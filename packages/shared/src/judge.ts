import { z } from 'zod';

/**
 * 소프트 판정 — 코드로 못 거른 조건을 모델이 읽고 판단하는 단계.
 *
 * 하드 필터(업력·지역·업종·연령 …)를 통과한 조합만 여기로 온다.
 * 프롬프트를 여기 두는 이유는 사업계획서 프롬프트와 같다 —
 * 로컬 Claude 와 Gemma 가 **같은 지시로 같은 형식**을 내놓아야
 * 어느 쪽이 돌았는지에 따라 결과가 달라지지 않는다.
 */

export const JudgeReasonSchema = z.object({
  field: z.string(),
  verdict: z.enum(['pass', 'fail', 'unknown']),
  message: z.string(),
});
export type JudgeReason = z.infer<typeof JudgeReasonSchema>;

export const JudgeVerdictSchema = z.object({
  /** 신청 가능 여부. 모르면 null */
  eligible: z.boolean().nullable(),
  reasons: z.array(JudgeReasonSchema),
  /** 판단 근거로 삼은 공고 원문 인용 */
  quotes: z.array(z.string()),
});
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

/** 모델에게 넘기는 판정 입력 */
export interface JudgeInput {
  grant: {
    title: string;
    agency: string;
    summary: string | null;
    /** 공고 원문의 신청 대상 / 제외 대상 등 구조화하지 못한 칸 */
    applyTargetDetail?: string | null;
    excludeTarget?: string | null;
  };
  profile: {
    name: string;
    stage: string | null;
    industry: string | null;
    region: string | null;
    foundedAt: string | null;
    employees: number | null;
    certifications: string[];
  };
  /** 코드가 이미 확정한 항목 — 다시 판정하면 중복이다 */
  hardReasons: { field: string; verdict: string; message: string }[];
}

const STAGE_LABEL: Record<string, string> = {
  preliminary: '예비창업자 (사업자등록 전)',
  individual: '개인사업자',
  corporate: '법인사업자',
};

/** 모델에 상관없이 같은 지시를 쓰기 위한 시스템 프롬프트 */
export const JUDGE_SYSTEM_PROMPT = `당신은 정부지원사업 신청 자격을 검토하는 전문가입니다.

가장 중요한 원칙은 **모르면 모른다고 하는 것**입니다.
틀린 "지원 가능" 판정은 신청자가 헛수고를 하게 만들고,
틀린 "지원 불가" 판정은 기회를 놓치게 만듭니다. 둘 다 침묵보다 나쁩니다.

규칙
1. 공고에 적혀 있지 않은 조건은 만들어내지 마세요.
2. 신청자 정보로 확인할 수 없는 조건은 반드시 verdict 를 "unknown" 으로 두세요.
   (과거 수혜 이력, 교육 이수 여부 등은 알 수 없습니다)
3. 확실하지 않으면 "pass" 라고 하지 마세요.
4. 이미 확인된 항목은 다시 판정하지 마세요.
5. **거의 모든 공고에 붙는 표준 결격 사유는 판정하지 마세요.**
   국세·지방세 체납, 휴업·폐업, 부도·회생·파산, 금융 연체, 범죄 경력,
   보조금 환수 이력, "기타 사유" 같은 항목이 여기 해당합니다.
   정상 운영 중인 기업은 대부분 해당하지 않아, 이걸 확인 필요로 올리면
   모든 공고가 주황색이 되어 표시가 무의미해집니다.
   이 사업에만 있는 **특수한 조건**만 골라내세요.
6. 판단 근거가 된 공고 문구를 quotes 에 원문 그대로 인용하세요.
7. message 는 한 문장으로 짧게 쓰세요.`;

/** 공고 1건에 대한 판정 요청문 */
export function buildJudgePrompt(input: JudgeInput): string {
  const { grant, profile, hardReasons } = input;

  const extra = [
    grant.applyTargetDetail && `신청 대상: ${grant.applyTargetDetail}`,
    grant.excludeTarget && `제외 대상: ${grant.excludeTarget}`,
  ]
    .filter(Boolean)
    .join('\n');

  return `## 신청자 정보
- 이름: ${profile.name}
- 사업자 형태: ${profile.stage ? (STAGE_LABEL[profile.stage] ?? profile.stage) : '미선택'}
- 업종: ${profile.industry ?? '미등록'}
- 지역: ${profile.region ?? '미등록'}
- 개업일: ${profile.foundedAt ?? '해당 없음'}
- 종업원 수: ${profile.employees ?? '미등록'}
- 보유 인증: ${profile.certifications.length ? profile.certifications.join(', ') : '없음'}

## 공고
제목: ${grant.title}
기관: ${grant.agency}
내용: ${grant.summary ?? '(요약 없음)'}
${extra ? `\n${extra}` : ''}

## 이미 확인된 항목 (다시 판정하지 마세요)
${hardReasons.map((r) => `- ${r.field}: ${r.message}`).join('\n') || '- 없음'}

## 할 일
위에 없는 **추가 자격 조건**을 공고에서 찾아 판정하세요.
예: 수혜 이력 제한, 교육 이수 요건, 중복 지원 제한, 특정 프로그램 선정 이력 등.

추가 조건이 없으면 reasons 를 빈 배열로 두고 eligible 을 true 로 하세요.`;
}

/** 모델별 JSON 응답 형식 안내 — 구조화 출력을 못 쓰는 모델용 */
export const JUDGE_JSON_FORMAT = `## 출력 (JSON만, 다른 말 금지)
{
  "eligible": true | false | null,
  "reasons": [
    { "field": "조건 이름", "verdict": "pass" | "fail" | "unknown", "message": "한 문장 설명" }
  ],
  "quotes": ["공고 원문에서 인용한 문구"]
}`;

/** 구조화 출력을 지원하는 모델에 넘길 JSON Schema */
export const JUDGE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    eligible: { type: ['boolean', 'null'] },
    reasons: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          field: { type: 'string' },
          verdict: { type: 'string', enum: ['pass', 'fail', 'unknown'] },
          message: { type: 'string' },
        },
        required: ['field', 'verdict', 'message'],
        additionalProperties: false,
      },
    },
    quotes: { type: 'array', items: { type: 'string' } },
  },
  required: ['eligible', 'reasons', 'quotes'],
  additionalProperties: false,
} as const;

/**
 * 모델 응답을 판정 결과로 바꾼다.
 *
 * 해석에 실패하면 통과로 넘기지 않고 "확인 필요"로 남긴다 —
 * 파싱 실패를 지원 가능으로 읽는 것이 가장 위험하다.
 */
export function parseJudgeOutput(raw: string): JudgeVerdict {
  const fallback: JudgeVerdict = {
    eligible: null,
    reasons: [
      {
        field: '추가 조건',
        verdict: 'unknown',
        message: '모델 응답을 해석하지 못했습니다. 공고 원문을 직접 확인해 주세요.',
      },
    ],
    quotes: [],
  };

  // JSON 형식을 지시해도 앞뒤에 설명이 붙는 모델이 있어 본문만 잘라낸다.
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) return fallback;

  try {
    const parsed = JudgeVerdictSchema.safeParse(
      JSON.parse(raw.slice(start, end + 1)),
    );
    if (!parsed.success) return fallback;

    return { ...parsed.data, quotes: parsed.data.quotes.slice(0, 5) };
  } catch {
    return fallback;
  }
}
