/**
 * 나라장터(조달청 입찰) 관련 상수.
 *
 * 지원사업과 입찰은 판정하는 축이 다르다 — 지원사업은 업력·매출·대상 구분을
 * 보지만, 입찰은 **면허(업종)와 지역**을 본다. 그래서 프로필에서 받는 것도
 * 다르고, 이 파일에 그 재료를 모아 둔다.
 */

/* ────────────── 관심 분야 ────────────── */

/**
 * 무엇을 찾고 있는지.
 *
 * 셋의 성격이 같지 않다 — `grant`·`bid` 는 **데이터 출처**가 다르고,
 * `rnd` 는 지원사업 안에서 R&D 만 추려 보는 **필터**다. 그래도 사용자에게는
 * "무엇을 찾고 있나" 라는 한 가지 질문이라 함께 둔다.
 */
export const INTERESTS = [
  'grant', // 정부 지원사업 — 지원금·자금·교육·공간
  'rnd',   // 공공 R&D 과제 — 위에서 기술개발 과제만
  'bid',   // 나라장터 공공 입찰 — 관공서 발주 수주
] as const;
export type Interest = (typeof INTERESTS)[number];

export const INTEREST_LABELS: Record<Interest, string> = {
  grant: '정부 지원사업',
  rnd: '공공 R&D 과제',
  bid: '나라장터 공공 입찰',
};

export const INTEREST_HINTS: Record<Interest, string> = {
  grant: '지원금 · 자금 · 교육 · 공간',
  rnd: '기술개발 과제만 추려 보기',
  bid: '관공서 발주 사업 수주',
};

/** 기본값 — 아무것도 안 고른 사람에게는 지원사업을 보여 준다. */
export const DEFAULT_INTERESTS: Interest[] = ['grant'];

/* ────────────── 지역 표기 ────────────── */

/**
 * 우리 지역 표기 → 나라장터 표기.
 *
 * **나라장터는 정식 명칭에 그 글자가 들어가는지로 찾는다.** 그래서 "경기"는
 * `경기도` 에 걸리지만 "경북"은 `경상북도` 에 걸리지 않는다. 실제로 확인했다:
 *
 *     충북 0건  →  충청북도 74건
 *     경북 0건  →  경상북도 124건
 *
 * 이 표가 없으면 충청·경상 지역 업체에게 입찰 공고가 **한 건도 안 뜬다.**
 * 여기 없는 지역은 우리 표기를 그대로 쓴다.
 */
const REGION_OVERRIDES: Record<string, string> = {
  충북: '충청북도',
  충남: '충청남도',
  경북: '경상북도',
  경남: '경상남도',
};

/** 지역 이름을 나라장터가 알아듣는 형태로 바꾼다 */
export function toProcurementRegion(region: string | null | undefined): string | null {
  const name = (region ?? '').trim();
  if (!name) return null;
  return REGION_OVERRIDES[name] ?? name;
}

/**
 * 시도해 볼 지역 표기를 **순서대로** 돌려준다.
 *
 * **한쪽만 맞는 경우가 지역마다 갈린다.** 31일치를 세어 보면:
 *
 *     경북 0건    / 경상북도 866건     ← 정식 명칭만 맞음
 *     충북 0건    / 충청북도 566건     ← 정식 명칭만 맞음
 *     전북 511건  / 전라북도 0건       ← 짧은 표기만 맞음 (전북특별자치도)
 *     전남 761건  / 전라남도 0건       ← 짧은 표기만 맞음
 *     경기 1186건 / 경기도 1186건      ← 둘 다 맞음
 *
 * 행정구역이 개편되면서(전북·강원특별자치도) 옛 이름이 더는 안 걸린다.
 * **앞으로 또 바뀔 수 있으므로 한 표기에 걸지 않는다** — 첫 번째로 찾고,
 * 0건이면 두 번째를 시도한다. 순서는 위 실측에서 맞는 쪽을 앞에 뒀으므로
 * 대개 한 번에 끝나고, 헛호출은 그 지역에 공고가 정말 없을 때만 생긴다.
 */
export function procurementRegionCandidates(
  region: string | null | undefined,
): string[] {
  const name = (region ?? '').trim();
  if (!name) return [];

  const formal = REGION_OVERRIDES[name];
  // 정식 명칭이 따로 있는 지역은 그쪽이 맞는 것으로 확인됐다.
  const ordered = formal ? [formal, name] : [name];

  return [...new Set(ordered)];
}

/* ────────────── 업종 ────────────── */

/** 입찰 업무 구분 — 오퍼레이션이 이 단위로 갈린다 */
export const BID_KINDS = ['cnstwk', 'servc', 'thng'] as const;
export type BidKind = (typeof BID_KINDS)[number];

export const BID_KIND_LABELS: Record<BidKind, string> = {
  cnstwk: '공사',
  servc: '용역',
  thng: '물품',
};

export interface ProcurementIndustry {
  /** 나라장터에 그대로 넘기는 값 — 손대지 말 것 */
  value: string;
  /** 화면에 보여 줄 짧은 이름 */
  label: string;
  kind: BidKind;
}

/**
 * 선택할 수 있는 업종.
 *
 * **`value` 는 실제 공고에서 뽑은 문자열 그대로다.** 눈으로 봐서는 같아
 * 보여도 구분자가 제각각이라 직접 적으면 안 된다 — 실제로 세 종류가 섞여
 * 있다:
 *
 *     기계설비ㆍ가스공사업      ㆍ (U+318D 한글 아래아)
 *     산업·환경설비공사업       ·  (U+00B7 가운뎃점)
 *     석면해체.제거업           .  (마침표)
 *
 * 처음에 눈에 익은 `·` 로 적었다가 여섯 개 업종이 전부 0건으로 나왔다.
 * 그래서 값은 응답에서 수집한 것을 그대로 두고, 읽기 좋은 이름은 `label`
 * 로 따로 붙인다.
 */
export const PROCUREMENT_INDUSTRIES: ProcurementIndustry[] = [
  // 공사 — 최근 30일 공고가 많은 순
  { value: '건축공사업', label: '건축', kind: 'cnstwk' },
  { value: '전기공사업', label: '전기', kind: 'cnstwk' },
  { value: '토목공사업', label: '토목', kind: 'cnstwk' },
  { value: '토목건축공사업', label: '토목건축', kind: 'cnstwk' },
  { value: '실내건축공사업', label: '실내건축', kind: 'cnstwk' },
  { value: '정보통신공사업', label: '정보통신', kind: 'cnstwk' },
  { value: '소방시설공사업', label: '소방시설', kind: 'cnstwk' },
  { value: '기계설비ㆍ가스공사업', label: '기계설비·가스', kind: 'cnstwk' },
  { value: '지반조성ㆍ포장공사업', label: '지반조성·포장', kind: 'cnstwk' },
  { value: '도장ㆍ습식ㆍ방수ㆍ석공사업', label: '도장·방수·석공', kind: 'cnstwk' },
  { value: '금속창호ㆍ지붕건축물조립공사업', label: '금속창호·지붕', kind: 'cnstwk' },
  { value: '조경식재ㆍ시설물공사업', label: '조경식재·시설물', kind: 'cnstwk' },
  { value: '조경공사업', label: '조경', kind: 'cnstwk' },
  { value: '상ㆍ하수도설비공사업', label: '상·하수도설비', kind: 'cnstwk' },
  { value: '수중ㆍ준설공사업', label: '수중·준설', kind: 'cnstwk' },
  { value: '산업·환경설비공사업', label: '산업·환경설비', kind: 'cnstwk' },
  { value: '석면해체.제거업', label: '석면해체·제거', kind: 'cnstwk' },

  // 용역
  { value: '소프트웨어사업', label: '소프트웨어', kind: 'servc' },
  { value: '엔지니어링', label: '엔지니어링', kind: 'servc' },
];

/** 업종 값 → 정의. 저장된 값이 목록에서 빠진 경우 null 이다. */
export function findIndustry(value: string): ProcurementIndustry | null {
  return PROCUREMENT_INDUSTRIES.find((i) => i.value === value) ?? null;
}

/** 고른 업종들이 어떤 업무 구분에 걸리는지 — 부를 오퍼레이션을 정한다 */
export function bidKindsOf(values: string[]): BidKind[] {
  const kinds = new Set<BidKind>();
  for (const v of values) {
    const found = findIndustry(v);
    if (found) kinds.add(found.kind);
  }
  return [...kinds];
}

/* ────────────── 입찰공고 ────────────── */

/**
 * 화면에 보여 줄 입찰공고 한 건.
 *
 * 나라장터 응답은 필드가 100개가 넘는데(공사 기준) 대부분 낙찰 계산용이라
 * 화면에서 쓰지 않는다. 여기 있는 것만 추려서 넘긴다.
 *
 * **DB 에 저장하지 않는다.** 목록은 부를 때마다 API 에서 받아 오고, 사용자가
 * ☆ 로 담은 것만 따로 보관한다.
 */
/** 공고가 요구하는 면허 하나 */
export interface BidLicense {
  /** 면허 이름 — 예: `식품판매업(집단급식소식품판매업)` */
  name: string;
  /** 이 면허를 대신할 수 있는 업종들 */
  alternatives: string[];
}

export interface BidNotice {
  /** 공고번호 + 차수 — 같은 공고가 정정되면 차수가 올라간다 */
  id: string;
  bidNo: string;
  /**
   * 공고 차수. 정정되면 올라가고, **마감일이 함께 바뀐다.**
   * 같은 `bidNo` 안에서 가장 큰 차수만 유효하다.
   */
  ord: number;
  title: string;
  kind: BidKind;
  /** 공고 기관 */
  agency: string;
  /** 수요 기관 — 실제로 그 물건·일을 쓰는 곳 */
  demandAgency: string | null;
  /** 계약 방법 (제한경쟁·수의계약 …) */
  contractMethod: string | null;

  /** 예산 금액(원) */
  budget: number | null;
  /** 추정 가격(원) — 투찰 판단의 기준 */
  estimate: number | null;

  noticedAt: string | null;
  /** 입찰 시작·마감, 개찰 */
  bidBeginAt: string | null;
  bidCloseAt: string | null;
  openAt: string | null;

  /** 업종 제한이 걸린 공고인지 */
  industryLimited: boolean;
  /**
   * 이 공고를 찾아낸 내 업종.
   *
   * 공사는 **업종 자체가 참가 자격**이라, 면허제한 조회에 아예 들어 있지
   * 않다(물품·용역만 있다). 대신 우리가 이 업종으로 찾아왔으므로 여기 적어
   * 둔다 — "업종 제한 있음" 이라고만 하고 무엇인지 안 알려 주면, 사용자는
   * 결국 공고문을 열어 확인해야 한다.
   */
  matchedIndustry?: string;
  /**
   * 필요한 면허·자격.
   *
   * 목록 응답에는 `industryLimited` 로 **있다/없다만** 온다. "업종 제한 있음"
   * 만 보여 주면 사용자는 결국 공고문을 열어 봐야 하므로, 면허제한 조회로
   * **무엇이 필요한지**까지 채워서 준다. 조회가 실패하면 비어 있다.
   */
  licenses?: BidLicense[];
  /** 참가 가능 지역. 비어 있으면 제한이 없거나 확인하지 못한 것이다. */
  allowedRegions?: string[];
  /**
   * 입찰참가 수수료(원).
   *
   * 넣기 전에 드는 돈이라 **미리 알아야 한다.** 145만원짜리도 있어서,
   * 작은 공고에 무심코 들어갔다가 수수료가 더 나가는 경우가 생긴다.
   */
  participationFee: number | null;
  /** 입찰참가 제한이 걸린 공고인지 */
  participationLimited: boolean;

  /**
   * 낙찰자 결정 방법 (원문).
   *
   * **여기에 제안서가 필요한지가 이미 적혀 있다.** 100% 채워져 오므로
   * 공고문을 읽지 않고도 가를 수 있다 — "협상에의한계약"이면 제안서,
   * "소액수의견적"이나 "최저가낙찰제"면 가격이다.
   */
  successMethod: string | null;

  /**
   * 공동수급(컨소시엄) 허용 여부.
   *
   * 실제로 세어 보면 **89%가 불허**다. 실적이 모자랄 때 다른 업체와 같이
   * 들어가는 길이 대부분 막혀 있다는 뜻이라, 규모 판정을 느슨하게 둘 근거가
   * 되지 못한다.
   */
  jointAllowed: boolean;

  /** 입찰 방식 — 전자입찰 · 직찰 등. 직찰이면 직접 가야 한다. */
  bidMethod: string | null;

  /** 공고 종류 — 등록공고 · 재공고 · 변경공고 · 취소공고 */
  noticeKind: string | null;
  /** 취소된 공고인지 — 목록에서 걸러야 한다 */
  canceled: boolean;
  /** 재공고인지 — 지난번에 유찰됐다는 뜻이라 경쟁이 덜할 수 있다 */
  reNotice: boolean;
  /** 공사 현장 지역 (공사 공고에만 있다) */
  siteRegion: string | null;

  url: string | null;
  /** 규격서·공고문 첨부 */
  attachments: { name: string; url: string }[];
}
