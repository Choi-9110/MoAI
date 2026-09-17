/**
 * 공고문 ↔ 수집한 공고 맞추기.
 *
 * 사용자가 공고문 파일을 올리면, 그게 우리 DB 에 이미 있는 공고인지 찾아
 * 사업에 묶어 둔다. 묶이면 "공고 원문 보러가기"가 살아나고, 마감일·지원금
 * 같은 구조화된 정보를 그대로 쓸 수 있다.
 *
 * 파일명이 곧 공고명인 경우가 많아 이름만으로도 상당히 맞는다.
 * ("1. 2026년 광주 IP창업존 62기(26년 4기) 모집공고(K).pdf")
 */

/**
 * 비교용으로 제목을 다듬는다.
 *
 * 같은 공고인데 파일명에는 "1. " 같은 순번이 붙고, 확장자가 달리고,
 * 띄어쓰기가 다르다. 그런 차이 때문에 못 찾으면 곤란하다.
 */
export function normalizeTitle(raw: string): string {
  return raw
    .replace(/\.(pdf|hwpx?|docx?|txt|md|zip)$/i, '') // 확장자
    .replace(/^[\s\d]+[.)\-]\s*/, '')                 // 앞머리 순번 "1. "
    .replace(/\([^)]*\)/g, ' ')                       // 괄호 주석 "(K)" "(최종)"
    .replace(/\[[^\]]*\]/g, ' ')                      // 대괄호 "[재공고]"
    .replace(/[_\-–—·ㆍ]/g, ' ')
    .replace(/(모집\s*)?공고문?$/, '')                 // 꼬리의 "모집공고"
    .replace(/[^0-9A-Za-z가-힣]/g, '')                 // 남은 기호·공백 제거
    .toLowerCase();
}

/**
 * 제목에서 연도를 뽑는다.
 *
 * 정부지원사업은 해마다 같은 이름으로 다시 나온다.
 * "비즈쿨 지정서 수여식"과 "2013년도 비즈쿨 지정서 수여식"은 글자로는 거의
 * 같지만 **다른 공고**다. 연도가 유일한 구분자인 경우가 많다.
 */
function years(raw: string): Set<string> {
  const out = new Set<string>();
  for (const m of raw.matchAll(/20(\d{2})/g)) out.add(m[1]);
  // "'26년", "26년도" 처럼 두 자리로 쓰는 표기
  for (const m of raw.matchAll(/['‘’]?(\d{2})년/g)) out.add(m[1]);
  return out;
}

/** 글자 2개씩 잘라 집합으로 만든다 (한국어는 형태소보다 이게 안정적이다) */
function bigrams(s: string): Set<string> {
  const out = new Set<string>();
  if (s.length === 1) out.add(s);
  for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
  return out;
}

/**
 * 제목이 얼마나 같은지 0~1 로.
 *
 * 두 집합의 겹치는 정도(Dice)를 쓴다. 한쪽이 다른 쪽을 통째로 품고 있으면
 * (파일명에 군더더기가 붙은 경우) 같은 것으로 본다.
 */
export function titleSimilarity(a: string, b: string): number {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);
  if (!x || !y) return 0;

  const ya = years(a);
  const yb = years(b);

  // 둘 다 연도가 있는데 겹치지 않으면 다른 회차다. 글자가 아무리 같아도.
  if (ya.size > 0 && yb.size > 0) {
    const overlap = [...ya].some((v) => yb.has(v));
    if (!overlap) return 0;
  }

  /*
   * 한쪽에만 연도가 있으면 확신할 수 없다.
   * "비즈쿨 지정서 수여식" 은 어느 해 것인지 알 수 없으므로
   * "2013년도 비즈쿨 지정서 수여식" 과 같다고 단정하면 안 된다.
   */
  const uncertainYear = (ya.size > 0) !== (yb.size > 0);
  const cap = uncertainYear ? 0.75 : 1;

  if (x === y) return cap;

  // 한쪽이 다른 쪽을 품고 있으면 같은 공고일 가능성이 높다.
  // 다만 길이 차가 크면 군더더기가 아니라 다른 공고다.
  const longer = x.length >= y.length ? x : y;
  const shorter = x.length >= y.length ? y : x;
  if (shorter.length >= 8 && longer.includes(shorter)) {
    const ratio = shorter.length / longer.length;
    return Math.min(cap, 0.6 + 0.4 * ratio);
  }

  const ax = bigrams(x);
  const by = bigrams(y);
  let shared = 0;
  for (const g of ax) if (by.has(g)) shared += 1;

  return Math.min(cap, (2 * shared) / (ax.size + by.size));
}

export interface GrantCandidate {
  id: string;
  title: string;
}

export interface GrantMatch {
  grantId: string;
  title: string;
  /** 0~1. 어떤 근거로 묶였는지 사용자에게 보여줄 때 쓴다 */
  score: number;
  /** 무엇을 가지고 찾았는지 */
  matchedBy: string;
}

/**
 * 후보 중에서 가장 비슷한 공고를 찾는다.
 *
 * `queries` 에는 파일명과 공고문에서 읽은 사업명을 함께 넣는다.
 * 둘 중 하나만 맞아도 찾아진다.
 */
export function matchGrant(
  candidates: GrantCandidate[],
  queries: (string | null | undefined)[],
  threshold = 0.8,
): GrantMatch | null {
  let best: GrantMatch | null = null;

  for (const query of queries) {
    if (!query || normalizeTitle(query).length < 6) continue;

    for (const c of candidates) {
      const score = titleSimilarity(query, c.title);
      if (score < threshold) continue;
      if (!best || score > best.score) {
        best = { grantId: c.id, title: c.title, score, matchedBy: query };
      }
    }
  }

  return best;
}
