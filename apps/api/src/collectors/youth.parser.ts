import type { ApplicantType, GrantCategory } from '@moai/shared';

/**
 * 온통청년(한국고용정보원) 청년정책 응답.
 *
 * 필드가 예순 개쯤 오는데, **우리가 쓰는 것만** 적어 둔다. 다 옮겨 적으면
 * 어느 것이 실제로 쓰이는지 알 수 없게 된다.
 */
export interface YouthPolicy {
  plcyNo: string;
  plcyNm: string | null;            // 정책명
  plcyExplnCn: string | null;       // 설명
  plcySprtCn: string | null;        // 지원 내용
  lclsfNm: string | null;           // 대분류 (일자리·주거·교육…)
  mclsfNm: string | null;           // 중분류 (취업·창업·주택…)
  sprvsnInstCdNm: string | null;    // 주관 기관
  operInstCdNm: string | null;      // 운영 기관
  aplyYmd: string | null;           // `20260831 ~ 20261231`
  aplyPrdSeCd: string | null;       // 신청 기간 구분(상시 등)
  bizPrdEtcCn: string | null;       // 사업 기간 설명
  plcyAplyMthdCn: string | null;    // 신청 방법
  sbmsnDcmntCn: string | null;      // 제출 서류
  aplyUrlAddr: string | null;       // 신청 주소
  refUrlAddr1: string | null;       // 참고 주소
  sprtTrgtMinAge: string | null;
  sprtTrgtMaxAge: string | null;
  sprtSclCnt: string | null;        // 지원 규모(명)
  zipCd: string | null;             // 지역 우편번호(쉼표로 여러 개)
}

/**
 * 우리가 담을 것인가.
 *
 * **중분류가 `창업` 인 것만 받는다.** 전체 2,745건 중 327건이다. 나머지는
 * 월세·면접비·문화패스처럼 **사업과 무관한 개인 지원**이라, 기업 공고
 * 목록에 섞이면 무엇을 보는 화면인지 흐려진다.
 *
 * 예비창업자는 개인이지만 우리 사용자다 — 가르는 기준은 "개인이냐 기업이냐"가
 * 아니라 **"사업을 하려는 것이냐"** 다.
 */
export function isStartupPolicy(row: YouthPolicy): boolean {
  return (row.mclsfNm ?? '').trim() === '창업';
}

/**
 * 우리 유형으로 옮긴다.
 *
 * 온통청년은 창업을 한 덩어리로 준다. 그 안에 사업화 자금도 있고 특강도
 * 있어서, 그대로 두면 아까 만든 유형 필터가 무의미해진다. **이름과 지원
 * 내용을 보고 다시 가른다.**
 */
export function parseCategory(row: YouthPolicy): GrantCategory {
  const text = `${row.plcyNm ?? ''} ${row.plcySprtCn ?? ''} ${row.plcyExplnCn ?? ''}`;

  /* 순서가 중요하다 — 위에서 걸리면 아래는 안 본다 */
  if (/융자|이차보전|보증|대출/.test(text)) return 'loan';
  if (/입주|임대|사무실|공간|쇼룸|청년몰|보육/.test(text)) return 'space';
  if (/경진대회|공모전|해커톤|아이디어\s*대회|페스타|박람회/.test(text)) return 'contest';
  if (/교육|특강|아카데미|스쿨|과정|강좌|양성/.test(text)) return 'education';
  if (/멘토링|컨설팅|자문|코칭/.test(text)) return 'mentoring';
  if (/바우처/.test(text)) return 'voucher';
  if (/수출|해외|글로벌|판로/.test(text)) return 'export';
  if (/사업화|지원금|보조금|창업자금|성장자금/.test(text)) return 'funding';
  return 'startup';
}

/**
 * 신청 기간.
 *
 * `20260831 ~ 20261231` 로 온다. 비어 있는 것도 많은데(상시 모집), 그때는
 * **마감일을 지어내지 않는다** — 없는 마감일을 만들면 달력에 엉뚱한 날짜로
 * 놓이고, 지난 것처럼 보여 사라진다.
 */
export function parsePeriod(raw: string | null): {
  start: Date | null;
  end: Date | null;
} {
  const m = /(\d{4})(\d{2})(\d{2})\s*~\s*(\d{4})(\d{2})(\d{2})/.exec(raw ?? '');
  if (!m) return { start: null, end: null };

  const [, y1, m1, d1, y2, m2, d2] = m;
  return {
    start: toDate(y1, m1, d1),
    // 마감일은 그날 끝까지다. 자정으로 두면 당일 공고가 이미 지난 것이 된다.
    end: toDate(y2, m2, d2, true),
  };
}

function toDate(y: string, m: string, d: string, endOfDay = false): Date | null {
  const date = new Date(
    `${y}-${m}-${d}T${endOfDay ? '23:59:59' : '00:00:00'}+09:00`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** 나이 조건 — 0 이나 빈 값은 "제한 없음"이다 */
export function parseAge(raw: string | null): number | null {
  const n = Number((raw ?? '').trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * 지원 대상.
 *
 * 온통청년은 사업자 형태를 따로 주지 않는다. 청년 창업 정책은 대개
 * **예비창업자와 초기 사업자 둘 다** 받으므로 셋을 다 열어 둔다 —
 * 좁게 잡으면 낼 수 있는 공고가 "자격 미달"로 숨는다.
 */
export function parseApplicantTypes(row: YouthPolicy): ApplicantType[] {
  const text = `${row.plcyNm ?? ''} ${row.plcySprtCn ?? ''}`;

  /* 예비창업자만 받는다고 적힌 것 */
  if (/예비\s*창업/.test(text) && !/기창업|사업자등록/.test(text)) {
    return ['preliminary'];
  }
  /* 사업자가 있어야 하는 것 */
  if (/사업자등록증|기창업자|창업\s*\d+년\s*이내/.test(text)) {
    return ['individual', 'corporate'];
  }
  return ['preliminary', 'individual', 'corporate'];
}

/**
 * 기관 이름.
 *
 * 주관이 비면 운영 기관을 쓴다. 둘 다 없으면 "온통청년"으로 두지 않는다 —
 * 그건 출처지 공고를 낸 곳이 아니라서, 사용자가 어디에 문의할지 알 수 없다.
 */
export function parseAgency(row: YouthPolicy): string {
  return (
    row.sprvsnInstCdNm?.trim() ||
    row.operInstCdNm?.trim() ||
    '기관 미상'
  );
}

/**
 * 공고를 볼 수 있는 주소.
 *
 * 신청 주소가 있으면 그것을, 없으면 참고 주소를 쓴다. 둘 다 없으면
 * `null` 로 둔다 — 온통청년 목록 주소를 대신 넣으면 눌렀을 때 자기 공고가
 * 아닌 목록이 열려서, 없느니만 못하다.
 */
export function parseUrl(row: YouthPolicy): string | null {
  const url = row.aplyUrlAddr?.trim() || row.refUrlAddr1?.trim() || '';
  return /^https?:\/\//.test(url) ? url : null;
}

/** 요약 — 지원 내용이 본문보다 쓸모 있다 */
export function parseSummary(row: YouthPolicy): string | null {
  const text = (row.plcySprtCn || row.plcyExplnCn || '').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 1000) : null;
}
