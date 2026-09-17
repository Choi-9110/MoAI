/**
 * 사업 트랙.
 *
 * 지금은 둘이다.
 * - gov: 일반 정부지원사업. 공고를 고르거나 올려서 시작한다.
 * - modoo: 「모두의 창업 프로젝트」. 공고가 하나로 고정이라 올릴 것이 없고,
 *   대신 주최측 지원서 문항(Q1~Q11)을 그대로 받는다.
 *
 * 트랙이 갈리는 지점은 **입력**이다. 요약 한 장부터는 다시 하나로 합쳐진다.
 */
import type { NoticeDigest } from './plan-doc';

export const PROJECT_TRACKS = ['gov', 'modoo'] as const;
export type ProjectTrack = (typeof PROJECT_TRACKS)[number];

export interface TrackSpec {
  label: string;
  /** 팝업에서 보여줄 한 줄 설명 */
  summary: string;
  /** 어떤 사람이 고르는가 */
  when: string;
}

export const TRACK_SPECS: Record<ProjectTrack, TrackSpec> = {
  modoo: {
    label: '모두의창업',
    summary: '중소벤처기업부 「모두의 창업 프로젝트」 지원서 문항으로 시작합니다.',
    when: '공고는 이미 정해져 있습니다. 지원서 문항만 채우면 됩니다.',
  },
  gov: {
    label: '정부사업',
    summary: '공고를 고르거나 공고문을 올려서 시작합니다.',
    when: 'K-Startup·지자체 등 일반 정부지원사업에 지원할 때.',
  },
};

/* ────────────── 모두의창업 지원서 문항 ────────────── */

export type ModooFieldKind = 'line' | 'text' | 'select';

export interface ModooQuestion {
  /** 저장 키 */
  id: string;
  /** 화면에 붙는 번호 — 주최측 지원서의 번호를 그대로 쓴다 */
  no: string;
  label: string;
  /** 문항 아래 회색 안내문 */
  hint?: string;
  required: boolean;
  kind: ModooFieldKind;
  /** 글자 수 상한 — 주최측 제한 그대로 */
  max: number;
  min?: number;
  options?: string[];
  /** 이 문항이 요약 한 장의 어느 칸으로 가는지 (프롬프트에 함께 넣는다) */
  feeds: string;
}

/**
 * 주최측 지원서 문항.
 *
 * 뺀 것들 —
 *  - 영상 링크: 영상은 분석하지 않는다
 *  - 사업 분야·창업 여부: 가입할 때 이미 받는다
 *  - 자랑 문구: 공개 페이지에 걸리는 홍보용이라 사업계획서와 무관하다
 *
 * **번호는 주최측 원본이 아니라 이 화면의 순서다.** 원본 번호를 그대로 두면
 * 빼낸 자리만큼 건너뛰어서 "4-2 다음이 8" 처럼 보인다. 쓰는 사람 눈에는
 * 그것이 빠뜨린 문항으로 읽히므로 이어지는 번호를 붙인다.
 *
 * 한 주제를 둘로 나눈 것(차별점·수익 / 사업화·멘토링)은 3-1·3-2 로 묶어
 * 둔다 — 따로 세면 아홉 문항이 되어 실제보다 많아 보인다.
 */
export const MODOO_QUESTIONS: ModooQuestion[] = [
  {
    id: 'oneLiner',
    no: 'Q1',
    label: '나의 아이디어를 한 줄로 소개해주세요',
    hint: '무엇을 누구에게 어떻게 파는지가 한 문장에 들어가면 좋습니다.',
    required: true,
    kind: 'line',
    min: 10,
    max: 100,
    feeds: '요약 한 장의 제목과 머리말',
  },
  {
    id: 'background',
    no: 'Q2',
    label: '아이디어를 떠올린 배경 이야기를 들려주세요',
    hint: '어떤 문제를 겪었고 왜 이 일을 하려는지. 겪은 일을 그대로 쓰는 게 가장 강합니다.',
    required: true,
    kind: 'text',
    max: 2000,
    feeds: '내부·외부 문제점',
  },
  {
    id: 'difference',
    no: 'Q3-1',
    label: '기존 제품 및 서비스 대비 차별점과 어떤 문제를 해결할 수 있나요?',
    hint: '경쟁 제품을 실제 이름으로 놓고 비교하면 구체성 점수가 올라갑니다.',
    required: true,
    kind: 'text',
    max: 2000,
    feeds: '해결 방안',
  },
  {
    id: 'revenue',
    no: 'Q3-2',
    label: '어떻게 수익을 창출할 계획인가요?',
    hint: '누가 얼마를 왜 내는지. 단가 × 수량이 보이면 좋습니다.',
    required: true,
    kind: 'text',
    max: 2000,
    feeds: '기대 효과',
  },
  {
    id: 'commercialization',
    no: 'Q4-1',
    label: '아이디어를 어떻게 사업화 하실 계획이신가요?',
    hint: '언제 무엇을 할지 시점(M+N)으로 끊어 쓰면 마일스톤이 됩니다.',
    required: true,
    kind: 'text',
    max: 2000,
    feeds: '사업 목표',
  },
  {
    id: 'mentoring',
    no: 'Q4-2',
    label: '책임멘토를 통해 어떤 도움을 받고 싶은가요?',
    hint: '막힌 지점을 구체적으로. 이 답이 향후 발전방안(D)의 재료가 됩니다.',
    required: true,
    kind: 'text',
    max: 2000,
    feeds: '향후 발전방안',
  },
  {
    id: 'improved',
    no: 'Q5',
    label: '2차 지원서에서는 1차 지원서보다 어떤 점이 더 개선되었나요?',
    hint: '1차에 지원하지 않았다면 비워 두세요.',
    required: false,
    kind: 'text',
    max: 2000,
    feeds: '향후 발전방안 (변화의 증거)',
  },
  {
    id: 'capability',
    no: 'Q6',
    label: '아이디어를 사업화 시킬 수 있는 본인의 역량을 알려주세요',
    hint: '경력·자격·실적을 이 문제와 이어서. 없는 이력을 지어내지 마세요.',
    required: true,
    kind: 'text',
    max: 2000,
    feeds: '기업 현황',
  },
  {
    id: 'teamSize',
    no: 'Q7',
    label: '팀원 명수',
    required: false,
    kind: 'select',
    max: 20,
    options: ['팀원 없음', '1명', '2명', '3명', '4명 이상'],
    feeds: '기업 현황',
  },
];

export type ModooAnswers = Partial<Record<string, string>>;

/**
 * 아직 못 낸 문항.
 *
 * 안 쓴 필수 문항과, **쓰긴 썼는데 최소 길이에 못 미치는 문항**을 함께 본다 —
 * 주최측이 Q1 에 10자 하한을 두고 있어서, 세 글자만 적고 넘어가면
 * 제출할 때 거기서 막힌다.
 */
export function missingModooAnswers(answers: ModooAnswers): ModooQuestion[] {
  return MODOO_QUESTIONS.filter((q) => {
    const value = (answers[q.id] ?? '').trim();
    if (q.required && !value) return true;
    return Boolean(value && q.min && value.length < q.min);
  });
}

/**
 * 답변을 프롬프트에 넣을 글로 편다.
 *
 * 빈 문항은 **빼지 않고 '(미작성)'으로 남긴다.** 지원서에 빈칸이 있다는
 * 사실 자체가 요약 한 장에서 gap 이 되어야 하기 때문이다.
 */
export function formatModooAnswers(answers: ModooAnswers): string {
  return MODOO_QUESTIONS.map((q) => {
    const value = (answers[q.id] ?? '').trim();
    return `### ${q.no}. ${q.label}\n${value || '(미작성)'}`;
  }).join('\n\n');
}

/** Q1 은 아이디어 제목 자리에 그대로 쓴다 */
export function modooTitle(answers: ModooAnswers): string {
  return (answers.oneLiner ?? '').trim().slice(0, 200);
}

/** 아이디어 원문 — 요약 한 장이 읽을 본문 */
export function modooIdea(answers: ModooAnswers): string {
  return formatModooAnswers(answers);
}

/**
 * 목록에 두 줄로 보여줄 미리보기.
 *
 * 제목이 이미 Q1 이라, 아이디어 원문을 그대로 쓰면 제목이 두 번 나오고
 * 그 뒤로 문항 번호가 줄줄이 붙는다. 배경 이야기(Q2)를 쓴다.
 */
export function modooPreview(answers: ModooAnswers | null): string {
  if (!answers) return '';
  return (answers.background ?? answers.difference ?? '').trim();
}

/* ────────────── 모두의창업 공고 ────────────── */

/**
 * 모두의창업 공고의 핵심.
 *
 * 공고가 하나로 고정이라 **모델에게 매번 뽑게 하지 않는다.** 같은 공고를
 * 사람마다 다시 읽히면 돈만 들고, 읽을 때마다 조금씩 다르게 요약된다.
 * 전문은 `docs/references/modoo/모두의창업-공고요약.md` 에 있고,
 * 여기에는 사업계획서를 쓸 때 쓰는 것만 옮겨 둔다.
 *
 * 3차 공고가 나오면 이 상수와 요약 MD 를 함께 고쳐야 한다.
 */
export const MODOO_NOTICE_DIGEST: NoticeDigest = {
  name: '「모두의 창업 프로젝트」 통합 모집공고 (2차)',
  agency: '중소벤처기업부 · 창업진흥원(일반/기술트랙) · 소상공인시장진흥공단(로컬트랙)',
  target:
    '예비창업자 또는 업력 7년 이내 기창업자(이종창업 희망자). 예비창업자는 공고일(2026.8.20.) ' +
    '기준 본인 명의 사업자등록이 없어야 하고, 기창업자는 사업자등록일이 2019.8.21.~2026.8.20. ' +
    '사이여야 한다. 이종·동종은 한국표준산업분류 세세분류(5자리)로 판단한다. ' +
    '일반/기술트랙 8,000명(수도권 30% · 비수도권 70%), 로컬트랙 2,000명(수도권 10% · 비수도권 90%)을 ' +
    '뽑고, 두 트랙 모두 예비창업자 80% · 기창업자 20% 내외로 배분한다.',
  support:
    '1R 초기 창업활동자금 200만원 + AI솔루션 2개월(100만원) + 책임 멘토링. ' +
    '이후 라운드로 갈수록 사업화 자금이 커지며 최대 상금은 일반/기술트랙 5억원, 로컬트랙 1억원이다. ' +
    '1R 아이디어 서면심사 → 2R 지역 예선(관찰식+서면) → 3R 지역 오디션(공개 IR) → 전국 오디션(대국민 IR) ' +
    '순의 토너먼트다.',
  criteria: [
    '1R: 아이디어의 차별성·효과성 (로컬트랙은 창의성·지역적 가치). 책임멘토 3인 서면평가',
    '2R: 1R 프로그램 참여에 대한 책임멘토 관찰평가 + 사업계획서·창업활동·멘토링 보고서',
    '3R: 시제품 제작 결과와 향후 사업계획. 외부전문가 5인 이상 공개 IR',
    'Final: 전문가 IR 평가 + 대국민 공개 IR',
    '가점 최대 4점 — 재도전 멘토링 참여 1점, 1차 도전 이력자의 기존 아이디어 보완사항 작성 최대 3점',
    '※ 항목별 배점표는 공고에 없다. 세부 평가지표는 멘토기관별로 따로 공개된다.',
  ],
  documents: [
    '온라인 도전신청서 (모두의 창업 플랫폼 www.modoo.or.kr)',
    '자격 증빙서류는 신청 시 내지 않는다 — 1R 진출자에 한해 통보일로부터 5일 이내 제출',
  ],
  limits:
    '본인이 직접 착안한 아이디어만 낼 수 있다. 이미 상용화된 아이디어나 정부·지자체 공모전 ' +
    '수상 이력이 대외 공개된 아이디어는 선정 취소·환수 대상이다. 대필은 금지되어 있다. ' +
    '단순한 제도개선·문제제기·불만 표시는 심사 대상에서 제외되므로, 반드시 제품 또는 서비스 ' +
    '형태의 사업으로 제시해야 한다.',
};
