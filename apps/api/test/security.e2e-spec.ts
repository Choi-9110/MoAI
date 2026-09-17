import {
  call, callJson, createUser, removeUser, serverUp, type TestUser,
} from './helpers';

/**
 * 워크스페이스 격리.
 *
 * **이 파일이 가장 중요하다.** 로그인만 하면 주소의 워크스페이스 번호를
 * 바꿔 남의 관심 공고·기업 정보·IR 덱을 그대로 볼 수 있었다. 실제로 다른
 * 회사의 자료가 나왔다.
 *
 * 가드 한 곳에서 막았지만, 그 한 줄이 지워지면 전부 다시 열린다. 그래서
 * 여기서 지킨다 — **새 경로를 추가할 때마다 이 목록에 한 줄 늘려야 한다.**
 */
describe('워크스페이스 격리', () => {
  let me: TestUser;
  let other: TestUser;
  let up = false;

  beforeAll(async () => {
    up = await serverUp();
    if (!up) return;
    me = await createUser('iso-me');
    other = await createUser('iso-other');
  }, 120_000);

  afterAll(async () => {
    if (!up) return;
    await removeUser(me).catch(() => {});
    await removeUser(other).catch(() => {});
  }, 60_000);

  const skip = () => {
    if (!up) console.warn('서버가 없어 건너뜁니다 (pnpm dev 로 띄우세요)');
    return !up;
  };

  /* 주소의 `:tenantId` 로 대상을 받는 경로들 */
  const PATHS = (id: string) => [
    `/saved-grants/${id}`,
    `/saved-grants/ids/${id}`,
    `/company-profiles/default/${id}`,
    `/ir-decks/${id}`,
    `/procurement/bids/${id}`,
    `/procurement/drafts/${id}`,
  ];

  it('남의 워크스페이스는 403 이다', async () => {
    if (skip()) return;
    for (const path of PATHS(other.tenantId)) {
      const res = await call(me, path);
      expect({ path, status: res.status }).toEqual({ path, status: 403 });
    }
  }, 120_000);

  it('내 워크스페이스는 그대로 된다', async () => {
    if (skip()) return;
    for (const path of PATHS(me.tenantId)) {
      const res = await call(me, path);
      /* 200 이거나 404(아직 자료가 없음) — 막히지만 않으면 된다 */
      expect({ path, blocked: res.status === 403 }).toEqual({
        path,
        blocked: false,
      });
    }
  }, 120_000);

  it('질의 문자열로 남의 것을 물어도 막는다', async () => {
    if (skip()) return;
    const res = await call(me, `/policy-briefs?tenantId=${other.tenantId}`);
    expect(res.status).toBe(403);
  }, 60_000);

  it('로그인 없이는 아무것도 못 본다', async () => {
    if (skip()) return;
    for (const path of PATHS(me.tenantId)) {
      const res = await call(null, path);
      expect({ path, status: res.status }).toEqual({ path, status: 401 });
    }
  }, 120_000);

  it('남의 자료를 고치거나 지울 수 없다', async () => {
    if (skip()) return;
    const zero = '00000000-0000-0000-0000-000000000000';

    const put = await call(
      me,
      `/saved-grants/${other.tenantId}/${zero}/outcome`,
      { method: 'PUT', body: JSON.stringify({ outcome: 'won' }) },
    );
    expect(put.status).toBe(403);

    const del = await call(me, `/ir-decks/${other.tenantId}/${zero}`, {
      method: 'DELETE',
    });
    expect(del.status).toBe(403);
  }, 60_000);

  it('형태가 아닌 워크스페이스 번호에 500 이 나지 않는다', async () => {
    if (skip()) return;
    /*
     * 예전에는 `?tenantId=abc` 로 서버가 터졌다. 개인화는 곁가지라
     * 못 읽으면 개인화만 건너뛰면 되는데, 글 자체를 못 보게 만들었다.
     */
    const { status } = await callJson(me, '/policy-briefs?tenantId=abc');
    expect(status).toBeLessThan(500);
  }, 60_000);
});
