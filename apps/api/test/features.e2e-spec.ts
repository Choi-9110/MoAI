import {
  call, callJson, createUser, removeUser, serverUp, type TestUser,
} from './helpers';

/**
 * 기능별 계약.
 *
 * 화면이 기대하는 모양이 실제로 오는지 본다. **필드 하나가 빠지는 실수**가
 * 이 프로젝트에서 반복됐다 — 표에는 있는데 응답에 없어서, 화면은 조용히
 * 빈칸을 보여 주고 아무도 오류를 못 본다. 그런 것은 타입으로도 안 잡힌다.
 */
describe('기능 계약', () => {
  let me: TestUser;
  let up = false;
  const zero = '00000000-0000-0000-0000-000000000000';

  beforeAll(async () => {
    up = await serverUp();
    if (up) me = await createUser('feat');
  }, 120_000);

  afterAll(async () => {
    if (up) await removeUser(me).catch(() => {});
  }, 60_000);

  const skip = () => !up;

  /* ────────────── 정책 브리핑 ────────────── */

  describe('정책 브리핑', () => {
    it('목록에 개인화 개수가 함께 온다', async () => {
      if (skip()) return;
      const { status, body } = await callJson<
        { id: string; totalCount: number; matchedCount: number }[]
      >(me, `/policy-briefs?tenantId=${me.tenantId}`);

      expect(status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
      for (const b of body) {
        /* 목록에서 "나와 상관있나"를 알 수 있어야 열지 말지 정한다 */
        expect(typeof b.totalCount).toBe('number');
        expect(typeof b.matchedCount).toBe('number');
        expect(b.matchedCount).toBeLessThanOrEqual(b.totalCount);
      }
    }, 60_000);

    it('상세에 항목과 고른 근거가 온다', async () => {
      if (skip()) return;
      const list = await callJson<{ id: string }[]>(me, '/policy-briefs');
      if (!Array.isArray(list.body) || list.body.length === 0) return;

      const { status, body } = await callJson<{
        items: { id: string; label: string }[];
        matchedIds: string[];
        basis: Record<string, unknown>;
      }>(me, `/policy-briefs/${list.body[0].id}?tenantId=${me.tenantId}`);

      expect(status).toBe(200);
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.basis).toBeDefined();

      /* 항목 id 는 서버가 채워 준다 — 겹치면 엉뚱한 것이 골라진다 */
      const ids = body.items.map((i) => i.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of body.matchedIds) expect(ids).toContain(id);
    }, 60_000);

    it('없는 글은 404 다', async () => {
      if (skip()) return;
      const res = await call(me, `/policy-briefs/${zero}`);
      expect(res.status).toBe(404);
    }, 60_000);
  });

  /* ────────────── 지원 이력 ────────────── */

  describe('지원 이력', () => {
    it('없는 공고에는 기록하지 않는다', async () => {
      if (skip()) return;
      /*
       * 남겨도 목록에는 안 나온다(공고를 못 찾아 걸러진다). 그러면
       * "적었는데 안 보인다"가 되고 표에는 아무도 못 보는 줄이 쌓인다.
       */
      const res = await call(me, `/saved-grants/${me.tenantId}/${zero}/outcome`, {
        method: 'PUT',
        body: JSON.stringify({ outcome: 'won' }),
      });
      expect(res.status).toBe(404);
    }, 60_000);

    it('없는 값은 400 이다', async () => {
      if (skip()) return;
      const res = await call(me, `/saved-grants/${me.tenantId}/${zero}/outcome`, {
        method: 'PUT',
        body: JSON.stringify({ outcome: '받았을지도' }),
      });
      expect(res.status).toBe(400);
    }, 60_000);

    it('기록을 남기면 관심 공고에 담기고, 별로 지워지지 않는다', async () => {
      if (skip()) return;

      const cal = await callJson<{
        days: { items: { grant: { id: string } }[] }[];
      }>(me, `/grants/calendar?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}`);

      const first = cal.body?.days?.flatMap((d) => d.items)?.[0]?.grant?.id;
      if (!first) return; // 이 달에 공고가 없으면 볼 것이 없다

      /* 별을 안 눌러도 결과를 적으면 담긴다 */
      const put = await call(me, `/saved-grants/${me.tenantId}/${first}/outcome`, {
        method: 'PUT',
        body: JSON.stringify({ outcome: 'won' }),
      });
      expect(put.status).toBe(200);

      const listed = await callJson<{ outcome: string | null }[]>(
        me,
        `/saved-grants/${me.tenantId}`,
      );
      expect(listed.body.some((x) => x.outcome === 'won')).toBe(true);

      /* 별을 눌러도 지워지지 않는다 — 기록이 함께 사라지면 안 된다 */
      const toggled = await callJson<{ saved: boolean; keptForOutcome?: boolean }>(
        me,
        '/saved-grants/toggle',
        {
          method: 'POST',
          body: JSON.stringify({ tenantId: me.tenantId, grantId: first }),
        },
      );
      expect(toggled.body.keptForOutcome).toBe(true);

      /* 삭제 경로도 같아야 한다 — 뒷문으로 지워지면 막은 의미가 없다 */
      const removed = await callJson<{ ok: boolean }>(
        me,
        `/saved-grants/${me.tenantId}/${first}`,
        { method: 'DELETE' },
      );
      expect(removed.body.ok).toBe(false);

      /* 기록을 지우면 그때는 빠진다 */
      await call(me, `/saved-grants/${me.tenantId}/${first}/outcome`, {
        method: 'PUT',
        body: JSON.stringify({ outcome: null }),
      });
      const after = await callJson<{ ok: boolean }>(
        me,
        `/saved-grants/${me.tenantId}/${first}`,
        { method: 'DELETE' },
      );
      expect(after.body.ok).toBe(true);
    }, 180_000);
  });

  /* ────────────── 공고 필터 ────────────── */

  describe('공고 필터', () => {
    const now = new Date();
    const ym = `year=${now.getFullYear()}&month=${now.getMonth() + 1}`;

    it('없는 값은 400 으로 막는다', async () => {
      if (skip()) return;
      for (const q of ['stages=없는단계', 'categories=없는유형']) {
        const res = await call(me, `/grants/calendar?${ym}&${q}`);
        expect({ q, status: res.status }).toEqual({ q, status: 400 });
      }
    }, 60_000);

    it('단계를 걸면 결과가 줄어든다', async () => {
      if (skip()) return;
      const all = await callJson<{ summary: { total: number } }>(
        me,
        `/grants/calendar?${ym}`,
      );
      const early = await callJson<{ summary: { total: number } }>(
        me,
        `/grants/calendar?${ym}&stages=early`,
      );
      expect(early.body.summary.total).toBeLessThanOrEqual(
        all.body.summary.total,
      );
    }, 120_000);

    it('단계와 유형을 함께 걸 수 있다', async () => {
      if (skip()) return;
      const res = await call(
        me,
        `/grants/calendar?${ym}&stages=early,any&categories=rnd,funding`,
      );
      expect(res.status).toBe(200);
    }, 120_000);

    it('공고에 지원 결과가 함께 실려 온다', async () => {
      if (skip()) return;
      const { body } = await callJson<{
        days: { items: Record<string, unknown>[] }[];
      }>(me, `/grants/calendar?${ym}&tenantId=${me.tenantId}`);

      const item = body?.days?.flatMap((d) => d.items)?.[0];
      if (!item) return;
      /* 빠뜨리기 쉬운 필드다 — 표에는 있는데 응답에 없던 일이 반복됐다 */
      expect(item).toHaveProperty('outcome');
      expect(item).toHaveProperty('saved');
    }, 120_000);
  });

  /* ────────────── IR 덱 ────────────── */

  describe('IR 덱 보관함', () => {
    /** 아주 작은 PDF — 내용은 중요하지 않다 */
    const pdf = () =>
      new Blob([new TextEncoder().encode('%PDF-1.4 테스트')], {
        type: 'application/pdf',
      });

    it('발표 자료가 아닌 것은 막는다', async () => {
      if (skip()) return;
      const form = new FormData();
      form.append('file', new Blob(['x']), 'bad.exe');
      const res = await call(me, `/ir-decks/${me.tenantId}`, {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(400);
    }, 60_000);

    it('파일 없이 올리면 막는다', async () => {
      if (skip()) return;
      const form = new FormData();
      form.append('name', '이름만');
      const res = await call(me, `/ir-decks/${me.tenantId}`, {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(400);
    }, 60_000);

    it('한글 이름으로 올리고 그대로 받는다', async () => {
      if (skip()) return;

      const form = new FormData();
      form.append('file', pdf(), '모아이 투자덱 v3.pdf');
      form.append('name', '투자용 v3');
      form.append('memo', '시드 라운드용');

      const made = await callJson<{ id: string; name: string; fileName: string }>(
        me,
        `/ir-decks/${me.tenantId}`,
        { method: 'POST', body: form },
      );
      expect(made.status).toBe(201);

      /*
       * multipart 는 글자를 latin1 로 읽어 넘긴다. 되돌리지 않으면 이름도
       * 파일명도 깨진 채로 저장되고, 내려받을 때까지 깨져 있다.
       */
      expect(made.body.name).toBe('투자용 v3');
      expect(made.body.fileName).toBe('모아이 투자덱 v3.pdf');

      /* 내려받기 — 파일명이 살아 있어야 한다 */
      const file = await call(me, `/ir-decks/${me.tenantId}/${made.body.id}/file`);
      expect(file.status).toBe(200);
      const disp = file.headers.get('content-disposition') ?? '';
      expect(decodeURIComponent(disp)).toContain('모아이 투자덱 v3.pdf');

      /* 뒷정리 */
      await call(me, `/ir-decks/${me.tenantId}/${made.body.id}`, {
        method: 'DELETE',
      });
    }, 120_000);

    it('긴 이름은 잘라서 저장한다 — DB 오류를 사용자에게 보이지 않는다', async () => {
      if (skip()) return;

      const form = new FormData();
      form.append('file', pdf(), 'deck.pdf');
      form.append('name', '가'.repeat(300));

      const made = await callJson<{ id: string; name: string }>(
        me,
        `/ir-decks/${me.tenantId}`,
        { method: 'POST', body: form },
      );
      expect(made.status).toBe(201);
      expect(made.body.name.length).toBe(200);

      await call(me, `/ir-decks/${me.tenantId}/${made.body.id}`, {
        method: 'DELETE',
      });
    }, 120_000);

    it('없는 덱은 404 다', async () => {
      if (skip()) return;
      const res = await call(me, `/ir-decks/${me.tenantId}/${zero}/file`);
      expect(res.status).toBe(404);
    }, 60_000);
  });
});
