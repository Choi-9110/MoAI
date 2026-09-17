import type { ApplicantType } from './enums';

/**
 * 정책 브리핑.
 *
 * **뉴스가 아니라 예고편이다.** 예산안·정책 발표는 곧 내년 공고로 바뀐다.
 * "모두의 창업 지원금이 2천만 원에서 3천만 원으로 오른다"는 예비창업자에게
 * 실제로 1천만 원이 달라지는 일이다.
 *
 * 그런데 이런 자료는 스무 항목이 한 문서에 들어 있고, 그중 나에게 해당하는
 * 것은 두어 개다. 나머지를 읽느라 그 둘을 놓친다. 그래서 **항목마다 누구에게
 * 해당하는지를 달아 두고**, 프로필과 맞는 것을 위로 올린다.
 */
export interface BriefAudience {
  /** 사업자 형태 — 비어 있으면 가리지 않는다 */
  stages?: ApplicantType[];
  /** 업력 하한(년). 예비창업자는 `-1` 로 센다 */
  minYears?: number | null;
  /** 업력 상한(년) */
  maxYears?: number | null;
  /**
   * 해당 지역. 비어 있으면 전국.
   * 프로필의 시·도 표기와 앞부분만 맞춰 본다 (`경기` ↔ `경기도`).
   */
  regions?: string[];
}

/** 브리핑 안의 변화 하나 */
export interface BriefItem {
  id: string;
  /** 무엇이 달라지는가 — 예: `모두의 창업 지원금 상향` */
  label: string;
  /** 한두 문장 설명 */
  detail: string;
  /** 규모 — 예: `4,411억 원`, `2천만 → 3천만 원` */
  amount?: string | null;
  /** 새로 생긴 것인가 — 기존 사업의 변경과 구분해 보여 준다 */
  isNew?: boolean;
  /** 누구에게 해당하는가 */
  audience?: BriefAudience;
}

export interface PolicyBrief {
  id: string;
  title: string;
  /** 어디서 나온 자료인가 — 예: `중소벤처기업부` */
  source: string;
  /** 발표일 (ISO date) */
  publishedAt: string;
  summary: string;
  sourceUrl: string | null;
  items: BriefItem[];
  createdAt: string;
  updatedAt: string;
}

/** 매칭에 쓸 프로필 조각 */
export interface BriefProfileInput {
  stage?: ApplicantType | null;
  /** 업력(년) — `businessYearsOf` 로 구한 값. 모르면 `null` */
  years?: number | null;
  region?: string | null;
}

/**
 * 이 항목이 나에게 해당하는가.
 *
 * **모르는 것은 걸러내지 않는다.** 창업일을 안 넣은 사람에게 업력 조건이
 * 걸린 항목을 숨기면, 자기와 상관있는 정책을 못 보게 된다. 조건을 확인할
 * 수 없으면 "해당한다" 쪽으로 남긴다 — 놓치는 쪽이 더 나쁘기 때문이다.
 */
export function briefItemMatches(
  item: BriefItem,
  profile: BriefProfileInput,
): boolean {
  const a = item.audience;
  if (!a) return true; // 대상을 안 적었으면 모두에게 해당한다

  if (a.stages?.length) {
    // 형태를 모르면 막지 않는다
    if (profile.stage && !a.stages.includes(profile.stage)) return false;
  }

  if (a.minYears != null || a.maxYears != null) {
    const y = profile.years;
    if (y != null) {
      if (a.minYears != null && y < a.minYears) return false;
      if (a.maxYears != null && y > a.maxYears) return false;
    }
  }

  if (a.regions?.length) {
    const mine = (profile.region ?? '').trim();
    if (mine) {
      /*
       * 표기가 서로 다르다 (`경기` / `경기도`). 짧은 쪽이 긴 쪽의 앞부분이면
       * 같은 곳으로 본다 — 지역 판정에서 쓰는 것과 같은 방식이다.
       */
      const hit = a.regions.some(
        (r) => r.startsWith(mine) || mine.startsWith(r),
      );
      if (!hit) return false;
    }
  }

  return true;
}

/** 나에게 해당하는 것을 앞으로 보낸다 */
export function sortBriefItems(
  items: BriefItem[],
  profile: BriefProfileInput,
): { mine: BriefItem[]; others: BriefItem[] } {
  const mine: BriefItem[] = [];
  const others: BriefItem[] = [];
  for (const it of items) {
    (briefItemMatches(it, profile) ? mine : others).push(it);
  }
  return { mine, others };
}

/**
 * 대상을 사람 말로 옮긴다 — "누구에게 해당하는지"를 화면에 적기 위해.
 */
export function describeAudience(a: BriefAudience | undefined): string | null {
  if (!a) return null;
  const parts: string[] = [];

  if (a.stages?.length) {
    const labels: Record<ApplicantType, string> = {
      preliminary: '예비창업자',
      individual: '개인사업자',
      corporate: '법인',
    };
    parts.push(a.stages.map((s) => labels[s]).join('·'));
  }

  if (a.minYears != null || a.maxYears != null) {
    if (a.maxYears != null && a.minYears == null) {
      parts.push(`업력 ${a.maxYears}년 이내`);
    } else if (a.minYears != null && a.maxYears == null) {
      parts.push(`업력 ${a.minYears}년 이상`);
    } else {
      parts.push(`업력 ${a.minYears}~${a.maxYears}년`);
    }
  }

  if (a.regions?.length) parts.push(a.regions.join('·'));

  return parts.length ? parts.join(' · ') : null;
}
