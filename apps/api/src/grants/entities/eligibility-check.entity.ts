import { Column, Entity, Index, Unique } from 'typeorm';
import type {
  EligibilityLevel, EligibilityReason, SoftCheckStatus,
} from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * 기업 × 공고 판정 캐시.
 *
 * 조합마다 한 줄이며, 한 번 판정하면 저장해 두고 다시 검사하지 않는다.
 * 매일 도는 배치는 아래 조건에 해당하는 조합만 처리한다.
 *
 *   - 아직 검사한 적 없음
 *   - 공고 내용이 바뀜   (grantVersion 불일치)
 *   - 기업 정보가 바뀜   (profileVersion 불일치)
 *
 * 접수가 끝난 공고와 하드 필터에서 이미 탈락한 조합은 대상에서 제외한다.
 * 소프트 판정(LLM)은 비용이 있으므로 하드 필터를 통과한 것만 돌린다.
 */
@Entity('eligibility_checks')
@Unique('uq_eligibility_profile_grant', ['companyProfileId', 'grantId'])
export class EligibilityCheck extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'company_profile_id' })
  companyProfileId!: string;

  @Index()
  @Column({ type: 'uuid', name: 'grant_id' })
  grantId!: string;

  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  /* ── 1단계 : 하드 필터 (코드로 계산) ── */

  @Index()
  @Column({ type: 'varchar', length: 20, name: 'hard_level' })
  hardLevel!: EligibilityLevel;

  @Column({ type: 'int', name: 'hard_passed', default: 0 })
  hardPassed!: number;

  @Column({ type: 'int', name: 'hard_checked', default: 0 })
  hardChecked!: number;

  /** 항목별 결과 — 화면에서 "0/1 법인사업자 ✕" 로 펼쳐 보여준다. */
  @Column({ type: 'jsonb', name: 'hard_reasons', default: () => "'[]'::jsonb" })
  hardReasons!: EligibilityReason[];

  /* ── 2단계 : 소프트 판정 (로컬 LLM) ── */

  @Index()
  @Column({ type: 'varchar', length: 20, name: 'soft_status', default: 'pending' })
  softStatus!: SoftCheckStatus;

  @Column({ type: 'jsonb', name: 'soft_reasons', default: () => "'[]'::jsonb" })
  softReasons!: EligibilityReason[];

  /** 모델이 판단 근거로 삼은 공고 원문 인용 — 사람이 검증할 수 있게 남긴다. */
  @Column({ type: 'jsonb', name: 'soft_quotes', default: () => "'[]'::jsonb" })
  softQuotes!: string[];

  @Column({ type: 'varchar', length: 60, name: 'soft_model', nullable: true })
  softModel!: string | null;

  @Column({ type: 'timestamptz', name: 'soft_checked_at', nullable: true })
  softCheckedAt!: Date | null;

  /* ── 캐시 무효화 기준 ── */

  /** 판정 당시 공고의 updatedAt. 공고가 수정되면 재검사한다. */
  @Column({ type: 'timestamptz', name: 'grant_version' })
  grantVersion!: Date;

  /** 판정 당시 기업 정보의 updatedAt. 프로필이 바뀌면 재검사한다. */
  @Column({ type: 'timestamptz', name: 'profile_version' })
  profileVersion!: Date;
}
