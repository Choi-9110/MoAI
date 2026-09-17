/**
 * 입찰 공고 읽어주기 — 제안요청서에서 "무엇을 준비해야 하는지"를 뽑는다.
 *
 * **왜 필요한가.** 실제 제안요청서는 3만 자가 넘는다(방금 받아 본 것이
 * 31,248자였다). 사람이 그걸 다 읽고 "우리한테 뭐가 없지"를 골라내는 게
 * 입찰 준비의 진짜 일이다. 공고 목록만 보여 주는 곳은 많지만 여기까지
 * 해 주는 곳은 없다.
 *
 * **대신 써 주지 않는다.** 짚어 주고, 있으면 받아 적고, 없으면 어떻게
 * 풀지 제안한다. 마지막에 사람이 확인하고 고친다.
 */

/** 요구사항 하나 */
export interface BidRequirement {
  id: string;
  /** 짧은 이름 — "유사 구축 실적 3건" */
  label: string;
  /**
   * 필수인지 우대인지.
   * 필수는 없으면 못 넣고, 우대는 점수 문제라 대응이 다르다.
   */
  required: boolean;
  /**
   * 공고 원문 그대로.
   *
   * 요약만 보여 주면 "정말 그렇게 쓰여 있나" 를 확인할 수 없다. 제출 전에
   * 원문과 맞춰 보라고 만든 칸이라 **고쳐 쓰지 않고 인용한다.**
   */
  quote: string;
  /** 평가 배점 — 공고에 적혀 있을 때만 */
  points: number | null;
  /**
   * 갖고 있지 않을 때 어떻게 풀지에 대한 제안.
   * 빈칸 앞에서 포기하지 않게 하는 것이 이 칸의 목적이다.
   */
  fallbackHint: string | null;
}

/** 사용자가 요구사항에 답한 것 */
export interface BidAnswer {
  requirementId: string;
  /** 갖고 있는지 — null 이면 아직 답하지 않음 */
  have: boolean | null;
  /**
   * 사용자가 적은 내용.
   * 있으면 실적·수치를, 없으면 대신 내세울 경험을 말로 적는다.
   */
  note: string;
}

/**
 * 낙찰자를 무엇으로 정하는가 — **최종 단계가 여기서 갈린다.**
 *
 * 실제로 세어 보면 절반 가까이가 가격만으로 정한다. 그런 공고에 제안서를
 * 쓰는 것은 시간 낭비고, 반대로 기술평가가 있는데 가격만 넣으면 떨어진다.
 * 그래서 문서를 만들기 전에 이것부터 가른다.
 */
export const BID_DECISIONS = [
  'price',     // 가격만 — 투찰가가 전부. 제안서 필요 없음
  'technical', // 기술평가·협상 — 제안서를 쓴다
  'mixed',     // 기술 + 가격 (예: 기술 80 / 가격 20)
  'unknown',   // 공고문에서 확정하지 못함
] as const;
export type BidDecision = (typeof BID_DECISIONS)[number];

export const BID_DECISION_LABELS: Record<BidDecision, string> = {
  price: '입찰가만 필요합니다',
  technical: '제안서가 필요합니다',
  mixed: '제안서 + 입찰가가 필요합니다',
  unknown: '공고 원문에서 확인해 주세요',
};

/** 공고 하나를 읽은 결과 */
export interface BidBrief {
  /** 낙찰자 결정 방식 — 최종 단계를 가르는 값 */
  decision: BidDecision;
  /** 이 입찰이 무슨 일인지 한 줄 */
  summary: string;
  /** 발주처가 풀려는 문제 — 제안서 첫 장에 그대로 쓰인다 */
  problem: string | null;
  /** 과업 범위 */
  scope: string[];
  requirements: BidRequirement[];
  /** 제출 서류 */
  documents: string[];
  /** 평가 방식 (기술 80 / 가격 20 같은) */
  evaluation: string | null;
  /** 읽어 낸 원문의 분량 — 얼마나 근거가 있는지 보여 준다 */
  sourceChars: number;
  /** 읽은 파일 이름 */
  sourceFiles: string[];
}

/* ────────────── 프롬프트 ────────────── */

export const BID_BRIEF_SYSTEM_PROMPT = `당신은 공공 입찰 제안서를 오래 써 온 사람입니다.
제안요청서를 읽고, 참가하려는 업체가 **무엇을 준비해야 하는지**를 뽑아 줍니다.

원칙:
- 공고에 있는 것만 씁니다. 없는 요건을 지어내지 않습니다.
- 요구사항마다 **공고 원문을 그대로 인용**합니다. 요약하지 않습니다.
- 필수와 우대를 구분합니다. 필수는 없으면 참가할 수 없는 것입니다.
- 배점이 적혀 있으면 숫자로 옮깁니다. 없으면 null 입니다.
- 업체가 그 요건을 못 갖췄을 때 **무엇으로 대신 내세울 수 있는지**를 한 줄로 제안합니다.
  실적이 없으면 비슷한 규모의 다른 경험, 인증이 없으면 그에 준하는 절차 같은 식입니다.
  대신할 것이 마땅치 않으면 null 로 둡니다.

출력은 JSON 하나입니다. 다른 말을 붙이지 마세요.`;

export function buildBidBriefPrompt(input: {
  title: string;
  agency: string;
  kind: string;
  estimate: number | null;
  /** 첨부에서 뽑은 원문 */
  text: string;
}): string {
  return `다음은 공공 입찰 공고와 첨부 문서입니다.

## 공고
- 공고명: ${input.title}
- 발주기관: ${input.agency}
- 구분: ${input.kind}
${input.estimate ? `- 추정가격: ${input.estimate.toLocaleString()}원` : ''}

## 첨부 원문
${input.text}

---

위 문서를 읽고 아래 JSON 을 채우세요.

{
  "decision": "price | technical | mixed | unknown",
  "summary": "이 입찰이 무슨 일인지 한 문장",
  "problem": "발주처가 풀려는 문제. 문서에 드러나지 않으면 null",
  "scope": ["과업 범위를 항목으로", "..."],
  "requirements": [
    {
      "id": "r1",
      "label": "짧은 이름 (예: 유사 구축 실적 3건)",
      "required": true,
      "quote": "공고 원문 그대로 인용",
      "points": 10,
      "fallbackHint": "못 갖췄을 때 대신 내세울 것 한 줄. 마땅치 않으면 null"
    }
  ],
  "documents": ["제출해야 하는 서류", "..."],
  "evaluation": "평가 방식 (예: 기술 80 / 가격 20). 없으면 null"
}

decision 은 낙찰자를 무엇으로 정하는지입니다. 이 값에 따라 다음 단계가 갈립니다.
- "price": 기술평가·제안서 없이 **가격만으로** 정하는 경우. 적격심사·최저가·
  낙찰하한율만 언급되고 기술평가 배점이 없으면 여기입니다.
- "technical": 협상에 의한 계약, 기술제안, 제안서 평가가 있는 경우.
- "mixed": 기술평가와 가격을 함께 보는 경우(예: 기술 80 / 가격 20).
- "unknown": 문서에서 확정할 수 없을 때. **추측하지 마세요.**

requirements 는 **참가 자격과 평가 항목**을 모두 담되, 업체가 준비해야 하는 것만
넣으세요. "국세 완납" 처럼 정상적인 업체면 당연히 충족하는 항목은 빼세요.`;
}

/**
 * 낙찰방법 문구로 제안서가 필요한지 가른다.
 *
 * **공고문을 읽지 않아도 된다.** 목록 응답의 `sucsfbidMthdNm` 이 100% 채워져
 * 오고, 거기에 방식이 그대로 적혀 있다. 1~3분짜리 읽기를 돌리기 전에
 * 목록에서 바로 알려 줄 수 있다는 뜻이다.
 *
 * 실제로 594건을 세어 보면 이렇게 갈린다:
 *
 *     소액수의견적    184건   가격
 *     협상에의한계약  120건   제안서
 *     수의시담         82건   가격
 *     규격가격동시입찰  66건   규격 + 가격
 *     적격심사제       ~50건   가격 (자격 심사는 서류)
 *     최저가·제한적최저가 41건  가격
 */
export function decisionFromMethod(method: string | null): BidDecision {
  const m = (method ?? '').trim();
  if (!m) return 'unknown';

  // 제안서를 쓰는 것
  if (/협상에\s*의한\s*계약|기술제안|제안서/.test(m)) return 'technical';
  // 규격(기술)과 가격을 함께 보는 것
  if (/규격.*가격|가격.*규격|２단계|2단계/.test(m)) return 'mixed';
  // 가격으로 정하는 것
  if (/소액수의|수의시담|최저가|적격심사|낙찰하한율|추첨/.test(m)) return 'price';

  return 'unknown';
}

/** 답변까지 반영한 진행률 — 화면 위쪽에 쓴다 */
export function briefProgress(
  requirements: BidRequirement[],
  answers: BidAnswer[],
): { answered: number; total: number; missing: number } {
  const map = new Map(answers.map((a) => [a.requirementId, a]));
  let answered = 0;
  let missing = 0;

  for (const r of requirements) {
    const a = map.get(r.id);
    if (!a || a.have === null) continue;
    answered += 1;
    // 없다고 답했는데 대신할 내용도 안 적은 것 — 여기가 비어 있으면 제안서가 약해진다
    if (!a.have && !a.note.trim()) missing += 1;
  }

  return { answered, total: requirements.length, missing };
}
