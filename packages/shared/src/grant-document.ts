import { z } from 'zod';
import { APPLICANT_TYPES, INDUSTRIES } from './enums';
import { REGION_DISTRICTS } from './regions';

/**
 * 공고문(첨부 HWP·PDF)에서 신청 자격을 뽑아내는 계약.
 *
 * 공공 API 는 목록 수준 정보만 준다. 기업마당 공고의 신청대상 칸은 평균
 * 18자("중소기업")라, 종업원·매출 상한이나 "OO사업 선정기업 대상" 같은 진짜
 * 조건은 전부 첨부 공고문에 있다. 이걸 로컬 Claude 로 **공고당 한 번** 읽어
 * 구조화해 두고, 판정은 코드가 한다.
 *
 * 원칙은 판정과 같다 — 모르면 비워 둔다. 잘못 채운 상한은 지원 가능한
 * 공고를 숨기고, 잘못 채운 전용 대상은 남의 공고를 추천한다.
 */

/** 프롬프트·스키마를 바꾸면 올린다. 낮은 버전으로 뽑은 공고는 다시 읽는다. */
export const DOCUMENT_EXTRACT_VERSION = 1;

export const DOCUMENT_STATUSES = [
  'extracted',   // 읽고 조건을 뽑았다
  'no_text',     // 파일은 받았는데 글자가 없다 (스캔 PDF·이미지)
  'unsupported', // 읽을 수 없는 형식
  'failed',      // 내려받기·모델 호출 실패 — 몇 번 다시 시도한다
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

const Bound = z.object({ value: z.number(), inclusive: z.boolean() });

export const EXCLUSIVE_TARGETS = [
  'female', 'restart', 'student', 'career_break', 'foreigner',
  'smallBusiness', 'socialEconomy', 'exporting', 'ip',
] as const;

export const DocumentConditionsSchema = z.object({
  /**
   * 트랙·분야별로 자격이 다른 공고인가.
   * 참이면 아래 구조화 값은 **모든 트랙에 공통인 것만** 들어 있어야 한다.
   */
  multiTrack: z.boolean().default(false),
  applicantTypes: z.array(z.enum(APPLICANT_TYPES)).nullable().default(null),
  businessYears: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      /** "7년 미만"처럼 상한을 포함하지 않으면 true */
      exclusiveMax: z.boolean().default(false),
    })
    .nullable()
    .default(null),
  age: z.object({ min: z.number().nullable(), max: z.number().nullable() }).nullable().default(null),
  regions: z.array(z.string()).default([]),
  districts: z.array(z.string()).default([]),
  maxEmployees: Bound.nullable().default(null),
  maxRevenue: Bound.nullable().default(null),
  requiredCertifications: z.array(z.string()).default([]),
  exclusiveTargets: z.array(z.enum(EXCLUSIVE_TARGETS)).default([]),
  industries: z.array(z.enum(INDUSTRIES)).default([]),
  /** 충족해야 하는 조건 중 위 칸에 못 넣은 것 — 원문 그대로 짧게 */
  requirements: z.array(z.string()).default([]),
  /** 해당하면 신청할 수 없는 조건 — 원문 그대로 짧게 */
  exclusions: z.array(z.string()).default([]),
  preferences: z.array(z.string()).default([]),
  /** 근거 인용 — 화면에 그대로 보여 준다 */
  quotes: z.array(z.object({ field: z.string(), text: z.string() })).default([]),
});
export type DocumentConditions = z.infer<typeof DocumentConditionsSchema>;

/** 공고에 붙여 두는 값 — 조건과 그걸 뽑은 출처 */
export interface GrantDocumentConditions extends DocumentConditions {
  version: number;
  model: string;
  sourceUrl: string;
  extractedAt: string;
}

export const DOCUMENT_SYSTEM_PROMPT = `당신은 한국 정부·공공 지원사업 공고문에서 **신청 자격 조건**만 정확히 뽑아내는 추출기입니다.

원칙
1. 공고문에 **명시된 것만** 적습니다. 추정·상식 보완 금지. 확실하지 않으면 null 또는 빈 배열.
2. "우대", "가점", "우선 선정", "가산점"은 자격 조건이 아닙니다. preferences 에만 적습니다.
3. 여러 갈래 중 하나만 충족하면 되는 경우("① 예비창업자 ② 재학생")는 그 갈래를 전용 조건으로 적지 않습니다.
4. **트랙·분야·유형별로 자격이 다르면** multiTrack 을 true 로 하고, 구조화 칸(applicantTypes·businessYears·age·regions·maxEmployees·maxRevenue·exclusiveTargets·industries)에는 **모든 트랙에 공통인 조건만** 적습니다. 트랙별 조건은 requirements 에 "트랙명: 조건" 으로 적습니다.
5. 세금 체납, 휴·폐업, 부도·회생, 참여제한 제재, 신용불량, 임금체불, 허위 신청, 대기업·상호출자제한기업집단, 사행·유흥업종, **동일 건 중복 수혜 금지** 같은 표준 결격 사유는 적지 않습니다.
6. requirements·exclusions 에는 **신청자가 신청 전에 '예/아니오'로 답할 수 있는 자격**만 적습니다. 아래는 자격이 아니므로 **적지 않습니다**:
   - 제출 서류·증빙("사업자등록증 제출", "수료증 제출")
   - 지원 범위·비용 규칙("공고일 이전 지출 건 지원 불가", "2026년 출원 건만 지원", "내수용 사용 불가")
   - 신청 건수·방법("최대 3건", "1개 트랙만", "대표자 본인 신청")
   - 선정 절차·평가("60점 이상", "적정성 검토", "예산 소진 시 마감")
   - 선정 **후** 의무("3개월 이내 출원", "사업기간 중 이전 불가", "매출실적 제출 의무")
   - 지역·업력·업종·규모처럼 위 구조화 칸으로 이미 표현한 것의 반복
7. 모든 구조화 값에는 근거가 되는 **공고문 원문 문장**을 quotes 에 그대로 인용합니다.

용어
- applicantTypes: preliminary=예비창업자(사업자등록 전), individual=개인사업자, corporate=법인사업자. "중소기업", "창업기업" 만으로는 제한이 아닙니다.
- businessYears: 업력(창업·개업 후 경과 연수). "7년 미만"은 {"min":null,"max":7,"exclusiveMax":true}, "7년 이내"는 {"max":7,"exclusiveMax":false}.
- regions: **광역 시·도** 소재지 제한("서울","경기","부산","경남" …). 전국이면 []. 시·군·구는 여기 넣지 말고 districts 에.
- districts: 시·군·구 제한("성남시","창원시","울주군"). 이때 regions 에는 그 시·군이 속한 시·도를 적습니다.
- maxEmployees / maxRevenue: 상시근로자 수·매출액(원) **상한**. "10인 미만"은 {"value":10,"inclusive":false}.
- exclusiveTargets: 공고 **전체**가 그 대상에게만 열려 있을 때만.
  female=여성(대표·기업), restart=재창업자, student=대학(원)생, career_break=경력단절자, foreigner=외국인·다문화·북한이탈주민,
  smallBusiness=**소상공인**(소기업·중소기업과 다름), socialEconomy=사회적기업·협동조합·마을기업 등, exporting=수출 실적이 있는 기업, ip=특허 등 지식재산 보유 기업.
- industries: 업종 제한이 명시된 경우만. it=정보통신·SW, manufacturing=제조, bio=바이오·의료·제약, content=콘텐츠·문화, commerce=유통·커머스, service=서비스, food=식품·외식, construction=건설·부동산.
- requirements / exclusions: 특정 사업 선정 이력, 입주 요건, 이전 조건, 교육 이수, 중복 수혜 제한처럼 칸에 못 넣은 조건. 원문을 80자 이내로 옮깁니다.`;

export const DOCUMENT_JSON_FORMAT = `## 출력 (JSON 하나만, 설명 금지)
{
  "multiTrack": boolean,
  "applicantTypes": ["preliminary"|"individual"|"corporate"] | null,
  "businessYears": { "min": number|null, "max": number|null, "exclusiveMax": boolean } | null,
  "age": { "min": number|null, "max": number|null } | null,
  "regions": string[],
  "districts": string[],
  "maxEmployees": { "value": number, "inclusive": boolean } | null,
  "maxRevenue": { "value": number, "inclusive": boolean } | null,
  "requiredCertifications": string[],
  "exclusiveTargets": string[],
  "industries": string[],
  "requirements": string[],
  "exclusions": string[],
  "preferences": string[],
  "quotes": [{ "field": "필드명", "text": "원문 인용" }]
}`;

/** 모델에 넘길 본문 상한 — 긴 공고의 뒤쪽은 대개 서식·붙임이다 */
export const DOCUMENT_MAX_CHARS = 40_000;

/**
 * 추출한 글을 모델에 넘기기 좋게 다듬는다.
 *
 * PDF 는 굵은 글씨를 같은 글자를 여러 번 겹쳐 찍어 표현하는 경우가 있어
 * "소상공인소상공인소상공인…" 처럼 읽힌다. 세 번 이상 반복되면 하나로 줄인다.
 */
export function cleanDocumentText(raw: string): string {
  return raw
    .replace(/\u0000/g, '')
    .replace(/(.{1,12}?)\1{2,}/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** 글자가 사실상 없는지 — 스캔 PDF 는 쪽 번호만 남는다 */
export function hasReadableText(text: string): boolean {
  return (text.match(/[가-힣]/g) ?? []).length >= 200;
}

export function buildDocumentPrompt(input: { title: string; text: string }): string {
  return `## 공고 제목
${input.title}

## 공고문 본문
${cleanDocumentText(input.text).slice(0, DOCUMENT_MAX_CHARS)}`;
}

/**
 * 모델 응답을 조건으로 바꾼다. 해석에 실패하면 `null` — 추측으로 채우지 않는다.
 *
 * 스키마에 안 맞는 항목 하나 때문에 전체를 버리지 않도록, 열거값 배열은
 * 아는 값만 남긴다. 모델이 "소기업" 같은 값을 넣어도 나머지는 살린다.
 */
export function parseDocumentOutput(raw: string): DocumentConditions | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return null;

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }

  const only = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
    Array.isArray(v) ? v.filter((x): x is T => allowed.includes(x as T)) : [];
  const strings = (v: unknown, max = 200): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '')
          .map((x) => x.trim().slice(0, max))
      : [];

  // 모델이 시·군을 시·도 칸에 넣는 일이 있다("창원"). 광역이 아니면 시·군으로 옮긴다.
  const { regions, districts } = normalizeRegions(
    strings(json.regions, 20),
    strings(json.districts, 20),
  );

  const parsed = DocumentConditionsSchema.safeParse({
    ...json,
    applicantTypes: Array.isArray(json.applicantTypes)
      ? only(json.applicantTypes, APPLICANT_TYPES)
      : null,
    exclusiveTargets: only(json.exclusiveTargets, EXCLUSIVE_TARGETS),
    industries: only(json.industries, INDUSTRIES),
    regions,
    districts,
    requiredCertifications: strings(json.requiredCertifications, 40),
    requirements: strings(json.requirements),
    exclusions: strings(json.exclusions),
    preferences: strings(json.preferences),
    quotes: Array.isArray(json.quotes)
      ? json.quotes.filter(
          (q): q is { field: string; text: string } =>
            !!q && typeof (q as { field?: unknown }).field === 'string' &&
            typeof (q as { text?: unknown }).text === 'string',
        ).map((q) => ({ field: q.field, text: q.text.slice(0, 300) }))
      : [],
  });
  if (!parsed.success) return null;

  // 빈 applicantTypes 배열은 "제한 없음"이다
  const data = parsed.data;
  if (data.applicantTypes?.length === 0) data.applicantTypes = null;
  return data;
}

const PROVINCES = Object.keys(REGION_DISTRICTS);

/** "서울특별시"·"경상남도" → "서울"·"경남" */
function provinceOf(name: string): string | null {
  const short = name
    .replace(/특별자치(시|도)$|특별시$|광역시$|자치도$/, '')
    .replace(/^경상남도$/, '경남').replace(/^경상북도$/, '경북')
    .replace(/^전라남도$/, '전남').replace(/^전라북도$/, '전북')
    .replace(/^충청남도$/, '충남').replace(/^충청북도$/, '충북')
    .replace(/도$/, '');
  return PROVINCES.includes(short) ? short : null;
}

/**
 * 시·도와 시·군·구를 가른다.
 *
 * 시·도 칸에 시·군이 들어오면 그 시·군이 속한 시·도를 찾아 채운다 —
 * "창원"만 두면 경남 기업이 모두 지역 불일치로 탈락한다.
 */
export function normalizeRegions(
  rawRegions: string[],
  rawDistricts: string[],
): { regions: string[]; districts: string[] } {
  const regions = new Set<string>();
  const districts = new Set<string>();

  const place = (name: string) => {
    const province = provinceOf(name.trim());
    if (province) {
      regions.add(province);
      return;
    }
    const key = name.trim().replace(/(특별자치)?[시군구]$/, '');
    for (const [prov, list] of Object.entries(REGION_DISTRICTS)) {
      const hit = list.find((d) => d.replace(/(특별자치)?[시군구]$/, '') === key);
      if (hit) {
        regions.add(prov);
        districts.add(hit);
        return;
      }
    }
    // 모르는 이름은 버린다 — 틀린 지역으로 탈락시키는 것보다 낫다
  };

  rawRegions.forEach(place);
  rawDistricts.forEach(place);
  return { regions: [...regions], districts: [...districts] };
}

/** 공고에서 읽을 첨부 — 기업마당이 주는 단일 파일 */
export interface GrantDocumentJob {
  grantId: string;
  title: string;
  url: string;
  fileName: string;
}

/** 에이전트가 읽고 돌려주는 결과 */
export interface GrantDocumentResult {
  sourceUrl: string;
  fileName: string;
  status: DocumentStatus;
  text?: string | null;
  conditions?: DocumentConditions | null;
  model?: string | null;
  version: number;
  error?: string | null;
}
