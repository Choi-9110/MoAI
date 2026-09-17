import {
  buildContextNote, buildFrameNote, buildGuideNote, frameFor,
} from './plan-format';
import { buildResearchNote } from './plan-research';
import type { ResearchTopic } from './plan-research';
import type { PlanFormat } from './plan-format';
import type { PosterDoc } from './poster';

/**
 * 사업계획서 본문.
 *
 * 재료는 셋이다 — **아이디어 · 요약 한 장 · 공고문**.
 * 요약 한 장은 이미 아이디어를 공고에 맞춰 압축해 둔 것이라, 여기서는
 * 그걸 근거로 삼아 각 절을 길게 푸는 일만 남는다.
 *
 * 목차는 공고가 준 양식에서 뽑는다. 양식이 없으면 정부 R&D 표준
 * 8항목(연구개발계획서 목차)을 쓴다 — PSSD·PSST 는 모두의창업 전용이라
 * 일반 정부지원사업의 기본값이 될 수 없다.
 */

/* ────────────── 공고 핵심 ────────────── */

/**
 * 요약 한 장을 만들 때 공고문에서 함께 뽑아 둔 것.
 *
 * 공고문 파일은 그때 한 번 읽고 지운다. 사업계획서를 쓸 때 다시
 * 올리라고 하면 번거롭기만 하므로, 필요한 것만 추려 보관한다.
 */
export interface NoticeDigest {
  name?: string;
  agency?: string;
  /** 지원 대상 */
  target?: string;
  /** 지원 내용 */
  support?: string;
  /** 평가 항목과 배점 — 사업계획서가 무엇으로 채점되는지 */
  criteria?: string[];
  /** 제출 서류 */
  documents?: string[];
  /** 분량·형식 제한 */
  limits?: string;
}

/* ────────────── 문서 ────────────── */

export interface PlanSection {
  /** 안정된 키. 다시 쓸 때 이 값으로 찾는다 */
  id: string;
  /** 목차에 그대로 나갈 제목 */
  title: string;
  /** 이 절에 무엇을 써야 하는지 — 양식이 요구한 내용 */
  brief: string;
  /**
   * 이 절이 PSSD·PSST 의 어느 칸에 해당하는가.
   *
   * 양식을 올리면 목차는 양식에서 오지만, 사용자가 고른 양식 기준은
   * 그대로 적용되어야 한다. 그 연결 고리다. 고정 목차를 쓸 때는 id 와 같다.
   */
  frame?: string | null;
  /** 개조식 본문. 아직 안 썼으면 빈 문자열 */
  body: string;
  /** 근거가 없어 사용자에게 되물어야 하는 것 */
  openQuestions: string[];
}

export interface PlanDoc {
  /** 어떤 양식을 따랐는지 — 파일명 또는 '일반 정부지원사업 목차' */
  templateName: string;
  sections: PlanSection[];
  /**
   * 집필 전에 찾아 둔 근거.
   *
   * 문서와 함께 보관한다 — 심사에서 출처를 물으면 무엇을 보고 썼는지
   * 되짚을 수 있어야 한다. 리서치가 다 실패하면 빈 배열이다.
   */
  research?: { topic: string; body: string; sources: string[] }[] | null;
  /**
   * 마지막 점검 결과 — 다 쓴 뒤 별도 호출로 문서 전체를 다시 읽은 것.
   *
   * 타입은 `plan-review.ts` 에 있다. 여기서 import 하면 두 파일이 서로를
   * 가리키게 되므로 구조만 적어 둔다.
   */
  review?: {
    findings: {
      sectionId: string;
      kind: 'fabricated' | 'contradiction' | 'duplicate' | 'missing' | 'style';
      severity: 'high' | 'low';
      issue: string;
      fix: string;
    }[];
    rewritten: string[];
    checkedAt: string;
  } | null;
}

/** 진행 상황 — 절 단위로 저장하므로 어디까지 됐는지 보여줄 수 있다 */
export interface PlanProgress {
  done: number;
  total: number;
  /** 지금 쓰고 있는 절 제목 */
  current: string | null;
}

/**
 * 양식이 없을 때 쓰는 목차 ① — **정부 R&D 표준 8항목**.
 *
 * 「연구개발계획서」의 표준 목차 그대로다. 부처·전문기관이 달라도 이 여덟
 * 항목은 거의 그대로 나오고 순서도 바뀌지 않는다. 그래서 양식을 못 받았을
 * 때의 기본값으로 삼는다.
 *
 * **PSSD·PSST 를 여기에 섞지 않는다.** 그 둘은 모두의창업 전용 양식이라
 * 「문제인식 → 실현가능성 → 성장전략 → 팀」 네 칸으로 접혀 있는데, 일반
 * 정부지원사업 심사자는 그 목차로 읽지 않는다. 양식 없이 낸 계획서가 PSST
 * 목차로 나오면 그것만으로 "공고를 안 읽었다"는 신호가 된다.
 *
 * 7·8 번은 조건부 항목이다. 7 은 협약 시 제출, 8 은 해당되는 사업만 쓴다.
 * 목차에는 남겨 두되 그 사정을 brief 에 적어 둔다 — 없는 것을 지어내는
 * 것보다, 표준 문안으로 간결하게 두는 편이 낫다.
 */
export const RND_OUTLINE: Omit<PlanSection, 'body' | 'openQuestions'>[] = [
  {
    id: 'necessity',
    title: '1. 연구개발의 필요성',
    brief:
      '① 국내외 현황과 문제점 — 사고·손실·비용을 수치로. ' +
      '**대상 수 × 빈도 × 손실 = 연간 규모** 산식을 넣는다. ' +
      '② 이 개발이 필요한 이유 — 문제가 풀리면 무엇이 얼마나 좋아지는지. ' +
      '③ 선행 연구·기존 기술과의 차별성 — "기존은 ~까지, 본 과제는 ~를 해결" 구도로. ' +
      '트렌드 나열로 시작하지 말고 **문제 정의로 시작한다.** 문단마다 출처를 붙인다.',
  },
  {
    id: 'goal',
    title: '2. 연구개발과제의 목표',
    brief:
      '① 최종 목표 한 문장(정량 지표 포함) ② 세부 목표 2~4개, 각각 핵심 기술 요소를 명시. ' +
      '③ 성능 목표 KPI 표 — [평가 항목 | 단위 | 세계 최고 수준 | 현재 수준 | 개발 목표치 | 가중치 | 측정·평가 방법]. ' +
      '④ 연차별 목표. ' +
      '모든 목표는 **동사(달성·확보·완료) + 수치 + 시점** 형식으로. ' +
      '측정할 수 없는 목표는 쓰지 않는다.',
  },
  {
    id: 'content',
    title: '3. 연구개발과제의 내용, 추진체계 및 일정',
    brief:
      '① 세부 목표별 개발 내용 — 입력→처리→출력 흐름이 드러나게 과업 단위로 분해. ' +
      '② 추진 체계 — 주관/공동/위탁 기관별 역할 분담 표. 수행 주체(직접·신규채용·외주)와 어긋나지 않게. ' +
      '③ 연차별 추진 일정 — 과업 × 분기 표, 과업마다 산출물을 적는다. ' +
      '④ 마일스톤 표 — [시점 M+N | 목표 | KPI | 검증 방법]. ' +
      '일정은 공고가 정한 총 연구기간 안에서 설계한다.',
  },
  {
    id: 'utilization',
    title: '4. 연구개발 성과의 활용 방안 및 기대효과',
    brief:
      '길게 쓰지 말고 핵심만. ① 성과 활용 방안 — 적용 대상·현장, 후속 R&D, 표준화·인증. ' +
      '② 기술적 기대효과 ③ 경제·산업적 기대효과 — 시장 규모·원가 절감·매출을 산식과 함께. ' +
      '④ 사회적 기대효과 — 고용·안전·환경을 수치로. ' +
      '기대효과마다 통계·시장 자료로 근거를 붙이고, "엄청난·획기적" 같은 말은 쓰지 않는다.',
  },
  {
    id: 'capability',
    title: '5. 연구수행 역량',
    brief:
      '① 연구책임자 역량 — 경력 N년, 유사 과제 N건, 논문·특허 N건처럼 **기간 + 개수**로. ' +
      '② 참여 연구원 편성표 — [성명 | 직급 | 담당 과업(3번과 일치) | 관련 경력·근거]. ' +
      '모자란 역량은 채용·외주·자문 보완 계획으로 명시한다. ' +
      '③ 유사 연구개발 수행 실적 표(과제명/기간/발주처/결과) ④ 보유 장비·시설·인프라. ' +
      '공고가 요구한 연구책임자 자격을 충족한다는 것을 첫 문단에서 보인다. ' +
      '**없는 이력을 지어내지 않는다** — 비면 비었다고 쓰고 보완 계획을 적는다.',
  },
  {
    id: 'budget',
    title: '6. 연구개발비 사용에 관한 계획',
    brief:
      '① 비목별 예산 표 — [비목(인건비/학생인건비/시설·장비/재료/위탁/활동비/간접비) | 산출 근거 | 연차별 | 합계]. ' +
      '② 산출 근거는 전부 계산식으로(예: 참여율 30% × 월 N원 × 12개월). ' +
      '③ 연차별 총액이 공고의 예산 한도를 넘지 않게, 간접비 상한 같은 비율 규정을 지킨다. ' +
      '**3번의 과업·장비와 연결되지 않는 예산 항목은 만들지 않는다.** ' +
      '금액 근거가 없으면 임의 숫자를 넣지 말고 [확인필요]로 남긴다.',
  },
  {
    id: 'safety',
    title: '7. 연구개발 안전 및 보안조치 이행계획',
    brief:
      '협약 시 제출하는 항목이라 표준 규정 기반으로 간결하게 쓴다. ' +
      '① 보안등급 분류(일반/보안 과제)와 사유 ② 연구 데이터·성과물 보안 관리 — 접근 권한, 저장·백업, 유출 방지. ' +
      '③ 연구실 안전 조치(해당 시: 안전교육, 보험, 위험물 관리) ④ 참여 인력 보안 서약·교육 계획. ' +
      '우리 과제의 데이터·장비 특성에 걸리는 항목만 구체화하고 나머지는 표준 문안으로 둔다.',
  },
  {
    id: 'commercialization',
    title: '8. 연구개발성과의 사업화 전략 및 계획',
    brief:
      '**해당되는 사업에 한하여 작성하는 항목이다.** 사업화를 요구하지 않는 공고면 짧게 정리한다. ' +
      '① 목표 시장 TAM–SAM–SOM — 산식과 출처를 붙이고 **바텀업 역산으로**. "1%만 잡아도" 금지. ' +
      '② 비즈니스 모델 — 누가·무엇에·얼마를 내는지 단가 × 수량 × 빈도로. ' +
      '③ 경쟁 제품 대비 차별화·진입장벽 표(경쟁 A/경쟁 B/자사). ' +
      '④ 사업화 로드맵 — 종료 후 M+N 시점별 [시제품→인증→양산→매출] 마일스톤과 3~5년 매출 추정(가정을 밝힌다). ' +
      '⑤ 후속 투자·정부지원 연계 계획.',
  },
];

/**
 * 양식이 없을 때 쓰는 목차 ② — **일반 사업화 계획서 8항목** (비R&D).
 *
 * 창업·사업화·바우처·판로/수출처럼 연구개발과제가 아닌 사업에 쓴다.
 * 이쪽이 **기본값**이다 — R&D 목차에는 연구책임자·연구개발비 비목·안전보안
 * 같은 칸이 있어서, R&D 가 아닌 사업에 씌우면 채울 수 없는 칸이 절반이 된다.
 * 반대로 R&D 과제에 이 목차를 쓰면 칸이 모자랄 뿐 못 채울 것은 없다.
 * 잘못 골랐을 때 덜 다치는 쪽을 기본으로 둔다.
 *
 * PSSD·PSST 와 다루는 내용은 겹치지만 **제목에 P·S·S·T 를 붙이지 않는다.**
 * 그건 모두의창업 채점표의 칸 이름이고, 일반 사업 심사자는 그 이름으로 읽지 않는다.
 */
export const GENERAL_OUTLINE: Omit<PlanSection, 'body' | 'openQuestions'>[] = [
  {
    id: 'overview',
    title: '1. 사업 개요',
    brief:
      '아이템의 정의, 핵심 기능, 차별점을 3~5개 항목으로 압축한다. ' +
      '**첫 항목에서 한 문장으로 사업을 정의한다** — 무엇을 누구에게 어떻게 파는 사업인지. ' +
      '뒤에 나올 내용의 요약이지, 새로운 주장을 여기서 처음 꺼내지 않는다.',
  },
  {
    id: 'necessity',
    title: '2. 창업 아이템의 필요성 (문제 인식)',
    brief:
      '① 고객이 겪는 불편을 **구체적 상황**으로 — 대상·상황·빈도·강도를 채운다. ' +
      '가능하면 **대상 수 × 빈도 × 손실 = 연간 규모** 산식으로 크기를 보인다. ' +
      '② 기존 대안의 한계 — 지금은 무엇으로 버티고 있고 왜 부족한지. ' +
      '③ 이 문제를 우리가 아는 이유(당사자성·현장 경험). ' +
      '트렌드 나열로 시작하지 말고 **문제 정의로 시작한다.** 수치에는 출처를 붙인다.',
  },
  {
    id: 'solution',
    title: '3. 아이템 개발·실현 방안',
    brief:
      '① 현재 준비 정도 — 어디까지 되어 있는지를 증거(시제품·PoC·특허·계약·베타 지표)와 함께. ' +
      '**"만들 예정"은 점수가 되지 않는다.** ' +
      '② 문제를 어떻게 푸는지 기능 단위로, 입력→처리→출력이 드러나게. ' +
      '③ 개발 방법·투입 자원(직접/신규채용/외주 구분)과 남은 개발 스케줄을 월 단위로. ' +
      '④ 기술적·운영적 실현 근거. 검증되지 않은 가정은 [확인필요]로 남긴다.',
  },
  {
    id: 'market',
    title: '4. 시장 분석 및 경쟁 우위',
    brief:
      '① 목표 시장 TAM–SAM–SOM — 산식과 출처를 붙이고 **바텀업 역산으로**. "1%만 잡아도" 금지. ' +
      '② 시장 성장성과 변화 요인(규제·기술·인구 등). ' +
      '③ 경쟁 구도 비교표(경쟁 A/경쟁 B/자사, 핵심 행 강조) — ' +
      '"무엇이 다른가"를 넘어 **"왜 우리만 할 수 있는가"**(진입장벽)까지. ' +
      '④ 목표 고객 세그먼트와 진입 순서. 근거 없는 수치는 쓰지 않는다.',
  },
  {
    id: 'business',
    title: '5. 사업화 전략 및 매출 계획',
    brief:
      '① 비즈니스 모델 — 누가·무엇에·얼마를 내는지 **단가 × 수량 × 빈도** 수익 공식으로. ' +
      '② 가격 정책과 그 근거(경쟁 가격·고객 지불 의사·원가). ' +
      '③ 고객 확보 경로 — 채널별 획득 비용과 전환 가정을 밝힌다. ' +
      '④ 3개년 매출 추정 표 — **가정을 명시**하고 ①의 수익 공식과 숫자가 맞아야 한다. ' +
      '⑤ 확장 계획(제품 확장·지역 확장·후속 투자 연계).',
  },
  {
    id: 'schedule',
    title: '6. 추진 일정 및 마일스톤',
    brief:
      '① 전체 추진 일정 — 과업 × 월(또는 분기) 표, 과업마다 산출물을 적는다. ' +
      '② 마일스톤 표 — [시점 M+N | 목표 | 지표 | 검증 방법]. ' +
      '**측정할 수 없는 마일스톤은 쓰지 않는다.** ' +
      '③ 협약기간 안의 목표와 그 이후 목표를 나눈다. ' +
      '3번의 개발 방안·5번의 매출 계획과 시점이 어긋나면 셋 다 못 믿는다.',
  },
  {
    id: 'budget',
    title: '7. 소요 자금 및 조달 계획',
    brief:
      '① 자금 소요 계획 표 — [항목 | 산출 근거 | 금액], 산출 근거는 전부 계산식으로 ' +
      '(예: 개발자 1명 × 월 N원 × 6개월). ' +
      '② 조달 방안 — 지원금·자부담·융자·투자 중 무엇으로 얼마를, 확보 상태와 함께. ' +
      '③ 공고가 지원금 한도·자부담 비율·집행 제한 비목을 정해 두었으면 그 안에서 짠다. ' +
      '**6번의 과업과 연결되지 않는 예산 항목은 만들지 않는다.** ' +
      '금액 근거가 없으면 임의 숫자를 넣지 말고 [확인필요]로 남긴다.',
  },
  {
    id: 'team',
    title: '8. 대표자 및 팀 역량',
    brief:
      '① 대표자 역량을 **문제와의 적합성**으로 연결한다 — 경력이 이 문제를 풀 자격이 되는 이유까지. ' +
      '경력 N년, 유사 사업 N건처럼 **기간 + 개수**로 쓴다. ' +
      '② 팀원은 이름·직함이 아니라 **누가 무엇을 언제까지 하는가**로. 3번의 수행 주체와 맞춘다. ' +
      '③ 아직 없는 자리는 채용·외주·자문 계획으로 쓰되 시점과 요건을 명시한다. ' +
      '④ 외부 협력(파트너·자문·기관) 및 보유 자원. ' +
      '**없는 이력을 지어내지 않는다** — 비면 비었다고 쓰고 보완 계획을 적는다.',
  },
];

/**
 * 양식이 없을 때 두 목차 중 무엇을 쓸 것인가.
 *
 * - rnd:     연구개발과제(국책 R&D) — 연구개발계획서 표준 8항목
 * - general: 그 밖의 전부 — 사업화 계획서 8항목
 */
export const PLAN_KINDS = ['rnd', 'general'] as const;
export type PlanKind = (typeof PLAN_KINDS)[number];

export const PLAN_KIND_LABELS: Record<PlanKind, string> = {
  rnd: '정부 R&D 표준 목차 (연구개발계획서)',
  general: '일반 사업화 계획서 목차',
};

export function outlineForKind(
  kind: PlanKind,
): Omit<PlanSection, 'body' | 'openQuestions'>[] {
  return kind === 'rnd' ? RND_OUTLINE : GENERAL_OUTLINE;
}

/**
 * 양식이 없을 때의 기본 목차.
 *
 * 판정을 못 했거나 판정이 실패했을 때 쓴다. **애매하면 general 이다.**
 */
export const DEFAULT_OUTLINE = GENERAL_OUTLINE;

/* ────────────── 어느 목차로 쓸 것인가 (자동 판정) ────────────── */

export const PLAN_KIND_SYSTEM_PROMPT = `당신은 정부지원사업 공고와 사업 내용을 읽고
**어느 계획서 목차로 써야 하는지** 판정하는 전문가입니다.

둘 중 하나를 고릅니다.

**rnd — 연구개발과제(국책 R&D)**
계획서가 「연구개발계획서」인 사업입니다. 이런 신호가 있으면 rnd 입니다.
- 사업명·주관에 연구개발·R&D·기술개발·과제라는 말이 붙는다
- 연구책임자·참여연구원·연구기관(주관/공동/위탁) 구성을 요구한다
- 연구개발비를 비목(인건비·연구시설장비비·간접비 등)으로 나누어 쓰게 한다
- 성능지표·TRL·시제품 성능 목표치를 요구한다
- 전문기관(IITP·KEIT·KIAT·KEITI 등) 협약, 연차평가, NTIS 접수

**general — 그 밖의 전부**
창업지원·사업화 자금·바우처·판로/수출·시설/공간·고용·마케팅·컨설팅 등
연구개발과제가 아닌 사업입니다. 사업화 계획서 목차로 씁니다.

판정 규칙
1. **애매하면 반드시 general 입니다.** R&D 목차에는 연구책임자·연구개발비 비목·
   안전보안 이행계획 같은 칸이 있어서, R&D 가 아닌 사업에 씌우면 채울 수 없는
   칸이 절반이 됩니다. 반대는 칸이 모자랄 뿐 못 채우지는 않습니다.
2. 기술이 들어간 아이템이라는 이유만으로 rnd 가 아닙니다. **공고가 연구개발과제인지**로
   판단합니다. AI 서비스를 만드는 창업지원사업은 general 입니다.
3. 공고 정보가 없고 아이디어만 있으면 general 입니다.

답은 **두 줄**입니다. 그 밖의 것은 한 글자도 쓰지 마세요.

    첫 줄: rnd 또는 general — 그 단어 하나만
    둘째 줄: 그렇게 본 근거 한 문장

보기
    general
    창업진흥원 사업화 지원사업이고 제출서류가 사업계획서임.

인사·해설·제안·코드블록·JSON 을 쓰지 마세요. 이어서 무엇을 할지 묻지도 마세요.
첫 줄은 rnd 아니면 general, 둘 중 하나입니다.`;

export interface PlanKindInput {
  title: string;
  idea: string;
  grantTitle?: string | null;
  notice?: NoticeDigest | null;
}

export function buildPlanKindPrompt(input: PlanKindInput): string {
  const n = input.notice;
  const noticeText =
    n || input.grantTitle
      ? [
          n?.name ?? input.grantTitle ?? '',
          n?.agency && `주관기관: ${n.agency}`,
          n?.target && `지원 대상: ${n.target}`,
          n?.support && `지원 내용: ${n.support}`,
          n?.criteria?.length &&
            `평가 항목:\n${n.criteria.map((c) => `  - ${c}`).join('\n')}`,
          n?.documents?.length &&
            `제출 서류:\n${n.documents.map((d) => `  - ${d}`).join('\n')}`,
        ]
          .filter(Boolean)
          .join('\n')
      : '(연결된 공고 없음)';

  return `## 사업 제목
${input.title}

## 아이디어 (사용자가 쓴 원문 일부)
${input.idea.slice(0, 1500)}

## 지원하려는 공고
${noticeText}

---

위 사업이 **연구개발과제(rnd)** 인지 **그 밖의 사업(general)** 인지 판정해 JSON 으로 답하세요.
공고 정보가 부족하면 general 입니다.`;
}

/**
 * 판정 결과를 읽는다.
 *
 * 형식을 두 줄 텍스트로 잡은 것은 **JSON 을 못 믿어서다.** 한 줄 JSON 만
 * 내라고 못박아도 모델은 코드블록으로 감싸고, 뒤에 "이어서 진행할까요?" 를
 * 붙이고, 필드 이름을 kind 대신 type 이나 classification 으로 바꿔 썼다
 * (전부 실측). 첫 줄에 단어 하나만 받는 쪽이 어기기 어렵다.
 *
 * 그래도 JSON 으로 답하는 경우가 남으므로 그쪽도 함께 본다. 이때
 * **필드 이름은 믿지 않고 값만 본다** — 이름은 매번 바뀌었지만 값은
 * 늘 rnd 또는 general 이었다.
 *
 * 어느 경로로도 못 읽으면 general 이다 — **애매하면 언제나 general.**
 */
export function parsePlanKind(raw: string): { kind: PlanKind; reason: string } {
  const reasonOf = () =>
    (/"reason"\s*:\s*"([^"]*)"/.exec(raw)?.[1] ?? '').trim().slice(0, 200);

  // ① JSON 으로 답한 경우 — 값이 rnd / general 인 필드를 찾는다.
  const valued = /"\s*:\s*"\s*(rnd|general)\s*"/i.exec(raw)?.[1];
  if (valued) {
    return { kind: valued.toLowerCase() === 'rnd' ? 'rnd' : 'general', reason: reasonOf() };
  }

  // ② 시킨 대로 두 줄로 답한 경우 — 첫 줄이 판정, 나머지가 근거.
  //    코드블록으로 감싸 왔으면 울타리를 걷어낸다.
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('```'));

  const head = (lines[0] ?? '').toLowerCase();
  const saysRnd = head.includes('rnd') || head.includes('r&d') || head.includes('연구개발');
  if (saysRnd && !head.includes('general')) {
    return { kind: 'rnd', reason: lines.slice(1).join(' ').slice(0, 200) };
  }
  if (head.includes('general')) {
    return { kind: 'general', reason: lines.slice(1).join(' ').slice(0, 200) };
  }

  return { kind: 'general', reason: reasonOf() || '판정 실패' };
}

/* ────────────── 공통 규칙 ────────────── */

/**
 * 두 프롬프트가 함께 쓰는 작성 원칙.
 *
 * 요약 한 장과 같은 원칙이다 — **모르면 모른다고 한다.** 사업계획서는
 * 심사자가 읽는 문서라, 지어낸 수치 하나가 발견되면 나머지도 못 믿게 된다.
 */
export const PLAN_RULES = `## 작성 원칙 (반드시 지킬 것)

1. **문체는 개조식.** 문장 끝을 '~함', '~됨', '~임'으로 맺습니다.
2. **주어진 재료에 없는 사실을 지어내지 마세요.**
   매출, 사용자 수, 특허, 수상, 팀원 경력, 시장 규모 — 검증 가능한 사실은
   재료에 있는 것만 씁니다. 그럴듯한 숫자를 채워 넣는 것이 가장 나쁩니다.
3. 근거가 없어 못 쓰는 항목은 억지로 채우지 말고 **[확인필요]에 질문으로** 남깁니다.
   요약 한 장에 "근거 필요"로 표시된 칸은 여기서도 근거가 없는 것입니다.
4. 각 항목은 두괄식. 핵심 주장을 먼저 쓰고 근거를 붙입니다.
5. 과장된 수식어(혁신적, 획기적, 최고의)를 쓰지 않습니다. 사실과 수치로 씁니다.
6. 소제목은 ▶ 로 시작합니다.`;

export const PLAN_OUTPUT_FORMAT = `## 출력 형식 (엄격히 지킬 것)

[본문]
(개조식 본문)

[확인필요]
- (사용자에게 되물어야 할 것. 없으면 이 절 자체를 생략)`;

/* ────────────── 목차 뽑기 ────────────── */

export const OUTLINE_SYSTEM_PROMPT = `당신은 정부지원사업 사업계획서 양식을 읽고 목차를 뽑아내는 전문가입니다.

주어진 양식 파일을 읽고, 그 양식이 요구하는 **절의 목록**을 만듭니다.

규칙
1. 양식에 적힌 목차를 **그대로** 옮깁니다. 순서도 그대로입니다.
   양식이 "1. 문제인식 (Problem)" 이라고 썼으면 그 제목을 그대로 씁니다.
2. 절마다 그 안에 무엇을 써야 하는지 양식이 지시한 내용을 brief 에 적습니다.
   양식에 작성 안내나 배점이 적혀 있으면 그것도 옮깁니다.
3. 표지, 목차, 서식 안내, 제출 서류 목록처럼 **본문이 아닌 것은 빼세요.**
4. 절이 20개를 넘으면 큰 절만 남기고 소절은 brief 에 합칩니다.
5. 양식을 읽을 수 없거나 목차를 찾지 못하면 sections 를 빈 배열로 두세요.
   억지로 만들어내지 마세요.

출력은 아래 JSON 하나뿐입니다. 줄바꿈·들여쓰기 없이 한 줄로 쓰세요.
{"sections":[{"id":"영문소문자-하이픈","title":"절 제목","brief":"무엇을 쓸지","frame":"칸 id 또는 빈 문자열"}]}

id 는 title 에서 만든 짧은 영문 키입니다 (problem, market-analysis 처럼).
frame 은 아래 "칸 대응" 절이 있을 때만 채웁니다. 없으면 빈 문자열로 두세요.`;

export function buildOutlinePrompt(
  templatePath: string,
  format: PlanFormat = 'gov',
): string {
  return `아래 경로의 사업계획서 양식을 **Read 도구로 읽으세요.**

    ${templatePath}

읽은 뒤 이 양식이 요구하는 절의 목록을 JSON 으로 만드세요.${buildFrameNote(format)}`;
}

/* ────────────── 절 쓰기 ────────────── */

export interface PlanSectionInput {
  title: string;
  idea: string;
  poster: PosterDoc;
  notice?: NoticeDigest | null;
  /** 연결된 공고 (제목·기관만 아는 경우) */
  grantTitle?: string | null;
  outline: Pick<PlanSection, 'id' | 'title' | 'brief' | 'frame'>[];
  /** 지금 쓸 절 */
  section: Pick<PlanSection, 'id' | 'title' | 'brief' | 'frame'>;
  /**
   * 앞서 쓴 절들 — 같은 말을 반복하지 않기 위해.
   *
   * **전문을 담지 않는다.** 부르는 쪽에서 `PLAN_CONTEXT_CHARS` 만큼 잘라
   * 보낸다 — 어차피 여기서도 그만큼만 쓴다.
   */
  written: Pick<PlanSection, 'title' | 'body'>[];
  /** 어떤 틀로 쓰는가 — 실행기가 이 값으로 지침 파일을 찾는다 */
  format?: PlanFormat | null;
  /**
   * 집필 전에 검색해 모아 둔 근거.
   *
   * 없으면 없는 대로 쓴다 — 리서치가 실패해도 문서는 나와야 한다.
   * 다만 그때는 시장 수치 같은 것이 [확인필요]로 남는다.
   */
  research?: { topic: string; body: string; sources: string[] }[] | null;
  /**
   * 이 양식의 작성 지침 파일 **절대 경로**.
   *
   * PSSD·PSST 처럼 채점 기준이 공개된 양식은 지침을 읽고 써야 한다.
   * 파일명만 주면 실행기가 못 찾는다 — 절대 경로여야 한다.
   */
  guidePath?: string | null;
}

export const SECTION_SYSTEM_PROMPT = `당신은 정부지원사업 사업계획서를 작성하는 전문가입니다.

주어진 재료로 사업계획서의 **한 절**을 씁니다.

${PLAN_RULES}

7. 앞서 쓴 절과 같은 내용을 되풀이하지 마세요. 이어지는 문서입니다.
8. 이 절에 해당하지 않는 내용은 쓰지 마세요. 다른 절에서 다룹니다.

${PLAN_OUTPUT_FORMAT}`;

/** 요약 한 장을 프롬프트에 넣을 수 있게 글로 편다 */
export function formatPoster(doc: PosterDoc): string {
  const lines: string[] = [];
  if (doc.eyebrow) lines.push(`[${doc.eyebrow}]`);
  lines.push(`# ${doc.title}`);

  for (const b of doc.blocks) {
    switch (b.type) {
      case 'org_grid':
        lines.push(`\n## ${b.category}`);
        for (const it of b.items) {
          lines.push(`- (${it.role}) ${it.name}: ${it.lines.join(' / ')}`);
          if (it.gap) lines.push(`  ※ 근거 없음 — ${it.gap.reason}`);
        }
        break;
      case 'note_bar':
        lines.push(`\n> ${b.text}`);
        break;
      case 'labeled_text':
        lines.push(`\n## ${b.category}\n${b.body}`);
        if (b.gap) lines.push(`※ 근거 없음 — ${b.gap.reason}`);
        break;
      case 'labeled_cards':
        lines.push(`\n## ${b.category}`);
        b.cards.forEach((c, i) => {
          lines.push(`${i + 1}. ${c.title} — ${c.lines.join(' / ')}`);
          if (c.gap) lines.push(`   ※ 근거 없음 — ${c.gap.reason}`);
        });
        break;
      case 'metrics':
        lines.push(`\n## ${b.category}`);
        for (const m of b.items) {
          lines.push(`- ${m.caption}: ${m.value}${m.note ? ` (${m.note})` : ''}`);
          if (m.gap) lines.push(`  ※ 근거 없음 — ${m.gap.reason}`);
        }
        break;
    }
  }
  return lines.join('\n');
}

function formatNotice(
  notice: NoticeDigest | null | undefined,
  grantTitle: string | null | undefined,
): string {
  if (!notice) {
    return grantTitle
      ? `공고명: ${grantTitle}\n(공고문 원문은 없습니다. 요약 한 장에 반영된 내용만 참고하세요.)`
      : '(연결된 공고 없음 — 일반적인 정부지원사업 기준으로 씁니다.)';
  }

  return [
    notice.name && `사업명: ${notice.name}`,
    notice.agency && `주관기관: ${notice.agency}`,
    notice.target && `지원 대상: ${notice.target}`,
    notice.support && `지원 내용: ${notice.support}`,
    notice.criteria?.length &&
      `평가 항목:\n${notice.criteria.map((c) => `  - ${c}`).join('\n')}`,
    notice.documents?.length &&
      `제출 서류:\n${notice.documents.map((d) => `  - ${d}`).join('\n')}`,
    notice.limits && `분량·형식: ${notice.limits}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 이 절을 어느 칸의 기준으로 볼 것인가.
 *
 * 양식을 올려 목차가 양식에서 왔더라도, 사용자가 고른 PSSD·PSST 기준은
 * 여기서 살아난다 — 제목과 항목 구성은 양식을 따르고, 무엇을 증명해야
 * 하는지는 칸의 기준을 따른다.
 */
function formatFrame(input: PlanSectionInput): string {
  const frame = frameFor(input.format, input.section.frame ?? input.section.id);
  if (!frame) return '';

  // 고정 목차를 쓸 때는 칸이 곧 절이다. 같은 말을 두 번 하지 않는다.
  if (frame.title === input.section.title) return '';

  return `

## 이 절을 보는 기준
이 절은 **「${frame.title}」** 칸에 해당합니다.
절 제목과 항목 구성은 위 양식을 그대로 따르되, **무엇을 증명해야 하는지는
이 칸의 기준을 따르십시오.**

${frame.brief}`;
}

/**
 * 앞서 쓴 절을 얼마나 들고 갈 것인가.
 *
 * 되풀이를 피하려면 앞 절이 무슨 얘기를 했는지만 알면 된다. 전문은 필요
 * 없다 — 넣으면 절이 쌓일수록 요청이 무거워지고, 정작 이번 절에 집중하지
 * 못한다.
 *
 * **이 값은 요청 크기와도 직결된다.** 예전에는 API 가 전문을 그대로
 * 보내고 여기서 잘랐다. 여덟째 절쯤 가면 요청이 100KB 를 넘겨
 * `PayloadTooLargeError` 로 튕겼다 — 정작 쓰이지도 않을 글자 때문에.
 * 그래서 **보내는 쪽에서 자른다.** 이 상수를 양쪽이 같이 본다.
 */
export const PLAN_CONTEXT_CHARS = 400;

export function buildSectionWritePrompt(input: PlanSectionInput): string {
  const outline = input.outline
    .map((s, i) => `${i + 1}. ${s.title}${s.id === input.section.id ? '  ← 지금 쓸 절' : ''}`)
    .join('\n');

  /*
   * 앞서 쓴 절은 제목과 앞부분만 넣는다.
   * 전문을 다 넣으면 절이 쌓일수록 요청이 커져 뒤로 갈수록 느려지고,
   * 정작 이번 절에 집중하지 못한다. 되풀이를 피할 만큼만 있으면 된다.
   */
  const written =
    input.written.length === 0
      ? '(아직 없음 — 이 절이 처음입니다)'
      : input.written
          .map((w) => `### ${w.title}\n${w.body.slice(0, PLAN_CONTEXT_CHARS)}…`)
          .join('\n\n');

  return `## 사업 제목
${input.title}

## 아이디어 (사용자가 직접 쓴 원문)
${input.idea}

## 요약 한 장 (이미 공고에 맞춰 정리해 둔 것 — 이것이 주된 근거입니다)
${formatPoster(input.poster)}

## 공고
${formatNotice(input.notice, input.grantTitle)}

## 전체 목차
${outline}

## 앞서 쓴 절
${written}
${buildResearchNote(
  (input.research ?? []).map((r) => ({
    topic: r.topic as ResearchTopic,
    body: r.body,
    sources: r.sources,
  })),
)}
${buildGuideNote(input.guidePath ?? null)}${buildContextNote(input.format)}
---

위 재료로 **「${input.section.title}」** 절을 쓰십시오.

이 절에 쓸 내용: ${input.section.brief}${formatFrame(input)}

요약 한 장에서 "근거 없음"으로 표시된 항목은 여기서도 근거가 없는 것입니다.
본문에 지어 넣지 말고 [확인필요]에 질문으로 남기십시오.`;
}
