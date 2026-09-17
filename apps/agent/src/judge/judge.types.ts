import type { JudgeInput, JudgeVerdict } from '@moai/shared';

export type { JudgeInput, JudgeVerdict };

/** 판정기 준비 상태 */
export interface JudgeHealth {
  ok: boolean;
  /** 사용자에게 보여줄 안내 — 준비가 안 됐을 때만 채운다 */
  message?: string;
}

/**
 * 소프트 판정을 수행하는 주체.
 *
 * 로컬 Claude 와 Gemma(Ollama) 가 같은 자리에 꽂힌다.
 * 사업계획서 생성의 `PlanExecutor` 와 같은 구조로, 어느 쪽이 돌든
 * 워커 코드는 바뀌지 않는다.
 */
export interface Judge {
  /** 결과에 기록할 모델 이름 */
  readonly name: string;
  readonly model: string;
  health(): Promise<JudgeHealth>;
  judge(input: JudgeInput): Promise<JudgeVerdict>;
}
