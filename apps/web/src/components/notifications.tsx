'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { notificationApi } from '@/lib/api';
import type { Notice } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * 다 됐다고 알려 주는 것.
 *
 * 요약 한 장도 사업계획서도 백그라운드로 돈다 — 요청만 걸어 두고 다른
 * 페이지로 가도 계속 돌아간다. 문제는 **끝난 줄 모른다**는 것이다.
 * 지금은 돌아와서 새로고침해 봐야 "어 됐네" 하고 안다.
 *
 * 그래서 30초마다 물어본다. 밀어 넣는 방식(푸시)이 아닌 이유는, 이 서비스가
 * 로컬 PC 에서 도는 데다 알림을 받을 사람이 **지금 창을 열어 둔 사람**뿐이기
 * 때문이다. 푸시 인프라(서비스 워커·VAPID 키·구독 저장)를 세울 값을 치를
 * 만한 차이가 없다.
 *
 * 두 갈래로 알린다.
 * - 화면 안 토스트 — 창을 보고 있으면 이걸로 충분하다
 * - 브라우저 알림 — 다른 탭에 가 있어도 뜬다. 권한을 준 경우에만
 */

/** 물어보는 간격 — 절 하나에 1분 가까이 걸리므로 30초면 촘촘하다 */
const INTERVAL_MS = 30_000;

export function Notifications() {
  const { session, expired } = useAuth();
  const [shown, setShown] = useState<Notice[]>([]);

  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  /*
   * **숨어 있어도 계속 물어본다.**
   *
   * 처음에는 다른 탭을 보고 있을 때 요청을 아끼려고 건너뛰게 했는데,
   * 그러면 브라우저 알림이 존재할 이유가 없어진다 — 그건 "다른 탭에 있어도
   * 알려 주는 것"인데, 다른 탭에 있는 동안 묻지 않으면 돌아왔을 때에야
   * 뜬다. 그럴 거면 토스트만 있으면 된다.
   *
   * 아끼는 쪽도 실익이 없다. 30초에 한 번, 같은 PC 안의 서버에 보내는
   * 짧은 요청이다.
   */
  const poll = useCallback(async () => {
    if (!session?.tenantId || expired) return;

    try {
      /*
       * 인증이 붙은 클라이언트로 부른다. 맨 `fetch` 로 부르면 토큰이 없어
       * 401 이 떨어지고, 알림이 영영 안 뜬다 (실제로 그렇게 만들었다가 잡았다).
       */
      const items = await notificationApi.pending(session.tenantId);
      if (items.length === 0) return;

      setShown((prev) => {
        const seen = new Set(prev.map((n) => `${n.projectId}:${n.kind}`));
        return [...prev, ...items.filter((n) => !seen.has(`${n.projectId}:${n.kind}`))];
      });

      // 브라우저 알림은 권한을 준 경우에만. 조르지 않는다.
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const n of items) {
          new Notification(n.ok ? 'MoAI — 작업 완료' : 'MoAI — 작업 실패', {
            body: `${n.title}\n${n.message}`,
            tag: `${n.projectId}:${n.kind}`,
          });
        }
      }

      /*
       * 띄운 **뒤에** 확인 처리한다. 먼저 표시하면 그 사이에 창이 닫혔을 때
       * 알림이 통째로 사라진다.
       */
      await notificationApi.ack(
        session.tenantId,
        items.map((n) => ({ projectId: n.projectId, kind: n.kind })),
      );
    } catch {
      /*
       * 서버가 잠깐 죽어 있을 수 있다. 다음 차례에 다시 물어보면 된다.
       *
       * **토큰 만료(401)도 여기로 떨어지지만 여기서 다루지 않는다.** 그건
       * `lib/api.ts` 가 잡아 auth 로 올리고, auth 가 안내를 띄운 뒤
       * 로그아웃시킨다. 아래 effect 가 `expired` 를 보고 이 반복을 멈춘다.
       *
       * 예전에는 그 처리가 아무 데도 없어서, 토큰이 만료된 탭이 **1분마다
       * 조용히 401 을 받으며** 며칠을 돌았다. 화면에는 아무것도 뜨지 않아
       * 아무도 몰랐다.
       */
    }
  }, [session?.tenantId, expired]);

  useEffect(() => {
    /*
     * 세션이 끝났으면 아예 걸지 않는다. 걸어 두면 사용자가 안내를 읽는
     * 동안에도 계속 물어보게 된다 — 어차피 전부 401 로 떨어질 것들이다.
     */
    if (!session?.tenantId || expired) return;

    void poll();
    timer.current = setInterval(() => void poll(), INTERVAL_MS);

    // 돌아왔을 때는 다음 차례를 기다리지 않고 바로 한 번 더 확인한다.
    const onVisible = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timer.current) clearInterval(timer.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [session?.tenantId, expired, poll]);

  if (shown.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {shown.map((n) => (
        <div
          key={`${n.projectId}:${n.kind}`}
          className={`pointer-events-auto rounded-xl border bg-white p-4 shadow-lg ${
            n.ok ? 'border-grey-200' : 'border-danger-soft'
          }`}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 text-lg">{n.ok ? '✓' : '!'}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-grey-900">{n.title}</p>
              <p className="mt-0.5 text-xs text-grey-600">{n.message}</p>
              {/*
                가는 곳이 종류마다 다르다. 입찰은 프로젝트가 아니라 목록이라
                `projectId` 로 주소를 만들면 없는 곳으로 보내게 된다.
              */}
              <Link
                href={
                  n.kind === 'bids'
                    ? '/bids'
                    : n.kind === 'plan'
                      ? `/plans/${n.projectId}/document`
                      : `/plans/${n.projectId}`
                }
                onClick={() => setShown((prev) => prev.filter((x) => x !== n))}
                className="mt-2 inline-block text-xs font-semibold text-brand hover:underline"
              >
                보러 가기 →
              </Link>
            </div>
            <button
              onClick={() => setShown((prev) => prev.filter((x) => x !== n))}
              aria-label="알림 닫기"
              className="grid size-6 shrink-0 place-items-center rounded text-grey-400 hover:bg-grey-100"
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 브라우저 알림 권한 스위치.
 *
 * 처음 들어오자마자 권한을 물으면 대개 거절당하고, 한 번 거절하면 브라우저가
 * 다시는 안 물어본다. **사용자가 켜겠다고 눌렀을 때만** 요청한다.
 */
export function NotificationToggle() {
  const [state, setState] = useState<NotificationPermission | 'unsupported'>('default');

  useEffect(() => {
    if (typeof Notification === 'undefined') setState('unsupported');
    else setState(Notification.permission);
  }, []);

  if (state === 'unsupported') {
    return <p className="text-xs text-grey-500">이 브라우저는 알림을 지원하지 않아요.</p>;
  }

  if (state === 'granted') {
    return (
      <p className="text-xs text-grey-500">
        브라우저 알림이 켜져 있어요. 다른 탭에 있어도 작업이 끝나면 알려드려요.
      </p>
    );
  }

  if (state === 'denied') {
    return (
      <p className="text-xs text-grey-500">
        브라우저에서 알림을 막아 두었어요. 주소창 왼쪽 자물쇠에서 알림을 허용으로
        바꾸면 켤 수 있어요. (화면 안 알림은 그대로 떠요)
      </p>
    );
  }

  return (
    <button
      onClick={async () => setState(await Notification.requestPermission())}
      className="rounded-lg border border-grey-200 bg-white px-3 py-1.5 text-xs font-semibold text-grey-700 hover:bg-grey-50"
    >
      브라우저 알림 켜기
    </button>
  );
}
