import type { ConfidenceLevel, PlanJob, SectionKey } from './index';

/** 섹션 키 → 한국어 제목 */
export const SECTION_TITLES: Record<SectionKey, string> = {
  overview: '사업 개요',
  problem: '문제 인식 (Problem)',
  solution: '실현 가능성 (Solution)',
  market: '시장 분석',
  business: '성장 전략 (Scale-up)',
  budget: '소요 예산 및 자금 조달',
  team: '팀 구성 (Team)',
};

/** 섹션별 작성 지시 */
const SECTION_BRIEFS: Record<SectionKey, string> = {
  overview:
    '아이템의 정의, 핵심 기능, 차별점을 3~5개 항목으로 압축해 제시할 것. 첫 항목에서 한 문장으로 사업을 정의할 것.',
  problem:
    '고객이 겪는 불편을 구체적 상황으로 서술하고, 기존 대안의 한계를 지적할 것. 가능하면 응답에 포함된 수치를 인용할 것.',
  solution:
    '문제를 어떻게 해결하는지 기능 단위로 서술하고, 현재 개발 단계와 실현 근거를 명시할 것.',
  market:
    '목표 시장의 규모와 성장성, 경쟁 구도, 진입 전략을 서술할 것. 근거 없는 수치는 절대 만들어내지 말 것.',
  business:
    '수익 모델, 가격 정책, 고객 확보 경로, 향후 3년 로드맵을 서술할 것.',
  budget:
    '자금 사용 계획을 항목별로 구분하고 산출 근거를 붙일 것. 응답에 금액 정보가 없으면 임의 금액을 쓰지 말고 확인 필요로 남길 것.',
  team: '대표자 및 팀원의 역량과 역할 분담을 서술할 것. 없는 이력을 지어내지 말 것.',
};

/**
 * 시스템 프롬프트.
 *
 * 정부지원사업 사업계획서 작성 실무에서 검증된 규칙을 그대로 옮긴 것으로,
 * 특히 "모르는 것은 지어내지 말고 확인 필요로 표시" 규칙이 품질의 핵심이다.
 */
export function buildSystemPrompt(job: PlanJob): string {
  return `당신은 정부·공공 지원사업 사업계획서 작성 전문가입니다.

## 작성 원칙 (반드시 준수)

1. **문체는 개조식**을 사용합니다. 문장 끝은 '~함', '~됨', '~임'으로 맺습니다.
2. **사용자 응답에 없는 사실을 절대 지어내지 않습니다.**
   매출액, 사용자 수, 특허, 수상 이력, 팀원 경력 등 검증 가능한 사실은
   응답에 명시된 것만 사용합니다.
3. 근거가 없어 작성할 수 없는 항목은 본문에 억지로 채우지 말고
   **[확인필요] 목록에 질문 형태로 남깁니다.**
4. 참조자료가 제공된 경우, 그 안의 표현·구조·평가 관점을 참고하되
   내용을 그대로 복사하지 않습니다.
5. 각 항목은 두괄식으로 작성하고, 핵심 주장을 먼저 제시한 뒤 근거를 붙입니다.
6. 과장된 수식어(혁신적, 획기적, 최고의)를 쓰지 않습니다. 사실과 수치로 설득합니다.

## 출력 형식 (엄격히 준수)

[본문]
(개조식 본문. 소제목은 ▶ 로 시작)

[확인필요]
- (사용자에게 되물어야 할 항목. 없으면 이 절 자체를 생략)

## 대상 양식
${job.templateKind}`;
}

/** 질의 응답을 프롬프트용 텍스트로 직렬화 */
export function formatAnswers(job: PlanJob): string {
  return job.answers
    .map((a, i) => {
      const value = Array.isArray(a.value) ? a.value.join(', ') : String(a.value);
      return `${i + 1}. [${a.questionKey}] ${value}`;
    })
    .join('\n');
}

/** 참조자료를 프롬프트용 텍스트로 직렬화 */
export function formatKnowledge(job: PlanJob): string {
  if (job.knowledge.length === 0) {
    return '(제공된 참조자료 없음 — 응답 내용만으로 작성할 것)';
  }
  return job.knowledge
    .map((k) => `### ${k.title} (${k.category})\n${k.content.slice(0, 4000)}`)
    .join('\n\n');
}

/** 섹션 1개 생성을 위한 사용자 메시지 */
export function buildSectionPrompt(job: PlanJob, section: SectionKey): string {
  return `## 사업 아이디어
${job.idea}

## 창업자 응답 (${job.answers.length}개)
${formatAnswers(job)}

## 참조자료
${formatKnowledge(job)}

---

위 정보를 근거로 **「${SECTION_TITLES[section]}」** 섹션을 작성하십시오.

작성 지침: ${SECTION_BRIEFS[section]}

응답에 근거가 없는 내용은 본문에 쓰지 말고 [확인필요]에 남기십시오.`;
}

/**
 * 모델 출력에서 본문과 확인 필요 항목을 분리한다.
 * api / agent 양쪽이 동일한 파서를 써야 결과가 일관된다.
 *
 * 구분자는 **줄 하나를 통째로 차지한** `[확인필요]` 여야 한다.
 * 그냥 문자열로 찾으면 안 된다 — 모델이 본문 안에서
 * "미결 사항은 [확인필요]로 정리함" 처럼 말로 쓰는 일이 실제로 있고,
 * 그걸 구분자로 오인하면 본문의 나머지가 통째로 질문 목록이 되어 버린다.
 */
export function parseSectionOutput(raw: string): {
  body: string;
  confidence: ConfidenceLevel;
  openQuestions: string[];
} {
  const lines = raw.split('\n');

  // 뒤에서부터 찾는다. 문서 끝에 붙는 절이라 마지막 것이 진짜다.
  const at = lines.reduce(
    (found, line, i) => (line.trim() === '[확인필요]' ? i : found),
    -1,
  );

  const strip = (text: string) =>
    text.replace(/^\s*\[본문\]\s*/, '').trim();

  if (at === -1) {
    return {
      body: strip(raw),
      confidence: 'confirmed',
      openQuestions: [],
    };
  }

  const openQuestions = lines
    .slice(at + 1)
    .map((l) => l.replace(/^[-*·]\s*/, '').trim())
    .filter((l) => l.length > 0);

  return {
    body: strip(lines.slice(0, at).join('\n')),
    confidence: openQuestions.length > 0 ? 'needs_user' : 'confirmed',
    openQuestions,
  };
}
