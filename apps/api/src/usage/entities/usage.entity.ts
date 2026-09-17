import { Column, Entity, Index } from 'typeorm';
import type { ExecutorKind } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * 사용량 미터링.
 * 테넌트별 월 상한 판정의 근거가 되므로 잡 1건마다 반드시 적재한다.
 */
@Entity('usage_events')
export class Usage extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'project_id', nullable: true })
  projectId!: string | null;

  @Column({ type: 'uuid', name: 'job_id', nullable: true })
  jobId!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'local' })
  executor!: ExecutorKind;

  @Column({ type: 'int', name: 'input_tokens', default: 0 })
  inputTokens!: number;

  @Column({ type: 'int', name: 'output_tokens', default: 0 })
  outputTokens!: number;

  /** 원화 환산 비용. local 실행기는 0 으로 기록한다. */
  @Column({ type: 'numeric', name: 'cost_krw', precision: 12, scale: 2, default: 0 })
  costKrw!: string;

  /** 월별 집계 키 (예: 2026-08) */
  @Index()
  @Column({ type: 'varchar', length: 7, name: 'billing_month' })
  billingMonth!: string;
}
