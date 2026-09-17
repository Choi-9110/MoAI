import { EXECUTOR_KINDS, JOB_STATUSES, SECTION_KEYS } from '@moai/shared';
import type { ExecutorKind, JobStatus, SectionKey } from '@moai/shared';
import { IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';

export class CreateJobDto {
  @IsUUID()
  projectId!: string;

  @IsUUID()
  tenantId!: string;

  @IsOptional()
  @IsIn(JOB_STATUSES as unknown as string[])
  status?: JobStatus;

  @IsOptional()
  @IsIn(EXECUTOR_KINDS as unknown as string[])
  executor?: ExecutorKind;

  /** 비우면 전체 섹션 생성 */
  @IsOptional()
  @IsArray()
  @IsIn(SECTION_KEYS as unknown as string[], { each: true })
  targetSections?: SectionKey[];
}
