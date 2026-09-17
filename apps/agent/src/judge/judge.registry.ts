import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClaudeCliJudgeService } from './claude-cli-judge.service';
import { ClaudeJudgeService } from './claude-judge.service';
import { GemmaJudgeService } from './gemma-judge.service';
import type { Judge, JudgeHealth } from './judge.types';

/**
 * 판정기 선택.
 *
 * `JUDGE_PRIORITY` 순서대로 준비된 것을 고른다 (기본: claude,gemma).
 * 사업계획서 생성의 `ExecutorRegistry` 와 같은 방식이다 —
 * 로컬 환경이 바뀌어도 워커는 그대로 돌아야 한다.
 */
@Injectable()
export class JudgeRegistry {
  private readonly logger = new Logger(JudgeRegistry.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cli: ClaudeCliJudgeService,
    private readonly claude: ClaudeJudgeService,
    private readonly gemma: GemmaJudgeService,
  ) {}

  private get order(): string[] {
    return this.config
      .get<string>('JUDGE_PRIORITY', 'claude-cli,claude-api,gemma')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
  }

  private byName(name: string): Judge | null {
    // PC 에 로그인된 클로드를 그대로 쓰는 것이 기본이다 (API 키 불필요).
    if (name === 'claude-cli' || name === 'cli') return this.cli;
    if (name === 'claude-api' || name === 'claude') return this.claude;
    if (name === 'gemma') return this.gemma;
    return null;
  }

  /** 지금 쓸 수 있는 판정기. 없으면 왜 없는지 함께 돌려준다. */
  async resolve(): Promise<
    { judge: Judge; health: JudgeHealth } | { judge: null; message: string }
  > {
    const tried: string[] = [];

    for (const name of this.order) {
      const judge = this.byName(name);
      if (!judge) continue;

      const health = await judge.health();
      if (health.ok) {
        this.logger.log(`판정기 — ${judge.name} (${judge.model})`);
        return { judge, health };
      }
      tried.push(`${name}: ${health.message ?? '사용 불가'}`);
    }

    return {
      judge: null,
      message: tried.length
        ? `사용 가능한 판정기가 없습니다. ${tried.join(' / ')}`
        : `판정기가 설정되지 않았습니다 (JUDGE_PRIORITY=${this.order.join(',')})`,
    };
  }

  /** 각 판정기의 준비 상태 — 상태 화면에서 쓴다 */
  async statuses(): Promise<Record<string, JudgeHealth & { model: string }>> {
    const out: Record<string, JudgeHealth & { model: string }> = {};
    for (const name of this.order) {
      const judge = this.byName(name);
      if (!judge) continue;
      out[name] = { ...(await judge.health()), model: judge.model };
    }
    return out;
  }
}
