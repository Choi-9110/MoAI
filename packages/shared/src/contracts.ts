import { z } from 'zod';
import {
  ARTIFACT_KINDS, CONFIDENCE_LEVELS, EXECUTOR_KINDS, JOB_STATUSES,
  KNOWLEDGE_CATEGORIES, QUESTION_TYPES, SECTION_KEYS, TEMPLATE_KINDS,
} from './enums';

/* ────────────── 질의(Questionnaire) ────────────── */

/** 개별 질문 정의. 템플릿 하나당 최소 10개 이상 구성한다. */
export const QuestionSchema = z.object({
  id: z.string().uuid(),
  templateId: z.string().uuid(),
  order: z.number().int().min(1),
  key: z.string().min(1),              // 프롬프트에서 참조할 식별자 (예: target_customer)
  label: z.string().min(1),            // 화면에 노출할 질문 문구
  hint: z.string().nullable(),         // 작성 도움말
  type: z.enum(QUESTION_TYPES),
  required: z.boolean(),
  options: z.array(z.string()).nullable(), // select 계열에서만 사용
  maxLength: z.number().int().positive().nullable(),
  /** 이 질문의 답이 주로 기여하는 섹션 (프롬프트 라우팅용) */
  targetSection: z.enum(SECTION_KEYS).nullable(),
});
export type Question = z.infer<typeof QuestionSchema>;

/** 사용자 응답 */
export const AnswerSchema = z.object({
  questionKey: z.string().min(1),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});
export type Answer = z.infer<typeof AnswerSchema>;

/** 생성 요청 시 최소 10개 응답을 요구한다. */
export const AnswerSetSchema = z.array(AnswerSchema).min(10, {
  message: '사업계획서 생성에는 최소 10개의 질의 응답이 필요합니다.',
});

/* ────────────── 잡(Job) 계약 ────────────── */

/** api → agent 로 전달되는 생성 잡. 세 앱이 공유하는 핵심 계약. */
export const PlanJobSchema = z.object({
  jobId: z.string().uuid(),
  projectId: z.string().uuid(),
  tenantId: z.string().uuid(),
  templateKind: z.enum(TEMPLATE_KINDS),
  /** 아이디어 원문 — 사용자가 최초 입력한 한 문단 */
  idea: z.string().min(10),
  /** 질의 응답 (10개 이상) */
  answers: AnswerSetSchema,
  /** RAG 로 선별된 참조 자료. agent 는 이 안에서만 근거를 인용한다. */
  knowledge: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    category: z.enum(KNOWLEDGE_CATEGORIES),
    content: z.string(),
  })).default([]),
  /** 생성 대상 섹션. 비우면 전체 생성 */
  sections: z.array(z.enum(SECTION_KEYS)).default([]),
  /** 재생성 여부 */
  regenerate: z.boolean().default(false),
});
export type PlanJob = z.infer<typeof PlanJobSchema>;

/** agent → api 로 흐르는 진행 이벤트 (SSE) */
export const ProgressEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('job_start'), jobId: z.string().uuid(), totalSections: z.number().int() }),
  z.object({ type: z.literal('section_start'), section: z.enum(SECTION_KEYS) }),
  z.object({ type: z.literal('token'), section: z.enum(SECTION_KEYS), text: z.string() }),
  z.object({
    type: z.literal('section_done'),
    section: z.enum(SECTION_KEYS),
    content: z.string(),
    confidence: z.enum(CONFIDENCE_LEVELS),
    /** 사용자에게 되물어야 할 항목 (needs_user 일 때 채워진다) */
    openQuestions: z.array(z.string()).default([]),
  }),
  z.object({ type: z.literal('artifact'), kind: z.enum(ARTIFACT_KINDS), url: z.string(), bytes: z.number().int() }),
  z.object({ type: z.literal('usage'), inputTokens: z.number().int(), outputTokens: z.number().int() }),
  z.object({ type: z.literal('job_done'), jobId: z.string().uuid(), status: z.enum(JOB_STATUSES) }),
  z.object({ type: z.literal('error'), message: z.string(), retryable: z.boolean().default(false) }),
]);
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;

/** agent 의 잡 접수 응답 */
export const JobAcceptedSchema = z.object({
  jobId: z.string().uuid(),
  status: z.enum(JOB_STATUSES),
  streamPath: z.string(),
});
export type JobAccepted = z.infer<typeof JobAcceptedSchema>;

/** agent 헬스체크 응답 — api 의 폴백 판정 근거 */
export const HealthSchema = z.object({
  ok: z.boolean(),
  executor: z.enum(EXECUTOR_KINDS),
  version: z.string(),
  busySlots: z.number().int(),
  maxSlots: z.number().int(),
  uptimeSec: z.number(),
});
export type Health = z.infer<typeof HealthSchema>;

/* ────────────── 산출물 ────────────── */

export const ArtifactSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(ARTIFACT_KINDS),
  url: z.string(),
  bytes: z.number().int(),
  createdAt: z.string(),
});
export type Artifact = z.infer<typeof ArtifactSchema>;
