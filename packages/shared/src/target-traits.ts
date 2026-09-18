/**
 * 대상 특성 — 공고가 "누구에게만" 열려 있는지와, 사용자가 그 누구인지.
 *
 * 공공 API 는 업력·지역·연령 정도만 구조화해서 준다. 그런데 실측해 보면
 * 접수 중 공고 1,975건 중 제목·신청대상에만 소상공인 256건, 사회적경제 51건,
 * 여성 26건, 재창업 19건이 걸려 있었다. 이걸 못 보면 여성기업 전용 공고가
 * 남성 대표에게 "지원 가능"으로 뜬다.
 *
 * 그래서 **사용자에게 직접 받고**, 공고 쪽은 문장에서 보수적으로 찾는다.
 *
 * 원칙
 *   - 제목·신청대상만 본다. 요약은 "우대·가점" 설명이 섞여 있어 틀린다.
 *   - "우대·가점·우선·포함"이 붙은 문장은 조건이 아니다.
 *   - 확신(`certain`)은 제목에 대상이 박혀 있을 때만이다.
 *     확신이 없으면 안 맞아도 탈락이 아니라 확인 필요로 둔다.
 */

/* ────────────── 사용자 쪽 값 ────────────── */

/** 대표자 특성. 공고의 대상 요건과 1:1 로 맞춘다. */
export const FOUNDER_TRAITS = [
  'female',       // 여성
  'restart',      // 재창업(폐업 경험)
  'student',      // 대학(원)생
  'career_break', // 경력단절
  'foreigner',    // 외국인·다문화·북한이탈주민
] as const;
export type FounderTrait = (typeof FOUNDER_TRAITS)[number];

export const FOUNDER_TRAIT_LABELS: Record<FounderTrait, string> = {
  female: '여성',
  restart: '재창업',
  student: '대학(원)생',
  career_break: '경력단절',
  foreigner: '외국인·다문화',
};

/**
 * 해당하는 특성이 없다는 표시.
 *
 * `NO_CERTIFICATION` 과 같은 이유다 — 빈 배열은 "없다"가 아니라
 * "아직 안 골랐다"이다. 둘을 못 가르면 답한 사람도 계속 확인 필요로 남는다.
 */
export const NO_FOUNDER_TRAIT = 'none';

export const EXPORT_STATUSES = ['exporting', 'preparing', 'none'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

export const EXPORT_STATUS_LABELS: Record<ExportStatus, string> = {
  exporting: '수출 중',
  preparing: '준비 중',
  none: '없음',
};

/**
 * 사회적경제기업으로 보는 인증.
 * 이 중 하나라도 있으면 "사회적경제기업 대상" 공고를 충족한다.
 */
export const SOCIAL_ECONOMY_CERTIFICATIONS = [
  '사회적기업', '예비사회적기업', '협동조합', '마을기업', '자활기업', '소셜벤처',
] as const;

/**
 * 자주 나오는 정부 창업지원 사업.
 *
 * "동일 사업 기수혜자 제외", "OO패키지 선정기업 대상" 판정에 쓴다.
 * `match` 는 공고 제목에서 이 사업을 알아보는 규칙이다 — 관심 공고를
 * "선정"으로 표시하면 여기서 찾아 자동으로 이력에 넣는다.
 */
export const PAST_PROGRAMS = [
  { value: '예비창업패키지', match: /예비\s*창업\s*패키지/ },
  { value: '초기창업패키지', match: /초기\s*창업\s*패키지/ },
  { value: '창업도약패키지', match: /창업\s*도약\s*패키지/ },
  { value: '청년창업사관학교', match: /청년\s*창업\s*사관학교/ },
  { value: '재도전성공패키지', match: /재도전\s*성공\s*패키지/ },
  { value: 'TIPS', match: /\bTIPS\b|팁스/i },
  { value: '신사업창업사관학교', match: /신사업\s*창업\s*사관학교/ },
  { value: '창업중심대학', match: /창업\s*중심\s*대학/ },
] as const;
export type PastProgram = (typeof PAST_PROGRAMS)[number]['value'];

/** 선정된 사업이 없다는 표시 — `NO_FOUNDER_TRAIT` 와 같은 이유로 둔다 */
export const NO_PAST_PROGRAM = 'none';

/** 글(공고 제목·조건 문장)에서 알아볼 수 있는 사업 이름들 */
export function programsIn(text: string): PastProgram[] {
  return PAST_PROGRAMS.filter((p) => p.match.test(text)).map((p) => p.value);
}

/**
 * 소상공인 추정.
 *
 * 소상공인기본법 기준은 상시근로자 **제조·건설·운수·광업 10명 미만,
 * 그 밖의 업종 5명 미만**이다(매출 기준도 있지만 여기선 보지 않는다).
 * 확정이 아니라 **입력 칸의 기본 추천값**으로만 쓴다.
 */
export function suggestSmallBusiness(
  employees: number | null,
  industry: string | null,
): boolean | null {
  if (employees == null) return null;
  const limit = industry === 'manufacturing' || industry === 'construction' ? 10 : 5;
  return employees < limit;
}

/* ────────────── 공고 쪽 요건 찾기 ────────────── */

export type TargetRequirement =
  | { kind: 'trait'; trait: FounderTrait }
  | { kind: 'smallBusiness' }
  | { kind: 'socialEconomy' }
  | { kind: 'exporting' }
  | { kind: 'ip' };

export interface DetectedRequirement {
  requirement: TargetRequirement;
  /** 제목에 대상이 박혀 있어 안 맞으면 탈락시켜도 되는가 */
  certain: boolean;
  /** 근거가 된 문장 조각 — 화면에 그대로 보여 준다 */
  evidence: string;
}

/**
 * 조건이 아닌 문장.
 * "여성·청년 우대", "재창업자 포함", "소상공인 제외" 는 전용 요건이 아니다.
 */
const NOT_REQUIREMENT = /우대|가점|가산|우선|포함|제외|불가|불포함|해당\s*없/;

interface Rule {
  requirement: TargetRequirement;
  /** 제목에서 찾으면 확신 */
  title: RegExp;
  /** 신청대상에서 찾으면 확인 필요 */
  target: RegExp;
  /** 이게 같이 있으면 전용이 아니다 (예: "소상공인 및 중소기업") */
  notExclusive?: RegExp;
  /** 이름만 닮은 것 (기관명 등) */
  ignore?: RegExp;
}

const RULES: Rule[] = [
  {
    requirement: { kind: 'trait', trait: 'female' },
    title: /여성\s*(기업|창업|기업인|CEO|대표|벤처|스타트업|경제인|과학기술인)/,
    target: /여성\s*(기업|창업자|대표|기업인|\(?예비\)?\s*창업자)|^여성$/,
    notExclusive: /남성|누구나|제한\s*없|중소기업|소상공인|사회적\s*경제|청년\s*창업/,
  },
  {
    requirement: { kind: 'trait', trait: 'restart' },
    title: /재창업|재도전\s*(성공)?\s*패키지/,
    target: /재창업(자|기업)?|폐업\s*(경험|이력)/,
    notExclusive: /신규\s*창업|초기|예비|일반\s*창업/,
  },
  {
    requirement: { kind: 'trait', trait: 'student' },
    title: /대학(교)?\s*(생|원생)\s*(창업|대상|예비창업)|재학생\s*(창업|대상)/,
    target: /대학(교)?\s*(생|원생)|재학생|휴학생/,
    notExclusive: /일반인|누구나|교원|제한\s*없|기업|예비\s*창업|관계자/,
  },
  {
    requirement: { kind: 'trait', trait: 'career_break' },
    title: /경력\s*단절\s*(여성|자|인)|경단녀/,
    target: /경력\s*단절|경단녀/,
    // "경력단절 예방 — 직장문화 개선 컨설팅" 은 기업 대상이다
    ignore: /예방|직장\s*문화/,
  },
  {
    requirement: { kind: 'trait', trait: 'foreigner' },
    title: /(외국인|유학생|다문화|이민자|북한이탈주민|새터민)\s*(창업|대상|예비창업|기업|스타트업)/,
    target: /외국인\s*(창업자|유학생|\(?예비\)?\s*창업자)|유학생|다문화|이민자|북한이탈주민|새터민/,
    notExclusive: /내국인|누구나|제한\s*없/,
    ignore: /외국인\s*(투자|관광|환자|직접투자|고용|근로자\s*고용)|한국\s*국적|재외\s*국민/,
  },
  {
    requirement: { kind: 'smallBusiness' },
    title: /소상공인|소공인/,
    target: /소상공인|소공인/,
    notExclusive: /중소기업|중견|창업기업|스타트업|예비\s*창업|벤처|기업\s*누구나|제한\s*없/,
    ignore: /소상공인\s*(시장)?\s*진흥\s*공단|소상공인\s*(지원)?\s*센터|소상공인\s*연합회|소상공인\s*정책자금\s*안내/,
  },
  {
    requirement: { kind: 'socialEconomy' },
    title: /사회적\s*경제\s*기업|사회적\s*기업|사회적\s*협동조합|마을기업|자활기업|소셜\s*벤처/,
    target: /사회적\s*경제\s*기업|\(?예비\)?\s*사회적\s*기업|협동조합|마을기업|자활기업|소셜\s*벤처/,
    notExclusive: /일반\s*기업|중소기업|창업기업|스타트업|예비\s*창업|누구나|제한\s*없/,
    // "예비사회적기업 지정", "사회적경제기업 창업지원" 은 되려는 사람 대상이다
    ignore: /육성|인증\s*(준비|신청|심사)|지정\s*(계획|공고|신청)|되고자|설립|창업\s*(지원|희망)|아카데미|교육/,
  },
  {
    requirement: { kind: 'exporting' },
    title: /수출\s*(기업|중소기업|실적\s*보유)(?!\s*화)/,
    target: /수출\s*실적\s*(이\s*)?(보유|있는)|수출\s*(기업|중소기업)(?!\s*화)/,
    notExclusive: /내수|초보|희망|준비|예비|유망|새싹|첫걸음|잠재/,
  },
  {
    requirement: { kind: 'ip' },
    title: /(특허|지식재산|실용신안|디자인권)\s*(을|를)?\s*보유\s*(한\s*)?(기업|자)/,
    target: /(특허|지식재산(권)?|실용신안|디자인권)\s*(을|를)?\s*(보유|등록)\s*(한|중인)?\s*(기업|자|업체)/,
    notExclusive: /출원\s*(예정|희망)|창출\s*지원|없는/,
  },
];

/** 문장 단위로 끊는다 — 조건 하나가 한 줄에 있다고 본다 */
function clausesOf(text: string): string[] {
  return text
    .split(/\n|(?<=[.。])\s+|\s*[◦○●▪▫※□■]\s*|\s+(?=\d{1,2}\.\s*[가-힣])|\s*[|/]\s*/)
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * 공고가 특정 대상에게만 열려 있는지 찾는다.
 *
 * 같은 요건은 한 번만 낸다. 제목에서 찾은 것(확신)이 신청대상보다 우선한다.
 */
export function detectTargetRequirements(grant: {
  title: string;
  applyTargetDetail?: string | null;
}): DetectedRequirement[] {
  const found = new Map<string, DetectedRequirement>();
  const keyOf = (r: TargetRequirement) =>
    r.kind === 'trait' ? `trait:${r.trait}` : r.kind;

  const target = grant.applyTargetDetail ?? '';
  /*
   * 전용인지는 **공고 전체**로 본다. 신청대상이 "① 예비창업자 ② 재학생"
   * 처럼 갈래를 나열하면, 한 줄만 떼어 보면 재학생 전용으로 읽힌다.
   */
  const whole = `${grant.title} ${target}`;

  /*
   * 제목에 여러 대상이 함께 나오면("사회적경제기업 및 여성기업 프리마켓")
   * 어느 하나의 전용이 아니라 나열이다. 확신을 내리지 않는다.
   */
  const titleHits = RULES.filter(
    (r) => r.title.test(grant.title) && !(r.ignore?.test(grant.title)),
  ).length;

  for (const rule of RULES) {
    const key = keyOf(rule.requirement);

    // 제목 — 제목에 "우대"가 붙는 일은 드물지만 있으면 거른다
    const title = grant.title;
    if (
      rule.title.test(title) &&
      !NOT_REQUIREMENT.test(title) &&
      !(rule.ignore?.test(title)) &&
      !(rule.notExclusive?.test(whole))
    ) {
      found.set(key, {
        requirement: rule.requirement,
        certain: titleHits === 1,
        evidence: title.trim(),
      });
      continue;
    }

    for (const clause of clausesOf(target)) {
      if (!rule.target.test(clause)) continue;
      if (NOT_REQUIREMENT.test(clause)) continue;
      if (rule.ignore?.test(clause)) continue;
      if (rule.notExclusive?.test(whole)) continue;
      found.set(key, {
        requirement: rule.requirement,
        certain: false,
        evidence: clause.length > 80 ? `${clause.slice(0, 80)}…` : clause,
      });
      break;
    }
  }

  return [...found.values()];
}
