import type { NoticeDigest, PlanSection } from './plan-doc';
import { formatPoster } from './plan-doc';
import type { PosterDoc } from './poster';

/**
 * 마지막 점검.
 *
 * 절을 하나씩 쓰면 각 절은 그럴듯한데 **문서 전체로는 어긋나는 일**이 생긴다.
 * 자금계획 합계가 일정표의 과업과 안 맞고, 2번에서 든 시장 수치가 4번에서
 * 다른 숫자로 나온다. 절을 쓰는 컨텍스트는 앞 절을 400자씩만 보기 때문에
 * 이런 것을 스스로 잡지 못한다.
 *
 * 더 위험한 것은 **지어낸 근거**다. 작성 원칙에 "재료에 없는 사실을 쓰지
 * 말라"고 못박아 두어도 모델은 출처와 URL 을 그럴듯하게 만들어 낸다
 * (실측: 검색 도구를 쥐여 주고 "못 찾으면 못 찾았다고 답하라"고까지 시켰는데
 * 도구를 쓰지 않고 그럴듯한 보고서명과 URL 을 지어낸 적이 있다).
 * 규칙만으로는 안 막힌다.
 * 그래서 **다 쓴 다음 별도 호출로 다시 읽는다.** 쓴 사람과 보는 사람을
 * 갈라 놓는 것이 요점이다 — 같은 맥락 안에서는 자기가 지어낸 것을 못 본다.
 */

/** 점검에서 걸린 것 하나 */
export interface PlanFinding {
  /** 어느 절인가 — outline 의 id. 문서 전체 문제면 빈 문자열 */
  sectionId: string;
  /**
   * 무엇이 문제인가.
   *
   * - fabricated: 재료에 없는 수치·출처·URL 을 지어냈다
   * - contradiction: 다른 절과 숫자·시점·역할이 어긋난다
   * - duplicate: 다른 절과 같은 말을 반복한다
   * - missing: 양식·공고가 요구한 항목이 빠졌다
   * - style: 개조식 위반, 과장 수식어, 측정 불가능한 목표
   */
  kind: 'fabricated' | 'contradiction' | 'duplicate' | 'missing' | 'style';
  /** 고쳐 쓸 만큼 중한가 */
  severity: 'high' | 'low';
  /** 무엇이 문제인지 한 문장 */
  issue: string;
  /** 어떻게 고쳐야 하는지 한 문장 */
  fix: string;
}

export interface PlanReview {
  findings: PlanFinding[];
  /** 다시 쓴 절 id */
  rewritten: string[];
  /** 점검 시각 (ISO) */
  checkedAt: string;
}

export const REVIEW_SYSTEM_PROMPT = `당신은 정부지원사업 심사위원이자 팩트체커입니다.

다 쓴 사업계획서를 **처음 보는 사람의 눈으로** 읽고, 심사에서 걸릴 것을 찾아냅니다.
당신은 이 문서를 쓰지 않았습니다. 잘 썼다고 편들지 마세요.

## 무엇을 찾는가

1. **fabricated — 지어낸 근거 (가장 중요)**
   본문에 있는 수치·통계·출처·URL·기관명 중에서 **아래 재료에 없는 것**을 찾습니다.
   "○○연구원 2025년 보고서에 따르면 시장 규모 3,200억원" 처럼 그럴듯하게 적혀
   있어도, 재료에 그 숫자가 없으면 지어낸 것입니다. 심사위원이 출처를 확인하면
   바로 걸리고, 그 한 줄 때문에 나머지 진짜 내용까지 의심받습니다.
   **재료에 없는 숫자는 전부 의심하세요.** 상식으로 알 만한 것도 예외가 아닙니다.

2. **contradiction — 절 사이의 모순**
   자금 합계가 일정표의 과업과 안 맞는다, 2번에서 든 시장 규모가 4번에서 다른
   숫자로 나온다, 팀 역할 분담이 개발 방안의 수행 주체와 다르다.

3. **missing — 요구한 것이 빠짐**
   그 절이 쓰라고 지시받은 항목(brief) 중 본문에 없는 것. 공고가 요구한 제출
   항목 중 문서 어디에도 없는 것.

4. **duplicate — 절 사이의 반복**
   같은 내용이 두 절에 그대로 들어간 경우. 서로 이어지는 서술은 반복이 아닙니다.

5. **style — 문장 문제**
   개조식이 아닌 문장, 과장 수식어(혁신적·획기적·최고의), 측정할 수 없는 목표
   ("적극 추진함"), 근거 없이 단정하는 문장.

## 판정 기준

- severity **high**: 심사에서 감점되거나 신뢰를 잃는 것 → 그 절을 다시 씁니다.
  지어낸 근거는 **무조건 high** 입니다.
- severity **low**: 있으면 좋지만 다시 쓸 정도는 아닌 것.

- **없으면 없다고 하세요.** 억지로 찾아내려고 트집을 잡으면, 멀쩡한 절이
  다시 쓰이면서 오히려 나빠집니다. findings 를 빈 배열로 두는 것은 실패가
  아닙니다.
- 이미 [확인필요]로 남겨 둔 항목은 문제가 아닙니다. 모른다고 정직하게 밝힌
  것이므로 그대로 두세요.

## 출력

JSON 하나만 출력합니다. 설명·인사·코드블록 없이 JSON 으로 시작해 JSON 으로 끝냅니다.
{"findings":[{"sectionId":"절 id","kind":"fabricated|contradiction|duplicate|missing|style","severity":"high|low","issue":"무엇이 문제인지 한 문장","fix":"어떻게 고칠지 한 문장"}]}

sectionId 는 아래 목차에 적힌 id 를 그대로 씁니다. 문서 전체에 걸친 문제면 빈 문자열.`;

export interface PlanReviewInput {
  title: string;
  idea: string;
  poster: PosterDoc;
  notice?: NoticeDigest | null;
  grantTitle?: string | null;
  sections: Pick<PlanSection, 'id' | 'title' | 'brief' | 'body' | 'openQuestions'>[];
}

export function buildReviewPrompt(input: PlanReviewInput): string {
  const materials = [
    `## 사업 제목\n${input.title}`,
    `## 아이디어 (사용자가 쓴 원문)\n${input.idea}`,
    `## 요약 한 장 (집필의 주된 근거)\n${formatPoster(input.poster)}`,
    input.notice
      ? `## 공고\n${[
          input.notice.name && `사업명: ${input.notice.name}`,
          input.notice.agency && `주관기관: ${input.notice.agency}`,
          input.notice.target && `지원 대상: ${input.notice.target}`,
          input.notice.support && `지원 내용: ${input.notice.support}`,
          input.notice.criteria?.length &&
            `평가 항목:\n${input.notice.criteria.map((c) => `  - ${c}`).join('\n')}`,
          input.notice.documents?.length &&
            `제출 서류:\n${input.notice.documents.map((d) => `  - ${d}`).join('\n')}`,
          input.notice.limits && `분량·형식: ${input.notice.limits}`,
        ]
          .filter(Boolean)
          .join('\n')}`
      : `## 공고\n${input.grantTitle ?? '(연결된 공고 없음)'}`,
  ].join('\n\n');

  const doc = input.sections
    .map(
      (s) =>
        `### [${s.id}] ${s.title}\n` +
        `(이 절에 쓰라고 지시된 것: ${s.brief})\n\n` +
        `${s.body || '(비어 있음)'}` +
        (s.openQuestions.length > 0
          ? `\n\n[확인필요로 남긴 것]\n${s.openQuestions.map((q) => `- ${q}`).join('\n')}`
          : ''),
    )
    .join('\n\n---\n\n');

  return `# 재료 (이 문서가 근거로 삼을 수 있는 전부)

${materials}

**위가 전부입니다.** 여기에 없는 수치·출처·URL 이 본문에 있으면 지어낸 것입니다.

# 사업계획서 본문

${doc}

---

위 본문을 재료와 대조해 점검하고, 걸린 것을 JSON 으로 내놓으세요.
문제가 없으면 {"findings":[]} 입니다.`;
}

/**
 * 점검 결과를 읽는다.
 *
 * **필드 이름을 믿지 않는다.** 형식을 못박아도 모델은 제 식대로 쓴다 —
 * 실측에서 `sectionId` 대신 `section`, `kind` 대신 `type`, severity 에는
 * 정해 주지도 않은 `critical` 을 넣어 왔다. 이름만 보고 읽으면 지어낸 근거가
 * 전부 "문장 문제(style)"로 떨어져서, 정작 고쳐야 할 절이 안 고쳐진다.
 * 그래서 이름은 후보를 여럿 두고, 값은 키워드로 알아본다.
 *
 * 읽어내지 못하면 **빈 목록**이다. 점검을 못 했다고 멀쩡한 문서를 건드리면
 * 안 된다.
 */
export function parseReview(raw: string): PlanFinding[] {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return [];

  const pick = (row: Record<string, unknown>, keys: string[]): string => {
    for (const k of keys) {
      const v = row[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return '';
  };

  /** 값 안에 든 낱말로 종류를 알아본다 (`fabricated_source` → fabricated) */
  const kindOf = (value: string): PlanFinding['kind'] => {
    const v = value.toLowerCase();
    if (v.includes('fabricat') || v.includes('hallucin') || v.includes('unsupported')) {
      return 'fabricated';
    }
    if (v.includes('contradic') || v.includes('inconsist') || v.includes('mismatch')) {
      return 'contradiction';
    }
    if (v.includes('duplicat') || v.includes('redundan') || v.includes('repeat')) {
      return 'duplicate';
    }
    if (v.includes('missing') || v.includes('omit') || v.includes('incomplete')) {
      return 'missing';
    }
    return 'style';
  };

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1)) as {
      findings?: Record<string, unknown>[];
    };
    if (!Array.isArray(parsed.findings)) return [];

    return parsed.findings
      .map((row) => {
        const kind = kindOf(pick(row, ['kind', 'type', 'category', 'issueType']));
        const rawSeverity = pick(row, ['severity', 'level', 'priority']).toLowerCase();

        /*
         * critical·major 도 high 로 본다 — 정해 주지 않은 등급을 만들어 쓰는
         * 일이 잦다. 그리고 **지어낸 근거는 무조건 high 다.** 프롬프트에도
         * 그렇게 적어 두었지만 low 로 매기는 일이 있었고, 그러면 그 절이
         * 다시 쓰이지 않는다. 규칙은 여기서 못박는다.
         */
        const high =
          kind === 'fabricated' ||
          rawSeverity.includes('high') ||
          rawSeverity.includes('critical') ||
          rawSeverity.includes('major');

        return {
          // `id` 는 마지막 후보다. 모델이 F1·F2 같은 일련번호를 여기 넣는 일이
          // 있어서, 목차에 없는 값이면 호출하는 쪽이 걸러낸다.
          sectionId: pick(row, ['sectionId', 'section', 'section_id', 'id']),
          kind,
          severity: (high ? 'high' : 'low') as PlanFinding['severity'],
          issue: pick(row, ['issue', 'problem', 'description', 'detail']).slice(0, 300),
          fix: pick(row, ['fix', 'suggestion', 'action', 'recommendation']).slice(0, 300),
        };
      })
      .filter((f) => f.issue.length > 0)
      .slice(0, 30);
  } catch {
    return [];
  }
}

/**
 * 다시 쓸 때 절 프롬프트 뒤에 붙이는 지적 사항.
 *
 * 절을 통째로 다시 쓰되 **무엇이 걸렸는지 알려 준다.** 그냥 다시 쓰라고만
 * 하면 같은 문장을 또 쓴다.
 */
export function buildRewriteNote(findings: PlanFinding[]): string {
  if (findings.length === 0) return '';

  const lines = findings
    .map((f, i) => `${i + 1}. (${f.kind}) ${f.issue}\n   → ${f.fix}`)
    .join('\n');

  return `

## 이 절은 점검에서 아래가 걸렸습니다 — 다시 씁니다

${lines}

**지적된 것을 고쳐서 절 전체를 다시 쓰세요.** 지적되지 않은 부분은 그대로 두어도 됩니다.
근거가 없어 못 채우는 항목은 지어내지 말고 [확인필요]에 질문으로 남기세요 —
지어낸 근거를 지우는 것이 이 절을 다시 쓰는 이유입니다.`;
}
