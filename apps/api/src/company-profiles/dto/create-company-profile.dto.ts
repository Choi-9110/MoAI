import {
  APPLICANT_TYPES, EXPORT_STATUSES, FOUNDER_TRAITS, INDUSTRIES, INTERESTS,
  NO_FOUNDER_TRAIT, NO_PAST_PROGRAM, PAST_PROGRAMS, PROCUREMENT_INDUSTRIES,
  normalizeBusinessNumber,
} from '@moai/shared';
import type { ApplicantType, ExportStatus, Industry } from '@moai/shared';
import { Transform } from 'class-transformer';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber,
  IsOptional, IsString, IsUUID, Length, Matches, Max, Min,
} from 'class-validator';

export class CreateCompanyProfileDto {
  @IsUUID()
  tenantId!: string;

  @IsString()
  @Length(1, 160)
  name!: string;

  /**
   * 신청 자격상의 구분.
   * 예비창업자는 사업자번호·개업일·매출이 없는 것이 정상이므로
   * 그 경우 해당 항목을 "정보 부족"이 아니라 확정 판정으로 처리한다.
   */
  @IsOptional()
  @IsIn(APPLICANT_TYPES as unknown as string[])
  stage?: ApplicantType;

  /**
   * 사업자등록번호 — **숫자 10자리로 통일해서 저장한다.**
   *
   * 하이픈을 여기서 떼는 이유는, 화면만 고쳐 두면 다른 경로로 들어온 값이
   * 그대로 쌓이기 때문이다. 실제로 `862-16-02751` 과 `8621602751` 이
   * 섞여 있었고, 그러면 같은 사업자가 서로 다른 값으로 보인다.
   *
   * 빈 값은 null 로 바꿔 **지울 수 있게** 한다. 예비창업자로 되돌린 사람의
   * 옛 번호가 남아 있으면 판정에서 "사업자 있음"으로 읽힌다.
   */
  @IsOptional()
  @Transform(({ value }) => {
    const digits = normalizeBusinessNumber(
      typeof value === 'string' || typeof value === 'number' ? String(value) : '',
    );
    return digits === '' ? null : digits;
  })
  @Matches(/^\d{10}$/, {
    message: '사업자등록번호는 숫자 10자리여야 합니다.',
  })
  businessNumber?: string | null;

  @IsOptional()
  @IsIn(INDUSTRIES as unknown as string[])
  industry?: Industry;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  region?: string;

  @IsOptional()
  @IsString()
  regionDetail?: string;

  @IsOptional()
  @IsDateString()
  foundedAt?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  employees?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  annualRevenue?: number;

  /** 대표자 출생연도 — 청년 대상 공고 판정에 쓴다 */
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  founderBirthYear?: number;

  @IsOptional()
  @IsBoolean()
  isCorporation?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  certifications?: string[];

  /** 대표자 특성. `none` 은 해당 없음 — 다른 값과 함께 올 수 없다 */
  @IsOptional()
  @IsArray()
  @IsIn([...FOUNDER_TRAITS, NO_FOUNDER_TRAIT], {
    each: true,
    message: '알 수 없는 대표자 특성입니다.',
  })
  @Transform(({ value }) =>
    Array.isArray(value) && value.includes(NO_FOUNDER_TRAIT) ? [NO_FOUNDER_TRAIT] : value,
  )
  founderTraits?: string[];

  @IsOptional()
  @IsBoolean()
  isSmallBusiness?: boolean | null;

  @IsOptional()
  @IsIn(EXPORT_STATUSES as unknown as string[])
  exportStatus?: ExportStatus | null;

  @IsOptional()
  @IsBoolean()
  hasIp?: boolean | null;

  /** 선정 이력. 목록에 있는 사업만 받는다 — 자유 입력은 판정에서 못 맞춘다 */
  @IsOptional()
  @IsArray()
  @IsIn([...PAST_PROGRAMS.map((p) => p.value), NO_PAST_PROGRAM], {
    each: true,
    message: '알 수 없는 사업입니다.',
  })
  @Transform(({ value }) =>
    Array.isArray(value) && value.includes(NO_PAST_PROGRAM) ? [NO_PAST_PROGRAM] : value,
  )
  pastPrograms?: string[];

  /** 관심 분야 — 고른 것만 목록에 나온다 */
  @IsOptional()
  @IsArray()
  @IsIn(INTERESTS as unknown as string[], { each: true })
  interests?: string[];

  /**
   * 보유 업종·면허.
   *
   * 값을 정해진 목록으로 제한한다. 나라장터는 구분자가 제각각이라
   * (`기계설비ㆍ가스공사업` 의 `ㆍ` 는 아래아다) 자유 입력을 받으면
   * 눈으로는 같아 보여도 조회가 0건이 된다.
   */
  @IsOptional()
  @IsArray()
  @IsIn(
    PROCUREMENT_INDUSTRIES.map((i) => i.value),
    { each: true, message: '알 수 없는 업종입니다.' },
  )
  procurementIndustries?: string[];

  @IsOptional()
  @IsBoolean()
  procurementRegistered?: boolean | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  procurementPerformance?: number | null;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
