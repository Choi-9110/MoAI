import type { GrantCategory } from './enums';

/**
 * 창업 자금 로드맵.
 *
 * **왜 필요한가.** 공고 목록은 "지금 열려 있는 것"만 보여 준다. 그래서
 * 처음 오는 사람은 예비창업패키지와 창업도약패키지가 어떻게 다른지, 지금
 * 자기가 어디쯤인지, 다음에 무엇을 노려야 하는지를 알 수 없다. 목록은
 * 나무를 보여 주지만 숲은 보여 주지 않는다.
 *
 * 단계는 **엄격한 순서가 아니다.** 융자는 어느 단계에서도 받고, TIPS 없이
 * Series A 로 가는 곳도 많다. 그래서 "이 순서로 해야 한다"가 아니라
 * "이런 것들이 있고 대개 이 언저리에 온다"로 읽히게 적었다.
 */
export const ROADMAP_KINDS = ['grant', 'invest', 'loan', 'tips'] as const;
export type RoadmapKind = (typeof ROADMAP_KINDS)[number];

export const ROADMAP_KIND_LABELS: Record<RoadmapKind, string> = {
  grant: '지원사업',
  invest: '투자유치',
  loan: '융자',
  tips: 'TIPS',
};

/**
 * 사업 진행 순서.
 *
 * **개별 공고로는 안 보이는 정보다.** 목록은 "D-14" 만 알려 주는데, 정작
 * 알아야 할 것은 **지원부터 돈이 들어오기까지 몇 달이 걸리느냐**다.
 * 1월에 공고가 나도 사업화자금은 4월에 들어온다 — 그 세 달을 버텨야 한다는
 * 뜻이고, 그걸 모르면 자금 계획이 어긋난다.
 */
export interface RoadmapPhase {
  /** 공고 · 선정평가 · 협약체결 · 자금집행 */
  label: string;
  /** 대략의 시기 — `1~2월` 처럼 적는다 */
  when: string;
}

export interface RoadmapSchedule {
  phases: RoadmapPhase[];
  /** 지원부터 자금까지 걸리는 기간(개월) — 사람이 제일 먼저 보는 숫자 */
  months: number;
  /**
   * 이 일정을 얼마나 믿을 수 있는가.
   *
   * `announced` 는 기관이 공고한 절차를 그대로 옮긴 것이고,
   * `typical` 은 예년 흐름을 본 어림이다. **둘을 같이 보여 주면 안 된다** —
   * 어림을 확정으로 읽고 계획을 세우면 어긋난다.
   */
  basis: 'announced' | 'typical';
  /** `announced` 일 때 어디서 왔는지 */
  source?: string;
  /** 낼 것 */
  documents?: string[];
  /** 어디에 내는가 */
  applyVia?: string;
}

export interface RoadmapStep {
  no: number;
  title: string;
  /** 한 줄 설명 — 무엇을 하는 단계인가 */
  note: string;
  kind: RoadmapKind;
  /** 규모 — 아는 것만 적는다. 모르는 것을 지어내면 기준이 흔들린다 */
  amount?: string;
  /**
   * 이 단계에 해당하는 업력(년). 프로필의 업력으로 "지금 여기"를 찍는 데 쓴다.
   * `[하한, 상한]`, 상한이 `null` 이면 그 뒤로 계속.
   */
  years: [number, number | null];
  /** 공고 목록으로 넘어갈 때 걸 유형 — 없으면 검색어만 넘긴다 */
  categories?: GrantCategory[];
  /** 목록에서 찾을 때 쓰는 말 */
  keyword?: string;
  /** 진행 순서 — 아는 것만 적는다 */
  schedule?: RoadmapSchedule;
}

/**
 * 16단계.
 *
 * 업력 구간은 **겹친다.** 실제로 그렇기 때문이다 — 3년차 기업이 초기창업
 * 패키지와 R&D 를 같이 보는 일은 흔하다. 겹치지 않게 자르면 화면은 깔끔해도
 * 사실과 멀어진다.
 */
const STEPS: Omit<RoadmapStep, 'no'>[] = [
  {
    title: '아이디어·검증', note: '창업교육 · 메이커스페이스',
    kind: 'grant', years: [-1, 0],
    categories: ['education', 'mentoring'], keyword: '창업교육',
  },
  {
    title: '예비창업패키지', note: 'MVP · 고객검증',
    kind: 'grant', amount: '최대 1억원', years: [-1, 0],
    categories: ['startup', 'funding'], keyword: '예비창업패키지',
    schedule: {
      phases: [
        { label: '사업공고', when: '2~3월' },
        { label: '선정평가', when: '~4월' },
        { label: '협약체결', when: '~5월' },
        { label: '사업화자금', when: '5~6월' },
      ],
      months: 3,
      basis: 'typical',
      documents: ['사업계획서'],
      applyVia: 'K-Startup 온라인 신청',
    },
  },
  {
    title: '사업자등록·법인설립', note: '법인설립 · 벤처인증',
    kind: 'grant', years: [0, 1],
    categories: ['mentoring'], keyword: '벤처확인',
  },
  {
    title: '청년창업사관학교', note: 'BM검증 · 제조창업',
    kind: 'grant', amount: '최대 1억원', years: [0, 3],
    categories: ['startup', 'funding'], keyword: '청년창업사관학교',
    schedule: {
      phases: [
        { label: '사업공고', when: '1~2월' },
        { label: '선정평가', when: '~3월' },
        { label: '협약체결', when: '~4월' },
        { label: '사업화자금', when: '4~5월' },
      ],
      months: 3,
      basis: 'typical',
      documents: ['사업계획서'],
      applyVia: 'K-Startup 온라인 신청',
    },
  },
  {
    title: '초기창업패키지', note: '사업화자금 · 3년 이내',
    kind: 'grant', amount: '최대 1억원', years: [0, 3],
    categories: ['startup', 'funding'], keyword: '초기창업패키지',
    schedule: {
      phases: [
        { label: '사업공고', when: '2~3월' },
        { label: '선정평가', when: '~4월' },
        { label: '협약체결', when: '~5월' },
        { label: '사업화자금', when: '5~6월' },
      ],
      months: 3,
      basis: 'typical',
      documents: ['사업계획서', '사업자등록증'],
      applyVia: 'K-Startup 온라인 신청',
    },
  },
  {
    title: 'Pre-TIPS', note: '민간 투자와 함께 가는 초기 단계',
    kind: 'tips', amount: '5천만~1억원', years: [0, 5],
    categories: ['rnd', 'funding'], keyword: 'TIPS',
  },
  {
    title: 'AC·컴퍼니빌더', note: '액셀러레이터 프로그램',
    kind: 'invest', amount: '3천만~1억원', years: [0, 3],
    keyword: '액셀러레이터',
  },
  {
    title: '융자·보증', note: '신용보증 · 기술보증',
    kind: 'loan', years: [0, null],
    categories: ['loan'], keyword: '융자',
  },
  {
    title: 'Seed 투자', note: '첫 기관 투자',
    kind: 'invest', amount: '1억~5억원', years: [0, 4],
  },
  {
    title: 'R&D', note: '창업성장 기술개발',
    kind: 'grant', amount: '최대 5억원', years: [1, 7],
    categories: ['rnd'], keyword: '기술개발',
  },
  {
    title: 'TIPS', note: '민간투자 주도 기술창업',
    kind: 'tips', amount: '최대 8억원', years: [1, 7],
    categories: ['rnd'], keyword: 'TIPS',
  },
  {
    title: 'Pre-A 투자', note: '시장을 넓히는 자금',
    kind: 'invest', amount: '5억~15억원', years: [2, 7],
  },
  {
    title: '창업중심대학', note: '딥테크 중심 · 청년·대학 창업',
    kind: 'grant', amount: '1,083억 원 (2027년 예산안)', years: [-1, 7],
    categories: ['startup', 'funding'], keyword: '창업중심대학',
    /*
     * **이 하나만 기관이 공고한 절차 그대로다.** 나머지는 예년 흐름을 본
     * 어림이라, 화면에서 둘을 구분해 보여 준다.
     */
    schedule: {
      phases: [
        { label: '사업공고', when: '1월' },
        { label: '선정평가', when: '~2월' },
        { label: '협약체결', when: '~3월' },
        { label: '사업화자금', when: '4월' },
      ],
      months: 3,
      basis: 'announced',
      source: '창업진흥원 창업중심대학 사업절차',
      documents: ['사업계획서', '기타 우대 관련 서류'],
      applyVia: 'K-Startup 온라인 신청 (www.k-startup.go.kr)',
    },
  },
  {
    title: '창업도약패키지', note: '스케일업 · 사업화자금',
    kind: 'grant', amount: '최대 3억원', years: [3, 7],
    categories: ['startup', 'funding'], keyword: '창업도약패키지',
    schedule: {
      phases: [
        { label: '사업공고', when: '2~3월' },
        { label: '선정평가', when: '~4월' },
        { label: '협약체결', when: '~5월' },
        { label: '사업화자금', when: '5~6월' },
      ],
      months: 3,
      basis: 'typical',
      documents: ['사업계획서', '사업자등록증'],
      applyVia: 'K-Startup 온라인 신청',
    },
  },
  {
    title: '딥테크 TIPS', note: '10대 신산업 분야',
    kind: 'tips', amount: '최대 15억원', years: [3, 10],
    categories: ['rnd'], keyword: '딥테크',
  },
  {
    title: 'Series A', note: '본격 성장 단계',
    kind: 'invest', amount: '20억~40억원', years: [3, null],
  },
  {
    title: 'Growth·글로벌 자금', note: '데이터·AI 바우처 · 스마트공장',
    kind: 'grant', years: [5, null],
    categories: ['voucher', 'export'], keyword: '바우처',
  },
];

/**
 * 번호는 **적는 것이 아니라 세는 것이다.**
 *
 * 손으로 적으면 중간에 하나 넣을 때 `12.5` 같은 것이 생기고, 그 뒤로 전부
 * 어긋난다. 배열에 놓인 자리가 곧 번호다.
 */
export const ROADMAP: RoadmapStep[] = STEPS.map((s, i) => ({ ...s, no: i + 1 }));

/**
 * 업력으로 지금 단계를 고른다.
 *
 * **하나만 찍지 않는다.** 5년차가 R&D 와 창업도약패키지와 Series A 를
 * 동시에 보는 것이 실제 모습이라, 해당하는 것을 모두 돌려준다. 하나만
 * 찍으면 나머지가 "내 것이 아닌 것"처럼 보인다.
 *
 * @param years 업력(년). 예비창업자는 `-1` 로 넘긴다.
 */
export function roadmapStepsFor(
  years: number | null,
  limit = 4,
): RoadmapStep[] {
  if (years === null) return [];

  const matched = ROADMAP.filter((s) => {
    const [from, to] = s.years;
    return years >= from && (to === null || years <= to);
  });

  /*
   * **다 찍으면 아무것도 안 찍은 것과 같다.**
   *
   * 3년차에 걸리는 단계를 그대로 세면 열일곱 중 열셋이 나온다. 융자는 어느
   * 단계에서도 받고 Series A 는 그 뒤로 계속이라, 범위가 넓은 것들이 전부
   * 걸리기 때문이다. 그 상태로 표시하면 "지금 여기"가 온 화면에 흩어져
   * 어디가 지금인지 알 수 없다.
   *
   * 그래서 **범위가 좁은 것부터** 고른다. 좁다는 것은 그 시기에만 해당한다는
   * 뜻이라, 지금을 가리키기에 더 정확하다. 넓은 것(융자·Series A)은 언제든
   * 볼 수 있으니 굳이 지금이라고 짚지 않아도 된다.
   */
  return matched
    .map((s, i) => ({ s, i, width: spanWidth(s) }))
    .sort((a, b) => a.width - b.width || a.i - b.i)
    .slice(0, limit)
    .map((x) => x.s);
}

/** 단계가 걸치는 햇수 — 끝이 없으면 무한대로 본다 */
function spanWidth(step: RoadmapStep): number {
  const [from, to] = step.years;
  return to === null ? Number.POSITIVE_INFINITY : to - from;
}

/**
 * 창업일로 업력을 센다 — 예비창업자는 `-1`.
 *
 * 만 나이처럼 센다. 2년 11개월은 2년차다. 지원사업의 "3년 이내" 도 같은
 * 방식으로 세므로 여기서 올림하면 자격을 잘못 알려 주게 된다.
 */
export function businessYearsOf(
  foundedAt: string | null | undefined,
  stage?: string | null,
  now: Date = new Date(),
): number | null {
  if (stage === 'preliminary') return -1;
  if (!foundedAt) return null;

  const start = new Date(foundedAt);
  if (Number.isNaN(start.getTime())) return null;

  let years = now.getFullYear() - start.getFullYear();
  const monthDiff = now.getMonth() - start.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < start.getDate())) {
    years -= 1;
  }
  return Math.max(years, 0);
}
