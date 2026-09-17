/**
 * 고친 것을 반영한다 — 빌드하고, 다시 띄운다.
 *
 * **왜 스크립트가 필요한가.** 실서비스는 미리 빌드해 둔 것(`dist`)을 돌린다.
 * 그래서 코드를 고쳐도 다시 빌드하지 않으면 아무 일도 일어나지 않는다.
 * 손으로 하면 빼먹기 쉬운 순서라 한 줄로 묶어 둔다.
 *
 * **빌드가 실패하면 재시작하지 않는다.** 이게 핵심이다. 깨진 코드를 그대로
 * 올리면 서비스가 통째로 죽는데, 빌드 단계에서 걸러 내면 지금 돌고 있는
 * 멀쩡한 것이 계속 돈다. 사용자는 아무것도 못 느낀다.
 *
 *   pnpm run deploy          전부
 *   pnpm run deploy api      한 곳만
 *
 * **`run` 을 빼면 안 된다.** `deploy` 는 pnpm 이 이미 쓰는 내장 명령이라
 * `pnpm deploy` 는 이 파일까지 오지도 못하고 ERR_PNPM_NOTHING_TO_DEPLOY
 * 로 끝난다. 배포한 줄 알았는데 아무것도 안 바뀐 상태가 되므로,
 * 고쳤는데 왜 그대로냐고 한참 헤매기 딱 좋다.
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

/**
 * 무엇을 빌드하고, 무엇을 다시 띄우고, **떴는지 어떻게 확인할 것인가.**
 *
 * 마지막 것이 중요하다. PM2 는 프로세스를 띄운 순간 `online` 이라고 답하는데,
 * 그때 Nest 는 아직 뜨는 중이고 Next 는 30초쯤 더 걸린다. 그 사이에 들어온
 * 요청은 그냥 실패한다 — 터널 로그에 남은
 * `Unable to reach the origin service` 가 그것이다.
 */
const APPS = {
  api: {
    pkg: '@moai/api',
    proc: 'moai-api',
    ready: 'http://localhost:4000/api/grants/stats',
  },
  agent: {
    pkg: '@moai/agent',
    proc: 'moai-agent',
    ready: 'http://localhost:4100/health',
  },
  web: {
    pkg: '@moai/web',
    proc: 'moai-web',
    ready: 'http://localhost:3000',
  },
};

/** 얼마나 기다려 줄 것인가 — Next 가 제일 느려서 넉넉히 잡는다 */
const READY_TIMEOUT_MS = 90_000;

/** PM2 가 지금 이 이름으로 돌리고 있는 프로세스 번호 */
function pidOf(proc) {
  try {
    const list = JSON.parse(
      execFileSync('pm2', ['jlist'], {
        encoding: 'utf8',
        shell: true,
        maxBuffer: 16 * 1024 * 1024,
      }),
    );
    return list.find((p) => p.name === proc)?.pid ?? null;
  } catch {
    return null;
  }
}

/**
 * 새로 뜬 것이 답을 할 때까지 기다린다.
 *
 * **주소만 물어보면 안 된다.** 재시작 직후에는 **옛 프로세스가 아직 포트를
 * 쥔 채 답을 한다.** 그걸 보고 "준비됐다"고 넘어가면 정작 새 것이 뜨기
 * 전에 다음 서버를 내리게 된다 — 실제로 웹이 `준비됨 (0초)` 로 찍혔는데,
 * 그때 답한 것은 30초 뒤에나 사라질 옛 프로세스였다.
 *
 * 그래서 **번호가 바뀐 것을 먼저 확인하고**, 그 다음에 주소를 물어본다.
 *
 * **못 떴다고 배포를 되돌리지는 않는다.** 여기까지 왔으면 빌드는 이미
 * 성공했고 새 코드가 올라간 뒤다. 되돌릴 방법이 없으니 알리기만 한다 —
 * 조용히 넘어가면 "배포했다"는 말만 믿고 있다가 한참 뒤에 발견하게 된다.
 */
async function waitReady(proc, url, oldPid) {
  const t0 = Date.now();
  let swapped = oldPid === null;

  for (;;) {
    if (!swapped) {
      const now = pidOf(proc);
      if (now !== null && now !== oldPid) swapped = true;
    }

    if (swapped) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(5_000),
          headers: { 'user-agent': 'moai-healthcheck' },
        });
        /* 401 도 살아 있는 것이다 — 로그인을 요구한다는 뜻이니 답은 하고 있다 */
        if (res.status < 500) {
          const sec = Math.round((Date.now() - t0) / 1000);
          console.log(`  ${proc} 준비됨 (${sec}초)`);
          return true;
        }
      } catch {
        /* 아직 안 떴다 */
      }
    }

    if (Date.now() - t0 > READY_TIMEOUT_MS) {
      console.log(
        `  ⚠ ${proc} 이 ${READY_TIMEOUT_MS / 1000}초 안에 응답하지 않습니다 — ` +
          `pm2 logs ${proc} 을 보세요`,
      );
      return false;
    }

    await new Promise((r) => setTimeout(r, 2_000));
  }
}

const sh = (cmd, args) =>
  execFileSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: true });

const asked = process.argv.slice(2).filter((a) => APPS[a]);
const targets = asked.length ? asked : Object.keys(APPS);

console.log(`\n▶ 빌드 — ${targets.join(', ')}\n`);

/*
 * 공용 코드(`packages/shared`)를 먼저 짓는다. 세 앱이 모두 여기에 기대므로
 * 이게 낡아 있으면 나머지 빌드가 옛 타입을 보고 통과해 버린다.
 */
sh('pnpm', ['--filter', '@moai/shared', 'build']);
for (const t of targets) sh('pnpm', ['--filter', APPS[t].pkg, 'build']);

console.log(`\n▶ 다시 띄우기\n`);

/*
 * 한 번에 다 끄지 않고 하나씩 돌린다. API 와 실행기가 동시에 내려가면
 * 그 사이에 사용자가 누른 것이 통째로 실패하기 때문이다.
 *
 * **이름이 아니라 설정 파일로 다시 띄운다.** `pm2 restart <이름>` 은 PM2 가
 * 처음 읽어 둔 설정을 그대로 다시 쓴다 — `ecosystem.config.js` 를 고쳐도
 * 반영되지 않는다. 실제로 로그 색을 끄는 설정을 넣고 재시작했는데 그대로
 * 색이 나왔고, 한참을 "설정이 왜 안 먹지" 하고 들여다봤다.
 * 파일을 주면 그때 다시 읽는다.
 */
let allReady = true;

for (const t of targets) {
  /* 바뀐 것을 알아보려면 바꾸기 전 번호를 알고 있어야 한다 */
  const before = pidOf(APPS[t].proc);

  sh('pm2', [
    'restart',
    'ecosystem.config.js',
    '--only', APPS[t].proc,
    '--update-env',
  ]);

  /*
   * 다음 것으로 넘어가기 전에 **실제로 답하는지 확인한다.**
   *
   * 예전에는 4초를 세고 넘어갔다. 그런데 Next 는 30초쯤 걸려서, 셋을 다
   * 돌린 뒤에도 사이트는 아직 죽어 있었다. 배포는 성공했다고 나오는데
   * 들어가 보면 502 가 뜨는 상태가 그것이다.
   */
  if (!(await waitReady(APPS[t].proc, APPS[t].ready, before))) allReady = false;
}

console.log('');
console.log(allReady ? '✓ 반영했습니다.' : '⚠ 반영했지만 일부가 응답하지 않습니다.');
console.log('');
sh('pm2', ['status']);
