import { Injectable } from '@nestjs/common';
import {
  FOUNDER_TRAIT_LABELS, NO_PAST_PROGRAM,
  SOCIAL_ECONOMY_CERTIFICATIONS, businessYearsOf, cityKey, conditionKey,
  detectTargetRequirements, estimateAgeRange, formatAgeRange, programsIn,
} from '@moai/shared';
import type {
  ApplicantType, ConditionAnswer, Eligibility, EligibilityReason, FounderTrait,
  OpenCondition, TargetRequirement,
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
  /보조금.*환수|지원금.*환수|제재부가금/,
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
];

export function isNotACondition(clause: string): boolean {
  // 글머리 기호("◦ 모집 인원: …")가 붙은 줄도 같은 안내문이다.
  // 원문과 기호를 뗀 형태를 모두 본다.
  const raw = clause.trim();
  const normalized = conditionKey(clause);
  return NOT_A_CONDITION.some((re) => re.test(raw) || re.test(normalized));
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
  evaluate(grant: Grant, profile: CompanyProfile | null): Eligibility {
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
    const districts = findDistricts(
      g.targetRegions,
      g.applyTargetDetail,
      g.title,
      g.summary,
    );
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
    if (!raw || isEmptyClause(raw)) return [];

    const clauses = splitClauses(raw).filter(
      (c) =>
        !isEmptyClause(c) &&
        !isNotACondition(c) &&
        !isCoveredByStructure(c) &&
        hasSpecificRequirement(c),
    );
    if (clauses.length === 0) return [];

    const answers = p.conditionAnswers ?? {};
    const pending: string[] = [];
    const asked: OpenCondition[] = [];

    for (const clause of clauses) {
      const key = conditionKey(clause);
      const answer = this.programAnswer(clause, p) ?? answers[key];
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
    const raw = g.excludeTarget?.trim();
    // "없음", "해당없음" 같은 값은 조건이 아니라 빈칸 표시다.
    if (!raw || isEmptyClause(raw)) return [];

    // 사업자 형태가 그대로 적힌 경우는 확정 판정한다.
    // 긴 문장 속 단어는 부정문일 수 있어 단독 표기만 인정한다.
    if (p.stage) {
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
    const specific = splitClauses(raw).filter(
      (c) =>
        !isEmptyClause(c) && !isNotACondition(c) && !isStandardExclusion(c),
    );

    if (specific.length === 0) {
      return [{
        field: '제외 대상',
        verdict: 'pass',
        message: '세금 체납·휴폐업 등 일반 결격 사유만 있습니다.',
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
      const answer = this.programAnswer(clause, p) ?? answers[key];
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
    return detectTargetRequirements(g).map(({ requirement, certain, evidence }) => {
      const { label, has, answered, ask } = this.traitOf(requirement, p);
      const field = `대상 (${label})`;

      if (has) {
        return { field, verdict: 'pass', message: `${label} 대상 — 해당합니다.` };
      }
      if (!answered) {
        return {
          field,
          verdict: 'unknown',
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
  ): { label: string; has: boolean; answered: boolean; ask: string } {
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
        };
      }
      case 'smallBusiness':
        return {
          label: '소상공인',
          has: p.isSmallBusiness === true,
          answered: preliminary || p.isSmallBusiness != null,
          ask: '소상공인 여부',
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
        };
      }
      case 'exporting':
        return {
          label: '수출기업',
          has: p.exportStatus === 'exporting',
          answered: preliminary || p.exportStatus != null,
          ask: '수출 현황',
        };
      case 'ip':
        return {
          label: '지식재산 보유',
          has: p.hasIp === true,
          answered: p.hasIp != null,
          ask: '지식재산 보유 여부',
        };
    }
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
