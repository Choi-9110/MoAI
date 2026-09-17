import { Column, Entity, Index } from 'typeorm';
import type {
  AgencyType, ApplicantType, GrantCategory, Industry, Recurrence,
} from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * 정부·공공 지원사업 공고.
 *
 * 캘린더의 원천 데이터이며, 자격요건 컬럼들이 지원 가능 여부 판정의 기준이 된다.
 * 요건 컬럼이 비어 있으면 "제한 없음"으로 해석한다.
 */
@Entity('grants')
export class Grant extends BaseEntity {
  @Column({ type: 'varchar', length: 400 })
  title!: string;

  @Index()
  @Column({ type: 'varchar', length: 160 })
  agency!: string;

  @Column({ type: 'varchar', length: 20, name: 'agency_type', default: 'central' })
  agencyType!: AgencyType;

  @Index()
  @Column({ type: 'varchar', length: 20, default: 'etc' })
  category!: GrantCategory;

  @Column({ type: 'text', nullable: true })
  summary!: string | null;

  /* ── 일정 (캘린더 축) ── */

  @Column({ type: 'timestamptz', name: 'apply_start_at', nullable: true })
  applyStartAt!: Date | null;

  /** 캘린더는 이 날짜를 기준으로 공고를 배치한다. */
  @Index()
  @Column({ type: 'timestamptz', name: 'apply_end_at', nullable: true })
  applyEndAt!: Date | null;

  /* ── 지원 금액 ── */

  @Column({ type: 'bigint', name: 'amount_min', nullable: true })
  amountMin!: string | null;

  @Column({ type: 'bigint', name: 'amount_max', nullable: true })
  amountMax!: string | null;

  /* ── 신청 대상 ── */

  /**
   * 신청 가능한 사업자 유형.
   * 비어 있으면 제한 없음. 예: ["corporate"] 면 법인만 신청 가능.
   */
  @Column({ type: 'jsonb', name: 'applicant_types', default: () => "'[]'::jsonb" })
  applicantTypes!: ApplicantType[];

  /** 접수 주기 — 대출·정책자금은 상시(always)이거나 매월 반복이다. */
  @Column({ type: 'varchar', length: 10, default: 'once' })
  recurrence!: Recurrence;

  /* ── 자격 요건 (빈 배열 / null = 제한 없음) ── */

  @Column({ type: 'jsonb', name: 'target_regions', default: () => "'[]'::jsonb" })
  targetRegions!: string[];

  @Column({ type: 'jsonb', name: 'target_industries', default: () => "'[]'::jsonb" })
  targetIndustries!: Industry[];

  /** 최소 업력(년). 예: 창업 1년 이상 */
  @Column({ type: 'int', name: 'min_business_years', nullable: true })
  minBusinessYears!: number | null;

  /** 최대 업력(년). 예: 창업 7년 이내 */
  @Column({ type: 'int', name: 'max_business_years', nullable: true })
  maxBusinessYears!: number | null;

  @Column({ type: 'int', name: 'max_employees', nullable: true })
  maxEmployees!: number | null;

  @Column({ type: 'bigint', name: 'max_revenue', nullable: true })
  maxRevenue!: string | null;

  @Column({ type: 'jsonb', name: 'required_certifications', default: () => "'[]'::jsonb" })
  requiredCertifications!: string[];

  /**
   * 신청 대상 상세 원문.
   *
   * "23년~26년 초기창업패키지 선정·졸업기업" 처럼
   * 구조화 필드로는 표현되지 않는 실질 조건이 여기 들어온다.
   * 이걸 안 보면 자격이 없는데도 "지원 가능"으로 안내하게 된다.
   */
  @Column({ type: 'text', name: 'apply_target_detail', nullable: true })
  applyTargetDetail!: string | null;

  /**
   * 제외 대상 원문.
   *
   * 신청 대상과 모순되는 경우가 실제로 있다.
   * (지원대상에 "예비창업자"가 있는데 제외 대상에도 "예비창업자"가 있는 공고)
   * 이걸 안 보면 "지원 가능"이라고 안내해 놓고 실제로는 탈락시키게 된다.
   */
  @Column({ type: 'text', name: 'exclude_target', nullable: true })
  excludeTarget!: string | null;

  /** 대표자 연령 요건 (만 나이). null 이면 제한 없음 */
  @Column({ type: 'int', name: 'min_age', nullable: true })
  minAge!: number | null;

  @Column({ type: 'int', name: 'max_age', nullable: true })
  maxAge!: number | null;

  /** true 면 법인만 신청 가능 */
  @Column({ type: 'boolean', name: 'corporation_only', nullable: true })
  corporationOnly!: boolean | null;

  /* ── 출처 ── */

  @Column({ type: 'text', name: 'source_url', nullable: true })
  sourceUrl!: string | null;

  /** 수집처 식별자 (kstartup, bizinfo, smtech …) */
  @Index()
  @Column({ type: 'varchar', length: 40, name: 'source_api', nullable: true })
  sourceApi!: string | null;

  /**
   * 수집처가 부여한 공고 번호.
   * (sourceApi, externalId) 조합으로 같은 공고를 다시 받았는지 판정한다.
   */
  @Index()
  @Column({ type: 'varchar', length: 80, name: 'external_id', nullable: true })
  externalId!: string | null;

  /** 원문에서 파싱하지 못한 부가 정보 */
  @Column({ type: 'jsonb', name: 'raw_metadata', default: () => "'{}'::jsonb" })
  rawMetadata!: Record<string, unknown>;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
