/**
 * 시스템 전역 열거형.
 * web / api / agent 세 앱이 이 파일 하나만 참조하도록 유지한다.
 */

/** 사업계획서 양식 종류 */
export const TEMPLATE_KINDS = [
  'kstartup-psst', // K-Startup 표준 (Problem-Solution-Scale-Team)
  'bizinfo',       // 기업마당 일반 지원사업
  'rnd',           // R&D 과제 계획서
  'ir-deck',       // 투자 유치용 IR
  'custom',        // 사용자 정의
] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** 질의 응답 유형 — 프론트 입력 위젯과 1:1 대응 */
export const QUESTION_TYPES = [
  'short_text',   // 한 줄 입력
  'long_text',    // 여러 줄 입력
  'number',       // 숫자
  'single_select',// 단일 선택
  'multi_select', // 다중 선택
  'date',         // 날짜
  'money',        // 금액(원)
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

/** 사업계획서 표준 섹션 키 (PSST 기준 7종) */
export const SECTION_KEYS = [
  'overview',     // 사업 개요
  'problem',      // 문제 인식
  'solution',     // 해결 방안
  'market',       // 시장 분석
  'business',     // 사업화 전략
  'budget',       // 소요 예산
  'team',         // 팀 구성
] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** 잡 처리 상태 */
export const JOB_STATUSES = [
  'queued',    // 대기열
  'running',   // 실행 중
  'succeeded', // 완료
  'failed',    // 실패
  'canceled',  // 취소
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

/** 실행기 종류 — 로컬 Claude 서버 / Anthropic API 직결 */
export const EXECUTOR_KINDS = ['local', 'api'] as const;
export type ExecutorKind = (typeof EXECUTOR_KINDS)[number];

/** 산출물 파일 종류 */
export const ARTIFACT_KINDS = ['docx', 'pdf', 'md', 'hwpx'] as const;
export type ArtifactKind = (typeof ARTIFACT_KINDS)[number];

/**
 * 확신도 표기.
 * govgrant-app 벤치마킹에서 가져온 핵심 장치 —
 * AI가 모르는 값을 지어내는 대신 needs_user 로 표시해 사용자에게 되묻게 한다.
 */
export const CONFIDENCE_LEVELS = [
  'confirmed',  // 확정 (근거 있음)
  'needs_user', // 사용자 확인 필요
  'risk',       // 리스크 (충족 못할 가능성)
] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/** 학습(참조) 데이터 분류 — 실제 데이터 수급 전까지 러프하게 운영 */
export const KNOWLEDGE_CATEGORIES = [
  'winning_plan',  // 선정된 사업계획서 사례
  'announcement',  // 공고 원문
  'evaluation',    // 평가지표 / 심사 기준
  'writing_guide', // 작성 가이드 / 문체 규칙
  'glossary',      // 용어집
  'etc',
] as const;
export type KnowledgeCategory = (typeof KNOWLEDGE_CATEGORIES)[number];

/* ────────────── 공고 캘린더 ────────────── */

/** 공고 시행 기관 유형 */
export const AGENCY_TYPES = [
  'central',   // 중앙부처 (중기부·과기정통부 등)
  'local',     // 지자체
  'public',    // 공공기관·진흥원
  'private',   // 민간·재단
] as const;
export type AgencyType = (typeof AGENCY_TYPES)[number];

/**
 * 공고를 어디서 받아왔는가.
 *
 * 화면에 출처를 밝히는 이유는 **원문을 어디서 확인해야 하는지**를 알려주기
 * 위해서다. 같은 사업이 두 곳에 올라오기도 하고, 기관마다 갱신 시점이 달라
 * 우리 쪽 내용이 뒤처질 수 있다.
 */
export const GRANT_SOURCES = [
  'kstartup', // 창업진흥원 K-Startup
  'bizinfo',  // 중소벤처기업부 기업마당
  'g2b',      // 조달청 나라장터 (입찰)
] as const;
export type GrantSource = (typeof GRANT_SOURCES)[number];

export const GRANT_SOURCE_LABELS: Record<GrantSource, string> = {
  kstartup: 'K-Startup',
  bizinfo: '기업마당',
  g2b: '나라장터',
};

/** 공고 지원 유형 */
export const GRANT_CATEGORIES = [
  'startup',    // 창업지원
  'funding',    // 사업화 자금
  'rnd',        // R&D 과제
  'space',      // 입주공간
  'voucher',    // 바우처
  'contest',    // 공모전·경진대회
  'export',     // 수출·판로
  'employment', // 고용·인력
  'loan',       // 융자·정책자금 (상환 의무가 있는 대출)
  'education',  // 창업교육
  'mentoring',  // 멘토링·컨설팅
  'etc',
] as const;
export type GrantCategory = (typeof GRANT_CATEGORIES)[number];

/**
 * 유형 이름.
 *
 * 화면마다 따로 적어 두면 한쪽만 고쳐지는 일이 생긴다 — 실제로 목록에만
 * 있었고 캘린더 필터에는 없었다.
 */
export const GRANT_CATEGORY_LABELS: Record<GrantCategory, string> = {
  startup: '창업지원',
  funding: '사업화 자금',
  rnd: '기술개발(R&D)',
  space: '시설·공간·보육',
  voucher: '바우처',
  contest: '행사·네트워크',
  export: '수출·글로벌',
  employment: '인력',
  loan: '융자·보증',
  education: '교육',
  mentoring: '멘토링·컨설팅',
  etc: '기타',
};

/**
 * 공고가 겨냥하는 **창업 단계**.
 *
 * 프로필로 하는 판정과는 목적이 다르다. 판정은 "내가 넣을 수 있나"를 보지만,
 * 이건 **"지금 내가 보고 싶은 것만 추리는"** 쪽이다. 3년차라도 도약기 공고를
 * 미리 훑어 두는 일이 있기 때문이다.
 *
 * 열린 공고 641건 중 업력 상한이 걸린 것은 138건뿐이고 **503건은 제한이
 * 없다.** 그래서 `any` 를 항목으로 둔다 — 빼면 고르는 순간 대부분이 사라져,
 * 필터가 아니라 고장으로 보인다.
 */
export const GRANT_STAGES = [
  'preliminary', // 예비창업
  'early',       // 창업초기 (3년 이내)
  'growth',      // 창업도약기 (4~7년)
  'new',         // 신산업 (8~10년)
  'any',         // 업력 무관
] as const;
export type GrantStage = (typeof GRANT_STAGES)[number];

export const GRANT_STAGE_LABELS: Record<GrantStage, string> = {
  preliminary: '예비창업',
  early: '창업초기 (3년 이내)',
  growth: '창업도약기 (4~7년)',
  new: '신산업 (10년 이내)',
  any: '업력 무관',
};

/**
 * 단계별 업력 상한 구간 — `[하한, 상한]`, 둘 다 포함.
 *
 * `any` 는 `max_business_years` 가 비어 있는 것이라 구간이 없다.
 * `preliminary` 는 연수로는 0년이지만 실제로는 `applicant_types` 로 가른다.
 */
export const GRANT_STAGE_YEARS: Record<GrantStage, [number, number] | null> = {
  preliminary: [0, 0],
  early: [1, 3],
  growth: [4, 7],
  new: [8, 10],
  any: null,
};

/**
 * 지원 결과 — **사용자가 직접 적는다.**
 *
 * 자동으로 알 방법이 없다. 선정 결과는 기관마다 제각각으로 공고되고 우리가
 * 볼 수 있는 곳에 남지 않는다. 그래서 본인이 남기게 하고, 대신 그 값을
 * 쓸모 있게 쓴다 — **중복 수혜 제한**이 그것이다. 지원사업에는
 * "OOO사업 수혜 기업 제외" 가 흔한데, 무엇을 받았는지 알아야 걸러 준다.
 */
export const GRANT_OUTCOMES = [
  'applied', // 지원함 — 결과를 기다리는 중
  'won',     // 지원받음 (선정)
  'lost',    // 지원받지 못함
] as const;
export type GrantOutcome = (typeof GRANT_OUTCOMES)[number];

export const GRANT_OUTCOME_LABELS: Record<GrantOutcome, string> = {
  applied: '지원함 · 결과 기다리는 중',
  won: '지원받음',
  lost: '지원받지 못함',
};

/** 목록에서 한 줄로 쓰는 짧은 이름 */
export const GRANT_OUTCOME_SHORT: Record<GrantOutcome, string> = {
  applied: '결과 대기',
  won: '선정',
  lost: '미선정',
};

/**
 * 인증이 하나도 없다는 표시.
 *
 * **빈 배열은 "없다"가 아니라 "아직 안 골랐다"이다.** 둘을 구분하지 못하면
 * 인증이 없는 사람은 입력 완성도가 영원히 9/10 에 멈춘다 — 채우고 싶어도
 * 채울 것이 없으니 죽어도 못 채우는 칸이 된다.
 *
 * 그래서 "해당 없음"을 **고를 수 있는 값**으로 둔다. 자격 판정에서는 이
 * 값을 인증으로 세지 않는다.
 */
export const NO_CERTIFICATION = '해당 없음';

/** 공고 진행 상태 (마감일 기준 자동 계산) */
export const GRANT_STATUSES = [
  'upcoming', // 접수 예정
  'open',     // 접수 중
  'closing',  // 마감 임박 (D-7 이내)
  'closed',   // 마감
] as const;
export type GrantStatus = (typeof GRANT_STATUSES)[number];

/**
 * 지원 가능 여부 판정.
 *
 * 사업계획서의 확신도(ConfidenceLevel)와 같은 사고방식이다.
 * 확실하지 않으면 단정하지 않고 unknown 으로 남겨 사용자가 직접 확인하게 한다.
 */
export const ELIGIBILITY_LEVELS = [
  'eligible',    // 지원 가능 — 확인된 요건을 모두 충족
  'conditional', // 조건부 — 일부 요건이 불명확하거나 준비가 필요
  'ineligible',  // 지원 불가 — 명확한 배제 조건에 해당
  'unknown',     // 판정 불가 — 기업 프로필 정보가 부족
] as const;
export type EligibilityLevel = (typeof ELIGIBILITY_LEVELS)[number];

/** 업종 대분류 — 공고 자격요건 매칭용 */
export const INDUSTRIES = [
  'it',            // 정보통신·SW
  'manufacturing', // 제조
  'bio',           // 바이오·의료
  'content',       // 콘텐츠·문화
  'commerce',      // 유통·커머스
  'service',       // 서비스
  'food',          // 식품·외식
  'construction',  // 건설·부동산
  'etc',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

/** 화면에 쓸 한글 이름 — 위 `APPLICANT_TYPE_LABELS` 와 같은 이유로 여기 둔다 */
export const INDUSTRY_LABELS: Record<Industry, string> = {
  it: 'IT·SW',
  manufacturing: '제조',
  bio: '바이오·의료',
  content: '콘텐츠·문화',
  commerce: '유통·커머스',
  service: '서비스',
  food: '식품·외식',
  construction: '건설·부동산',
  etc: '기타',
};

/* ────────────── 판정 캐시 ────────────── */

/**
 * 신청 가능 대상.
 * "기업만 받는 공고에 개인이 신청할 수 없다"를 구조로 표현한 것.
 */
export const APPLICANT_TYPES = [
  'preliminary', // 예비창업자 (사업자등록 전)
  'individual',  // 개인사업자
  'corporate',   // 법인사업자
] as const;
export type ApplicantType = (typeof APPLICANT_TYPES)[number];

/**
 * 화면에 쓸 한글 이름.
 *
 * 값(코드)과 이름을 **한 곳에** 둔다. 화면마다 따로 적어 두면 한쪽만 고쳐져서
 * 같은 회원이 어떤 화면에서는 "개인사업자", 다른 화면에서는 "individual" 로
 * 보인다(실제로 관리자 화면에서 그렇게 나왔다).
 */
export const APPLICANT_TYPE_LABELS: Record<ApplicantType, string> = {
  preliminary: '일반 (사업자등록 전)',
  individual: '개인사업자',
  corporate: '법인사업자',
};

/** 접수 주기 — 대출·정책자금은 상시이거나 매월 반복된다 */
export const RECURRENCES = ['once', 'monthly', 'always'] as const;
export type Recurrence = (typeof RECURRENCES)[number];

/** 2단계(LLM) 판정 상태 */
export const SOFT_CHECK_STATUSES = [
  'pending',   // 아직 검사 안 함 — 배치 대상
  'passed',    // 통과
  'failed',    // 미충족
  'needs_user',// 사용자 확인 필요 (시스템이 알 수 없는 조건)
  'skipped',   // 하드 필터에서 이미 탈락 → 검사 불필요
] as const;
export type SoftCheckStatus = (typeof SOFT_CHECK_STATUSES)[number];

/* ────────────── 회원 등급 ────────────── */

/**
 * 요금 등급.
 *
 * 무료 하나에 유료 둘, 모두 월 구독이다. 값(코드)은 결제·정산에 그대로 쓰이는
 * 것이라 **바꾸면 지난 기록과 어긋난다.** 화면에 보이는 이름은 아래
 * `MEMBER_GRADE_LABELS` 만 고치면 되고, 값은 건드리지 않는다.
 */
export const MEMBER_GRADES = ['free', 'basic', 'pro'] as const;
export type MemberGrade = (typeof MEMBER_GRADES)[number];

export const MEMBER_GRADE_LABELS: Record<MemberGrade, string> = {
  free: '무료',
  basic: '베이직',
  pro: '프로',
};

/** 등급을 고를 때 옆에 붙일 한 줄 — 관리자가 무엇을 주는지 알고 바꾸게 */
export const MEMBER_GRADE_NOTES: Record<MemberGrade, string> = {
  free: '기본 기능',
  basic: '월 구독 · 1단계',
  pro: '월 구독 · 2단계',
};
