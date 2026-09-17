import { Column, Entity, Index } from 'typeorm';
import type { ExecutorKind, JobStatus } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/** 생성 잡. 로컬 실행기 / API 실행기 중 어디서 처리됐는지 기록한다. */
@Entity('jobs')
export class Job extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'queued' })
  status!: JobStatus;

  /** local(내 PC) / api(Anthropic 직결) — 폴백 발생 여부 추적용 */
  @Column({ type: 'varchar', length: 10, default: 'local' })
  executor!: ExecutorKind;

  /** 폴백으로 전환된 잡인지 */
  @Column({ type: 'boolean', name: 'fell_back', default: false })
  fellBack!: boolean;

  @Column({ type: 'jsonb', name: 'target_sections', default: () => "'[]'::jsonb" })
  targetSections!: string[];

  @Column({ type: 'int', name: 'input_tokens', default: 0 })
  inputTokens!: number;

  @Column({ type: 'int', name: 'output_tokens', default: 0 })
  outputTokens!: number;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'timestamptz', name: 'started_at', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'timestamptz', name: 'finished_at', nullable: true })
  finishedAt!: Date | null;
}
