import type { PlanJob, ProgressEvent } from '@moai/shared';

/**
 * 사업계획서 생성 실행기.
 *
 * 구현체는 두 가지다.
 *  - LocalRestExecutor : 로컬 PC 의 Claude REST 서버 (평소 경로, 비용 0)
 *  - ClaudeApiExecutor : Anthropic API 직결 (폴백 → 추후 기본 경로)
 *
 * 백엔드의 나머지 코드는 이 인터페이스만 알기 때문에,
 * 향후 API 직결로 전환할 때 주입 순서만 바꾸면 된다.
 */
export interface PlanExecutor {
  /** 실행기 식별자 */
  readonly kind: 'local' | 'api';

  /** 사용 가능 여부. 폴백 판정의 근거가 된다. */
  health(): Promise<boolean>;

  /** 잡 실행. 진행 상황은 onEvent 로 흘려보낸다. */
  run(
    job: PlanJob,
    onEvent: (event: ProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}

export const PLAN_EXECUTORS = Symbol('PLAN_EXECUTORS');
