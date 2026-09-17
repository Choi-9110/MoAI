import type {
  ApplicantType, GrantCategory, Industry,
} from '@moai/shared';

/**
 * K-Startup 응답을 우리 스키마로 옮기는 룰 파서.
 *
 * K-Startup 은 자격 조건 상당수를 이미 코드화해서 내려준다.
 * 예: biz_enyy = "예비창업자,1년미만,3년미만,7년미만"
 *
 * 그래서 이 부분은 LLM 없이 규칙만으로 정확히 뽑을 수 있다.
 * LLM 은 자유 텍스트로만 오는 항목(제외 대상, 우대 사항)에만 쓴다.
 *
 * 원칙: **확신이 없으면 null 을 남긴다.**
 * 틀린 값이 들어가면 지원 가능한 공고를 놓치거나 자격 없는 공고를 추천하게 된다.
 */

/** K-Startup 지원사업 공고 응답 1건 */
export interface KStartupAnnouncement {
  pbanc_sn: number | string;          // 공고 일련번호 (중복 방지 키)
  biz_pbanc_nm: string | null;        // 공고명
  pbanc_ctnt: string | null;          // 공고 내용
  pbanc_ntrp_nm: string | null;       // 공고 기관
  sprv_inst: string | null;           // 감독 기관 구분
  supt_biz_clsfc: string | null;      // 지원사업 분류
  supt_regin: string | null;          // 지원 지역
  biz_enyy: string | null;            // 대상 업력
  aply_trgt: string | null;           // 신청 대상 (코드성)
  aply_trgt_ctnt: string | null;      // 신청 대상 상세 (자유 텍스트)
  aply_excl_trgt_ctnt: string | null; // 제외 대상 (자유 텍스트)
  biz_trgt_age: string | null;        // 대상 연령
  prfn_matr: string | null;           // 우대 사항
  pbanc_rcpt_bgng_dt: string | null;  // 접수 시작 (YYYYMMDD)
  pbanc_rcpt_end_dt: string | null;   // 접수 마감 (YYYYMMDD)
  aply_mthd_eml_rcpt_istc: string | null;    // 이메일 접수
  aply_mthd_vst_rcpt_istc: string | null;    // 방문 접수
  aply_mthd_fax_rcpt_istc: string | null;    // 팩스 접수
  aply_mthd_pssr_rcpt_istc: string | null;   // 우편 접수
  aply_mthd_etc_istc: string | null;         // 기타
  detl_pg_url: string | null;         // 상세 페이지
  biz_gdnc_url: string | null;        // 안내 페이지
  biz_aply_url: string | null;        // 신청 페이지
  rcrt_prgs_yn: string | null;        // 모집 진행 여부 (Y/N)
  intg_pbanc_yn: string | null;       // 통합공고 여부
  prch_cnpl_no: string | null;        // 문의 전화
  biz_prch_dprt_nm: string | null;    // 담당 부서
  [key: string]: unknown;
}

/** 우리 grants 테이블에 넣을 형태 */
export interface ParsedGrant {
  externalId: string;
  title: string;
  agency: string;
  agencyType: 'central' | 'local' | 'public' | 'private';
  category: GrantCategory;
  summary: string | null;

  applyStartAt: Date | null;
  applyEndAt: Date | null;

  targetRegions: string[];
  targetIndustries: Industry[];
  minBusinessYears: number | null;
  maxBusinessYears: number | null;
  applicantTypes: ApplicantType[];
  minAge: number | null;
  maxAge: number | null;
  excludeTarget: string | null;
  applyTargetDetail: string | null;

  sourceUrl: string | null;
  sourceApi: string;
  isActive: boolean;

  /** 구조화하지 못한 원문 — 2단계 LLM 판정의 입력 */
  rawMetadata: Record<string, unknown>;
}

/* ────────────── 분류 매핑 ────────────── */

/** supt_biz_clsfc → 우리 category */
const CATEGORY_MAP: { match: string[]; category: GrantCategory }[] = [
  { match: ['융자', '자금', '보증'], category: 'loan' },
  { match: ['기술개발', 'R&D', 'RND'], category: 'rnd' },
  { match: ['시설', '공간', '보육', '입주'], category: 'space' },
  { match: ['창업교육', '교육'], category: 'education' },
  { match: ['멘토링', '컨설팅'], category: 'mentoring' },
  { match: ['행사', '네트워크', '경진', '공모'], category: 'contest' },
  { match: ['글로벌', '해외', '수출'], category: 'export' },
  { match: ['인력', '채용', '고용'], category: 'employment' },
  { match: ['사업화'], category: 'funding' },
  { match: ['바우처'], category: 'voucher' },
];

/** sprv_inst → 기관 유형 */
function parseAgencyType(sprvInst: string | null): ParsedGrant['agencyType'] {
  if (!sprvInst) return 'public';
  if (sprvInst.includes('민간')) return 'private';
  if (sprvInst.includes('지자체') || sprvInst.includes('지방')) return 'local';
  if (sprvInst.includes('부처') || sprvInst.includes('중앙')) return 'central';
  return 'public';
}

export function parseCategory(clsfc: string | null): GrantCategory {
  if (!clsfc) return 'etc';
  for (const { match, category } of CATEGORY_MAP) {
    if (match.some((m) => clsfc.includes(m))) return category;
  }
  return 'etc';
}

/* ────────────── 업력 ────────────── */

/**
 * "예비창업자,1년미만,2년미만,3년미만,5년미만,7년미만,10년미만"
 *   → maxBusinessYears: 10, 예비창업자 포함
 *
 * "3년미만,5년미만"
 *   → maxBusinessYears: 5
 *
 * 값이 전부 나열형이므로 **가장 큰 값이 상한**이 된다.
 */
export function parseBusinessYears(bizEnyy: string | null): {
  min: number | null;
  max: number | null;
  includesPreliminary: boolean;
} {
  if (!bizEnyy) return { min: null, max: null, includesPreliminary: false };

  const tokens = bizEnyy.split(',').map((t) => t.trim()).filter(Boolean);
  const includesPreliminary = tokens.some((t) => t.includes('예비창업'));

  const years = tokens
    .map((t) => /(\d+)\s*년/.exec(t)?.[1])
    .filter((n): n is string => Boolean(n))
    .map(Number);

  if (years.length === 0) {
    // "예비창업자"만 있으면 창업 전만 대상이다.
    return {
      min: null,
      max: includesPreliminary ? 0 : null,
      includesPreliminary,
    };
  }

  return {
    min: null, // K-Startup 은 하한을 따로 주지 않는다
    max: Math.max(...years),
    includesPreliminary,
  };
}

/* ────────────── 지역 ────────────── */

/** "전국" 은 제한 없음이므로 빈 배열로 둔다. */
export function parseRegions(suptRegin: string | null): string[] {
  if (!suptRegin) return [];
  const raw = suptRegin.trim();
  if (!raw || raw === '전국') return [];

  return raw
    .split(',')
    .map((r) => r.trim().replace(/(특별시|광역시|특별자치시|특별자치도|도)$/, ''))
    .filter((r) => r.length > 0 && r !== '전국');
}

/* ────────────── 신청 대상 ────────────── */

/**
 * aply_trgt 는 "대학생,일반인,대학,연구기관,일반기업,1인 창조기업" 같은 나열이다.
 * 여기에 업력 정보(예비창업자 포함 여부)를 합쳐 사업자 형태를 정한다.
 *
 * 확신이 없으면 빈 배열(= 제한 없음)로 둔다. 잘못 좁히면 공고를 놓친다.
 */
export function parseApplicantTypes(
  aplyTrgt: string | null,
  includesPreliminary: boolean,
): ApplicantType[] {
  const types = new Set<ApplicantType>();
  const raw = aplyTrgt ?? '';

  // 예비창업자
  if (
    includesPreliminary ||
    /예비창업|대학생|일반인|청년/.test(raw)
  ) {
    types.add('preliminary');
  }

  // 사업자
  if (/기업|사업자|소상공인|창조기업|중소기업|법인/.test(raw)) {
    types.add('individual');
    types.add('corporate');
  }

  // 법인만 특정하는 표현
  if (/법인만|법인 사업자만/.test(raw)) {
    types.delete('individual');
    types.delete('preliminary');
    types.add('corporate');
  }

  return [...types];
}

/* ────────────── 날짜 ────────────── */

/** "20260908" → Date. 마감일은 그날 끝까지로 본다. */
export function parseDate(
  yyyymmdd: string | null,
  endOfDay = false,
): Date | null {
  if (!yyyymmdd) return null;
  const s = String(yyyymmdd).replace(/\D/g, '');
  if (s.length !== 8) return null;

  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(4, 6));
  const d = Number(s.slice(6, 8));
  if (!y || !m || !d) return null;

  return endOfDay
    ? new Date(y, m - 1, d, 23, 59, 59)
    : new Date(y, m - 1, d, 0, 0, 0);
}

/* ────────────── 변환 ────────────── */

export function parseAnnouncement(
  row: KStartupAnnouncement,
): ParsedGrant | null {
  /*
   * 제목도 본문과 똑같이 실체 참조를 풀어야 한다.
   * API 가 &apos; 를 그대로 보내는데, 이걸 안 풀면 화면에
   * "「민관협력」&apos;공공데이터 활용&apos; 모집공고" 처럼 찍힌다.
   */
  const title = decodeEntities(row.biz_pbanc_nm);
  if (!title) return null; // 공고명 없는 행은 버린다

  const { min, max, includesPreliminary } = parseBusinessYears(row.biz_enyy);
  const age = parseTargetAge(row.biz_trgt_age);

  return {
    externalId: String(row.pbanc_sn),
    title,
    agency: row.pbanc_ntrp_nm?.trim() || '미상',
    agencyType: parseAgencyType(row.sprv_inst),
    category: parseCategory(row.supt_biz_clsfc),
    summary: decodeEntities(row.pbanc_ctnt),

    applyStartAt: parseDate(row.pbanc_rcpt_bgng_dt),
    applyEndAt: parseDate(row.pbanc_rcpt_end_dt, true),

    targetRegions: parseRegions(row.supt_regin),
    targetIndustries: [], // K-Startup 은 업종 코드를 주지 않는다
    minBusinessYears: min,
    maxBusinessYears: max,
    applicantTypes: parseApplicantTypes(row.aply_trgt, includesPreliminary),
    minAge: age.min,
    maxAge: age.max,
    excludeTarget: decodeEntities(row.aply_excl_trgt_ctnt),
    applyTargetDetail: decodeEntities(row.aply_trgt_ctnt),

    sourceUrl: row.detl_pg_url || row.biz_gdnc_url || row.biz_aply_url || null,
    sourceApi: 'kstartup',
    isActive: row.rcrt_prgs_yn !== 'N',

    // 구조화하지 못한 항목은 그대로 보관한다. 2단계 판정의 입력이 된다.
    rawMetadata: {
      applyTargetDetail: decodeEntities(row.aply_trgt_ctnt),
      // 접수 경로 — 화면에서 "온라인 신청" 버튼으로 쓴다
      applyMethods: {
        online: row.aply_mthd_onli_rcpt_istc,
        email: row.aply_mthd_eml_rcpt_istc,
        visit: row.aply_mthd_vst_rcpt_istc,
        fax: row.aply_mthd_fax_rcpt_istc,
        post: row.aply_mthd_pssr_rcpt_istc,
        etc: row.aply_mthd_etc_istc,
      },
      guideUrl: row.biz_gdnc_url,
      applyUrl: row.biz_aply_url,
      excludeTarget: decodeEntities(row.aply_excl_trgt_ctnt),
      targetAge: row.biz_trgt_age,
      preferential: decodeEntities(row.prfn_matr),
      integratedNotice: row.intg_pbanc_yn,
      contact: row.prch_cnpl_no,
      department: row.biz_prch_dprt_nm,
      rawCategory: row.supt_biz_clsfc,
      rawRegion: row.supt_regin,
      rawBusinessYears: row.biz_enyy,
      rawApplyTarget: row.aply_trgt,
    },
  };
}

/* ────────────── 연령 ────────────── */

/**
 * "만 20세 이상 ~ 만 39세 이하,만 40세 이상"
 *
 * 구간이 여러 개 나열되면 **합집합**이다.
 * 위 예시는 20세 이상 전부를 뜻하므로 상한이 없다.
 *
 * 전 구간이 다 들어 있으면 제한 없음(null, null)으로 본다.
 */
export function parseTargetAge(bizTrgtAge: string | null): {
  min: number | null;
  max: number | null;
} {
  if (!bizTrgtAge) return { min: null, max: null };

  const tokens = bizTrgtAge.split(',').map((t) => t.trim()).filter(Boolean);
  if (tokens.length === 0) return { min: null, max: null };

  let min: number | null = null;
  let max: number | null = null;
  let openEnded = false; // 상한 없는 구간이 하나라도 있는가
  let openStart = false; // 하한 없는 구간이 하나라도 있는가

  for (const t of tokens) {
    const nums = [...t.matchAll(/(\d+)\s*세/g)].map((m) => Number(m[1]));

    if (/미만/.test(t) && nums.length === 1) {
      // "만 20세 미만" → 하한 없음, 상한 19
      openStart = true;
      max = max === null ? nums[0] - 1 : Math.max(max, nums[0] - 1);
      continue;
    }
    if (/이상/.test(t) && !/이하/.test(t) && nums.length === 1) {
      // "만 40세 이상" → 상한 없음
      openEnded = true;
      min = min === null ? nums[0] : Math.min(min, nums[0]);
      continue;
    }
    if (nums.length >= 2) {
      // "만 20세 이상 ~ 만 39세 이하"
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      min = min === null ? lo : Math.min(min, lo);
      max = max === null ? hi : Math.max(max, hi);
    }
  }

  return {
    min: openStart ? null : min,
    max: openEnded ? null : max,
  };
}

/* ────────────── 텍스트 정리 ────────────── */

/**
 * 공공 API 응답에는 HTML 엔티티가 그대로 들어 있다.
 *   "&apos;23년~&apos;26년"  →  "'23년~'26년"
 * 화면에 날것으로 노출되므로 저장 전에 풀어준다.
 */
export function decodeEntities(text: string | null): string | null {
  if (!text) return null;
  const decoded = text
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
    .replace(/&amp;/g, '&') // 마지막에 — 이중 인코딩 대비
    .trim();
  return decoded || null;
}
