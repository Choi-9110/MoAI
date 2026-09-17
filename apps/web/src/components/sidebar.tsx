'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BriefsModal } from '@/components/briefs/briefs-modal';
import { NoticeGuide } from '@/components/guide/notice-guide';
import { calendarApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface MenuItem {
  label: string;
  href: string;
  icon: string;
  soon?: boolean;
}

/**
 * 입찰 메뉴는 **켠 사람에게만** 보인다.
 *
 * 예비창업자나 기술직 1인 사업자에게 입찰은 평생 안 쓸 메뉴다. 항상 띄워
 * 두면 "나랑 상관없는 것"이 매 화면에 남는다. 내 정보에서 켜야 나타난다.
 */
const BID_ITEM: MenuItem = { label: '공공 입찰', href: '/bids', icon: '◈' };

/**
 * 입찰 제안서는 **사업계획서와 나란히 둔다.**
 *
 * 둘 다 "쓰는 것"이지만 출발이 반대다 — 사업계획서는 내 아이템에서,
 * 제안서는 공고의 과업에서 시작한다. 그래도 사람이 찾는 자리는 같아서
 * 서류 작성 아래에 붙인다.
 */
const BID_DOC_ITEM: MenuItem = {
  label: '입찰 제안서',
  href: '/bids/proposals',
  icon: '◪',
};

/** 좌측 메뉴 — 기획 문서의 기능 정의에서 도출 */
const GROUPS: { title: string; items: MenuItem[] }[] = [
  {
    /*
     * 첫 묶음의 이름은 **회사 이름으로 바뀐다**(`companyName`).
     * 여기 적힌 `지원사업` 은 이름을 아직 모를 때 쓰는 값이다 — 내 일이
     * 모인 자리라는 것이 이름으로 드러나는 편이 낫다.
     */
    title: '지원사업',
    items: [
      { label: '대시보드', href: '/dashboard', icon: '▤' },
      /*
       * 로드맵이 목록보다 앞이다. "내가 어디쯤인지"를 먼저 보고 그다음
       * "지금 뭐가 열렸는지"를 보는 순서가 실제로 사람이 밟는 순서다.
       */
      { label: '자금 로드맵', href: '/roadmap', icon: '◈' },
      { label: '지원사업', href: '/calendar', icon: '▦' },
      { label: '관심 공고', href: '/saved', icon: '☆' },
    ],
  },
  {
    title: '서류 작성',
    items: [
      { label: '사업 시작', href: '/plans/new', icon: '▧' },
      { label: '사업계획서', href: '/plans', icon: '◫' },
      /* 만들어 주는 것이 아니라 맡아 두는 곳이라, 서류 작성 아래 끝에 둔다 */
      { label: 'IR 덱 보관함', href: '/ir-decks', icon: '▣' },
    ],
  },
  {
    title: '설정',
    items: [
      { label: '내 정보', href: '/profile', icon: '⌂' },
      { label: '알림 설정', href: '/settings/alerts', icon: '◉' },
    ],
  },
  {
    /*
     * **읽을거리는 따로 묶는다.**
     *
     * 정책 브리핑과 가이드는 "지금 할 일"이 아니라 "알아 두면 좋은 것"이다.
     * 공고 옆에 섞어 두면 매일 눌러야 할 것처럼 보여, 정작 오늘 볼 것이
     * 무엇인지 흐려진다.
     */
    title: 'TIP',
    /*
     * **여기 것들은 화면을 옮기지 않는다.** 읽을거리라 보다가 덮는 것이고,
     * 페이지를 갈아 끼우면 하던 일의 자리를 잃는다. 그래서 항목이 아니라
     * 아래에서 버튼으로 놓는다.
     */
    items: [],
  },
];

/**
 * 지금 어느 메뉴에 있는지.
 *
 * 단순히 앞부분이 같은지로 보면 `/plans/new` 에서 "사업 시작"과
 * "사업계획서"가 **둘 다** 켜진다. `/plans` 도 앞부분이 같기 때문이다.
 * 그래서 맞는 것 중 **가장 긴 경로 하나만** 고른다.
 */
function activeHref(pathname: string, hrefs: string[]): string | null {
  const matched = hrefs.filter(
    (href) => pathname === href || pathname.startsWith(`${href}/`),
  );
  if (matched.length === 0) return null;
  return matched.reduce((a, b) => (b.length > a.length ? b : a));
}

/**
 * 좌측 메뉴.
 *
 * 화면이 좁으면 **서랍으로 접힌다.** 240px 짜리 고정 기둥이 늘 서 있으면
 * 폰에서는 본문에 150px 밖에 안 남는다. 데스크톱에서는 그대로 붙박이다.
 */
export function Sidebar({
  open = false, onClose,
}: {
  /** 모바일 서랍이 열려 있는가 */
  open?: boolean;
  onClose?: () => void;
} = {}) {
  const pathname = usePathname();
  const { session, signOut } = useAuth();

  /*
   * 화면에 보일 이름은 **기업 프로필 이름**이다.
   * 내 정보에서 "사업자가 있으면 상호, 없으면 편한 이름"으로 정한 그 값이라,
   * 여기와 대시보드가 계정 이름을 따로 쓰면 같은 사람이 두 이름으로 보인다.
   */
  const [companyName, setCompanyName] = useState<string | null>(null);
  /** 입찰을 켠 사람에게만 그 메뉴를 보여 준다 */
  const [wantsBid, setWantsBid] = useState(false);
  /**
   * 지원사업을 보는 사람인지.
   *
   * 아무것도 안 고른 사람은 지원사업을 보는 것으로 친다. 예전부터 쓰던
   * 사람들의 메뉴가 어느 날 갑자기 사라지면 안 되기 때문이다.
   */
  const [wantsGrant, setWantsGrant] = useState(true);

  /**
   * 고른 것만 메뉴에 남긴다.
   *
   * 입찰만 보는 시공업체에게 지원사업 메뉴가 남아 있으면, 눌러도 자기와
   * 상관없는 공고만 나온다. 반대로 지원사업만 보는 사람에게 입찰 메뉴는
   * 평생 안 쓸 자리다.
   *
   * **대시보드는 어느 쪽이든 남긴다.** 홈이라서 없애면 갈 곳이 사라진다.
   */
  const groups = useMemo(
    () =>
      GROUPS.map((g) => {
        /* 서류 작성 — 입찰을 보는 사람에게만 제안서 자리를 준다 */
        if (g.title === '서류 작성') {
          const items = wantsGrant
            ? [...g.items]
            : g.items.filter((i) => i.href !== '/plans/new');
          if (!wantsBid) return { ...g, items };

          /*
           * 제안서는 **보관함보다 앞**이다. 사업계획서·제안서는 만드는
           * 것이고 보관함은 맡아 두는 곳이라, 만드는 것끼리 붙여 둔다.
           */
          const at = items.findIndex((i) => i.href === '/ir-decks');
          const next = [...items];
          next.splice(at === -1 ? next.length : at, 0, BID_DOC_ITEM);
          return { ...g, items: next };
        }

        if (g.title !== '지원사업') return g;

        const items = wantsGrant
          ? [...g.items]
          : g.items.filter((i) => i.href === '/dashboard');

        return { ...g, items: wantsBid ? [...items, BID_ITEM] : items };
      }).filter(
        /*
         * 빈 묶음은 지운다. 다만 **TIP 은 남긴다** — 항목이 아니라 아래에서
         * 버튼으로 그리는 묶음이라, 여기서 지우면 통째로 사라진다.
         */
        (g) => g.items.length > 0 || g.title === 'TIP',
      ),
    [wantsBid, wantsGrant],
  );

  const current = activeHref(
    pathname,
    groups.flatMap((g) => g.items.map((i) => i.href)),
  );

  useEffect(() => {
    if (!session) {
      setCompanyName(null);
      setWantsBid(false);
      setWantsGrant(true);
      return;
    }
    let alive = true;
    void calendarApi
      .defaultProfile(session.tenantId)
      .then((p) => {
        if (!alive) return;
        setCompanyName(p?.name ?? null);
        const interests = p?.interests ?? [];
        setWantsBid(interests.includes('bid'));
        setWantsGrant(
          interests.length === 0 ||
            interests.includes('grant') ||
            interests.includes('rnd'),
        );
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [session]);

  /*
   * 가이드는 화면을 옮기지 않고 팝업으로 연다.
   *
   * 쓰다 말고 보는 것이라, 페이지를 갈아 끼우면 쓰던 자리를 잃는다.
   */
  const [guideOpen, setGuideOpen] = useState(false);
  const [briefsOpen, setBriefsOpen] = useState(false);

  const body = (
    <>
      <Link href="/dashboard" className="mb-6 px-3" onClick={onClose}>
        <span className="text-xl font-extrabold tracking-tight text-grey-900">
          MoAI
        </span>
      </Link>

      <nav className="flex-1 space-y-6">
        {groups.map((group) => (
          <div key={group.title}>
            <p className="mb-1.5 px-3 text-xs font-semibold text-grey-400">
              {/* 첫 묶음은 회사 이름으로 — 내 일이 모인 자리임이 드러난다 */}
              {group.title === '지원사업' ? companyName || group.title : group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = current === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.soon ? '#' : item.href}
                      aria-disabled={item.soon}
                      className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                        active
                          ? 'bg-brand-light font-semibold text-brand'
                          : item.soon
                            ? 'cursor-default text-grey-300'
                            : 'text-grey-600 hover:bg-grey-100'
                      }`}
                      onClick={(e) => {
                        if (item.soon) e.preventDefault();
                        else onClose?.();
                      }}
                    >
                      <span className="w-4 text-center">{item.icon}</span>
                      <span className="flex-1">{item.label}</span>
                      {item.soon && (
                        <span className="rounded bg-grey-100 px-1.5 py-0.5 text-[10px] text-grey-400">
                          준비 중
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/*
              가이드는 **화면을 옮기지 않고 팝업으로 연다.** 쓰다 말고 보는
              것이라 페이지를 갈아 끼우면 보던 자리를 잃는다. 그래도 성격은
              읽을거리라 정책 브리핑과 같은 묶음에 둔다.
            */}
            {group.title === 'TIP' && (
              <>
                <button
                  onClick={() => {
                    setBriefsOpen(true);
                    onClose?.();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-grey-600 transition-colors hover:bg-grey-100"
                >
                  <span className="w-4 text-center">◧</span>
                  <span className="flex-1">정책 브리핑</span>
                </button>
                <button
                  onClick={() => {
                    setGuideOpen(true);
                    onClose?.();
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm text-grey-600 transition-colors hover:bg-grey-100"
                >
                  <span className="w-4 text-center">◈</span>
                  <span className="flex-1">공고별 가이드</span>
                </button>
              </>
            )}
          </div>
        ))}

        {/*
          관리자에게만 보이는 메뉴.

          숨기는 것은 어디까지나 정리 차원이다 — 주소를 치고 들어가도
          서버가 막는다.
        */}
        {session?.isAdmin && (
          <div>
            <p className="mb-1.5 px-3 text-xs font-semibold text-grey-400">관리</p>
            <ul className="space-y-0.5">
              <li>
                <Link
                  href="/admin"
                  onClick={() => onClose?.()}
                  className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                    current === '/admin'
                      ? 'bg-brand-light font-semibold text-brand'
                      : 'text-grey-600 hover:bg-grey-100'
                  }`}
                >
                  <span className="w-4 text-center">◍</span>
                  <span className="flex-1">회원 관리</span>
                </Link>
              </li>
            </ul>
          </div>
        )}

        {/*
          공고 유형별 작성 가이드.

          메뉴처럼 보이지만 화면을 옮기지 않는다 — 쓰다 말고 열어 보는
          것이어서, 페이지가 바뀌면 쓰던 자리를 잃는다.
        */}

      </nav>

      {session && (
        <div className="mt-4 border-t border-grey-100 pt-4">
          <div className="px-3">
            <p className="truncate text-sm font-semibold text-grey-800">
              {companyName || session.name || '사용자'}
            </p>
            <p className="truncate text-xs text-grey-500">{session.email}</p>
          </div>
          <button
            onClick={() => void signOut()}
            className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm text-grey-500 hover:bg-grey-100"
          >
            로그아웃
          </button>
        </div>
      )}
    </>
  );

  const shell =
    'thin-scroll flex h-dvh flex-col overflow-y-auto border-r border-grey-200 bg-white px-3 py-5';

  return (
    <>
      {/*
        가이드 팝업은 여기 한 번만 둔다. `body` 는 넓은 화면과 서랍 양쪽에
        그려지므로, 저 안에 두면 팝업이 두 개 생긴다.
      */}
      <NoticeGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
      <BriefsModal open={briefsOpen} onClose={() => setBriefsOpen(false)} />

      {/* 넓은 화면 — 붙박이 */}
      <aside className={`${shell} hidden w-60 shrink-0 md:flex`}>{body}</aside>

      {/* 좁은 화면 — 서랍. 바깥을 누르면 닫힌다 */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={onClose}>
          <div className="absolute inset-0 bg-grey-900/40" />
          <aside
            className={`${shell} absolute inset-y-0 left-0 w-64 shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {body}
          </aside>
        </div>
      )}
    </>
  );
}
