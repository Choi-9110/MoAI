import { Injectable } from '@nestjs/common';
import {
  FOUNDER_TRAITS, FOUNDER_TRAIT_LABELS, NO_PAST_PROGRAM,
  SOCIAL_ECONOMY_CERTIFICATIONS, businessYearsOf, cityKey, conditionKey,
  detectTargetRequirements, estimateAgeRange, formatAgeRange, programsIn,
} from '@moai/shared';
import type {
  ApplicantType, ConditionAnswer, DetectedRequirement, Eligibility,
  EligibilityReason, FounderTrait, OpenCondition, TargetRequirement,
} from '@moai/shared';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { Grant } from './entities/grant.entity';

/**
 * 거의 모든 정부지원사업 공고에 들어가는 표준 결격 사유.
 *
 * 정상적으로 운영 중인 기업이라면 대부분 해당하지 않는다.
 * 이걸 "확인 필요"로 띄우면 모든 공고가 조건부가 되어 표시가 무의미해진다.
 */
const STANDARD_EXCLUSIONS: RegExp[] = [
  /국세|지방세|체납|세금|납세/,
  /휴업|폐업|폐지/,
  /부도|파산|회생|워크아웃|청산|법정관리|화의/,
  /신용정보|금융질서|연체|대위변제|대지급|채무불이행/,
  /신청요건에 적합하지|사업목적에 부합하지|서류.*미비|허위/,
  /기타.*(제한|사유)|그 ?외.*사유/,
  /범죄|형사처벌|성실의무|의무.*불이행/,
  /보조금.*환수|지원금.*환수|제재부가금|환수금/,
  /*
   * 아래는 운영 공고의 "확인 필요" 질문 237개를 세어 보고 더한 것이다.
   * 정상적으로 신청하는 사람이라면 해당하지 않는 것들이라, 물으면 소음이다.
   */
  /참여\s*제한|제재\s*조치|수행\s*(대상에서\s*)?배제|참여\s*제한\s*중/,
  /체불\s*사업주|임금\s*체불/,
  /주권\s*상장|상호\s*출자\s*제한|대기업|대규모\s*기업\s*집단/,
  /(지식\s*재산권|특허|실용\s*신안).{0,20}(침해|도용)|모방|도용|표절/,
  /부적합(하다고|한)?\s*(인정|판단)|부적격|기준\s*미달/,
  /사행|유흥|주점|도박|향락|무도장|미풍\s*양속|반사회/,
  /신용\s*(도\s*)?불량|금융\s*신용도/,
  /중복\s*(지원|수혜|참여|선정)/,
  /감사\s*의견|부채\s*비율|자본\s*(전액\s*)?잠식|상장\s*(사|기업|법인)|코스닥|코스피|중견\s*기업/,
  /지급\s*요청일|우선\s*순위에서\s*배제|유효\s*기간이?\s*(만료|유지)/,
  /동일(한)?\s*(내용|과제|아이템|사업)(으로|의)?.{0,30}(지원|수혜|선정)/,
  /불량\s*거래|자본\s*잠식|기소\s*중지|법적\s*제재|정당한\s*사유/,
  /부합(하지|되지)\s*않|부적당|요건에\s*해당하지\s*않는|사실과\s*다르|대리\s*신청/,
  /^[^가-힣]*기타\s*.{0,25}(인정|판단)하는\s*(경우|자|기업)/,
];

/**
 * 항목 단위로 끊는다 — "1." "2." 나 글머리 기호 앞에서 나눈다.
 *
 * 날짜("2019. 8. 5.")를 항목 번호로 오인하지 않도록
 * 1~2자리 숫자 + 점 + 한글/영문인 경우만 항목으로 본다.
 */
export function splitClauses(text: string): string[] {
  return text
    .replace(/\s+(?=\d{1,2}\.\s*[가-힣A-Za-z(])/g, '\n')
    .replace(/\s+(?=[◦○●▪▫·※□■]\s*\S)/g, '\n')
    .split('\n')
    .map((c) => c.trim())
    .filter(Boolean);
}

/**
 * 내용이 없는 값인지.
 *
 * 제외 대상 칸에 "없음", "해당없음", "-" 처럼 비어 있다는 표시를 넣는 공고가 많다.
 * 이걸 조건으로 읽으면 멀쩡한 공고가 전부 "확인 필요"가 된다.
 */
export function isEmptyClause(clause: string): boolean {
  const t = clause.replace(/[\s.·\-–—()]/g, '');
  return t === '' || /^(없음|해당없음|무|NA|N\/A|null|-)$/i.test(t);
}

/** 표준 결격 사유인지 */
export function isStandardExclusion(clause: string): boolean {
  return STANDARD_EXCLUSIONS.some((re) => re.test(clause));
}

/**
 * 신청 대상 상세에서 **구조화 필드로 이미 검사한 내용**인지.
 *
 * "창업 7년 이내 중소기업" 같은 문구는 업력 검사가 이미 처리했다.
 * 이런 것까지 확인 필요로 띄우면 중복 질문이 된다.
 */
const COVERED_BY_STRUCTURE: RegExp[] = [
  /^창업\s*\d+년/,
  /^\d+년\s*(미만|이내|이하)/,
  /^예비창업자?$/,
  /^(전국|중소기업|스타트업|창업기업|기업|법인|개인사업자|소상공인)$/,
  /^만\s*\d+세/,
];

/**
 * 신청 대상 상세에 **특정 이력이나 소속을 요구하는 조건**이 있는지.
 *
 * 예) "'23년~'26년 초기창업패키지 선정·졸업기업"
 *     → 그 사업에 선정된 적이 있어야 한다. 시스템은 알 수 없다.
 *
 * 이런 게 있으면 구조화 검사를 다 통과해도 실제로는 자격이 없을 수 있다.
 */
const SPECIFIC_REQUIREMENT: RegExp[] = [
  /선정|졸업|수혜|이수|협약|추천|지정|위촉/,
  /패키지|바우처|프로그램|사업단|아카데미|스쿨|캠프/,
  /회원|조합원|입주|소속|재학|재직/,
  /추천서|확인서|인증서|증명서.*필요|보유.*필수/,
];

/**
 * 조건이 아니라 **안내문**인 문장.
 *
 * "모집 인원: 30명 내외 (선착순 마감)" 같은 줄은 신청 대상 칸에 같이 적혀 있을 뿐
 * 사용자가 답할 수 있는 조건이 아니다. 이런 걸 물으면 체크리스트가 금세 무의미해진다.
 */
const NOT_A_CONDITION: RegExp[] = [
  // "모집 인원:", "선정 안내:" 처럼 안내 항목 라벨로 시작하는 줄
  /^(모집|선정|접수|지원|신청|제출|평가|발표|문의|교육|운영|혜택|일정|장소|기간|방법|규모)\s*(인원|규모|안내|내용|일정|기간|방법|절차|서류|기준|처|사항)?\s*[:：]/,
  // 부연 설명 — 앞 문장에 딸린 각주라 단독으로는 답할 수 없다
  /^[*※￭]?\s*(단|다만|참고|유의|비고|기타)\s*[,.):]/,
  /^[*※]/,
  // 문장 조각 — 괄호나 조사로 시작하면 splitClauses 가 잘라낸 뒷도막이다
  /^[)\]}]/,
  // 안내 제목
  /^(이런 분께|모집 개요|사업 개요|추천 대상)/,
  /*
   * 머리말·가리킴 — 조건은 그 아래나 다른 곳에 있다.
   * "아래 항목 중 1개 이상에 해당되는 경우 신청 불가", "공고문 참조",
   * "【입주제한 대상자】", "지원제한", "중복참여 제한"
   */
  /^[^가-힣A-Za-z]*$/, // 글자 없이 번호·기호뿐인 줄
  /^(?:[ㅁㅇo•￭⁃✓?\-]\s*)?(아래|다음|하기|상기)(의)?\s*.{0,25}(해당|경우|기업|자|요건)/,
  /^[【\[<(]?[^\s]{0,12}(대상자?|제한|불가|제외|요건)[】\]>)]?\s*[:：]?$/,
  /^(ㅁ|ㅇ|o|-|⁃|✓|\?)?\s*(지원\s*)?(불가|제한|제외)\s*(대상|업종|요건)?\s*[:：]?$/,
  /^(중복\s*참여|중복\s*지원)\s*(제한|불가)$/,
  // 괄호로 감싼 제목 한 줄 — "【입주제한 대상자】"
  /^[【\[<]\s*[^】\]>]{1,20}[】\]>]\s*[:：]?$/,
  // 절차·서류 안내 — 답할 수 있는 조건이 아니다
  /→|-&gt;|&gt;|https?:\/\/|www\./,
  /^(서류\s*제출|최종\s*선정|입주\s*기간)|협약\s*은행/,
  /^.{0,15}담당자.{0,5}문의[^가-힣]*$/,
  /(확인서|증명서|납부\s*확인서|등본)\s*\(/,
  /*
   * 누구나 받는 줄은 조건이 아니다.
   * "(졸업, 재학 누구나)" 처럼 **특정 집단 안에서의 누구나**는 조건이므로
   * "관심 있는 누구나", "누구나 참여 가능" 꼴만 본다.
   */
  /관심\s*(이\s*)?있는\s*누구나|누구나\s*(참여|신청|지원)\s*(가능|할\s*수)|^[^가-힣]*제한\s*없음[^가-힣]*$/,
];

/**
 * "공고문 참조" 같은 가리킴.
 *
 * 조건이 아니라서 묻지는 않는다. 다만 **조건이 공고문에 따로 있다는 뜻**이라
 * "일반 결격 사유만 있습니다" 라고 말하면 거짓이 된다. 안내 문구를 바꾸는 데 쓴다.
 */
const POINTER =
  /^.{0,20}(공고문|모집\s*공고|포스터|홈페이지|하단|첨부).{0,15}(참조|참고|확인)[^가-힣]*$/;

export function isNotACondition(clause: string): boolean {
  // 글머리 기호("◦ 모집 인원: …")가 붙은 줄도 같은 안내문이다.
  // 원문과 기호를 뗀 형태를 모두 본다.
  const raw = clause.trim();
  const normalized = conditionKey(clause);
  return (
    POINTER.test(normalized) ||
    NOT_A_CONDITION.some((re) => re.test(raw) || re.test(normalized))
  );
}

export function isCoveredByStructure(clause: string): boolean {
  return COVERED_BY_STRUCTURE.some((re) => re.test(clause.trim()));
}

export function hasSpecificRequirement(clause: string): boolean {
  return SPECIFIC_REQUIREMENT.some((re) => re.test(clause));
}

/**
 * 공고문에서 시·군·구 제한을 찾아낸다.
 *
 * 공공 API 의 지역 필드는 **광역 단위**뿐이다. "수원시 소재 기업만" 같은
 * 제한은 신청 대상 글에만 적혀 있어서, 광역만 보면 경기 기업이 전부
 * 지원 가능으로 뜬다. 실측으로 마감 전 경기 공고 25건 중 10건이 그랬다.
 *
 * 우리는 사업장이 경기 어디인지까지는 모른다. 그러니 통과시키지 말고
 * **확인 필요로 남긴다.** 잘못된 "지원 가능"이 가장 나쁘다.
 */
const DISTRICT =
  /([가-힣]{2,5}(?:시|군|구))\s*(?:소재지?|관내|거주|주소|시민|군민|구민|주민|내\s*|에\s*소재|지역|기업|소공인|사업자)/g;

/** 시·군 이름처럼 생겼지만 아닌 것 */
const NOT_DISTRICT =
  /^(광역시|특별시|자치시|자치구|중소기업|대기업|해당시|본시|타시|각시|전국|국내|해외|우리시|당시)$/;

/**
 * 글에서 시·군·구 제한을 찾는다.
 *
 * `broad` 에 공고의 광역 지역을 주면, 그 광역을 다시 말한 것뿐인 표현은
 * 걸러낸다. "서울특별시 소재 기업"은 좁힌 게 아니라 광역을 적은 것이다.
 */
export function findDistricts(
  broad: string[],
  ...texts: (string | null | undefined)[]
): string[] {
  const found = new Set<string>();

  for (const text of texts) {
    if (!text) continue;
    for (const m of text.matchAll(DISTRICT)) {
      const name = m[1].trim();
      if (name.length < 3 || NOT_DISTRICT.test(name)) continue;

      // 광역을 되풀이한 것이면 좁힌 게 아니다.
      if (broad.some((r) => r && name.includes(r))) continue;

      found.add(name);
    }
  }
  return [...found];
}

const unique = (list: string[]): string[] => {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = conditionKey(c);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/** 내 정보의 "보유 인증"에서 고를 수 있는 인증 */
const KNOWN_CERTIFICATION =
  /벤처|이노비즈|메인비즈|여성\s*기업|장애인\s*기업|사회적\s*기업|협동조합|마을\s*기업|소셜\s*벤처|연구\s*개발\s*전담|기업\s*부설\s*연구소|ISO/i;

/**
 * 지역 검사가 이미 다룬 문장인지 — "본사가 부천시에 소재한 기업",
 * "관외로 이전한 기업 제외". 공고에 지역 제한이 있으면 지역 검사가 판정하므로
 * 같은 내용을 다시 묻지 않는다.
 */
function coveredByLocation(clause: string, g: Grant): boolean {
  const hasRegion =
    g.targetRegions.length > 0 || (g.documentConditions?.districts ?? []).length > 0;
  return hasRegion && /소재|관내|관외|도내|역외|주소지|본점|이전/.test(clause);
}

/**
 * 공고 컬럼에 **공고문에서 읽은 조건을 채워 넣은 사본**.
 *
 * 비어 있는 칸만 채운다. 수집처가 구조화해 준 값이 있으면 그걸 믿는다 —
 * 공공 API 값은 기관이 직접 입력한 것이고, 공고문 추출은 모델이 읽은 것이다.
 *
 * 트랙마다 자격이 다른 공고(`multiTrack`)는 지역만 채운다. 모델에게 공통
 * 조건만 적으라고 했지만, 틀리면 멀쩡한 트랙을 가진 사람이 탈락한다.
 *
 * "미만"은 칸의 뜻("이하")에 맞게 하나 줄여 넣는다 — "10인 미만"은 9인 이하다.
 */
export function withDocument(g: Grant): Grant {
  const doc = g.documentConditions;
  if (!doc) return g;

  const out = Object.assign(Object.create(Object.getPrototypeOf(g)) as Grant, g);
  if (out.targetRegions.length === 0 && doc.regions.length > 0) {
    out.targetRegions = doc.regions;
  }
  if (doc.multiTrack) return out;

  if ((out.applicantTypes ?? []).length === 0 && doc.applicantTypes?.length) {
    out.applicantTypes = doc.applicantTypes;
  }
  if (out.minBusinessYears == null && out.maxBusinessYears == null && doc.businessYears) {
    const { min, max, exclusiveMax } = doc.businessYears;
    out.minBusinessYears = min;
    out.maxBusinessYears = max == null ? null : exclusiveMax ? Math.ceil(max) - 1 : max;
  }
  if (out.minAge == null && out.maxAge == null && doc.age) {
    out.minAge = doc.age.min;
    out.maxAge = doc.age.max;
  }
  if (out.maxEmployees == null && doc.maxEmployees) {
    const { value, inclusive } = doc.maxEmployees;
    out.maxEmployees = inclusive ? value : value - 1;
  }
  if (out.maxRevenue == null && doc.maxRevenue) {
    const { value, inclusive } = doc.maxRevenue;
    out.maxRevenue = String(inclusive ? value : value - 1);
  }
  /*
   * 인증은 **내 정보에서 고를 수 있는 것만** 요건 칸에 넣는다. "여행업 등록증"
   * 같은 면허는 고를 방법이 없어, 넣으면 그 면허가 있는 업체도 탈락한다.
   * 나머지는 확인 질문으로 돌린다.
   */
  const known = doc.requiredCertifications.filter((c) => KNOWN_CERTIFICATION.test(c));
  const unknown = doc.requiredCertifications.filter((c) => !KNOWN_CERTIFICATION.test(c));
  if (out.requiredCertifications.length === 0 && known.length > 0) {
    out.requiredCertifications = known;
  }
  if (unknown.length > 0) {
    out.documentConditions = {
      ...doc,
      requirements: [...doc.requirements, ...unknown.map((c) => `${c} 보유`)],
    };
  }
  if (out.targetIndustries.length === 0 && doc.industries.length > 0) {
    out.targetIndustries = doc.industries;
  }
  return out;
}

/**
 * 전용 대상 — 제목·신청대상에서 찾은 것과 공고문에서 읽은 것을 합친다.
 *
 * 공고문에서 읽은 것은 모델이 "공고 전체가 그 대상에게만 열려 있다"고 한
 * 것이라 확신으로 본다. 단, 트랙형 공고는 그 판단이 틀리기 쉬워 제외한다.
 */
function targetRequirementsOf(g: Grant): DetectedRequirement[] {
  const found = detectTargetRequirements(g);
  const doc = g.documentConditions;
  if (!doc || doc.multiTrack) return found;

  const has = (kind: string) =>
    found.some((f) => (f.requirement.kind === 'trait' ? f.requirement.trait : f.requirement.kind) === kind);
  const quote = doc.quotes.find((q) => q.field === 'exclusiveTargets')?.text;

  for (const t of doc.exclusiveTargets) {
    if (has(t)) {
      // 문장에서만 찾아 확신이 없던 것을 공고문이 뒷받침하면 확신으로 올린다
      for (const f of found) {
        const k = f.requirement.kind === 'trait' ? f.requirement.trait : f.requirement.kind;
        if (k === t) f.certain = true;
      }
      continue;
    }
    const requirement: TargetRequirement = (FOUNDER_TRAITS as readonly string[]).includes(t)
      ? { kind: 'trait', trait: t as FounderTrait }
      : { kind: t as Exclude<TargetRequirement['kind'], 'trait'> } as TargetRequirement;
    found.push({ requirement, certain: true, evidence: quote ?? '공고문' });
  }
  return found;
}

const APPLICANT_LABELS: Record<ApplicantType, string> = {
  preliminary: '예비창업자',
  individual: '개인사업자',
  corporate: '법인사업자',
};

/**
 * 지원 가능 여부 판정.
 *
 * 설계 원칙은 사업계획서 생성과 같다 — **모르면 모른다고 한다.**
 * 프로필에 값이 없으면 통과로 처리하지 않고 unknown 으로 남겨,
 * 사용자가 직접 확인하도록 만든다. 잘못된 "지원 가능" 판정은
 * 마감을 놓치게 만드는 것보다 더 나쁘다.
 */
@Injectable()
export class EligibilityService {
  evaluate(source: Grant, profile: CompanyProfile | null): Eligibility {
    const grant = withDocument(source);
    if (!profile) {
      return {
        level: 'unknown',
        passed: 0,
        checked: 0,
        reasons: [
          {
            field: '기업 프로필',
            verdict: 'unknown',
            message: '기업 정보를 등록하면 지원 가능 여부를 확인할 수 있습니다.',
          },
        ],
        openConditions: [],
      };
    }

    // 두 검사는 사용자에게 물어야 할 조건을 여기에 담는다.
    const open: OpenCondition[] = [];

    const reasons: EligibilityReason[] = [
      // 신청 대상은 가장 먼저 본다. 여기서 걸리면 나머지는 볼 필요가 없다.
      ...this.checkApplicantType(grant, profile),
      ...this.checkBusinessYears(grant, profile),
      ...this.checkRegion(grant, profile),
      ...this.checkIndustry(grant, profile),
      ...this.checkAge(grant, profile),
      ...this.checkEmployees(grant, profile),
      ...this.checkRevenue(grant, profile),
      ...this.checkCorporation(grant, profile),
      ...this.checkCertifications(grant, profile),
      ...this.checkTargetTraits(grant, profile),
      // 아래 둘은 마지막에 본다. 다른 요건을 다 통과해도 여기서 뒤집힐 수 있다.
      ...this.checkTargetDetail(grant, profile, open),
      ...this.checkExclusion(grant, profile, open),
    ];

    const checked = reasons.length;
    const passed = reasons.filter((r) => r.verdict === 'pass').length;
    const failed = reasons.filter((r) => r.verdict === 'fail').length;
    const unknown = reasons.filter((r) => r.verdict === 'unknown').length;

    // 공고가 아무 요건도 명시하지 않았다면 제한 없는 사업으로 본다.
    if (checked === 0) {
      return {
        level: 'eligible',
        passed: 0,
        checked: 0,
        reasons: [
          {
            field: '자격 요건',
            verdict: 'pass',
            message: '별도 자격 제한이 확인되지 않았습니다. 공고 원문을 확인해 주세요.',
          },
        ],
        openConditions: [],
      };
    }

    let level: Eligibility['level'];
    if (failed > 0) {
      level = 'ineligible';
    } else if (unknown === checked) {
      level = 'unknown';
    } else if (unknown > 0) {
      level = 'conditional';
    } else {
      level = 'eligible';
    }

    return { level, passed, checked, reasons, openConditions: open };
  }

  /* ────────────── 개별 요건 검사 ────────────── */

  /**
   * 신청 대상 — 예비창업자 / 개인사업자 / 법인사업자.
   *
   * "법인만 신청 가능한 사업에 개인사업자가 넣을 수 없다"처럼
   * 다른 요건을 아무리 충족해도 뒤집을 수 없는 조건이라 가장 먼저 검사한다.
   */
  private checkApplicantType(g: Grant, p: CompanyProfile): EligibilityReason[] {
    if (!g.applicantTypes || g.applicantTypes.length === 0) return [];

    const allowed = g.applicantTypes.map((t) => APPLICANT_LABELS[t]).join('·');

    // 아직 사업자 형태를 고르지 않았다면 단정하지 않는다.
    if (!p.stage) {
      return [{
        field: '신청 대상',
        verdict: 'unknown',
        profileField: 'stage',
        message: `${allowed} 대상 — 사업자 형태가 선택되지 않았습니다.`,
      }];
    }

    const matched = g.applicantTypes.includes(p.stage);

    return [{
      field: '신청 대상',
      verdict: matched ? 'pass' : 'fail',
      message: matched
        ? `${allowed} 대상 — ${APPLICANT_LABELS[p.stage]}(으)로 충족합니다.`
        : `${allowed}만 신청할 수 있는 사업입니다. 현재 ${APPLICANT_LABELS[p.stage]}입니다.`,
    }];
  }

  /** 업력 — 창업일로부터 경과한 연수 */
  private checkBusinessYears(g: Grant, p: CompanyProfile): EligibilityReason[] {
    if (g.minBusinessYears == null && g.maxBusinessYears == null) return [];

    const label = this.formatYearRange(g.minBusinessYears, g.maxBusinessYears);

    // 예비창업자는 업력 0년으로 본다. 창업일이 없는 게 정상이므로
    // "정보 부족"이 아니라 확정 판정을 내린다.
    if (p.stage === 'preliminary') {
      const ok = g.minBusinessYears == null || g.minBusinessYears === 0;
      return [{
        field: '업력',
        verdict: ok ? 'pass' : 'fail',
        message: ok
          ? `${label} 대상 — 예비창업자로 충족합니다.`
          : `${label} 대상 — 예비창업자는 해당하지 않습니다.`,
      }];
    }

    if (!p.foundedAt) {
      return [{
        field: '업력',
        verdict: 'unknown',
        profileField: 'foundedAt',
        message: `${label} 대상 — 창업일이 등록되어 있지 않습니다.`,
      }];
    }

    const years = this.yearsSince(new Date(p.foundedAt));

    if (g.minBusinessYears != null && years < g.minBusinessYears) {
      return [{
        field: '업력',
        verdict: 'fail',
        message: `${label} 대상 — 현재 업력 ${years}년으로 미달합니다.`,
      }];
    }
    if (g.maxBusinessYears != null && years > g.maxBusinessYears) {
      return [{
        field: '업력',
        verdict: 'fail',
        message: `${label} 대상 — 현재 업력 ${years}년으로 초과합니다.`,
      }];
    }
    return [{
      field: '업력',
      verdict: 'pass',
      message: `${label} 대상 — 현재 업력 ${years}년으로 충족합니다.`,
    }];
  }

  /** 지역 — 사업장 소재지 */
  private checkRegion(g: Grant, p: CompanyProfile): EligibilityReason[] {
    if (g.targetRegions.length === 0) return [];

    const label = g.targetRegions.join('·');

    if (!p.region) {
      return [{
        field: '지역',
        verdict: 'unknown',
        profileField: 'region',
        message: `${label} 소재 기업 대상 — 사업장 지역이 등록되어 있지 않습니다.`,
      }];
    }

    // "서울특별시" 와 "서울" 을 같게 보기 위해 부분 일치로 비교한다.
    const matched = g.targetRegions.some(
      (r) => r.includes(p.region!) || p.region!.includes(r),
    );

    if (!matched) {
      return [{
        field: '지역',
        verdict: 'fail',
        message: `${label} 소재 기업 대상 — ${p.region} 은(는) 해당하지 않습니다.`,
      }];
    }

    /*
     * 광역은 맞았다. 그런데 시·군까지 좁혀 놓은 공고인지 본다.
     * 공공 API 의 지역 필드는 광역까지만이라 여기서 한 번 더 봐야 한다.
     */
    const districts = unique([
      ...findDistricts(g.targetRegions, g.applyTargetDetail, g.title, g.summary),
      ...(g.documentConditions?.districts ?? []),
    ]);
    if (districts.length > 0) {
      /*
       * **시·군까지 알면 여기서 정할 수 있다.**
       *
       * 예전에는 광역만 받아서 "알 수 없습니다"로 남겼다. 이제 시·군을
       * 받으므로 맞는지 아닌지 답할 수 있다 — `성남시로 좁혀진 공고인데
       * 나는 수원시` 라면 넣을 수 없는 것이 분명하다.
       *
       * 견줄 때 끝의 시·군·구는 뗀다. 공고 제목은 `성남`, `성남시` 를
       * 오가는데 글자를 그대로 맞추면 멀쩡한 것이 어긋난다.
       */
      const mine = p.regionDetail?.trim();
      if (!mine) {
        return [{
          field: '지역',
          verdict: 'unknown',
          profileField: 'regionDetail',
          message:
            `${districts.join('·')} 로 좁혀진 공고입니다 — ` +
            `${p.region} 까지만 등록되어 있어 해당 여부를 알 수 없습니다. ` +
            '내 정보에 시·군을 넣으면 판정해 드립니다.',
        }];
      }

      const hit = districts.some((d) => cityKey(d) === cityKey(mine));
      return [{
        field: '지역',
        verdict: hit ? 'pass' : 'fail',
        message: hit
          ? `${districts.join('·')} 대상 — ${mine} 로 해당합니다.`
          : `${districts.join('·')} 로 좁혀진 공고입니다 — ${mine} 은(는) 해당하지 않습니다.`,
      }];
    }

    return [{
      field: '지역',
      verdict: 'pass',
      message: `${label} 소재 기업 대상 — ${p.region} 으로 충족합니다.`,
    }];
  }

  /** 업종 */
  private checkIndustry(g: Grant, p: CompanyProfile): EligibilityReason[] {
    if (g.targetIndustries.length === 0) return [];

    if (!p.industry) {
      return [{
        field: '업종',
        verdict: 'unknown',
        profileField: 'industry',
        message: '특정 업종 대상 — 업종이 등록되어 있지 않습니다.',
      }];
    }

    const matched = g.targetIndustries.includes(p.industry);
    return [{
      field: '업종',
      verdict: matched ? 'pass' : 'fail',
      message: matched
        ? '지정 업종에 해당합니다.'
        : '지정 업종에 해당하지 않습니다.',
    }];
  }

  /**
   * 대표자 연령 — 청년창업 공고가 많아 실제로 자주 걸린다.
   *
   * 출생연도만 받으므로 만 나이가 한 살 범위로 나온다.
   * 그 범위가 요건 경계에 걸치면 통과시키지 않고 확인 필요로 남긴다.
   * (생일이 지났는지에 따라 결과가 뒤집히기 때문)
   */
  private checkAge(g: Grant, p: CompanyProfile): EligibilityReason[] {
    if (g.minAge == null && g.maxAge == null) return [];

    const label =
      g.minAge != null && g.maxAge != null
        ? `만 ${g.minAge}~${g.maxAge}세 대상`
        : g.minAge != null
          ? `만 ${g.minAge}세 이상 대상`
          : `만 ${g.maxAge}세 이하 대상`;

    if (p.founderBirthYear == null) {
      return [{
        field: '대표자 연령',
        verdict: 'unknown',
        profileField: 'founderBirthYear',
        message: `${label} — 대표자 출생연도가 등록되어 있지 않습니다.`,
      }];
    }

    const age = estimateAgeRange(p.founderBirthYear);
    const shown = formatAgeRange(age);

    // 범위 전체가 요건을 벗어나면 확정 탈락
    const belowAll = g.minAge != null && age.max < g.minAge;
    const aboveAll = g.maxAge != null && age.min > g.maxAge;
    if (belowAll || aboveAll) {
      return [{
        field: '대표자 연령',
        verdict: 'fail',
        message: `${label} — 현재 ${shown}로 해당하지 않습니다.`,
      }];
    }

    // 범위 전체가 요건 안에 들어가야 확정 통과
    const insideAll =
      (g.minAge == null || age.min >= g.minAge) &&
      (g.maxAge == null || age.max <= g.maxAge);
    if (insideAll) {
      return [{
        field: '대표자 연령',
        verdict: 'pass',
        message: `${label} — 현재 ${shown}로 충족합니다.`,
      }];
    }

    // 경계에 걸침 — 생일 여부에 따라 갈리므로 단정하지 않는다
    return [{
      field: '대표자 연령',
      verdict: 'unknown',
      message: `${label} — 현재 ${shown}로 생일에 따라 달라집니다. 공고 원문을 확인해 주세요.`,
    }];
  }

  /** 종업원 수 상한 */
  private checkEmployees(g: Grant, p: CompanyProfile): EligibilityReason[] {
    if (g.maxEmployees == null) return [];

    // 예비창업자는 아직 고용이 없다. 상한 조건은 자동으로 충족된다.
    if (p.stage === 'preliminary' && p.employees == null) {
      return [{
        field: '종업원 수',
        verdict: 'pass',
        message: `${g.maxEmployees}인 이하 대상 — 예비창업자로 충족합니다.`,
      }];
    }

    if (p.employees == null) {
      return [{
        field: '종업원 수',
        verdict: 'unknown',
        profileField: 'employees',
        message: `${g.maxEmployees}인 이하 대상 — 종업원 수가 등록되어 있지 않습니다.`,
      }];
    }

    const ok = p.employees <= g.maxEmployees;
    return [{
      field: '종업원 수',
      verdict: ok ? 'pass' : 'fail',
      message: `${g.maxEmployees}인 이하 대상 — 현재 ${p.employees}인.`,
    }];
  }

  /** 매출액 상한 */
  private checkRevenue(g: Grant, p: CompanyProfile): EligibilityReason[] {
    if (g.maxRevenue == null) return [];

    const limit = Number(g.maxRevenue);
    const label = `연매출 ${this.formatMoney(limit)} 이하 대상`;

    // 예비창업자는 매출이 발생할 수 없다. 상한 조건은 자동으로 충족된다.
    if (p.stage === 'preliminary' && p.annualRevenue == null) {
      return [{
        field: '매출액',
        verdict: 'pass',
        message: `${label} — 예비창업자로 충족합니다.`,
      }];
    }

    if (p.annualRevenue == null) {
      return [{
        field: '매출액',
        verdict: 'unknown',
        profileField: 'annualRevenue',
        message: `${label} — 매출액이 등록되어 있지 않습니다.`,
      }];
    }

    const revenue = Number(p.annualRevenue);
    const ok = revenue <= limit;
    return [{
      field: '매출액',
      verdict: ok ? 'pass' : 'fail',
      message: `${label} — 현재 ${this.formatMoney(revenue)}.`,
    }];
  }

  /** 법인 여부 */
  private checkCorporation(g: Grant, p: CompanyProfile): EligibilityReason[] {
    if (g.corporationOnly !== true) return [];

    // applicantTypes 가 지정돼 있으면 같은 조건을 이미 검사했다.
    // 중복해서 물으면 "신청 대상 ✕ / 법인 여부 ✓" 같은 모순된 줄이 나온다.
    if (g.applicantTypes?.length) return [];

    // 예비창업자는 사업자등록 자체가 없으므로 법인일 수 없다.
    if (p.stage === 'preliminary') {
      return [{
        field: '법인 여부',
        verdict: 'fail',
        message: '법인 사업자 대상 — 예비창업자는 신청할 수 없습니다.',
      }];
    }

    if (p.isCorporation == null) {
      return [{
        field: '법인 여부',
        verdict: 'unknown',
        profileField: 'stage',
        message: '법인 사업자 대상 — 법인 여부가 등록되어 있지 않습니다.',
      }];
    }

    return [{
      field: '법인 여부',
      verdict: p.isCorporation ? 'pass' : 'fail',
      message: p.isCorporation
        ? '법인 사업자 대상 — 충족합니다.'
        : '법인 사업자 대상 — 개인사업자는 신청할 수 없습니다.',
    }];
  }

  /** 필수 인증 보유 */
  private checkCertifications(g: Grant, p: CompanyProfile): EligibilityReason[] {
    if (g.requiredCertifications.length === 0) return [];

    const missing = g.requiredCertifications.filter(
      (need) => !p.certifications.some((has) => has.includes(need) || need.includes(has)),
    );

    if (missing.length === 0) {
      return [{
        field: '인증',
        verdict: 'pass',
        message: `필수 인증(${g.requiredCertifications.join('·')})을 보유하고 있습니다.`,
      }];
    }

    return [{
      field: '인증',
      verdict: 'fail',
      message: `필수 인증 미보유: ${missing.join('·')}`,
    }];
  }

  /**
   * 신청 대상 상세.
   *
   * 구조화 필드(업력·지역·형태)를 다 통과해도, 실제 자격은 여기서 갈리는 공고가 있다.
   *
   *   신청 대상: "'23년~'26년 초기창업패키지 선정·졸업기업"
   *   → 그 사업에 선정된 적이 있어야 한다. 구조화 검사만 보면 "지원 가능"이 나온다.
   *
   * 이미 검사한 내용의 반복은 넘기고, **특정 이력·소속을 요구하는 조건**만 확인한다.
   */
  private checkTargetDetail(
    g: Grant,
    p: CompanyProfile,
    open: OpenCondition[],
  ): EligibilityReason[] {
    const raw = g.applyTargetDetail?.trim();
    const doc = g.documentConditions;

    /*
     * 트랙마다 자격이 다른 공고는 트랙 조건을 하나하나 "해당하나요?"로 물으면
     * 안 된다 — 하나만 맞아도 되는데 하나라도 "아니오"면 탈락시키게 된다.
     * 확인 필요로만 남기고 원문을 보게 한다.
     */
    if (doc?.multiTrack && doc.requirements.length > 0) {
      return [{
        field: '신청 대상 조건',
        verdict: 'unknown',
        message: `트랙·분야별로 자격이 다른 공고입니다 — 해당하는 트랙이 있는지 공고문을 확인해 주세요. (${this.shorten(doc.requirements.join(' / '), 80)})`,
      }];
    }

    const fromText = raw && !isEmptyClause(raw)
      ? splitClauses(raw).filter(
          (c) =>
            !isEmptyClause(c) &&
            !isNotACondition(c) &&
            !isCoveredByStructure(c) &&
            hasSpecificRequirement(c),
        )
      : [];
    // 공고문에서 뽑은 것은 이미 "조건"으로 추려진 문장이라 이력 여부로 거르지 않는다
    const fromDoc = (doc?.requirements ?? []).filter(
      (c) =>
        !isEmptyClause(c) &&
        !isNotACondition(c) &&
        !isCoveredByStructure(c) &&
        !coveredByLocation(c, g),
    );
    const clauses = unique([...fromText, ...fromDoc]);
    if (clauses.length === 0) return [];

    const answers = p.conditionAnswers ?? {};
    const pending: string[] = [];
    const asked: OpenCondition[] = [];

    for (const clause of clauses) {
      const key = conditionKey(clause);
      const answer = this.autoAnswer(clause, p, 'target') ?? answers[key];
      // 신청 대상은 "해당한다"가 통과다. 제외 대상과 방향이 반대다.
      if (answer === 'no') {
        return [{
          field: '신청 대상 조건',
          verdict: 'fail',
          message: `해당하지 않는다고 답하셨습니다 — ${this.shorten(clause)}`,
        }];
      }
      if (answer !== 'yes') {
        pending.push(clause);
        asked.push({ key, clause, kind: 'target' });
      }
    }

    if (pending.length === 0) {
      return [{
        field: '신청 대상 조건',
        verdict: 'pass',
        message: '신청 대상 조건을 모두 확인했습니다.',
      }];
    }

    open.push(...asked);
    return [{
      field: '신청 대상 조건',
      verdict: 'unknown',
      ...this.historyField(pending, p),
      message: `해당 여부 확인이 필요합니다 — ${this.shorten(pending.join(' / '))}`,
    }];
  }

  /**
   * 제외 대상.
   *
   * 신청 대상과 모순되는 공고가 실제로 있다.
   * 예) 지원대상에 "예비창업자"가 있는데 제외 대상에도 "예비창업자"가 적힌 공고
   *     → 앞의 검사만 보면 "지원 가능"이 나오지만 실제로는 탈락한다.
   *
   * 다만 제외 조항 대부분은 **모든 공고에 들어가는 표준 문구**다.
   * (세금 체납, 휴폐업, 부도·회생, 신용정보 등)
   * 이걸 전부 "확인 필요"로 만들면 거의 모든 공고가 조건부가 되어
   * 표시 자체가 신호 구실을 못 한다. 그래서 표준 조항은 걸러내고
   * **그 공고에만 있는 조건**이 남았을 때만 확인을 요청한다.
   */
  private checkExclusion(
    g: Grant,
    p: CompanyProfile,
    open: OpenCondition[],
  ): EligibilityReason[] {
    const docExclusions = g.documentConditions?.exclusions ?? [];
    const given = g.excludeTarget?.trim();
    // "없음", "해당없음" 같은 값은 조건이 아니라 빈칸 표시다.
    const raw = given && !isEmptyClause(given) ? given : '';
    if (!raw && docExclusions.length === 0) return [];

    // 사업자 형태가 그대로 적힌 경우는 확정 판정한다.
    // 긴 문장 속 단어는 부정문일 수 있어 단독 표기만 인정한다.
    if (p.stage && raw) {
      const label = APPLICANT_LABELS[p.stage];
      const tokens = raw
        .split(/[,·/\n]/)
        .map((t) => t.trim())
        .filter(Boolean);

      const matchesForm = (t: string, l: string) =>
        t === l || t === `${l}는` || t === `${l}은` || t === `${l}만`;

      const excluded = tokens.some((t) => matchesForm(t, label));
      if (excluded) {
        return [{
          field: '제외 대상',
          verdict: 'fail',
          message: `${label}는 제외 대상입니다. (신청 대상에는 포함돼 있으나 제외 조건이 우선합니다)`,
        }];
      }

      // 제외 목록이 사업자 형태만 나열한 것이라면, 내 형태가 없으니 해당 없음이다.
      // "예비창업자 제외"인 공고를 법인이 보면 확인할 것이 없다.
      const allForms = Object.values(APPLICANT_LABELS);
      const formsOnly = tokens.every((t) =>
        allForms.some((l) => matchesForm(t, l)),
      );
      if (formsOnly) {
        return [{
          field: '제외 대상',
          verdict: 'pass',
          message: `${tokens.join('·')}만 제외됩니다 — ${label}는 해당하지 않습니다.`,
        }];
      }
    }

    // 표준 결격 사유를 빼고 남는 조건만 본다
    const specific = unique([
      ...splitClauses(raw),
      ...docExclusions.filter((c) => !coveredByLocation(c, g)),
    ]).filter(
      (c) =>
        !isEmptyClause(c) && !isNotACondition(c) && !isStandardExclusion(c),
    );

    if (specific.length === 0) {
      const pointed = splitClauses(raw).some((c) => POINTER.test(conditionKey(c)));
      return [{
        field: '제외 대상',
        verdict: 'pass',
        message: pointed
          ? '세부 제외 조건은 공고문에 따로 있습니다 — 신청 전에 원문을 확인해 주세요.'
          : '세금 체납·휴폐업 등 일반 결격 사유만 있습니다.',
      }];
    }

    /*
     * 사용자가 이미 답한 조건은 그 답을 쓴다.
     * 같은 문구가 여러 공고에 반복되므로, 한 번 답하면 계속 재사용된다.
     */
    const answers = p.conditionAnswers ?? {};
    const hit: string[] = [];      // 해당한다고 답한 것 → 탈락
    const pending: string[] = [];  // 아직 안 물어본 것
    const asked: OpenCondition[] = [];

    for (const clause of specific) {
      const key = conditionKey(clause);
      const answer = this.autoAnswer(clause, p, 'exclusion') ?? answers[key];
      if (answer === 'yes') hit.push(clause);
      else if (answer !== 'no') {
        pending.push(clause);
        asked.push({ key, clause, kind: 'exclusion' });
      }
    }

    if (hit.length > 0) {
      return [{
        field: '제외 대상',
        verdict: 'fail',
        message: `제외 조건에 해당한다고 답하셨습니다 — ${this.shorten(hit.join(' / '))}`,
      }];
    }

    if (pending.length === 0) {
      return [{
        field: '제외 대상',
        verdict: 'pass',
        message: '제외 조건을 모두 확인했고 해당하지 않습니다.',
      }];
    }

    open.push(...asked);
    return [{
      field: '제외 대상',
      verdict: 'unknown',
      ...this.historyField(pending, p),
      message: `확인이 필요한 조건 ${pending.length}건 — ${this.shorten(pending.join(' / '))}`,
    }];
  }

  /**
   * 대상 특성 — 여성·재창업·소상공인·사회적경제·수출·지식재산 전용 공고.
   *
   * 공고 쪽은 `detectTargetRequirements` 가 제목·신청대상에서 찾는다.
   * 사용자 쪽은 내 정보에서 **직접 받은 값만** 쓴다. 종업원 수로 소상공인을
   * 추정할 수는 있지만 매출 기준이 빠져 있어 판정에는 쓰지 않는다.
   *
   * 탈락은 두 가지가 다 맞을 때만이다 — 사용자가 답했고, 공고 제목에
   * 대상이 박혀 있다(`certain`). 신청대상 문장에서만 찾은 것은 나열의
   * 한 갈래일 수 있어 확인 필요로 둔다.
   */
  private checkTargetTraits(g: Grant, p: CompanyProfile): EligibilityReason[] {
    return targetRequirementsOf(g).map(({ requirement, certain, evidence }) => {
      const { label, has, answered, ask, profileField } = this.traitOf(requirement, p);
      const field = `대상 (${label})`;

      if (has) {
        return { field, verdict: 'pass', message: `${label} 대상 — 해당합니다.` };
      }
      if (!answered) {
        return {
          field,
          verdict: 'unknown',
          profileField,
          message: `${label} 대상으로 보입니다 — 내 정보에 ${ask}을(를) 입력하면 판정해 드립니다.`,
        };
      }
      if (certain) {
        return { field, verdict: 'fail', message: `${label} 대상 사업입니다 — 해당하지 않습니다.` };
      }
      return {
        field,
        verdict: 'unknown',
        message: `${label} 대상일 수 있습니다 — 공고 원문을 확인해 주세요. "${evidence}"`,
      };
    });
  }

  /** 요건 하나에 대해 사용자가 해당하는지, 답은 했는지 */
  private traitOf(
    r: TargetRequirement,
    p: CompanyProfile,
  ): {
    label: string;
    has: boolean;
    answered: boolean;
    ask: string;
    /** 답을 받을 내 정보 칸 — "이것만 답하면 N건" 집계에 쓴다 */
    profileField: string;
  } {
    // 예비창업자는 사업체가 없으니 소상공인·수출기업일 수 없다. 답을 기다리지 않는다.
    const preliminary = p.stage === 'preliminary';

    switch (r.kind) {
      case 'trait': {
        const traits = p.founderTraits ?? [];
        return {
          label: FOUNDER_TRAIT_LABELS[r.trait],
          has: traits.includes(r.trait as FounderTrait),
          answered: traits.length > 0, // ['none'] 도 답한 것이다
          ask: '대표자 특성',
          profileField: 'founderTraits',
        };
      }
      case 'smallBusiness':
        return {
          label: '소상공인',
          has: p.isSmallBusiness === true,
          answered: preliminary || p.isSmallBusiness != null,
          ask: '소상공인 여부',
          profileField: 'isSmallBusiness',
        };
      case 'socialEconomy': {
        const certs = p.certifications ?? [];
        return {
          label: '사회적경제기업',
          has: certs.some((c) =>
            (SOCIAL_ECONOMY_CERTIFICATIONS as readonly string[]).includes(c),
          ),
          answered: certs.length > 0, // ['해당 없음'] 도 답한 것이다
          ask: '보유 인증',
          profileField: 'certifications',
        };
      }
      case 'exporting':
        return {
          label: '수출기업',
          has: p.exportStatus === 'exporting',
          answered: preliminary || p.exportStatus != null,
          ask: '수출 현황',
          profileField: 'exportStatus',
        };
      case 'ip':
        return {
          label: '지식재산 보유',
          has: p.hasIp === true,
          answered: p.hasIp != null,
          ask: '지식재산 보유 여부',
          profileField: 'hasIp',
        };
    }
  }

  /**
   * 내 정보로 답할 수 있는 조건 문장이면 답한다. 못 하면 `null`.
   *
   * 조건 문장은 공고마다 표현이 달라 문장을 키로 한 답변 재사용은 거의
   * 안 먹힌다(운영 공고에서 질문 237개 중 202개가 한 번만 나왔다). 대신
   * **문장이 묻는 사실**이 내 정보에 이미 있으면 그걸로 답한다.
   */
  private autoAnswer(
    clause: string,
    p: CompanyProfile,
    kind: OpenCondition['kind'],
  ): ConditionAnswer | null {
    const history = this.programAnswer(clause, p);
    if (history) return history;

    // 숫자·날짜로 답하는 사실 — 신청 대상·제외 대상 모두 "그 문장이 나에게 해당하나"로 같다
    const fact = this.sizeAnswer(clause, p) ?? this.foundedDateAnswer(clause, p);
    if (fact) return fact;

    /*
     * 아래는 **제외 대상에서만** 쓴다. 신청 대상 칸의 "예비창업자: 사업자를
     * 등록하지 않은 자" 는 여러 갈래 중 하나라, 법인에게 "해당 안 함"으로
     * 답하면 멀쩡한 공고가 탈락한다.
     */
    if (kind !== 'exclusion') return null;
    return (
      this.stageAnswer(clause, p) ??
      this.yearsAnswer(clause, p) ??
      this.industryAnswer(clause, p) ??
      this.ipAnswer(clause, p)
    );
  }

  /**
   * 규모로 답하는 조건 — "근로자 5인 이상 사업장", "상시근로자 10인 미만",
   * "연 매출액 0원 초과", "매출이 없는 업체".
   */
  private sizeAnswer(clause: string, p: CompanyProfile): ConditionAnswer | null {
    const flat = clause.replace(/\s+/g, ' ');

    const emp = flat.match(/(?:근로자|종업원|직원|상시\s*인원|고용\s*인원)\s*(?:수\s*)?(?:가\s*)?(\d+)\s*(?:인|명)\s*(이상|이하|미만|초과)/);
    if (emp) {
      const n = p.employees ?? (p.stage === 'preliminary' ? 0 : null);
      if (n == null) return null;
      const v = Number(emp[1]);
      const ok = { 이상: n >= v, 이하: n <= v, 미만: n < v, 초과: n > v }[emp[2] as '이상'];
      return ok ? 'yes' : 'no';
    }

    if (/매출\s*(액)?\s*(이|가)?\s*(없는|0\s*원\s*초과|발생하지\s*않은)/.test(flat)) {
      if (p.annualRevenue == null) return p.stage === 'preliminary' ? (/없는|않은/.test(flat) ? 'yes' : 'no') : null;
      const has = Number(p.annualRevenue) > 0;
      return /없는|않은/.test(flat) ? (has ? 'no' : 'yes') : (has ? 'yes' : 'no');
    }
    return null;
  }

  /** "개업일이 2025년 12월 31일 이전", "2024. 1. 1. 이후 창업한 기업" */
  private foundedDateAnswer(clause: string, p: CompanyProfile): ConditionAnswer | null {
    const flat = clause.replace(/\s+/g, ' ');
    if (!/개업|창업|설립|사업자\s*등록/.test(flat)) return null;
    const m = flat.match(/(20\d{2})\s*[.년-]\s*(\d{1,2})\s*[.월-]\s*(\d{1,2})\s*일?\.?\s*(이전|이후|전|후|까지|부터)/);
    if (!m) return null;
    if (p.stage === 'preliminary') return null;
    if (!p.foundedAt) return null;

    const pivot = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
    const founded = new Date(p.foundedAt).getTime();
    const before = /이전|전|까지/.test(m[4]);
    return (before ? founded <= pivot : founded >= pivot) ? 'yes' : 'no';
  }

  /**
   * 업력으로 답하는 제외 조건.
   *   "업력이 7년이 초과하는 기업", "창업 7년 초과 기업", "업력 1년 미만 창업기업",
   *   "업력 1년미만 및 업력 7년이상 소상공인 제외"
   */
  private yearsAnswer(clause: string, p: CompanyProfile): ConditionAnswer | null {
    const flat = clause.replace(/\s+/g, ' ');
    const rules = [...flat.matchAll(/(?:업력|창업)\s*(?:이\s*)?(\d+)\s*년\s*(?:이\s*)?(초과|이상|미만)/g)];
    if (rules.length === 0) return null;
    if (p.stage === 'preliminary') return null; // 예비창업자 업력은 별도 조건으로 다룬다
    if (!p.foundedAt) return null;

    const years = this.yearsSince(new Date(p.foundedAt));
    const hit = rules.some(([, n, op]) =>
      op === '미만' ? years < Number(n) : op === '이상' ? years >= Number(n) : years > Number(n),
    );
    return hit ? 'yes' : 'no';
  }

  /**
   * 업종으로 답하는 제외 조건 — 창업지원법 제외 업종, 입주 불가 업종, 공해 유발 업종.
   *
   * **해당 없음만 답한다.** 업종 선택지가 굵어서(`service` 안에 숙박도 미용도
   * 있다) "해당함"은 단정할 수 없다. 확실히 거리가 먼 업종일 때만 넘긴다.
   */
  private industryAnswer(clause: string, p: CompanyProfile): ConditionAnswer | null {
    if (!p.industry) return null;

    const excludedTrade =
      /창업에서\s*제외되는\s*업종|시행령\s*제\s*4\s*조|제외\s*(대상\s*)?업종|(입주|입점)\s*(불가|제한|제외)\s*(대상\s*)?업종|제한\s*업종|숙박|음식점|요식|금융\s*및\s*보험|부동산|도\s*소매|도매\s*및\s*소매|미용/;
    if (excludedTrade.test(clause) && ['it', 'bio', 'content', 'manufacturing'].includes(p.industry)) {
      return 'no';
    }

    const pollution = /공해|소음|진동|폐수|악취|분진|오염|도금|도장|주물|혐오/;
    if (pollution.test(clause) && ['it', 'content', 'service', 'commerce'].includes(p.industry)) {
      return 'no';
    }
    return null;
  }

  /** "특허를 보유하지 않은 기업" 제외 */
  private ipAnswer(clause: string, p: CompanyProfile): ConditionAnswer | null {
    if (p.hasIp == null) return null;
    if (!/(특허|지식\s*재산).{0,20}(보유하지\s*않|없는|미보유)/.test(clause)) return null;
    return p.hasIp ? 'no' : 'yes';
  }

  /**
   * 사업자 형태·업력으로 답하는 조건.
   *
   *   "신청일 기준 회사 설립이 완료되지 않은 기업 (예비창업자)" → 예비창업자면 해당
   *   "예비 창업자 제외"                                        → 예비창업자면 해당
   *   "사업자등록을 한 창업기업"                                → 사업자가 있으면 해당
   *   "신청일 기준 법인 설립 1년 미만인 기업"                   → 법인·개업일로 계산
   */
  private stageAnswer(clause: string, p: CompanyProfile): ConditionAnswer | null {
    if (!p.stage) return null;
    const pre = p.stage === 'preliminary';
    const flat = clause.replace(/\s+/g, ' ').trim();

    if (
      /예비\s*창업/.test(flat) &&
      (/제외|불가|설립이?\s*완료되지\s*않은|사업자\s*(등록\s*)?(전|없는|미등록)|영업하지\s*않는/.test(flat) ||
        /^[^가-힣]*예비\s*창업자?[^가-힣]*$/.test(flat))
    ) {
      return pre ? 'yes' : 'no';
    }

    if (/^[^가-힣]*(사업자\s*등록을?\s*(한|마친)\s*)?(창업\s*기업|기\s*창업자)[^가-힣]*$/.test(flat)) {
      return pre ? 'no' : 'yes';
    }

    const corpYears = flat.match(/법인\s*설립\s*(\d+)\s*년\s*미만/);
    if (corpYears) {
      if (p.stage !== 'corporate') return 'no';
      if (!p.foundedAt) return null;
      return this.yearsSince(new Date(p.foundedAt)) < Number(corpYears[1]) ? 'yes' : 'no';
    }

    return null;
  }

  /**
   * 사업 이력으로 조건 문장에 답한다.
   *
   * "'23년~'26년 초기창업패키지 선정기업", "예비창업패키지 기수혜자 제외"
   * 같은 문장은 내 정보의 선정 이력으로 답할 수 있다. 답은 "그 문장이 나에게
   * 해당하는가"이므로 신청 대상·제외 대상 모두 같은 뜻으로 쓴다.
   *
   * 이력을 아직 안 골랐거나 문장에 아는 사업 이름이 없으면 `null` —
   * 사용자가 직접 답한 것을 본다.
   */
  private programAnswer(clause: string, p: CompanyProfile): ConditionAnswer | null {
    const history = p.pastPrograms ?? [];
    if (history.length === 0) return null;
    if (!/선정|졸업|수혜|협약|참여|지원\s*받/.test(clause)) return null;

    const named = programsIn(clause);
    if (named.length === 0) return null;

    const mine = history.filter((h) => h !== NO_PAST_PROGRAM);
    return named.some((n) => mine.includes(n)) ? 'yes' : 'no';
  }

  /**
   * 남은 조건이 선정 이력으로 답할 수 있는 것이면, 이력 칸을 가리킨다.
   * 이력을 이미 골랐다면 `programAnswer` 가 답했을 테니 가리킬 것이 없다.
   */
  private historyField(
    pending: string[],
    p: CompanyProfile,
  ): { profileField?: string } {
    if ((p.pastPrograms ?? []).length > 0) return {};
    return pending.some((c) => programsIn(c).length > 0)
      ? { profileField: 'pastPrograms' }
      : {};
  }

  /* ────────────── 유틸 ────────────── */

  /** 긴 원문은 앞부분만 보여준다 */
  private shorten(text: string, max = 60): string {
    const flat = text.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max)}…` : flat;
  }

  /**
   * 업력(년).
   *
   * **셈은 `businessYearsOf` 한 곳에서 한다.** 예전에는 여기와 로드맵에
   * 같은 계산이 따로 있었다. 값은 같았지만 한쪽만 고치면 "4년차인데 왜
   * 3년 이내 공고가 되지" 같은 어긋남이 생기고, 그건 사용자가 우리를
   * 못 믿게 되는 종류의 오류다.
   */
  private yearsSince(from: Date): number {
    return businessYearsOf(from.toISOString()) ?? 0;
  }

  private formatYearRange(min: number | null, max: number | null): string {
    if (min != null && max != null) return `업력 ${min}~${max}년`;
    if (min != null) return `업력 ${min}년 이상`;
    return `창업 ${max}년 이내`;
  }

  private formatMoney(won: number): string {
    if (won >= 100_000_000) return `${(won / 100_000_000).toFixed(1).replace(/\.0$/, '')}억원`;
    if (won >= 10_000) return `${Math.round(won / 10_000).toLocaleString()}만원`;
    return `${won.toLocaleString()}원`;
  }
}
