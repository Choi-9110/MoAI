import { IsIn, IsObject, IsOptional, IsUUID } from 'class-validator';
import { CONDITION_ANSWERS } from '@moai/shared';
import type { ConditionAnswer } from '@moai/shared';

/**
 * 공고 조건에 대한 사용자 답변.
 *
 * 키는 조건 문장(`conditionKey`), 값은 `yes` / `no` 다.
 * `null` 을 보내면 그 조건의 답을 지운다 — 잘못 답한 경우 되돌리기 위함이다.
 */
export class AnswerConditionsDto {
  @IsObject()
  answers!: Record<string, ConditionAnswer | null>;
}

/** 개별 검증용 — 컨트롤러에서 값 하나씩 확인한다 */
export const isConditionAnswer = (v: unknown): v is ConditionAnswer =>
  typeof v === 'string' && (CONDITION_ANSWERS as readonly string[]).includes(v);
