import type {
  CalendarItem, CalendarMonth, CompanyProfile, ConditionAnswer, ConfidenceLevel,
  BriefItem, GrantCategory, GrantOutcome, GrantStage, ModooAnswers, PlanDoc, PlanFormat, PlanProgress, PosterDoc,
  ProgressEvent, ProjectTrack, QuestionType, SectionKey, SlotChange, SlotNote,
  TemplateKind, BidNotice, BidBrief, BidAnswer,
} from '@moai/shared';

/**
 * 같은 출처의 `/api` 를 부른다.
 *
 * next.config.ts 가 이걸 API 서버로 넘겨준다. 브라우저가 4000 번을 직접
 * 부르지 않으므로, 밖에 공개할 때 포트를 하나만 열면 된다.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? '/api';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface Project {
  id: string;
  tenantId: string;
  userId: string;
  templateId: string;
  templateKind: TemplateKind;
  /** 어느 트랙으로 시작했는가 */
  track: ProjectTrack;
  /** 모두의창업 지원서 답변 — 트랙이 modoo 일 때만 */
  modooAnswers: ModooAnswers | null;
  title: string;
  idea: string;
  status: string;
  /** 손으로 정한 목록 순서. 아직 손대지 않았으면 null */
  sortOrder: number | null;
  answeredCount: number;
  lastGeneratedAt: string | null;
  createdAt: string;
}

export interface Question {
  id: string;
  templateId: string;
  order: number;
  key: string;
  label: string;
  hint: string | null;
  type: QuestionType;
  required: boolean;
  options: string[] | null;
  targetSection: SectionKey | null;
}

export interface Answer {
  id: string;
  projectId: string;
  questionId: string | null;
  questionKey: string;
  value: string | number | string[];
  skipped: boolean;
}

export interface Section {
  id: string;
  projectId: string;
  sectionKey: SectionKey;
  content: string;
  confidence: ConfidenceLevel;
  openQuestions: string[];
  version: number;
  isEdited: boolean;
}

export interface Template {
  id: string;
  kind: TemplateKind;
  name: string;
  description: string | null;
  sectionKeys: SectionKey[];
  isActive: boolean;
}

/**
 * 로그인 토큰을 붙이기 위한 통로.
 *
 * auth 모듈이 세션을 들고 있는데, api 모듈이 auth 를 부르면 서로 물고 물린다.
 * 그래서 auth 쪽에서 토큰을 꺼내는 함수를 여기 꽂아 준다.
 */
let tokenSource: (() => Promise<string | null>) | null = null;

export function setTokenSource(fn: () => Promise<string | null>): void {
  tokenSource = fn;
}

/**
 * 세션이 끝났다고 알리는 통로.
 *
 * **왜 한 곳에서 알리나.** 토큰이 만료되면 어느 화면에서 무엇을 하든 401 이
 * 떨어진다. 그걸 부르는 쪽마다 따로 처리하면 반드시 빠뜨리는 데가 생긴다 —
 * 실제로 알림 종이 그랬다. 1분마다 조용히 401 을 받으면서 **화면에는
 * 아무것도 뜨지 않았고**, 그 상태로 며칠이 지났다. 요청 기록을 켜고 나서야
 * 드러났다.
 *
 * 그래서 401 은 여기 한 곳에서 잡아 위로 알린다. 받는 쪽(auth)이 로그아웃
 * 시키므로, 새 화면을 만들 때 이 처리를 따로 할 일이 없다.
 *
 * `tokenSource` 와 같은 이유로 함수를 꽂아 준다 — api 가 auth 를 직접
 * 부르면 서로 물고 물린다.
 */
let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(fn: () => void): void {
  onSessionExpired = fn;
}

/**
 * 인증 헤더만 따로.
 *
 * 파일을 내려받을 때 쓴다 — 그때는 `request` 를 못 쓴다(JSON 이 아니라
 * 바이너리라서). 링크(`<a download>`)로도 안 된다. 링크는 헤더를 못 붙여서
 * 로그인이 걸린 주소에서는 401 이 떨어진다.
 */
export async function authHeader(): Promise<Record<string, string>> {
  const token = tokenSource ? await tokenSource() : null;
  return token ? { authorization: `Bearer ${token}` } : {};
}

/**
 * 서버가 잠깐 자리를 비웠을 때 얼마씩 기다렸다 다시 물어볼 것인가.
 *
 * 서버를 다시 띄우는 데 10초 안팎이 걸린다. 1 → 3 → 6 초면 그 사이를
 * 덮는다. 사용자 눈에는 그냥 조금 느린 것으로 보인다.
 */
const RETRY_WAITS_MS = [1_000, 3_000, 6_000];

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  /*
   * FormData 를 보낼 때는 content-type 을 직접 넣으면 안 된다.
   * 브라우저가 경계 문자열(boundary)까지 붙여 만들어야 서버가 파싱할 수 있다.
   */
  const isForm = init?.body instanceof FormData;
  const method = (init?.method ?? 'GET').toUpperCase();

  /*
   * **읽기만 하는 요청은 마음 놓고 다시 보낼 수 있다.**
   *
   * 쓰는 요청(POST 등)은 조심해야 한다 — 서버까지 갔는데 답만 못 받은
   * 것일 수도 있어서, 다시 보내면 같은 일이 두 번 일어난다. 그래서
   * 쓰는 요청은 **아예 나가지도 못한 경우**(연결 거부)만 다시 보낸다.
   */
  const isRead = method === 'GET' || method === 'HEAD';

  for (let attempt = 0; ; attempt += 1) {
    const token = tokenSource ? await tokenSource() : null;
    let res: Response;

    try {
      res = await fetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          ...(isForm ? {} : { 'content-type': 'application/json' }),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...(init?.headers ?? {}),
        },
        cache: 'no-store',
      });
    } catch (err) {
      /*
       * 여기로 오면 요청이 **서버에 닿지도 못했다.** 서버가 다시 뜨는
       * 중이거나 네트워크가 끊긴 것이다. 어느 쪽이든 다시 보내도 안전하다.
       */
      if (attempt < RETRY_WAITS_MS.length) {
        await sleep(RETRY_WAITS_MS[attempt]);
        continue;
      }
      throw new Error(
        '서버에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.',
        { cause: err },
      );
    }

    /*
     * 토큰이 만료됐다.
     *
     * 알리기만 하고 여기서 화면을 옮기지는 않는다 — 무엇을 보여 줄지는
     * auth 가 정한다. 로그인하지 않은 사람에게도 401 은 떨어지므로
     * (로그인이 걸린 주소를 그냥 눌렀을 때), 받는 쪽에서 **세션이 있었을
     * 때만** 만료로 다룬다.
     */
    if (res.status === 401) {
      onSessionExpired?.();
      throw new Error('로그인이 필요합니다. 다시 로그인해 주세요.');
    }

    /*
     * 502·503·504 는 앞단(프록시)이 뒷단에 못 닿았다는 뜻이다. 서버를
     * 다시 띄우는 몇 초 동안 나온다. 읽기 요청이면 조용히 다시 묻는다.
     */
    if (isRead && res.status >= 502 && attempt < RETRY_WAITS_MS.length) {
      await sleep(RETRY_WAITS_MS[attempt]);
      continue;
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as {
        message?: string | string[];
      };
      const msg = Array.isArray(body.message)
        ? body.message.join(', ')
        : body.message;
      throw new Error(msg ?? `요청 실패 (${res.status})`);
    }
    return res.json() as Promise<T>;
  }
}

/** 백그라운드 작업이 끝났다는 알림 */
export interface Notice {
  projectId: string;
  kind: 'poster' | 'plan' | 'bids';
  ok: boolean;
  title: string;
  message: string;
  finishedAt: string | null;
}

export const notificationApi = {
  /** 끝났는데 아직 안 알린 것 */
  pending: (tenantId: string) =>
    request<Notice[]>(`/notifications?tenantId=${encodeURIComponent(tenantId)}`),

  /** 알렸다고 표시 — 이걸 해야 다음 차례에 또 뜨지 않는다 */
  ack: (tenantId: string, items: { projectId: string; kind: Notice['kind'] }[]) =>
    request<{ acked: number }>('/notifications/ack', {
      method: 'POST',
      body: JSON.stringify({ tenantId, items }),
    }),
};

/* ────────────── 회원 관리 (관리자 전용) ────────────── */

export interface MemberRow {
  id: string;
  /** 가린 이메일 — 목록에는 이것만 내려온다 (adm**@drevv.co.kr) */
  maskedEmail: string;
  /** 가운데를 가린 이름 — 목록에는 이것만 나온다 */
  maskedName: string;
  joinedAt: string;
  grade: string;
  isAdmin: boolean;
  isActive: boolean;
}

export interface MemberDetail extends MemberRow {
  /** 가리지 않은 것 — 상세에서만 내려온다 */
  email: string;
  name: string | null;
  tenantId: string;
  company: {
    name: string | null;
    stage: string | null;
    industry: string | null;
    region: string | null;
    foundedAt: string | null;
    employees: number | null;
    revenue: string | null;
  } | null;
  stats: { projects: number; plansDone: number; lastActiveAt: string | null };
}

export const adminApi = {
  members: (q = '') =>
    request<Page<MemberRow>>(
      `/admin/members?limit=200${q ? `&q=${encodeURIComponent(q)}` : ''}`,
    ),
  member: (id: string) => request<MemberDetail>(`/admin/members/${id}`),

  /** 회원 지우기 — 되돌릴 수 없다 */
  removeMember: (id: string) =>
    request<{
      deleted: true;
      alsoRemovedWorkspace: boolean;
      /** Supabase 로그인 계정까지 지웠는가 */
      authRemoved: boolean;
      email: string;
    }>(
      `/admin/members/${id}`,
      { method: 'DELETE' },
    ),

  /** 등급 바꾸기 — 바뀐 회원 정보를 돌려받는다 */
  setGrade: (id: string, grade: string) =>
    request<MemberDetail>(`/admin/members/${id}/grade`, {
      method: 'PATCH',
      body: JSON.stringify({ grade }),
    }),
};

export const api = {
  /* 프로젝트 */
  listProjects: () => request<Page<Project>>('/projects?limit=50'),
  getProject: (id: string) => request<Project>(`/projects/${id}`),
  /** 제목·아이디어 같은 것 고치기 */
  updateProject: (id: string, body: Partial<Pick<Project, 'title' | 'idea'>>) =>
    request<Project>(`/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  createProject: (body: Partial<Project>) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(body) }),
  deleteProject: (id: string) =>
    request<{ deleted: true }>(`/projects/${id}`, { method: 'DELETE' }),

  /**
   * 목록 순서 저장.
   *
   * 옮긴 것만이 아니라 **화면에 보이는 순서 전체**를 보낸다.
   * 서버가 이 배열 그대로 0,1,2… 를 다시 매긴다.
   */
  reorderProjects: (ids: string[]) =>
    request<{ ok: true }>('/projects/reorder', {
      method: 'PATCH',
      body: JSON.stringify({ ids }),
    }),

  /* 양식 · 질의 */
  listTemplates: () => request<Page<Template>>('/templates?limit=50'),
  listQuestions: () => request<Page<Question>>('/questions?limit=100'),

  /* 응답 */
  listAnswers: () => request<Page<Answer>>('/answers?limit=100'),
  saveAnswer: (body: Partial<Answer>) =>
    request<Answer>('/answers', { method: 'POST', body: JSON.stringify(body) }),

  /* 섹션 */
  listSections: () => request<Page<Section>>('/sections?limit=100'),

  /* 생성 */
  status: () =>
    request<{ executors: Record<string, boolean>; sections: SectionKey[] }>(
      '/generation/status',
    ),
};

/**
 * 생성 진행 상황을 SSE 로 구독한다.
 * 반환된 함수를 호출하면 구독이 해제된다.
 */
export function subscribeGeneration(
  projectId: string,
  onEvent: (event: ProgressEvent) => void,
  onDone: () => void,
): () => void {
  const source = new EventSource(
    `${API_BASE}/generation/projects/${projectId}/stream`,
  );

  source.onmessage = (msg) => {
    if (msg.data === '[DONE]') {
      source.close();
      onDone();
      return;
    }
    try {
      onEvent(JSON.parse(msg.data) as ProgressEvent);
    } catch {
      // 파싱 불가 프레임은 무시한다.
    }
  };

  source.onerror = () => {
    source.close();
    onDone();
  };

  return () => source.close();
}

/* ────────────── 공고 캘린더 ────────────── */

export interface CalendarParams {
  year: number;
  month: number;
  tenantId?: string;
  profileId?: string;
  categories?: GrantCategory[];
  stages?: GrantStage[];
  eligibleOnly?: boolean;
}

export const calendarApi = {
  /** 월간 캘린더 — 마감일 기준 공고 배치 + 지원 가능 여부 */
  month: (params: CalendarParams) => {
    const qs = new URLSearchParams({
      year: String(params.year),
      month: String(params.month),
    });
    if (params.tenantId) qs.set('tenantId', params.tenantId);
    if (params.profileId) qs.set('profileId', params.profileId);
    if (params.categories?.length) qs.set('categories', params.categories.join(','));
    if (params.stages?.length) qs.set('stages', params.stages.join(','));
    if (params.eligibleOnly) qs.set('eligibleOnly', 'true');
    return request<CalendarMonth>(`/grants/calendar?${qs.toString()}`);
  },

  /**
   * 로드맵 한 칸에 딸린, 지금 낼 수 있는 공고.
   *
   * 금액이 큰 것부터 몇 개만 온다 — 전부 늘어놓으면 목록이 되고, 그건
   * 지원사업 화면이 이미 하는 일이다.
   */
  relatedToStep: (params: {
    keyword?: string;
    categories?: GrantCategory[];
    tenantId?: string;
    limit?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params.keyword) qs.set('keyword', params.keyword);
    if (params.categories?.length) qs.set('categories', params.categories.join(','));
    if (params.tenantId) qs.set('tenantId', params.tenantId);
    if (params.limit) qs.set('limit', String(params.limit));
    return request<CalendarItem[]>(`/grants/related?${qs.toString()}`);
  },

  /**
   * 어제 새로 올라온 공고.
   *
   * 기간을 함께 받는다 — "어제"라고만 하면 언제부터인지 알 수 없다.
   */
  fresh: (tenantId?: string) => {
    const qs = new URLSearchParams();
    if (tenantId) qs.set('tenantId', tenantId);
    return request<{
      from: string | null;
      to: string | null;
      total: number;
      matched: number;
      items: CalendarItem[];
    }>(`/grants/fresh${qs.toString() ? `?${qs}` : ''}`);
  },

  /** 마감 임박 공고 */
  upcoming: (days = 14, tenantId?: string) => {
    const qs = new URLSearchParams({ days: String(days) });
    if (tenantId) qs.set('tenantId', tenantId);
    return request<CalendarItem[]>(`/grants/calendar/upcoming?${qs.toString()}`);
  },

  /** 공고 1건 판정 상세 */
  eligibility: (grantId: string, tenantId?: string) => {
    const qs = new URLSearchParams();
    if (tenantId) qs.set('tenantId', tenantId);
    return request<CalendarItem>(`/grants/${grantId}/eligibility?${qs.toString()}`);
  },

  /** 공고 1건 — 사업 시작 화면에서 원문 링크를 보여줄 때 */
  grant: (grantId: string) =>
    request<{
      id: string;
      title: string;
      agency: string;
      applyEndAt: string | null;
      sourceUrl: string | null;
    }>(`/grants/${grantId}`),

  /** 테넌트 기본 기업 프로필 */
  defaultProfile: (tenantId: string) =>
    request<CompanyProfile | null>(`/company-profiles/default/${tenantId}`),

  /**
   * 기업 정보 저장.
   *
   * 반드시 이 함수로 부를 것. 화면에서 fetch 를 직접 쓰면 로그인 토큰이
   * 붙지 않아 401 이 난다 — 실제로 그렇게 새어 나간 적이 있다.
   */
  saveProfile: (body: Record<string, unknown>, profileId?: string | null) =>
    request<CompanyProfile>(
      profileId ? `/company-profiles/${profileId}` : '/company-profiles',
      {
        method: profileId ? 'PATCH' : 'POST',
        // 수정할 때는 소속을 바꾸지 않는다.
        body: JSON.stringify(
          profileId ? { ...body, tenantId: undefined } : body,
        ),
      },
    ),
};

/** 사업 분석 — 하드 필터 스윕 + 로컬 판정 워커 호출 */
export interface AnalyzeResult {
  sweep: {
    scanned: number;
    hardPassed: number;
    hardFailed: number;
    skippedFresh: number;
  };
  worker: { ok: boolean; message?: string; result?: unknown };
}

export const analyzeApi = {
  run: (tenantId: string) =>
    request<AnalyzeResult>('/grants/eligibility/analyze', {
      method: 'POST',
      body: JSON.stringify({ tenantId }),
    }),
};

/* ────────────── 요약 한 장 ────────────── */

export interface ReviseResult {
  doc: PosterDoc;
  /** 무엇이 왜 바뀌었는지 — 요청한 칸과 따라 바뀐 칸을 구분해 준다 */
  changes: SlotChange[];
  costUsd?: number;
}

/** 요약 생성 상태 — 페이지를 떠났다 와도 이어서 볼 수 있게 서버가 들고 있다 */
export interface PosterState {
  status: 'idle' | 'running' | 'done' | 'failed';
  doc: PosterDoc | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  noticeFileName: string | null;
  /** 연결된 공고 — 원문을 보러 갈 수 있으면 채워진다 */
  grant: { id: string; title: string; sourceUrl: string | null } | null;
  /** 자동으로 찾아 묶은 경우의 근거. 직접 고른 경우엔 null */
  grantLink: { score: number; matchedBy: string } | null;
  /** 직전 재작성에서 바뀐 칸 */
  changes: SlotChange[] | null;
}

/** 공고 검색 결과 한 줄 */
export interface GrantOption {
  id: string;
  title: string;
  agency: string;
  applyEndAt: string | null;
  sourceUrl: string | null;
}

export const posterApi = {
  /**
   * 요약 생성 시작.
   *
   * 공고문은 선택이다. 없으면 특정 공고에 맞추지 않은 일반 초안이 나온다.
   * 곧바로 돌아오고 실제 생성은 서버 뒤에서 도니, 화면은 state 를 물어본다.
   */
  start: (projectId: string, notice?: File) => {
    const form = new FormData();
    if (notice) form.append('notice', notice);
    // FormData 를 보낼 때 content-type 을 직접 지정하면 경계 문자열이 빠진다.
    return request<PosterState>(`/projects/${projectId}/poster/start`, {
      method: 'POST',
      body: form,
      headers: {},
    });
  },

  /** 생성 상태 + 결과 */
  state: (projectId: string) =>
    request<PosterState>(`/projects/${projectId}/poster`),

  /** 공고 검색 — 자동으로 못 찾았을 때 직접 고른다 */
  searchGrants: (projectId: string, q: string) =>
    request<GrantOption[]>(
      `/projects/${projectId}/poster/grants/search?q=${encodeURIComponent(q)}`,
    ),

  /** 공고를 직접 묶는다. null 을 보내면 연결을 끊는다. */
  linkGrant: (projectId: string, grantId: string | null) =>
    request<PosterState>(`/projects/${projectId}/poster/grant`, {
      method: 'POST',
      body: JSON.stringify({ grantId }),
    }),

  /**
   * 보완 요청을 반영해 다시 만들기 **시작**.
   *
   * 곧바로 돌아온다. 문서 전체를 다시 쓰는 데 2분 가까이 걸려서
   * 응답을 붙잡고 있으면 중간의 프록시가 먼저 끊는다.
   * 끝났는지는 state 를 물어봐서 안다.
   */
  revise: (projectId: string, notes: SlotNote[]) =>
    request<PosterState>(`/projects/${projectId}/poster/revise`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    }),
};

/* ────────────── 사업계획서 ────────────── */

export interface PlanState {
  status: 'idle' | 'running' | 'done' | 'failed';
  doc: PlanDoc | null;
  progress: PlanProgress | null;
  error: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  templateName: string | null;
  /** 어떤 틀로 썼는가 */
  format: PlanFormat | null;
  /** 요약 한 장이 있어야 사업계획서를 쓸 수 있다 */
  hasPoster: boolean;
}

export const planApi = {
  /**
   * 작성 시작. 양식은 선택이다.
   *
   * 절 단위로 써 나가므로, 시작한 뒤에는 state 를 물어보면
   * 지금까지 쓴 것까지 볼 수 있다.
   */
  /**
   * 같은 요약으로 사업계획서를 하나 더 — 새 사업으로 갈라 낸다.
   *
   * 이름을 주지 않으면 서버가 `… v2` 를 붙인다.
   */
  duplicate: (projectId: string, title?: string, keepPoster = true) =>
    request<Project>(`/projects/${projectId}/plan/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ title, keepPoster }),
    }),

  start: (projectId: string, format: PlanFormat, template?: File) => {
    const form = new FormData();
    form.append('format', format);
    if (template) form.append('template', template);
    return request<PlanState>(`/projects/${projectId}/plan/start`, {
      method: 'POST',
      body: form,
      headers: {},
    });
  },

  state: (projectId: string) =>
    request<PlanState>(`/projects/${projectId}/plan`),
};

/* ────────────── 공고 조건 체크리스트 ────────────── */

export const conditionApi = {
  /**
   * 조건 답변 저장.
   *
   * 값에 null 을 넣으면 답을 지운다.
   * 조건 문장이 키라서, 한 번 답하면 같은 문구가 있는 다른 공고에도 반영된다.
   */
  answer: (
    profileId: string,
    answers: Record<string, ConditionAnswer | null>,
  ) =>
    request<CompanyProfile>(`/company-profiles/${profileId}/conditions`, {
      method: 'PATCH',
      body: JSON.stringify({ answers }),
    }),
};

/* ────────────── 관심 공고 (별표) ────────────── */

export const savedApi = {
  /** 별 토글 — 같은 공고를 다시 누르면 해제된다 */
  toggle: (tenantId: string, grantId: string, userId?: string) =>
    request<{ saved: boolean; keptForOutcome?: boolean }>('/saved-grants/toggle', {
      method: 'POST',
      body: JSON.stringify({ tenantId, grantId, ...(userId ? { userId } : {}) }),
    }),

  /** 저장한 공고 ID — 화면에서 별을 채울지 판단할 때 */
  ids: (tenantId: string) => request<string[]>(`/saved-grants/ids/${tenantId}`),

  /** 관심 공고 목록 (판정 포함) */
  list: (tenantId: string) => request<CalendarItem[]>(`/saved-grants/${tenantId}`),

  /**
   * 지원 결과 적기. `null` 이면 기록을 지운다.
   *
   * 별을 안 눌러 둔 공고여도 된다 — 서버가 함께 담는다.
   */
  setOutcome: (
    tenantId: string,
    grantId: string,
    outcome: GrantOutcome | null,
    userId?: string,
  ) =>
    request<{ outcome: GrantOutcome | null }>(
      `/saved-grants/${tenantId}/${grantId}/outcome`,
      {
        method: 'PUT',
        body: JSON.stringify({ outcome, ...(userId ? { userId } : {}) }),
      },
    ),

  /** 지원받은 사업들 — 중복 수혜 제한을 볼 때 */
  won: (tenantId: string) =>
    request<{ title: string; at: string | null }[]>(
      `/saved-grants/${tenantId}/won`,
    ),
};

/** 입찰 목록 응답 — DB 에 없고 부를 때마다 나라장터에서 받아 온다 */
export interface BidListResponse {
  items: BidNotice[];
  /** 그중 아직 마감되지 않은 건수 */
  openCount: number;
  /** 실제 호출 수 / 캐시로 때운 수 — 화면 아래 설명에 쓴다 */
  calls: number;
  cached: number;
  usedRegion: string | null;
  usedIndustries: string[];
}

export const procurementApi = {
  /**
   * 나라장터 입찰공고.
   *
   * 조건은 내 정보(지역·업종)에서 그대로 가져가므로 화면에서 따로 고를 것이
   * 없다. 업종을 안 골랐으면 서버가 아예 조회하지 않고 빈 목록을 준다.
   */
  /**
   * 입찰 목록.
   *
   * **곧바로 안 온다.** 업종마다 조달청에 물어야 해서 30초를 넘기기도 한다.
   * 그래서 `status: 'running'` 이 오면 아직 도는 중이라는 뜻이고,
   * `bidsStatus` 로 다 됐는지 물어보면 된다.
   */
  bids: (tenantId: string, days = 14, refresh = false) =>
    request<BidListResponse & { status?: 'running' | 'done' }>(
      `/procurement/bids/${tenantId}?days=${days}${refresh ? '&refresh=true' : ''}`,
    ),

  /** 조회가 끝났는지 */
  bidsStatus: (tenantId: string) =>
    request<{
      status: 'idle' | 'running' | 'done' | 'failed';
      elapsedSec: number;
      result: BidListResponse | null;
      error: string | null;
    }>(`/procurement/bids/${tenantId}/status`),

  /**
   * 공고 읽어주기 — 첨부(제안요청서)를 풀어 준비할 것을 뽑는다.
   *
   * 공고를 통째로 넘긴다. 목록이 DB 가 아니라 캐시에 있어 번호만으로는
   * 서버가 되찾을 수 없기 때문이다.
   */
  /**
   * 공고 읽기 **시작**.
   *
   * 결과를 기다리지 않는다 — 읽는 데 1~3분이 걸리는데 그동안 요청을 붙잡고
   * 있으면 중간 프록시가 먼저 끊어 500 이 난다. 진행 상황은 `draft` 로
   * 물어본다.
   */
  startBrief: (tenantId: string, notice: BidNotice) =>
    request<{ status: string }>(`/procurement/brief/${tenantId}`, {
      method: 'POST',
      body: JSON.stringify(notice),
    }),

  /* ── 준비 메모 ── */

  /** 준비 중인 공고들 — 목록에서 "이어보기" 로 쓴다 */
  drafts: (tenantId: string) =>
    request<BidDraft[]>(`/procurement/drafts/${tenantId}`),

  /** 공고 하나의 메모. 아직 안 연 공고면 null 이다. */
  draft: (tenantId: string, bidNo: string) =>
    request<BidDraft | null>(`/procurement/drafts/${tenantId}/${bidNo}`),

  /** 저장 — 넘긴 항목만 덮어쓴다 */
  saveDraft: (
    tenantId: string,
    bidNo: string,
    patch: {
      notice?: BidNotice;
      brief?: BidBrief | null;
      answers?: BidAnswer[];
      plannedPrice?: number | null;
      starred?: boolean;
    },
  ) =>
    request<BidDraft>(`/procurement/drafts/${tenantId}/${bidNo}`, {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
};

/** 서버에 저장된 입찰 준비 메모 */
export interface BidDraft {
  id: string;
  bidNo: string;
  notice: BidNotice;
  brief: BidBrief | null;
  answers: BidAnswer[];
  plannedPrice: string | null;
  briefStatus: 'idle' | 'running' | 'done' | 'failed';
  briefError: string | null;
  starred: boolean;
  updatedAt: string;
}

/* ────────────── IR 덱 보관함 ────────────── */

export interface IrDeck {
  id: string;
  name: string;
  memo: string | null;
  fileName: string;
  fileSize: number;
  mimeType: string | null;
  hasThumb: boolean;
  createdAt: string;
  updatedAt: string;
}

export const irDeckApi = {
  list: (tenantId: string) => request<IrDeck[]>(`/ir-decks/${tenantId}`),

  /**
   * 올리기.
   *
   * `FormData` 를 쓰므로 `Content-Type` 을 우리가 정하면 안 된다 —
   * 경계 문자열(boundary)이 빠져 서버가 못 읽는다. 브라우저가 붙이게 둔다.
   */
  upload: (
    tenantId: string,
    input: { file: File; thumb?: File | null; name: string; memo?: string },
  ) => {
    const form = new FormData();
    form.append('file', input.file);
    if (input.thumb) form.append('thumb', input.thumb);
    form.append('name', input.name);
    if (input.memo) form.append('memo', input.memo);
    return request<IrDeck>(`/ir-decks/${tenantId}`, {
      method: 'POST',
      body: form,
    });
  },

  update: (tenantId: string, id: string, patch: { name?: string; memo?: string | null }) =>
    request<IrDeck>(`/ir-decks/${tenantId}/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  remove: (tenantId: string, id: string) =>
    request<{ ok: boolean }>(`/ir-decks/${tenantId}/${id}`, { method: 'DELETE' }),

  /**
   * 파일을 **바이트로** 받아 온다.
   *
   * `<img src>` 나 `<a download>` 로는 안 된다. 그 둘은 브라우저가 직접
   * 요청을 보내는데, 우리 인증 토큰은 자바스크립트가 헤더에 실어 주는
   * 것이라 거기 붙지 않는다. 그래서 401 이 오고, 이미지는 안 그려지고
   * 내려받기는 취소된다 — 화면에는 아무 말도 안 뜬 채로.
   */
  blob: async (tenantId: string, id: string, kind: 'file' | 'thumb') => {
    const token = tokenSource ? await tokenSource() : null;
    const res = await fetch(`${API_BASE}/ir-decks/${tenantId}/${id}/${kind}`, {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`파일을 가져오지 못했습니다 (${res.status})`);
    return res.blob();
  },
};

/**
 * 내려받기.
 *
 * 받아 온 바이트를 임시 주소로 만들어 눌러 준 다음 곧바로 반납한다.
 * 반납하지 않으면 그 사본이 탭이 닫힐 때까지 메모리에 남는다 — 100MB 짜리
 * 덱이면 그대로 100MB 다.
 */
export async function downloadIrDeck(
  tenantId: string,
  id: string,
  fileName: string,
): Promise<void> {
  const blob = await irDeckApi.blob(tenantId, id, 'file');
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ────────────── 정책 브리핑 ────────────── */

export interface BriefListItem {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  sourceUrl: string | null;
  /** 전체 변화 항목 수 */
  totalCount: number;
  /** 그중 나에게 해당하는 수 */
  matchedCount: number;
}

export interface BriefDetail {
  id: string;
  title: string;
  source: string;
  publishedAt: string;
  summary: string;
  sourceUrl: string | null;
  items: BriefItem[];
  /** 나에게 해당하는 항목 id — 화면에서 갈라 보여 준다 */
  matchedIds: string[];
  /** 무엇을 근거로 골랐는지 — 비어 있으면 "내 정보를 채우세요"로 안내한다 */
  basis: { stage: string | null; years: number | null; region: string | null };
}

export const briefApi = {
  list: (tenantId?: string) =>
    request<BriefListItem[]>(
      `/policy-briefs${tenantId ? `?tenantId=${tenantId}` : ''}`,
    ),
  latest: (tenantId?: string) =>
    request<BriefListItem | null>(
      `/policy-briefs/latest${tenantId ? `?tenantId=${tenantId}` : ''}`,
    ),
  detail: (id: string, tenantId?: string) =>
    request<BriefDetail>(
      `/policy-briefs/${id}${tenantId ? `?tenantId=${tenantId}` : ''}`,
    ),
};
