import type { BidNotice } from './procurement';

/**
 * 입찰 자격 판정.
 *
 * **지원사업 판정과 다른 점.** 지원사업은 되거나 안 되거나 둘 중 하나에
 * 가깝지만, 입찰은 "지금은 안 되는데 뭘 하면 되는" 경우가 많다. 그걸
 * 한 덩어리 주황으로 뭉뚱그리면 사람이 헛걸음한다 — 조달청 등록은 3일이면
 * 되지만 면허는 1년이 걸린다. 그래서 **채울 수 있는 것과 자라야 하는 것**을
 * 나눈다.
 */
export const BID_LEVELS = [
  'eligible',   // 🟢 넣을 수 있음
  'actionable', // 🟠 지금 하면 가능 — 며칠 안에 해결되는 것
  'growing',    // 🟡 조건이 자라면 가능 — 시간이 걸리는 것
  'ineligible', // 🔴 넣을 수 없음 — 마감했거나 자격이 안 되거나
] as const;
export type BidLevel = (typeof BID_LEVELS)[number];

/**
 * 화면에 쓰는 이름.
 *
 * **얼마나 걸리는지를 이름에 넣는다.** "조건부" 같은 말로는 사람이 지금
 * 움직여야 하는지 기다려야 하는지 알 수 없다. 주황과 노랑을 가르는 것도
 * 색이 아니라 이 문구다 — 색만으로 나누면 색을 구분하지 못하는 사람에게는
 * 셋이 같은 칸이 된다.
 */
export const BID_LEVEL_LABELS: Record<BidLevel, string> = {
  eligible: '입찰 가능',
  /*
   * 예전 이름은 '며칠이면 가능' 이었는데, 무엇이 며칠 걸리는지가 없어서
   * 읽는 사람이 무슨 뜻인지 알 수 없었다. 실제로 이 층에 들어오는 조건은
   * **조달청 입찰참가자격 등록** 하나뿐이라(보통 3일) 그대로 이름을 붙였다.
   */
  actionable: '등록하면 가능',
  /* 이쪽도 마찬가지 — 자라야 하는 것은 조달 실적이다 */
  growing: '실적 쌓이면 가능',
  ineligible: '넣을 수 없음',
};

/**
 * 색과 기호.
 *
 * 신호등 그대로다 — 초록은 가고, 빨강은 멈춘다. 가운데 둘은 **주황이 더
 * 급하고 노랑이 더 멀다.** 색이 진할수록 지금 할 일에 가깝게 두었다.
 *
 * `mark` 를 함께 두는 이유는 색약·흑백 인쇄·작은 배지 때문이다. 색이
 * 사라져도 기호와 이름만으로 네 층이 구분돼야 한다.
 */
export const BID_LEVEL_STYLES: Record<
  BidLevel,
  { mark: string; tone: 'green' | 'orange' | 'yellow' | 'red' }
> = {
  eligible: { mark: '●', tone: 'green' },
  actionable: { mark: '◐', tone: 'orange' },
  growing: { mark: '◔', tone: 'yellow' },
  ineligible: { mark: '×', tone: 'red' },
};

/** 판정 근거 한 줄 */
export interface BidReason {
  field: string;
  verdict: 'pass' | 'todo' | 'grow' | 'fail' | 'unknown';
  message: string;
  /** 수치로 견줄 수 있는 것만 — "32억 / 50억" 처럼 얼마나 모자란지 보여 준다 */
  progress?: { have: number; need: number; ratio: number };
}

export interface BidJudgement {
  level: BidLevel;
  reasons: BidReason[];
  /** 지금 하면 되는 일 — 화면의 행동 버튼이 된다 */
  todo: string | null;
}

/**
 * 실적 대비 몇 배까지를 "사실상 불가"로 볼 것인가.
 *
 * 공동수급으로 메울 수 있는 여지를 감안해 넉넉히 잡았다. 낮추면 빨강이
 * 늘어 화면은 깔끔해지지만, 실제로 넣을 수 있었던 공고가 사라진다.
 */
const OUT_OF_REACH = 10;

/**
 * 공동수급이 안 되는 공고의 기준.
 *
 * 혼자 감당해야 하므로 훨씬 좁게 본다. 전체의 89%가 여기 해당한다.
 */
const OUT_OF_REACH_ALONE = 3;

export interface BidProfileInput {
  region: string | null;
  /** 시·군·구. 지역제한의 59% 가 여기까지 내려오므로 시·도만으로는 못 거른다. */
  regionDetail?: string | null;
  industries: string[];
  registered: boolean | null;
  /** 최근 3년 조달 실적(원) */
  performance: number | null;
}

/**
 * 공고 하나를 판정한다.
 *
 * **모르는 것은 막지 않는다.** 실적을 입력하지 않은 사람에게 "실적 부족"을
 * 띄우면 사실이 아니고, 넣을 수 있는 공고를 스스로 지우게 만든다. 확인하지
 * 못한 항목은 통과로 두고 "확인 필요"로만 남긴다 — 지원사업 판정과 같은
 * 원칙이다.
 */
export function judgeBid(
  notice: BidNotice,
  profile: BidProfileInput,
  now: Date = new Date(),
): BidJudgement {
  const reasons: BidReason[] = [];

  /* ── 마감 ── */
  if (notice.bidCloseAt) {
    const close = Date.parse(notice.bidCloseAt);
    if (Number.isFinite(close) && close < now.getTime()) {
      return {
        level: 'ineligible',
        reasons: [{ field: '마감', verdict: 'fail', message: '입찰이 마감됐습니다.' }],
        todo: null,
      };
    }
  }

  /* ── 참가 가능 지역 ──
   *
   * **못 맞아도 지우지 않는다.** 판단 기준이 거의 전부(287/288)
   * `본사또는참여지사소재지` 라서, 그 지역에 지사가 있으면 참가할 수 있다.
   * 목록에서 지워 버리면 지사를 가진 업체가 멀쩡한 공고를 잃는다.
   * 그래서 층만 내리고 이유를 적어 둔다.
   */
  if (notice.allowedRegions?.length) {
    const mine = regionMatches(
      notice.allowedRegions,
      profile.region,
      profile.regionDetail,
    );

    if (mine === false) {
      return {
        level: 'ineligible',
        reasons: [
          {
            field: '지역',
            verdict: 'fail',
            message:
              `${notice.allowedRegions.join(', ')} 소재 업체만 참가할 수 있습니다. ` +
              '해당 지역에 지사가 있다면 참가할 수 있습니다.',
          },
        ],
        todo: null,
      };
    }

    reasons.push(
      mine
        ? {
            field: '지역',
            verdict: 'pass',
            message: `${notice.allowedRegions.join(', ')} 제한 공고이고, 소재지가 맞습니다.`,
          }
        : {
            field: '지역',
            verdict: 'unknown',
            message:
              `${notice.allowedRegions.join(', ')} 소재 업체만 참가할 수 있습니다. ` +
              '내 정보에 지역을 넣으면 맞는지 알려 드립니다.',
          },
    );
  }

  /* ── 업종 ──
   * 목록을 이미 내 업종으로 걸러 받았으므로 여기까지 온 것은 맞는 공고다.
   * 그래도 근거로 남긴다 — 왜 이 공고가 보이는지 사람이 알아야 한다.
   */
  if (notice.industryLimited) {
    reasons.push({
      field: '업종',
      verdict: 'pass',
      message: '보유하신 업종으로 참가할 수 있는 공고입니다.',
    });
  } else {
    reasons.push({
      field: '업종',
      verdict: 'pass',
      message: '업종 제한이 없는 공고입니다.',
    });
  }

  /* ── 지역 ── */
  if (notice.siteRegion) {
    reasons.push({
      field: '지역',
      verdict: 'pass',
      message: `현장은 ${notice.siteRegion} 입니다.`,
    });
  }

  /* ── 공동수급 ──
   * 실적이 모자랄 때 다른 업체와 같이 들어갈 수 있는지. 대부분 막혀 있어서
   * 되는 공고는 그 자체가 기회다.
   */
  if (notice.jointAllowed) {
    reasons.push({
      field: '공동수급',
      verdict: 'pass',
      message: '다른 업체와 함께 참가할 수 있는 공고입니다.',
    });
  }

  /* ── 조달청 입찰참가자격 등록 ──
   * 이것이 없으면 자격을 떠나 **투찰 자체가 불가능하다.** 다만 며칠이면
   * 끝나는 일이라 보통은 "불가"가 아니라 "며칠이면 가능"이다.
   *
   * **단, 마감이 그 며칠 안에 있으면 이야기가 다르다.** 등록에 3일이 걸리는데
   * 마감이 내일이면 실제로는 넣을 수 없다. 그걸 주황으로 두면 "하면 되겠네"
   * 하고 움직였다가 마감을 만난다 — 헛걸음을 시키는 셈이라 빨강이 맞다.
   */
  let todo: string | null = null;
  const daysLeft = notice.bidCloseAt
    ? (Date.parse(notice.bidCloseAt) - now.getTime()) / 86_400_000
    : null;

  if (profile.registered === false) {
    const tooLate = daysLeft != null && Number.isFinite(daysLeft) && daysLeft < 3;
    if (tooLate) {
      reasons.push({
        field: '조달청 등록',
        verdict: 'fail',
        message:
          '입찰참가자격 등록이 필요한데 마감까지 3일이 남지 않았습니다. ' +
          '지금 등록해도 이 공고는 넣기 어렵습니다.',
      });
    } else {
      reasons.push({
        field: '조달청 등록',
        verdict: 'todo',
        message: '입찰참가자격 등록이 필요합니다. 보통 3일 안에 끝납니다.',
      });
      todo = '조달청 입찰참가자격 등록';
    }
  } else if (profile.registered === null) {
    reasons.push({
      field: '조달청 등록',
      verdict: 'unknown',
      message: '입찰참가자격 등록 여부를 알려주시면 더 정확히 판정합니다.',
    });
  } else {
    reasons.push({
      field: '조달청 등록',
      verdict: 'pass',
      message: '입찰참가자격이 등록되어 있습니다.',
    });
  }

  /* ── 규모 ──
   * 추정가격과 실적을 견준다. **단정하지 않는다** — 실제 자격 요건은 공고마다
   * 다르고 목록에는 그 기준이 실려 오지 않는다. 여기서 하는 것은
   * "이 규모는 지금 실적보다 큽니다" 라는 참고 표시다.
   */
  const scale = notice.estimate ?? notice.budget;
  if (scale && profile.performance != null && profile.performance > 0) {
    const times = scale / profile.performance;

    /*
     * 몇 배까지 봐줄 것인가는 **공동수급이 되는지에 달렸다.**
     *
     * 처음에는 컨소시엄으로 메울 수 있다고 보고 열 배까지 열어 뒀는데,
     * 594건을 세어 보니 **89%가 공동수급 불허**였다. 혼자 넣어야 하는
     * 공고에까지 그 여지를 주면, 못 넣을 것을 "가능"으로 보여 주게 된다.
     */
    const reach = notice.jointAllowed ? OUT_OF_REACH : OUT_OF_REACH_ALONE;

    if (times > reach) {
      reasons.push({
        field: '규모',
        verdict: 'fail',
        message: notice.jointAllowed
          ? `최근 3년 실적의 ${Math.round(times)}배 규모입니다. 단독 참가는 어렵습니다.`
          : `최근 3년 실적의 ${Math.round(times)}배 규모인데 공동수급이 불허된 공고입니다.`,
        progress: {
          have: profile.performance,
          need: scale,
          ratio: profile.performance / scale,
        },
      });
    } else if (scale > profile.performance) {
      reasons.push({
        field: '규모',
        verdict: 'grow',
        message: '최근 3년 실적보다 규모가 큰 공고입니다. 자격 요건을 확인해 주세요.',
        progress: {
          have: profile.performance,
          need: scale,
          ratio: Math.min(profile.performance / scale, 1),
        },
      });
    } else {
      reasons.push({
        field: '규모',
        verdict: 'pass',
        message: '최근 3년 실적 안에 들어오는 규모입니다.',
      });
    }
  } else if (scale && profile.performance == null) {
    reasons.push({
      field: '규모',
      verdict: 'unknown',
      message: '조달 실적을 입력하시면 규모가 맞는지 함께 봐 드립니다.',
    });
  }

  /*
   * 층을 정한다.
   *
   * 며칠이면 되는 일(todo)이 자라야 하는 일(grow)보다 앞선다 — 사람이 지금
   * 움직일 수 있는 것을 먼저 보여 주는 편이 쓸모 있다.
   */
  const level: BidLevel = reasons.some((r) => r.verdict === 'fail')
    ? 'ineligible'
    : reasons.some((r) => r.verdict === 'todo')
      ? 'actionable'
      : reasons.some((r) => r.verdict === 'grow')
        ? 'growing'
        : 'eligible';

  return { level, reasons, todo };
}

/** 목록을 층별로 센다 — 화면 위쪽 요약에 쓴다 */
export function countByLevel(judgements: BidJudgement[]): Record<BidLevel, number> {
  const counts: Record<BidLevel, number> = {
    eligible: 0, actionable: 0, growing: 0, ineligible: 0,
  };
  for (const j of judgements) counts[j.level] += 1;
  return counts;
}

/** `320000000` → `3.2억` — 금액은 자리수가 커서 그대로 두면 못 읽는다 */
export function formatMoney(won: number | null): string {
  if (won == null) return '-';
  if (won >= 100_000_000) {
    const eok = won / 100_000_000;
    return `${eok >= 10 ? Math.round(eok) : eok.toFixed(1)}억`;
  }
  if (won >= 10_000) return `${Math.round(won / 10_000).toLocaleString()}만`;
  return won.toLocaleString();
}


/**
 * 공고가 허용하는 지역에 내 소재지가 드는지.
 *
 * 표기가 서로 다르다. 공고는 `전북특별자치도 군산시`, `경기도`, `인천광역시`
 * 처럼 오고, 프로필은 `경기`·`전북` 처럼 짧다. 그래서 글자를 그대로 견주지
 * 않고 **시·도를 먼저 맞춘 뒤 시·군을 본다.**
 *
 * - 공고가 시·도까지만 걸었으면(`경기도`) 그 도의 업체는 전부 된다.
 * - 시·군까지 걸었으면(`경기도 성남시`) 시·군이 같아야 한다.
 * - 시·군을 아직 안 받았으면 **막지 않는다** — `null` 로 돌려 "모른다"고 한다.
 *   모르는 것을 못 한다고 하면 넣을 수 있는 공고를 스스로 지우게 된다.
 *
 * @returns 맞으면 `true`, 아니면 `false`, 판단할 정보가 없으면 `null`
 */
export function regionMatches(
  allowed: string[],
  region: string | null | undefined,
  detail?: string | null,
): boolean | null {
  const mine = (region ?? '').trim();
  if (!mine) return null;

  /** `경기` 와 `경기도`, `전북` 과 `전북특별자치도` 를 같게 본다 */
  const trim = (v: string) =>
    v.replace(/(특별자치도|특별자치시|광역시|특별시|자치도|도|시)$/, '');

  const myDo = trim(mine);
  const myCity = (detail ?? '').trim();

  let sawDoMatch = false;

  for (const raw of allowed) {
    const parts = raw.trim().split(/\s+/);
    const theirDo = trim(parts[0] ?? '');
    if (!theirDo || trim(theirDo) !== myDo) continue;

    sawDoMatch = true;

    // 시·도까지만 건 공고 — 그 도면 전부 된다
    if (parts.length === 1) return true;

    // 시·군까지 걸었는데 내 시·군을 모른다 → 판단 보류
    if (!myCity) return null;

    /*
     * **표기가 어긋나도 같은 곳으로 본다.**
     *
     * 공고는 `수원시`, `수원`, `경기도 수원시 영통구` 처럼 제각각 적힌다.
     * 글자를 그대로 견주면 `성남` 과 `성남시` 가 다른 곳이 되어, 낼 수 있는
     * 공고가 조용히 사라진다. 사라진 것은 눈에 안 띄므로 더 나쁘다.
     *
     * 그래서 **끝의 시·군·구를 떼고** 토막마다 견준다. `경기도 수원시
     * 영통구` 는 `수원`·`영통` 이 되고, 내 `수원시` 는 `수원` 이 되어 맞는다.
     */
    const mineKey = cityKey(myCity);
    const theirKeys = parts.slice(1).map(cityKey).filter(Boolean);
    if (theirKeys.some((k) => k === mineKey)) return true;

    /* 붙여 쓴 경우 (`수원시영통구`) 까지 본다 */
    const joined = parts.slice(1).join('');
    if (joined.includes(mineKey) || mineKey.includes(cityKey(joined))) {
      return true;
    }
  }

  /*
   * 여기까지 왔으면 못 맞은 것이다 — 시·도가 다르거나, 시·도는 맞는데
   * 시·군이 전부 어긋났거나. 시·군을 모르는 경우는 위에서 이미 `null` 로
   * 나갔으므로, 모른다는 이유로 막는 일은 없다.
   */
  void sawDoMatch;
  return false;
}

/**
 * 층마다 **왜 그 층인지**를 센다.
 *
 * 화면 위 요약이 `× 넣을 수 없음 264` 로만 끝나면, 264건이 마감된 것인지
 * 지역이 안 맞는 것인지 알 수 없다. 둘은 사람이 할 일이 전혀 다르다 —
 * 마감은 어쩔 수 없지만, 지역이 문제라면 내 정보를 고치면 된다.
 *
 * 그 층을 만든 이유만 센다. `ineligible` 이면 `fail`, `actionable` 이면
 * `todo` 처럼, 층을 결정한 판정과 같은 것만 본다.
 */
export function reasonBreakdown(
  judgements: BidJudgement[],
): Record<BidLevel, { field: string; count: number }[]> {
  const decisive: Record<BidLevel, BidReason['verdict'] | null> = {
    ineligible: 'fail',
    actionable: 'todo',
    growing: 'grow',
    eligible: null,
  };

  const tally: Record<BidLevel, Map<string, number>> = {
    eligible: new Map(), actionable: new Map(),
    growing: new Map(), ineligible: new Map(),
  };

  for (const j of judgements) {
    const want = decisive[j.level];
    if (!want) continue;

    /*
     * 한 공고가 같은 층 안에서 두 가지로 걸릴 수 있다(지역도 안 맞고 규모도
     * 모자란 식). 둘 다 센다 — 합이 건수보다 커지지만, 무엇을 고쳐야 하는지
     * 보여 주는 것이 목적이라 하나만 남기면 나머지가 숨는다.
     */
    for (const r of j.reasons) {
      if (r.verdict !== want) continue;
      const m = tally[j.level];
      m.set(r.field, (m.get(r.field) ?? 0) + 1);
    }
  }

  const out = {} as Record<BidLevel, { field: string; count: number }[]>;
  for (const level of BID_LEVELS) {
    out[level] = [...tally[level].entries()]
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count);
  }
  return out;
}

/**
 * 시·군·구 이름을 견주기 좋게 다듬는다.
 *
 * `성남시` → `성남`, `영통구` → `영통`, `달성군` → `달성`.
 *
 * **떼는 이유.** 공고마다 `성남`, `성남시`, `경기도 성남시` 로 제각각
 * 적히는데, 글자 그대로 비교하면 다 다른 곳이 된다. 뒤에 붙는 시·군·구는
 * 행정 단위지 이름이 아니므로 떼고 본다.
 *
 * 다만 **시·도를 먼저 맞춘 뒤에만 쓴다.** 강원 고성군과 경남 고성군처럼
 * 같은 이름이 실제로 있기 때문이다.
 */
export function cityKey(v: string): string {
  return v.trim().replace(/(특별자치)?[시군구]$/, '');
}
