import { EXECUTOR_KINDS } from '@moai/shared';
import type { ExecutorKind } from '@moai/shared';
import {
  IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Min,
} from 'class-validator';

export class CreateUsageDto {
  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @IsIn(EXECUTOR_KINDS as unknown as string[])
  executor?: ExecutorKind;

  @IsOptional()
  @IsInt()
  @Min(0)
  inputTokens?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  outputTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costKrw?: number;

  /** YYYY-MM */
  @IsString()
  @Matches(/^\d{4}-\d{2}$/, { message: 'billingMonth 는 YYYY-MM 형식이어야 합니다.' })
  billingMonth!: string;
}
