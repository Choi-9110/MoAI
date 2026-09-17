'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CalendarBoard } from '@/components/calendar/calendar-board';
import { GrantList } from '@/components/calendar/grant-list';
import { Button } from '@/components/ui/button';
import { calendarApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { GrantCategory } from '@moai/shared';

type View = 'calendar' | 'list';

/**
 * 지원사업 화면.
 *
 * 캘린더 뷰는 **페이지 자체가 스크롤되지 않는다.**
 * 달력과 우측 목록이 한 화면에 들어오고, 스크롤은 목록 안에서만 일어난다.
 * 공고를 누르면 팝업으로 상세를 띄우므로 위치를 잃지 않는다.
 *
 * 목록 뷰는 성격이 반대라 (전부 펼쳐 놓고 훑는 곳) 페이지 스크롤을 허용한다.
 */
export default function CalendarPage() {
  /*
   * `useSearchParams` 는 Suspense 경계 안에서만 쓸 수 있다. 로드맵에서
   * "이 단계 공고 보기"로 넘어올 때 조건을 주소에 실어 보내므로 필요하다.
   */
  return (
    <Suspense fallback={null}>
      <CalendarPageInner />
    </Suspense>
  );
}

function CalendarPageInner() {
  const { session } = useAuth();
  const params = useSearchParams();

  /*
   * 로드맵에서 넘어온 조건.
   *
   * 주소로 받는 이유는 **그 링크를 그대로 다시 열 수 있어야** 해서다.
   * 화면 안의 상태로만 두면 뒤로 갔다 오는 순간 조건이 풀린다.
   */
  const fromUrl = params.get('categories');
  const initialCategories = fromUrl
    ? (fromUrl.split(',').filter(Boolean) as GrantCategory[])
    : [];

  const [view, setView] = useState<View>(
    params.get('view') === 'list' ? 'list' : 'calendar',
  );
  /**
   * 지원사업을 보는 사람인지. `null` 은 아직 확인 전이라 화면을 바꾸지 않는다 —
   * 잠깐이라도 "안 보신다" 가 스쳤다가 공고가 뜨면 깜빡인 것처럼 보인다.
   */
  const [wantsGrant, setWantsGrant] = useState<boolean | null>(null);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    void calendarApi
      .defaultProfile(session.tenantId)
      .then((p) => {
        if (!alive) return;
        const interests = p?.interests ?? [];
        setWantsGrant(
          interests.length === 0 ||
            interests.includes('grant') ||
            interests.includes('rnd'),
        );
      })
      .catch(() => setWantsGrant(true));
    return () => {
      alive = false;
    };
  }, [session]);
  const fixed = view === 'calendar';

  return (
    <main
      /*
        화면을 꽉 채우는 배치는 **넓은 화면에서만** 쓴다.
        폰에서 높이를 고정하면 6주짜리 격자가 손톱만 해져서 아무것도 못 읽는다.
        좁을 때는 그냥 아래로 흐르게 두고 페이지를 스크롤한다.
      */
      className={`mx-auto flex max-w-6xl flex-col px-4 sm:px-6 lg:px-8 ${
        fixed
          ? 'py-4 md:h-full md:min-h-0 md:overflow-hidden'
          : 'py-6 sm:py-8'
      }`}
    >
      <header
        className={`flex flex-wrap items-start justify-between gap-4 ${
          fixed ? 'mb-2.5' : 'mb-4'
        }`}
      >
        <div>
          <h1
            className={`font-bold tracking-tight text-grey-900 ${
              fixed ? 'text-[22px]' : 'text-[26px]'
            }`}
          >
            지원사업
          </h1>
          {/*
            달력에서는 설명 줄을 접는다. 여기서 두 줄을 쓰면 그만큼 달력이
            아래로 밀려 마지막 주와 "더보기" 가 화면 밖으로 나간다.
            목록 화면에는 세로 여유가 있어 그대로 둔다.
          */}
          {!fixed && (
            <p className="mt-1 text-sm text-grey-600">
              마감일에 맞춰 배치하고, 우리 회사가 지원할 수 있는지 함께 표시합니다.
            </p>
          )}
        </div>

        {/* 뷰 전환 */}
        <div className="flex rounded-xl bg-grey-100 p-1">
          {(
            [
              { key: 'calendar', label: '캘린더' },
              { key: 'list', label: '목록' },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setView(t.key)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                view === t.key
                  ? 'bg-white text-grey-900 shadow-sm'
                  : 'text-grey-500 hover:text-grey-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      {/*
        지원사업을 끈 사람에게는 공고를 보여 주지 않는다.

        메뉴만 숨기면 주소로 들어올 수 있고, 그때 자기와 상관없는 공고가
        가득 뜨면 설정이 안 먹은 것처럼 보인다.
      */}
      {wantsGrant === false ? (
        <div className="grid flex-1 place-items-center py-16">
          <div className="max-w-md text-center">
            <p className="text-base font-bold text-grey-900">
              지원사업은 보지 않도록 해두셨어요
            </p>
            <p className="mt-2 text-sm leading-relaxed text-grey-600">
              내 정보에서 “정부 지원사업”을 켜면 여기에 공고가 나옵니다.
            </p>
            <Link href="/profile" className="mt-4 inline-block">
              <Button variant="brand">내 정보로 가기</Button>
            </Link>
          </div>
        </div>
      ) : fixed ? (
        <div className="min-h-0 flex-1">
          <CalendarBoard
            initialCategories={initialCategories}
            tenantId={session?.tenantId}
            withSidePanel
            fitHeight
            compact
          />
        </div>
      ) : (
        <GrantList
          tenantId={session?.tenantId}
          initialCategories={initialCategories}
        />
      )}
    </main>
  );
}
