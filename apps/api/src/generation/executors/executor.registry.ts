import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExecutorKind } from '@moai/shared';
import { ClaudeApiExecutor } from './claude-api.executor';
import { LocalRestExecutor } from './local-rest.executor';
import type { PlanExecutor } from './plan-executor.interface';

/**
 * 실행기 선택기.
 *
 * 우선순위는 환경변수 EXECUTOR_PRIORITY 로 제어한다 (기본 "local,api").
 * 매출 발생 후 API 직결로 전환할 때는 이 값을 "api,local" 로 바꾸기만 하면 된다.
 */
@Injectable()
export class ExecutorRegistry {
  private readonly logger = new Logger(ExecutorRegistry.name);

  constructor(
    private readonly config: ConfigService,
    private readonly local: LocalRestExecutor,
    private readonly api: ClaudeApiExecutor,
  ) {}

  private get priority(): ExecutorKind[] {
    return this.config
      .get<string>('EXECUTOR_PRIORITY', 'local,api')
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is ExecutorKind => s === 'local' || s === 'api');
  }

  private byKind(kind: ExecutorKind): PlanExecutor {
    return kind === 'local' ? this.local : this.api;
  }

  /**
   * 사용 가능한 실행기를 우선순위대로 찾는다.
   * 1순위가 죽어 있으면 다음 실행기로 폴백하고 그 사실을 반환값에 담는다.
   */
  async resolve(): Promise<{ executor: PlanExecutor; fellBack: boolean }> {
    const order = this.priority;

    for (let i = 0; i < order.length; i++) {
      const candidate = this.byKind(order[i]);
      const alive = await candidate.health();

      if (alive) {
        if (i > 0) {
          this.logger.warn(
            `1순위(${order[0]}) 실행기 사용 불가 — ${candidate.kind} 로 폴백`,
          );
        }
        return { executor: candidate, fellBack: i > 0 };
      }
    }

    /*
     * 사용자에게는 사용자가 할 수 있는 말만 한다. 어떤 실행기가 왜 죽었는지는
     * 운영자만 알면 되는 사정이고, 환경변수 이름을 화면에 그대로 내보내면
     * 서버 구성이 밖으로 새는 것이기도 하다. 원인은 로그에만 남긴다.
     */
    this.logger.error(
      `생성 실행기 전부 사용 불가 — 시도 순서: ${order.join(' → ') || '(비어 있음)'}`,
    );

    throw new ServiceUnavailableException(
      '지금은 생성 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요. ' +
        '문제가 계속되면 admin@drevv.co.kr 로 알려 주세요.',
    );
  }

  /** 각 실행기의 현재 상태 — 운영 대시보드용 */
  async status(): Promise<Record<ExecutorKind, boolean>> {
    const [local, api] = await Promise.all([
      this.local.health(),
      this.api.health(),
    ]);
    return { local, api };
  }
}
