import { Column, Entity, Index } from 'typeorm';
import type {
  ApplicantType, ConditionAnswer, ExportStatus, Industry,
} from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * 기업 프로필.
 *
 * 공고 자격요건과 대조해 지원 가능 여부를 판정하는 기준이 된다.
 * 값이 null 인 항목은 판정에서 "확인 불가"로 처리하며, 임의로 추정하지 않는다.
 */
@Entity('company_profiles')
export class CompanyProfile extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  /**
   * 신청 자격상의 구분.
   * 예비창업자는 사업자번호·개업일·매출이 없으므로 별도로 다뤄야 한다.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  stage!: ApplicantType | null;

  @Column({ type: 'varchar', length: 20, name: 'business_number', nullable: true })
  businessNumber!: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  industry!: Industry | null;

  /** 사업장 소재지 광역 단위 (예: 서울, 경기) */
  @Column({ type: 'varchar', length: 40, nullable: true })
  region!: string | null;

  /**
   * 시·군·구 (예: 성남시, 군산시).
   *
   * 입찰 지역제한의 59% 가 시·군까지 내려오는데, 시·도만으로는 그걸 못
   * 거른다. 경기 업체에게 `경기도 성남시` 전용 공고를 보여 주는 셈이 된다.
   */
  @Column({ type: 'varchar', length: 40, name: 'region_detail', nullable: true })
  regionDetail!: string | null;

  /** 창업일 — 업력 계산의 기준 */
  @Column({ type: 'date', name: 'founded_at', nullable: true })
  foundedAt!: string | null;

  @Column({ type: 'int', nullable: true })
  employees!: number | null;

  @Column({ type: 'bigint', name: 'annual_revenue', nullable: true })
  annualRevenue!: string | null;

  /**
   * 대표자 출생연도.
   * 청년 대상 공고(만 39세 이하 등)를 판정하려면 필요하다.
   * 생일까지는 받지 않으므로 경계에 걸리면 확정하지 않는다.
   */
  @Column({ type: 'int', name: 'founder_birth_year', nullable: true })
  founderBirthYear!: number | null;

  @Column({ type: 'boolean', name: 'is_corporation', nullable: true })
  isCorporation!: boolean | null;

  /**
   * 공고 조건에 대한 답변.
   *
   * 키는 조건 문장(정규화), 값은 "yes"(해당함) / "no"(해당 없음).
   * 같은 문구가 여러 공고에 반복되므로 한 번 답하면 계속 재사용한다.
   */
  @Column({ type: 'jsonb', name: 'condition_answers', default: () => "'{}'::jsonb" })
  conditionAnswers!: Record<string, ConditionAnswer>;

  /** 보유 인증 (벤처기업, 이노비즈, 여성기업 …) */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  certifications!: string[];

  /**
   * 대표자 특성 (여성 · 재창업 · 대학(원)생 · 경력단절 · 외국인).
   *
   * 여성기업·재창업 전용 공고를 거르려면 사람에 대한 정보가 필요하다.
   * 빈 배열은 "안 골랐다", `['none']` 은 "해당 없음"이다.
   */
  @Column({ type: 'jsonb', name: 'founder_traits', default: () => "'[]'::jsonb" })
  founderTraits!: string[];

  /**
   * 소상공인 해당 여부.
   * 소상공인 전용 공고가 접수 중 공고의 13% 라 따로 묻는다.
   */
  @Column({ type: 'boolean', name: 'is_small_business', nullable: true })
  isSmallBusiness!: boolean | null;

  /** 수출 현황 — `exporting` · `preparing` · `none` */
  @Column({ type: 'varchar', length: 20, name: 'export_status', nullable: true })
  exportStatus!: ExportStatus | null;

  /** 특허·실용신안·디자인권 보유 여부 */
  @Column({ type: 'boolean', name: 'has_ip', nullable: true })
  hasIp!: boolean | null;

  /**
   * 선정된 적 있는 정부 사업 (`PAST_PROGRAMS`).
   *
   * "초기창업패키지 선정기업 대상", "동일 사업 기수혜자 제외" 판정에 쓴다.
   * 관심 공고를 "선정"으로 표시하면 제목에서 찾아 자동으로 채운다.
   */
  @Column({ type: 'jsonb', name: 'past_programs', default: () => "'[]'::jsonb" })
  pastPrograms!: string[];

  /**
   * 무엇을 찾고 있는지 — `grant`(지원사업) · `rnd`(R&D) · `bid`(나라장터 입찰).
   *
   * 비어 있으면 지원사업만 본다. 고른 것에 따라 아래 입찰 항목을 물을지가
   * 정해지고, 목록에 무엇을 보여줄지도 갈린다.
   */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  interests!: string[];

  /**
   * 보유 업종·면허 (전기공사업, 소프트웨어사업 …).
   *
   * 값은 나라장터가 쓰는 문자열 그대로다 — 구분자가 제각각이라(`ㆍ`·`·`·`.`)
   * 임의로 손대면 조회가 0건이 된다. `PROCUREMENT_INDUSTRIES` 참고.
   */
  @Column({ type: 'jsonb', name: 'procurement_industries', default: () => "'[]'::jsonb" })
  procurementIndustries!: string[];

  /** 조달청 입찰참가자격 등록 여부. 없으면 아예 투찰할 수 없다. */
  @Column({ type: 'boolean', name: 'procurement_registered', nullable: true })
  procurementRegistered!: boolean | null;

  /** 최근 3년 조달 실적(원) — 규모가 큰 공고의 자격 판정에 쓴다 */
  @Column({ type: 'bigint', name: 'procurement_performance', nullable: true })
  procurementPerformance!: string | null;

  /** 테넌트의 기본 프로필 여부 */
  @Column({ type: 'boolean', name: 'is_default', default: true })
  isDefault!: boolean;
}
