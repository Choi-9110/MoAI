import 'dotenv/config';

/**
 * 돌고 있는 서버에 실제로 요청해서 확인한다.
 *
 * **왜 앱을 띄우지 않고 붙는가.** 이 서비스의 문제는 대부분 서비스 클래스가
 * 아니라 그 바깥에서 났다 — 인증 가드가 남의 워크스페이스를 걸러 주는지,
 * 파일 업로드에서 한글 이름이 살아남는지, 잘못된 값이 500 이 아니라 400 으로
 * 오는지. 앱을 모의로 띄우면 그 층이 통째로 빠진다.
 *
 * 그래서 `pnpm dev` 로 떠 있는 서버에 그대로 붙는다. 서버가 없으면 테스트는
 * 실패가 아니라 **건너뛴다** — 서버를 안 띄웠다는 이유로 빨간 줄이 뜨면
 * 사람이 곧 무시하게 된다.
 */
export const API = process.env.TEST_API_URL ?? 'http://localhost:4000/api';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

export interface TestUser {
  email: string;
  token: string;
  tenantId: string;
  userId: string;
}

/** 서버가 살아 있나 */
export async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(`${API}/policy-briefs`, {
      signal: AbortSignal.timeout(4000),
    });
    // 401 도 "떠 있음"이다 — 인증을 요구한다는 뜻이니까
    return res.status < 500;
  } catch {
    return false;
  }
}

/**
 * 테스트 전용 계정을 만든다.
 *
 * 실제 로그인 흐름을 그대로 탄다. 토큰을 손으로 만들면 가드가 하는 검사를
 * 건너뛰게 되어, 정작 확인하려던 것을 안 보게 된다.
 */
export async function createUser(tag: string): Promise<TestUser> {
  const email = `moai.test.${tag}@example.com`;
  const password = 'MoaiTest!2026';

  await deleteAuthUser(email);

  const made = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { name: `테스트 ${tag}` },
    }),
  });
  if (!made.ok) throw new Error(`계정을 못 만들었습니다: ${made.status}`);

  const tok = (await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      method: 'POST',
      headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    },
  ).then((r) => r.json())) as { access_token?: string };

  if (!tok.access_token) throw new Error('토큰을 못 받았습니다.');

  /* 우리 쪽 워크스페이스는 첫 요청에서 만들어진다 */
  const me = (await fetch(`${API}/auth/me`, {
    headers: { Authorization: `Bearer ${tok.access_token}` },
  }).then((r) => r.json())) as { tenantId?: string; userId?: string };

  /*
   * 여기서 막지 않으면 `undefined` 가 주소에 실려 나가고, 테스트는
   * 500 을 받아 놓고 "격리가 깨졌다"고 잘못 알린다. 실패의 원인을
   * 엉뚱한 곳에서 찾게 만드는 종류의 침묵이다.
   */
  if (!me.tenantId) {
    throw new Error(
      `워크스페이스를 못 받았습니다 (${tag}). 응답: ${JSON.stringify(me).slice(0, 120)}`,
    );
  }

  return {
    email,
    token: tok.access_token,
    tenantId: me.tenantId,
    userId: me.userId ?? '',
  };
}

/** 계정과 그 워크스페이스의 자료를 지운다 */
export async function removeUser(user: TestUser): Promise<void> {
  await deleteAuthUser(user.email);
}

async function deleteAuthUser(email: string): Promise<void> {
  const list = (await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?per_page=200`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  ).then((r) => r.json())) as { users?: { id: string; email: string }[] };

  const found = (list.users ?? []).find((u) => u.email === email);
  if (!found) return;

  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${found.id}`, {
    method: 'DELETE',
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
}

/** 로그인한 채로 부른다 */
export function call(
  user: TestUser | null,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...(user ? { Authorization: `Bearer ${user.token}` } : {}),
      ...(init.body && typeof init.body === 'string'
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(60_000),
  });
}

/** 응답 본문까지 함께 — 실패했을 때 무엇이 왔는지 봐야 한다 */
export async function callJson<T = unknown>(
  user: TestUser | null,
  path: string,
  init: RequestInit = {},
): Promise<{ status: number; body: T }> {
  const res = await call(user, path, init);
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* 본문이 JSON 이 아닐 수도 있다 — 파일 응답 등 */
  }
  return { status: res.status, body: body as T };
}
