import { IsIn, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { GRANT_OUTCOMES } from '@moai/shared';
import type { GrantOutcome } from '@moai/shared';

export class SetOutcomeDto {
  /**
   * 지원 결과. `null` 은 기록을 지운다는 뜻이라 허용해야 한다 —
   * 잘못 적었을 때 되돌릴 길이 없으면 사용자는 아예 안 적게 된다.
   */
  @ValidateIf((_, v) => v !== null)
  @IsIn(GRANT_OUTCOMES as unknown as string[])
  outcome!: GrantOutcome | null;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
