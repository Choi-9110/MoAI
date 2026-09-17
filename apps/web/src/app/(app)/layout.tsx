'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Notifications } from '@/components/notifications';
import { Sidebar } from '@/components/sidebar';
import { useAuth } from '@/lib/auth';

/** 로그인 이후 화면들의 공통 셸 — 좌측 메뉴 + 본문 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  /** 좁은 화면에서만 쓰는 메뉴 서랍 */
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (ready && !session) router.replace('/login');
  }, [ready, session, router]);

  // 메뉴를 골라 넘어갔으면 서랍은 닫혀야 한다.
  useEffect(() => {
    setNavOpen(false);
  }, [pathname]);

  if (!ready || !session) {
    return (
      <div className="grid h-dvh place-items-center">
        <p className="text-sm text-grey-400">불러오는 중…</p>
      </div>
    );
  }

  return (
    <div className="flex h-dvh bg-grey-50">
      <Sidebar open={navOpen} onClose={() => setNavOpen(false)} />

      {/* min-w-0 이 없으면 긴 제목 하나가 본문 전체를 화면 밖으로 밀어낸다 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 좁은 화면 전용 상단 바 — 여기서만 메뉴를 연다 */}
        <header className="flex shrink-0 items-center gap-3 border-b border-grey-200 bg-white px-4 py-3 md:hidden">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="메뉴 열기"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-grey-600 hover:bg-grey-100"
          >
            <span className="text-lg leading-none">☰</span>
          </button>
          <span className="text-lg font-extrabold tracking-tight text-grey-900">
            MoAI
          </span>
        </header>

        {/* 자식이 h-full 을 쓰면 페이지 스크롤 없이 화면을 채울 수 있다 */}
        <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
          {children}
        </div>
      </div>

      {/*
        백그라운드로 도는 작업이 끝났는지 여기서 지켜본다.
        어느 화면에 있든 알림이 뜨도록 셸에 둔다.
      */}
      <Notifications />
    </div>
  );
}
