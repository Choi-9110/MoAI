import { z } from 'zod';
import {
  AGENCY_TYPES, APPLICANT_TYPES, ELIGIBILITY_LEVELS, GRANT_CATEGORIES,
  GRANT_OUTCOMES,
  GRANT_STATUSES, INDUSTRIES,
} from './enums';
import { INTERESTS } from './procurement';
import {
  EXPORT_STATUSES, FOUNDER_TRAITS, NO_FOUNDER_TRAIT,
} from './target-traits';
import type { EligibilityLevel, GrantStatus } from './enums';

/* ────────────── 기업 프로필 ────────────── */

/**
 * 지원 가능 여부 판정의 기준이 되는 기업 정보.
 * 값이 없는 항목(null)은 판정에서 "확인 불가"로 처리한다.
 */
export const CompanyProfileSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  name: z.string(),
  /**
   * 사업자 형태. null 이면 아직 고르지 않은 상태다.
   * 사업자가 없는 사람에게 매출액·법인 여부를 묻지 않기 위해 먼저 받는다.
   */
  stage: z.enum(APPLICANT_TYPES).nullable(),
  /**
   * 사업자등록번호. 사업자가 없는 예비창업자는 null 이다.
   *
   * 저장은 되는데 이 칸이 계약에 빠져 있어서 화면이 값을 되읽지 못했다.
   * 서버는 처음부터 내려주고 있었다.
   */
  businessNumber: z.string().nullable(),
  industry: z.enum(INDUSTRIES).nullable(),
  region: z.string().nullable(),          // 예: 서울, 경기
  /** 시·군·구 — 입찰 지역제한의 59% 가 여기까지 내려온다 */
  regionDetail: z.string().nullable().default(null),
  foundedAt: z.string().nullable(),       // ISO date
  employees: z.number().int().nullable(),
  annualRevenue: z.number().nullable(),   // 원
  isCorporation: z.boolean().nullable(),  // 법인 여부
  /** 대표자 출생연도 — 청년 대상 공고 판정에 쓴다 */
  founderBirthYear: z.number().int().nullable(),
  certifications: z.array(z.string()).default([]), // 벤처확인·이노비즈 등

  /* ── 대상 특성 — 여성·재창업·소상공인 전용 공고 판정 ── */

  /** 대표자 특성. 빈 배열은 "안 골랐다", `['none']` 은 "해당 없음" */
  founderTraits: z.array(z.enum([...FOUNDER_TRAITS, NO_FOUNDER_TRAIT] as const)).default([]),
  /** 소상공인 해당 여부. null 이면 안 답했다 */
  isSmallBusiness: z.boolean().nullable().default(null),
  exportStatus: z.enum(EXPORT_STATUSES).nullable().default(null),
  /** 특허·실용신안·디자인권 보유 여부 */
  hasIp: z.boolean().nullable().default(null),
  /** 선정된 적 있는 정부 사업. 빈 배열은 "안 골랐다", `['none']` 은 "없음" */
  pastPrograms: z.array(z.string()).default([]),

  /* ── 무엇을 찾고 있는지 ── */

  /**
   * 관심 분야. 고른 것만 목록에 나온다.
   *
   * 비어 있으면 지원사업만 본다(`DEFAULT_INTERESTS`). 시공업체에게 창업교육
   * 공고는 소음이고, 예비창업자에게 입찰 공고도 마찬가지다.
   */
  interests: z.array(z.enum(INTERESTS)).default([]),

  /* ── 입찰(나라장터)용 — 위에서 bid 를 고른 경우에만 묻는다 ── */

  /** 보유 업종·면허. 입찰 목록을 이 값으로 걸러 받는다. */
  procurementIndustries: z.array(z.string()).default([]),
  /** 조달청 입찰참가자격 등록 여부. 없으면 아예 투찰할 수 없다. */
  procurementRegistered: z.boolean().nullable(),
  /** 최근 3년 조달 실적(원). 규모가 큰 공고의 자격 판정에 쓴다. */
  procurementPerformance: z.number().nullable(),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

/* ────────────── 공고 ────────────── */

export const GrantSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  agency: z.string(),
  agencyType: z.enum(AGENCY_TYPES),
  category: z.enum(GRANT_CATEGORIES),
  summary: z.string().nullable(),

  applyStartAt: z.string().nullable(),
  applyEndAt: z.string().nullable(),

  amountMin: z.number().nullable(),
  amountMax: z.number().nullable(),

  // ── 자격 요건 (비어 있으면 제한 없음으로 본다) ──
  targetRegions: z.array(z.string()).default([]),
  targetIndustries: z.array(z.enum(INDUSTRIES)).default([]),
  minBusinessYears: z.number().nullable(),
  maxBusinessYears: z.number().nullable(),
  maxEmployees: z.number().int().nullable(),
  maxRevenue: z.number().nullable(),
  requiredCertifications: z.array(z.string()).default([]),
  corporationOnly: z.boolean().nullable(),
  /** 대표자 연령 요건 (만 나이). null 이면 제한 없음 */
  minAge: z.number().int().nullable(),
  maxAge: z.number().int().nullable(),

  sourceUrl: z.string().nullable(),
  /**
   * 받아온 곳 (K-Startup · 기업마당 …).
   *
   * 화면에 출처를 밝혀 두면 원문을 어디서 확인할지 바로 알 수 있다.
   * 목록에 새 소스가 붙어도 견디도록 문자열로 둔다.
   */
  sourceApi: z.string().nullable(),

  /**
   * 구조화하지 못한 공고 부가 정보.
   * 화면에서 그대로 보여주기 위한 것이며, 판정에는 쓰지 않는다.
   */
  detail: z
    .object({
      applyTargetDetail: z.string().nullable().optional(), // 신청 대상 상세
      excludeTarget: z.string().nullable().optional(),     // 제외 대상
      targetAge: z.string().nullable().optional(),         // 대상 연령
      preferential: z.string().nullable().optional(),      // 우대 사항
      contact: z.string().nullable().optional(),           // 문의 전화
      department: z.string().nullable().optional(),        // 담당 부서
      rawCategory: z.string().nullable().optional(),       // 원문 분류
      rawRegion: z.string().nullable().optional(),         // 원문 지역
      rawBusinessYears: z.string().nullable().optional(),  // 원문 업력
      applyOnlineUrl: z.string().nullable().optional(),    // 온라인 접수처
      guideUrl: z.string().nullable().optional(),          // 안내 페이지
    })
    .optional(),
});
export type Grant = z.infer<typeof GrantSchema>;

/* ────────────── 조건 답변 ────────────── */

/** 사용자가 조건에 답한 결과 */
export const CONDITION_ANSWERS = ['yes', 'no'] as const;
/** yes = 해당함(제외 대상) / no = 해당 없음 */
export type ConditionAnswer = (typeof CONDITION_ANSWERS)[number];

/**
 * 조건 문장을 답변 저장용 키로 바꾼다.
 *
 * 같은 조건이 여러 공고에 반복해서 나온다.
 * ("유흥주점업 제외" 같은 문구는 수십 개 공고에 똑같이 들어간다)
 * 그래서 공고 ID 가 아니라 **문장 자체**를 키로 삼아,
 * 한 번 답하면 다른 공고에서도 재사용한다.
 */
export function conditionKey(clause: string): string {
  return clause
    .replace(/^[\s\-–—◦○●▪▫·※□■]+/, '') // 앞머리 기호 제거
    .replace(/^\d{1,2}\.\s*/, '')          // 앞머리 번호 제거
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

/* ────────────── 지원 가능 여부 판정 ────────────── */

/**
 * 사용자에게 직접 물어야 하는 조건 하나.
 *
 * 판정기가 "여기서 막혔다"고 남긴 지점이므로, 화면의 체크리스트는
 * 이 목록만 그리면 된다. 공고 원문을 다시 파싱하지 않으므로
 * 물어본 조건과 판정에 쓰이는 조건이 어긋날 수 없다.
 */
export const OpenConditionSchema = z.object({
  /** 답변 저장용 키 (`conditionKey`) — 공고가 달라도 문구가 같으면 같은 키다 */
  key: z.string(),
  /** 화면에 보여줄 조건 원문 */
  clause: z.string(),
  /**
   * 답의 방향.
   * `exclusion` — 제외 대상. "예"면 탈락.
   * `target`    — 신청 대상. "아니오"면 탈락.
   */
  kind: z.enum(['exclusion', 'target']),
});
export type OpenCondition = z.infer<typeof OpenConditionSchema>;

/** 판정 근거 한 줄 */
export const EligibilityReasonSchema = z.object({
  /** 검사한 요건 (예: 업력, 지역) */
  field: z.string(),
  /** 통과 / 미충족 / 확인 불가 */
  verdict: z.enum(['pass', 'fail', 'unknown']),
  message: z.string(),
});
export type EligibilityReason = z.infer<typeof EligibilityReasonSchema>;

export const EligibilitySchema = z.object({
  level: z.enum(ELIGIBILITY_LEVELS),
  /** 충족한 요건 수 / 검사한 요건 수 */
  passed: z.number().int(),
  checked: z.number().int(),
  reasons: z.array(EligibilityReasonSchema),
  /** 아직 답하지 않아 판정을 확정하지 못한 조건들 */
  openConditions: z.array(OpenConditionSchema).default([]),
});
export type Eligibility = z.infer<typeof EligibilitySchema>;

/* ────────────── 캘린더 응답 ────────────── */

/** 캘린더 한 칸에 들어가는 공고 항목 */
export const CalendarItemSchema = z.object({
  grant: GrantSchema,
  status: z.enum(GRANT_STATUSES),
  /** 마감까지 남은 일수. 음수면 이미 마감 */
  dDay: z.number().int().nullable(),
  eligibility: EligibilitySchema,
  /**
   * 관심 공고(별표)인가.
   *
   * 대시보드는 이 값으로 거른다 — 접수 중인 공고가 수백 건이라 전부
   * 찍으면 달력이 점으로 덮인다. 내가 담아 둔 것만 보여야 내 달력이 된다.
   */
  saved: z.boolean().default(false),
  /**
   * 지원 결과 — 사용자가 직접 적은 것. 안 적었으면 `null`.
   *
   * 목록에 함께 실어 보낸다. 이걸 빼고 별도로 부르면 화면마다 부르는 것을
   * 잊어 한쪽에만 안 나오는 일이 생긴다 — 실제로 사업자등록번호가 그랬다.
   */
  outcome: z.enum(GRANT_OUTCOMES).nullable().default(null),
});
export type CalendarItem = z.infer<typeof CalendarItemSchema>;

/** 날짜 하나 (YYYY-MM-DD) 에 묶인 공고들 */
export const CalendarDaySchema = z.object({
  date: z.string(),
  items: z.array(CalendarItemSchema),
});
export type CalendarDay = z.infer<typeof CalendarDaySchema>;

export const CalendarMonthSchema = z.object({
  year: z.number().int(),
  month: z.number().int(),
  days: z.array(CalendarDaySchema),
  summary: z.object({
    total: z.number().int(),
    eligible: z.number().int(),
    conditional: z.number().int(),
    ineligible: z.number().int(),
    unknown: z.number().int(),
    /** 그중 관심 공고 수 */
    saved: z.number().int().default(0),
  }),
});
export type CalendarMonth = z.infer<typeof CalendarMonthSchema>;

/* ────────────── 표시용 라벨 ────────────── */

export const ELIGIBILITY_LABELS: Record<EligibilityLevel, string> = {
  eligible: '지원 가능',
  conditional: '조건부',
  ineligible: '지원 불가',
  unknown: '정보 부족',
};

export const GRANT_STATUS_LABELS: Record<GrantStatus, string> = {
  upcoming: '접수 예정',
  open: '접수 중',
  closing: '마감 임박',
  closed: '마감',
};

/** 마감일로 진행 상태를 계산한다. */
export function resolveGrantStatus(
  applyStartAt: string | null,
  applyEndAt: string | null,
  now: Date,
): { status: GrantStatus; dDay: number | null } {
  if (!applyEndAt) return { status: 'open', dDay: null };

  const end = new Date(applyEndAt);
  const startOfToday = new Date(
    now.getFullYear(), now.getMonth(), now.getDate(),
  ).getTime();
  const startOfEnd = new Date(
    end.getFullYear(), end.getMonth(), end.getDate(),
  ).getTime();

  const dDay = Math.round((startOfEnd - startOfToday) / 86_400_000);

  if (dDay < 0) return { status: 'closed', dDay };
  if (applyStartAt && new Date(applyStartAt) > now) {
    return { status: 'upcoming', dDay };
  }
  if (dDay <= 7) return { status: 'closing', dDay };
  return { status: 'open', dDay };
}

/* ────────────── 판정 진행 표시 ────────────── */

/**
 * 항목별 검사 결과에 누적 카운터를 붙인다.
 *
 *   0/1  법인사업자   ✕  법인사업자만 가능한 지원사업입니다
 *   1/3  업력 3년이내 ✓
 *
 * 앞의 숫자는 "여기까지 봤을 때 몇 개를 충족했는가" 이다.
 * 어디서 걸렸는지 한눈에 보이게 하려는 표기다.
 */
export interface NumberedReason extends EligibilityReason {
  /** 1부터 시작하는 검사 순번 */
  index: number;
  /** 이 항목까지의 누적 충족 수 */
  passedSoFar: number;
  /** 전체 검사 항목 수 */
  total: number;
}

export function numberReasons(reasons: EligibilityReason[]): NumberedReason[] {
  let passed = 0;
  return reasons.map((r, i) => {
    if (r.verdict === 'pass') passed += 1;
    return {
      ...r,
      index: i + 1,
      passedSoFar: passed,
      total: reasons.length,
    };
  });
}

/** `0/1` 형태의 라벨 */
export function reasonCounter(r: NumberedReason): string {
  return `${r.passedSoFar}/${r.index}`;
}

/* ────────────── 연령 ────────────── */

/**
 * 출생연도로 만 나이를 추정한다.
 *
 * 생일 정보가 없으므로 두 가지 값이 가능하다.
 *   생일이 지났으면  올해 - 출생연도
 *   아직이면        올해 - 출생연도 - 1
 *
 * 공고 요건이 이 두 값 사이에 걸치면 단정할 수 없다.
 * 그럴 때는 통과시키지 않고 "확인 필요"로 남긴다.
 */
export function estimateAgeRange(
  birthYear: number,
  now: Date = new Date(),
): { min: number; max: number } {
  const diff = now.getFullYear() - birthYear;
  return { min: Math.max(0, diff - 1), max: Math.max(0, diff) };
}

/** "만 34~35세" 처럼 사람이 읽는 표기 */
export function formatAgeRange(range: { min: number; max: number }): string {
  return range.min === range.max
    ? `만 ${range.max}세`
    : `만 ${range.min}~${range.max}세`;
}
