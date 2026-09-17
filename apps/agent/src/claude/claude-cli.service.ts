import { execFile, execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * **동시에 띄울 수 있는 claude 프로세스 수.**
 *
 * 잡 단위로는 이미 막고 있었다(`MAX_CONCURRENT_JOBS`). 그런데 잡 하나가
 * 프로세스를 여럿 띄운다 — 사업계획서는 리서치 네 편을 한꺼번에 돌린다.
 * 그래서 잡 6개면 프로세스가 24개까지 갔고, 윈도우가
 * `0x800700e8 (시스템 리소스 부족)` 으로 실행을 거부하기 시작했다.
 *
 * 진짜 막아야 할 곳은 **프로세스가 실제로 뜨는 이 문 하나뿐**이다.
 * 여기서 세면 어느 경로로 들어오든 상한을 넘길 수 없다.
 *
 * claude 하나가 메모리를 200~500MB 쓴다. 넷이면 2GB 안쪽이라
 * 다른 것과 같이 돌려도 무리가 없다.
 */
const MAX_LIVE_PROCESSES = 4;

/** 지금 떠 있는 수와, 자리를 기다리는 줄 */
let live = 0;
const waiting: (() => void)[] = [];

/** 자리가 날 때까지 기다린다 */
async function takeSlot(): Promise<void> {
  if (live < MAX_LIVE_PROCESSES) {
    live += 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
  live += 1;
}

/** 자리를 비운다 — 기다리던 것이 있으면 하나 들여보낸다 */
function freeSlot(): void {
  live -= 1;
  waiting.shift()?.();
}

/** `claude -p --output-format json` 이 돌려주는 봉투 */
export interface CliEnvelope {
  is_error?: boolean;
  subtype?: string;
  result?: string;
  total_cost_usd?: number;
  usage?: { output_tokens?: number };
  /** 몇 턴을 돌았는가 — 한도를 넘겨 죽었는지 판단하는 데 쓴다 */
  num_turns?: number;
  stop_reason?: string;
}

export interface CliRunOptions {
  /** 이 작업에만 쓰는 시스템 프롬프트. 기본 프롬프트를 대체한다. */
  systemPrompt: string;
  /** stdin 으로 넘길 요청문 */
  prompt: string;
  model?: string;
  timeoutMs?: number;
  /**
   * 읽기를 허용할 디렉터리.
   *
   * 공고문처럼 파일을 봐야 하는 작업에 쓴다. PDF·DOCX 도 CLI 가 직접 읽으므로
   * 서버에 파서를 두지 않아도 된다. 지정한 디렉터리 밖은 볼 수 없다.
   */
  readDir?: string;
  /** 도구를 쓰는 작업은 여러 턴이 필요하다. 기본은 1턴. */
  maxTurns?: number;
  /**
   * 이 작업에 열어 줄 도구.
   *
   * 지정하지 않으면 파일을 읽는 도구(Read·Glob)만 열린다. 리서치처럼
   * 밖을 봐야 하는 작업에서만 `['WebSearch', 'WebFetch']` 를 넘긴다.
   *
   * **집필에는 열지 않는다.** 쓰다가 검색하면 문장 흐름에 맞는 것만 골라
   * 오게 되고, 무엇을 근거로 썼는지 나중에 되짚을 수 없다. 찾는 일과 쓰는
   * 일은 갈라 둔다.
   */
  allowedTools?: string[];
  /**
   * 이 저장소의 스킬 폴더를 읽게 할 것인가. **기본은 아니다.**
   *
   * CLI 의 스킬 기능을 켜지 않고 **폴더를 읽게만 한다.** 스킬 기능을 켜면
   * 우리 스킬 하나 때문에 클로드 코드 기본 스킬 12종의 목록까지 통째로
   * 딸려 오기 때문이다. 실측하면 이렇다 (하이쿠, 빈 요청 1회):
   *
   *   아무 설정도 지정 안 함             21,513 토큰  ← 사용자 개인 스킬까지
   *   프로젝트 스킬 기능 켬              20,460 토큰  ← 기본 스킬 12 + 우리 것 1
   *   스킬 기능 끔                      15,192 토큰  ← 지금 방식
   *
   * 우리 스킬은 실행 파일이 없는 **문서**라 Read 로 열어도 똑같이 동작한다.
   * 요청문에 경로만 한 줄 알려 주면, 모델이 필요할 때만 연다 — 지연 로딩은
   * 그대로이고 목록 값은 안 치른다.
   *
   * 그래서 **사업계획서 집필에만 켠다.** 공고 판정은 공고 수만큼 도는데,
   * 거기까지 켜면 쓰지도 않을 폴더를 매번 열어 둔다.
   */
  useSkills?: boolean;
}

/**
 * 로컬에 설치된 Claude CLI 실행.
 *
 * API 키를 따로 두지 않고 **PC 에 이미 로그인된 클로드**를 그대로 쓴다.
 * 이 프로젝트가 처음부터 로컬 실행을 전제로 한 이유와 같다 — 비용.
 *
 * 요청문은 stdin 으로 넘긴다. 긴 문서에는 따옴표·줄바꿈이 섞여 있어
 * 명령행 인자로 넘기면 셸을 거치며 깨질 수 있기 때문이다.
 *
 * 시스템 프롬프트는 인자로 넘긴다. 기본 프롬프트(클로드 코드용 지시와
 * 도구 정의)를 통째로 대체하므로 요청마다 얹히는 분량이 줄고,
 * 앞부분이 매번 같아 호출 사이에 프롬프트 캐시가 그대로 재사용된다.
 */
@Injectable()
export class ClaudeCliService {
  private readonly logger = new Logger(ClaudeCliService.name);
  private resolved: string | null | undefined;
  private skills: string | null | undefined;

  constructor(private readonly config: ConfigService) {}

  get defaultModel(): string {
    return this.config.get<string>('CLI_MODEL', 'claude-sonnet-5');
  }

  /**
   * 실행 파일 위치.
   *
   * 윈도우의 `claude` 는 배치 파일(.cmd)이라 셸 없이는 실행되지 않는데,
   * 셸을 끼우면 인자가 다시 깨진다. 그래서 배치가 실제로 호출하는
   * `claude.exe` 를 찾아 직접 띄운다.
   */
  resolveCli(): string | null {
    if (this.resolved !== undefined) return this.resolved;

    const override = this.config.get<string>('CLAUDE_CLI_PATH');
    if (override) {
      this.resolved = existsSync(override) ? override : null;
      if (!this.resolved) {
        this.logger.warn(`CLAUDE_CLI_PATH 경로에 파일이 없습니다: ${override}`);
      }
      return this.resolved;
    }

    if (process.platform !== 'win32') {
      this.resolved = 'claude';
      return this.resolved;
    }

    try {
      const hits = execFileSync('where', ['claude'], { encoding: 'utf8' })
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      const exe = hits.find((h) => h.toLowerCase().endsWith('.exe'));
      if (exe) {
        this.resolved = exe;
        return this.resolved;
      }

      // .cmd 옆에 설치된 실제 실행 파일을 찾는다.
      for (const hit of hits) {
        const candidate = join(
          dirname(hit),
          'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe',
        );
        if (existsSync(candidate)) {
          this.resolved = candidate;
          return this.resolved;
        }
      }
    } catch {
      // where 가 못 찾으면 아래에서 null 로 처리한다.
    }

    this.resolved = null;
    return this.resolved;
  }

  /**
   * 이 저장소의 스킬 폴더. 없으면 null.
   *
   * `.claude/skills/` 는 저장소 안에 있다 — 사용자 전역(`~/.claude/skills`)이
   * 아니다. 그래서 **다른 프로젝트에서는 보이지 않는다.**
   *
   * 실행 위치가 `apps/agent` 라 위로 올라가며 찾는다. 개발 중과 빌드 후의
   * 실행 위치가 달라서 경로를 박아 두면 한쪽이 깨진다.
   */
  get skillsDir(): string | null {
    if (this.skills !== undefined) return this.skills;

    const configured = this.config.get<string>('SKILLS_DIR');
    if (configured) {
      this.skills = existsSync(configured) ? configured : null;
      if (!this.skills) {
        this.logger.warn(`SKILLS_DIR 경로에 폴더가 없습니다: ${configured}`);
      }
      return this.skills;
    }

    let dir = process.cwd();
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, '.claude', 'skills');
      if (existsSync(candidate)) {
        this.skills = candidate;
        return this.skills;
      }
      const parent = dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    this.skills = null;
    return this.skills;
  }

  /** CLI 가 설치돼 있고 실행되는지 */
  health(): { ok: boolean; message?: string } {
    const cli = this.resolveCli();
    if (!cli) {
      return {
        ok: false,
        message:
          'Claude CLI 를 찾지 못했습니다. 설치돼 있다면 apps/agent/.env 에 CLAUDE_CLI_PATH 로 경로를 지정해 주세요.',
      };
    }

    // 실제 호출은 돈이 드니 버전 확인까지만 한다.
    try {
      const version = execFileSync(cli, ['--version'], {
        encoding: 'utf8',
        timeout: 15000,
      }).trim();
      return { ok: true, message: version };
    } catch (err) {
      return {
        ok: false,
        message: `Claude CLI 실행에 실패했습니다 (${cli}) — ${(err as Error).message}`,
      };
    }
  }

  /** 앞뒤에 잡소리가 붙어도 JSON 만 건져낸다 */
  private parseEnvelope(out: string): CliEnvelope | null {
    const start = out.indexOf('{');
    const end = out.lastIndexOf('}');
    if (start === -1 || end === -1) return null;
    try {
      return JSON.parse(out.slice(start, end + 1)) as CliEnvelope;
    } catch {
      return null;
    }
  }

  /**
   * 실패 이유를 사람이 읽을 수 있는 문장으로.
   *
   * 턴 한도 초과는 대개 **파일을 못 읽어서** 생긴다 — 모델이 이 방법 저 방법
   * 시도하다 한도를 넘긴다. 그 경우가 압도적으로 많으므로 그렇게 안내한다.
   */
  private describe(envelope: CliEnvelope, options: CliRunOptions): string {
    const turns = envelope.num_turns ?? 0;
    const max = options.maxTurns ?? 1;

    if (envelope.stop_reason === 'tool_use' || turns >= max) {
      return options.readDir
        ? `공고문을 읽지 못했습니다. 도구 사용 한도(${max}턴)를 넘겼습니다 — ` +
            'PDF·한글 파일이 이미지로만 되어 있으면 글자를 꺼낼 수 없습니다. ' +
            '텍스트가 들어 있는 파일로 다시 올려 주세요.'
        : `도구 사용 한도(${max}턴)를 넘겼습니다.`;
    }

    return `Claude CLI 오류: ${envelope.subtype ?? envelope.stop_reason ?? '알 수 없음'}`;
  }

  /** 한 번 호출하고 응답 봉투를 그대로 돌려준다 */
  async run(options: CliRunOptions): Promise<CliEnvelope> {
    const cli = this.resolveCli();
    if (!cli) return Promise.reject(new Error('Claude CLI 를 찾지 못했습니다.'));

    const timeoutMs =
      options.timeoutMs ??
      parseInt(this.config.get<string>('CLI_TIMEOUT_MS', '180000'), 10);

    const args = [
      '-p',
      '--output-format', 'json',
      '--model', options.model ?? this.defaultModel,
      // 도구 없이 한 번 읽고 답하는 게 기본이다.
      '--max-turns', String(options.maxTurns ?? 1),
      '--system-prompt', options.systemPrompt,
    ];

    /*
     * 설정과 스킬 목록을 **둘 다 끈다.**
     *
     * 지정하지 않으면 CLI 가 실행 위치를 보고 알아서 다 읽는다 — 사용자
     * 개인 스킬, 다른 프로젝트 설정, 기본 스킬 목록까지. 우리는 시스템
     * 프롬프트를 직접 주고 있어서 그것들이 필요 없고, 매 호출 값만 치른다.
     * 둘을 끄면 호출마다 6천 토큰 넘게 줄어든다 (실측 21,513 → 15,192).
     */
    args.push('--safe-mode', '--disable-slash-commands');

    const skillsDir = options.useSkills ? this.skillsDir : null;
    const dirs = [options.readDir, skillsDir].filter(Boolean) as string[];

    /*
     * 열어 줄 도구.
     *
     * 파일을 읽어야 하면 Read·Glob 을 붙이고, 밖을 봐야 하는 작업은
     * 부르는 쪽이 따로 지정한다. **쓰기·실행 도구는 어느 경우에도 주지
     * 않는다** — 이 프로세스는 사용자 PC 에서 돌고, 요청문에는 사용자가
     * 올린 파일의 내용이 그대로 실린다.
     */
    const tools = [
      ...(dirs.length > 0 ? ['Read', 'Glob'] : []),
      ...(options.allowedTools ?? []),
    ];

    if (tools.length > 0) args.push('--allowed-tools', ...tools);
    if (dirs.length > 0) args.push('--add-dir', ...dirs);

    /*
     * 자리가 날 때까지 기다린다. 여기서 줄을 서므로, 몇 개가 한꺼번에
     * 몰려와도 실제로 뜨는 프로세스는 넷을 넘지 않는다.
     */
    await takeSlot();

    return new Promise<CliEnvelope>((resolve, reject) => {
      /*
       * **`windowsHide` 가 없으면 창이 뜬다.**
       *
       * 윈도우는 콘솔 프로그램을 띄울 때마다 `conhost.exe` 를 하나씩
       * 붙이는데, 그게 화면에 검은 창으로 나타난다. 백그라운드로 도는
       * 작업이라 아무도 볼 일이 없는 창인데, 사용자 화면에는 열댓 개가
       * 쌓였다. 게다가 창 하나가 자원을 먹어서, 이것 때문에도
       * `시스템 리소스 부족` 에 더 빨리 닿았다.
       */
      const child = spawn(cli, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let out = '';
      let err = '';
      let settled = false;
      let slotFreed = false;

      /* 어느 길로 끝나든 자리는 딱 한 번만 비운다 */
      const release = () => {
        if (slotFreed) return;
        slotFreed = true;
        freeSlot();
      };

      const timer = setTimeout(() => {
        settled = true;
        killTree(child.pid);
        release();
        reject(new Error(`Claude CLI 응답 시간 초과 (${timeoutMs}ms)`));
      }, timeoutMs);

      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        release();
        reject(new Error(message));
      };

      child.stdout.on('data', (d: Buffer) => (out += d.toString('utf8')));
      child.stderr.on('data', (d: Buffer) => (err += d.toString('utf8')));
      child.on('error', (e) => fail(`Claude CLI 실행 실패: ${e.message}`));

      child.on('close', (code) => {
        release();
        if (settled) return;
        settled = true;
        clearTimeout(timer);

        /*
         * 종료 코드가 0 이 아니어도 **먼저 응답을 읽어 본다.**
         *
         * CLI 는 턴 한도를 넘기면 코드 1 로 죽으면서 stderr 에는 아무것도
         * 남기지 않는다. 그런데 stdout 에는 이유가 담긴 JSON 이 그대로 있다.
         * 이걸 안 읽으면 사용자에게 "종료 코드 1" 만 보이는데, 그 문장으로는
         * 무엇을 고쳐야 하는지 알 수가 없다.
         */
        const envelope = this.parseEnvelope(out);

        if (envelope) {
          if (envelope.is_error) {
            reject(new Error(this.describe(envelope, options)));
            return;
          }
          resolve(envelope);
          return;
        }

        if (code !== 0) {
          reject(
            new Error(
              `Claude CLI 종료 코드 ${code}${err.trim() ? ` — ${err.trim().slice(0, 200)}` : ''}`,
            ),
          );
          return;
        }

        reject(new Error(`Claude CLI 응답을 읽지 못했습니다: ${out.slice(0, 200)}`));
      });

      child.stdin.end(options.prompt, 'utf8');
    });
  }
}

/**
 * 프로세스를 **딸린 자식까지** 끝낸다.
 *
 * `child.kill()` 은 claude.exe 하나만 죽인다. 그런데 claude 는 자기
 * 아래로 node 를 여럿 띄우고, 부모가 죽어도 그것들은 부모 없이 살아남는다.
 * 시간 초과가 몇 번 나면 그렇게 남은 것이 쌓여 결국 자원이 바닥난다.
 *
 * 윈도우에서 자식까지 확실히 끝내는 방법은 `taskkill /T` 뿐이다.
 */
function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform !== 'win32') {
    try {
      process.kill(pid);
    } catch {
      /* 이미 죽었다 */
    }
    return;
  }
  execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => undefined);
}
