import { Column, Entity, Index, Unique } from 'typeorm';
import type { GrantOutcome } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * 관심 공고 (별표).
 *
 * 단순한 북마크가 아니라 우선순위 신호다.
 *  - 마감 알림은 관심 공고만 보낸다 (전부 보내면 스팸이 된다)
 *  - 로컬 LLM 판정 대기열에서 먼저 처리한다
 */
@Entity('saved_grants')
@Unique('uq_saved_tenant_grant', ['tenantId', 'grantId'])
export class SavedGrant extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Index()
  @Column({ type: 'uuid', name: 'grant_id' })
  grantId!: string;

  /** 저장한 사용자 — 조직 안에서 누가 찜했는지 */
  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  /** 사용자 메모 */
  @Column({ type: 'text', nullable: true })
  memo!: string | null;

  /**
   * 지원 결과 — 사용자가 직접 적는다.
   *
   * **여기(관심 공고)에 붙인 이유.** 결과를 적으려면 그 공고를 다시 찾아와야
   * 하는데, 이미 별을 눌러 둔 곳이 그 자리다. 별을 안 누른 공고에 결과를
   * 적으면 그때 별도 함께 눌린다 — 지원까지 한 공고가 목록에서 사라져 있으면
   * 나중에 찾을 방법이 없다.
   */
  @Index()
  @Column({ type: 'varchar', length: 10, nullable: true })
  outcome!: GrantOutcome | null;

  /** 결과를 적은 시점 — 중복 수혜 제한은 "최근 N년" 으로 걸리는 일이 많다 */
  @Column({ type: 'timestamptz', name: 'outcome_at', nullable: true })
  outcomeAt!: Date | null;
}
