'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { SiteFooter } from '@/components/brand/site-footer';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';

/**
 * 첫 화면.
 *
 * 고친 이유가 셋이다.
 *
 * 1. **앱 안과 색이 달랐다.** 이 화면만 파랑을 쓰고 로그인 뒤부터는 초록이라,
 *    같은 서비스로 안 보였다. 앱이 쓰는 색(`--moai-accent`)으로 맞췄다.
 * 2. **글로만 설명했다.** 캘린더도 사업계획서도 눈으로 보면 3초면 아는데,
 *    문장으로 읽히면 아무것도 안 남는다. **실제 화면을 넣었다.**
 * 3. **무엇이 다른지 없었다.** "AI가 써 준다"는 흔한 말이라, 다른 데서 안 하는
 *    것(자격 판정 · 공고 양식 그대로 · 근거 없으면 비워 둠)을 앞으로 뺐다.
 */

const STEPS = [
  {
    step: '01',
    title: '기업 정보를 한 번만 입력하면',
    body: '업종·지역·창업일·매출 정도면 충분합니다. 다시 물어보지 않습니다.',
  },
  {
    step: '02',
    title: '낼 수 있는 공고를 캘린더로',
    body: '마감일에 맞춰 배치하고, 우리 회사가 지원할 수 있는지 함께 표시합니다.',
  },
  {
    step: '03',
    title: '요약 한 장으로 먼저 맞추고',
    body: '사업 전체를 한 장에 압축해 보고, 비어 있는 칸부터 채웁니다.',
  },
  {
    step: '04',
    title: '공고 양식 그대로 사업계획서',
    body: '양식을 올리면 그 목차로, 없으면 공고 성격을 판정해 알맞은 목차로 씁니다.',
  },
];

/**
 * 요약 한 장이 왜 강한지.
 *
 * "AI 가 써 준다"는 어디나 한다. 이 화면이 다른 것은 **압축하면 빈 칸이
 * 드러난다**는 데 있다. 그래서 세 줄 모두 "무엇을 안 숨기는가"로 쓴다.
 */
const POSTER_POINTS = [
  {
    title: '빈 칸을 숨기지 않습니다',
    body: '근거가 없는 칸은 채워 넣지 않고 「근거 필요」로 남깁니다. 몇 곳이 비었는지 맨 위에 세어 둡니다.',
  },
  {
    title: '칸 하나만 골라 고칩니다',
    body: '마음에 걸리는 칸을 눌러 보완할 내용을 적으면 그 칸을 다시 씁니다. 문서를 통째로 다시 만들지 않습니다.',
  },
  {
    title: '고치면 짝이 따라옵니다',
    body: '문제 2번을 고치면 해결 2번도 함께 조정됩니다. 요청하지 않았는데 따라 바뀐 칸은 표시해 알려드립니다.',
  },
];

const POINTS = [
  {
    icon: '✓',
    title: '지원 자격을 미리 판정합니다',
    body: '업력·지역·업종·매출·인증을 대조해 지원 가능 여부를 공고마다 표시합니다. 못 내는 공고를 붙들고 있을 일이 없습니다.',
  },
  {
    icon: '◷',
    title: '마감을 놓치지 않습니다',
    body: '접수 중인 수천 건 중 우리가 낼 수 있는 것만 캘린더에 올립니다. 담아 둔 공고는 마감 임박순으로 따로 봅니다.',
  },
  {
    icon: '✎',
    title: '없는 내용은 지어내지 않습니다',
    body: '근거가 없는 항목은 비워 두고 무엇을 확인해야 하는지 알려드립니다. 다 쓴 뒤에는 지어낸 수치가 없는지 문서 전체를 한 번 더 검사합니다.',
  },
];

export default function LandingPage() {
  const { session, ready } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && session) router.replace('/dashboard');
  }, [ready, session, router]);

  return (
    <div className="min-h-dvh bg-white">
      {/* 상단 바 */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="text-xl font-extrabold tracking-tight text-[var(--moai-ink)]">
          MoAI
        </span>
        <div className="flex items-center gap-2">
          <Link href="/login">
            <Button variant="ghost" size="sm">
              로그인
            </Button>
          </Link>
          <Link href="/signup">
            <Button size="sm" variant="brand">
              시작하기
            </Button>
          </Link>
        </div>
      </header>

      {/*
        히어로.

        **첫 화면은 크기로 말한다.** 예전에는 제목이 54px 이고 여백이 좁아서,
        읽기는 되는데 아무 인상도 안 남았다. 문장을 늘려도 채워지지 않는다 —
        빈곤해 보이는 것은 글이 적어서가 아니라 **한 화면에 하나가 크게 놓여
        있지 않아서**다.

        그래서 셋만 남겼다. 한 문장, 살아 있는 숫자, 시작 버튼.
      */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-16 sm:pb-28 sm:pt-24">
        <p className="mb-6 inline-block rounded-full bg-[var(--moai-accent-50)] px-4 py-2 text-[15px] font-semibold text-[var(--moai-accent)]">
          정부지원사업 · 공공입찰
        </p>

        <h1 className="text-[44px] font-extrabold leading-[1.12] tracking-[-0.03em] text-[var(--moai-ink)] sm:text-[76px] lg:text-[88px]">
          우리 회사가
          <br />
          <span className="text-[var(--moai-accent)]">받을 수 있는 것</span>만
        </h1>

        <p className="mt-7 max-w-2xl text-[18px] leading-[1.75] text-[var(--moai-muted)] sm:text-[21px]">
          기업 정보를 한 번만 입력하면, 낼 수 있는 공고를 골라 캘린더에 놓고
          사업계획서 초안까지 만들어 드립니다.
        </p>

        {/*
          **살아 있는 숫자.**

          "3만 건" 처럼 박아 두면 그 순간부터 거짓말이 된다. 공고는 매일
          들어오고 매일 마감되므로, 열 때마다 세어서 보여 준다.
        */}
        <Stats />

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/signup">
            <Button variant="brand" size="lg" className="px-8 text-[17px]">
              무료로 시작하기
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary" size="lg" className="px-8 text-[17px]">
              로그인
            </Button>
          </Link>
        </div>

        {/*
          말보다 화면.

          캘린더는 설명하면 길지만 보면 3초다 — 날짜에 공고가 놓이고, 낼 수
          있는지가 색으로 붙어 있다는 것.
        */}
        <div className="mt-16 overflow-hidden rounded-2xl border border-[var(--moai-border)] bg-white shadow-sm sm:mt-20">
          <Image
            src="/shots/calendar.jpg"
            alt="지원사업 캘린더 — 마감일에 공고가 배치되고 지원 가능 여부가 함께 표시된 화면"
            width={1568}
            height={725}
            priority
            className="w-full"
          />
        </div>
        <p className="mt-2.5 text-center text-xs text-[var(--moai-subtle)]">
          실제 화면입니다. 지원 가능 · 조건부 · 지원 불가가 공고마다 표시됩니다.
        </p>
      </section>

      {/* 무엇이 다른가 */}
      <section className="border-y border-[var(--moai-border)] bg-[var(--moai-surface)]">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <h2 className="text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--moai-ink)] sm:text-[42px]">
            골라 주는 것까지가 절반입니다
          </h2>
          <p className="mt-3 text-[16px] leading-relaxed text-[var(--moai-muted)] sm:text-[18px]">
            공고를 모아 보여주는 곳은 많습니다. 낼 수 있는지 가려 주고, 낼 서류까지
            만들어 주는 곳은 드뭅니다.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {POINTS.map((p) => (
              <div
                key={p.title}
                className="border border-[var(--moai-border)] bg-white p-6"
              >
                <span className="text-lg text-[var(--moai-accent)]">{p.icon}</span>
                <h3 className="mt-2.5 text-[17px] font-bold text-[var(--moai-ink)]">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--moai-muted)]">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/*
        요약 한 장.

        이 서비스에서 가장 강한 화면이라 **여기만 색을 뒤집는다.** 위아래가
        전부 흰 바탕이므로, 딥 그린 한 판이 끼면 스크롤하다 걸린다.

        글과 그림을 좌우로 나누지 않고 위아래로 쌓은 것도 같은 이유다.
        한 장 짜리 문서는 좌우 절반에 밀어 넣으면 글자가 보이지 않는다.
        보이지 않는 그림은 없는 것과 같아서, 폭을 끝까지 준다.
      */}
      <section className="border-y border-[var(--moai-accent-hover)] bg-[var(--moai-accent)]">
        <div className="mx-auto max-w-7xl px-6 py-20 sm:py-28">
          <p className="mb-4 inline-block rounded-full bg-white/15 px-3.5 py-1.5 text-sm font-semibold text-white">
            요약 한 장
          </p>
          <h2 className="max-w-3xl text-[32px] font-extrabold leading-[1.18] tracking-[-0.02em] text-white sm:text-[48px]">
            20쪽을 쓰기 전에,
            <br />한 장으로 먼저 맞춥니다
          </h2>
          <p className="mt-5 max-w-2xl text-[17px] leading-[1.7] text-white/85 sm:text-[19px]">
            기업 현황 · 사업 목표 · 문제와 해결 · 기대 효과를 심사자가 읽는 순서
            그대로 한 장에 압축합니다. 압축해 보면 무엇이 비어 있는지가 드러나기
            때문에, 이 한 장은 요약이자 점검표입니다.
          </p>

          <div className="mt-10 overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5">
            <Image
              src="/shots/poster.jpg"
              alt="사업 요약 한 장 화면 — 기업 현황·사업 목표·내부 문제점이 칸으로 채워지고, 근거가 없는 칸에는 근거 필요 표시가 붙어 있다"
              width={1372}
              height={772}
              sizes="(min-width: 1280px) 1216px, 100vw"
              className="w-full"
            />
          </div>
          <p className="mt-3 text-center text-xs text-white/60">
            실제 화면입니다. 맨 위에 근거가 필요한 칸이 몇 곳인지 세어 둡니다.
          </p>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {POSTER_POINTS.map((p) => (
              <div key={p.title} className="border-t border-white/25 pt-4">
                <h3 className="text-[17px] font-bold text-white">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-white/75">
                  {p.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 사업계획서 */}
      <section className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
        <div className="grid items-center gap-10 lg:grid-cols-5">
          {/*
            글 2 : 그림 3.

            절반씩 나눴을 때 문서 스크린샷이 손톱만 해서 무슨 화면인지
            알아볼 수 없었다. 글은 줄 수가 적어 좁아져도 읽히므로,
            남는 폭을 그림에 준다.
          */}
          <div className="lg:col-span-2">
            <p className="text-sm font-semibold text-[var(--moai-accent)]">
              사업계획서
            </p>
            <h2 className="mt-2 text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--moai-ink)] sm:text-[42px]">
              공고가 요구한 목차 그대로,
              <br />
              절 단위로 씁니다
            </h2>
            <ul className="mt-6 space-y-3.5">
              {[
                {
                  t: '요약 한 장이 그대로 뼈대가 됩니다',
                  d: '앞에서 맞춰 둔 한 장의 목표·문제·해결·기대 효과를 각 절로 펼쳐 씁니다. 처음부터 다시 묻지 않습니다.',
                },
                {
                  t: '양식을 올리면 그 목차로',
                  d: '공고에 붙은 양식에서 목차를 뽑아 그대로 씁니다. 양식이 없으면 연구개발과제인지 판정해 알맞은 표준 목차를 고릅니다.',
                },
                {
                  t: '쓰기 전에 근거부터 찾습니다',
                  d: '시장 규모·경쟁 제품·특허·산업 동향을 먼저 조사해 두고, 그 자료를 근거로 본문을 씁니다.',
                },
                {
                  t: '다 쓴 뒤 한 번 더 검사합니다',
                  d: '지어낸 수치와 출처, 절 사이의 모순, 빠진 항목을 찾아 문제가 큰 절은 다시 씁니다.',
                },
              ].map((it) => (
                <li key={it.t} className="flex gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--moai-accent)]" />
                  <span>
                    <span className="block text-[15px] font-bold text-[var(--moai-ink)]">
                      {it.t}
                    </span>
                    <span className="mt-1 block text-sm leading-relaxed text-[var(--moai-muted)]">
                      {it.d}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/*
            앞 섹션과 **같은 사업**의 화면이다.

            한장요약은 고요, 사업계획서는 다른 사업으로 찍어 두면 나란히
            놓았을 때 같은 서비스에서 나온 화면으로 보이지 않는다.
            캡션에 한 줄 적어 두는 것은 그걸 눈으로 확인시키기 위해서다.
          */}
          <div className="lg:col-span-3">
            <div className="overflow-hidden rounded-2xl border border-[var(--moai-border)] bg-white shadow-sm">
              <Image
                src="/shots/plan.jpg"
                alt="사업계획서 화면 — 표지와 목차, 그 아래 요약 한 장이 이어지는 문서"
                width={680}
                height={726}
                sizes="(min-width: 1024px) 700px, 100vw"
                className="w-full"
              />
            </div>
            <p className="mt-2.5 text-center text-xs text-[var(--moai-subtle)]">
              바로 위 요약 한 장과 같은 사업의 문서입니다.
            </p>
          </div>
        </div>
      </section>

      {/* 어떻게 쓰나 */}
      <section className="border-t border-[var(--moai-border)] bg-[var(--moai-surface)]">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <h2 className="text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--moai-ink)] sm:text-[42px]">
            입력은 한 번, 나머지는 알아서
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <div
                key={s.step}
                className="border border-[var(--moai-border)] bg-white p-6"
              >
                <span className="tabular text-sm font-bold text-[var(--moai-accent)]">
                  {s.step}
                </span>
                <h3 className="mt-2 text-[17px] font-bold text-[var(--moai-ink)]">
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--moai-muted)]">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 마무리 */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <h2 className="text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-[var(--moai-ink)] sm:text-[42px]">
          지금 낼 수 있는 공고부터 확인해 보세요
        </h2>
        <p className="mt-3 text-[16px] leading-relaxed text-[var(--moai-muted)] sm:text-[18px]">
          기업 정보 입력에 2분이면 됩니다.
        </p>
        <div className="mt-6 flex justify-center">
          <Link href="/signup">
            <Button variant="brand">무료로 시작하기</Button>
          </Link>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}

/**
 * 첫 화면의 숫자.
 *
 * 로그인 전에도 열리는 값만 쓴다(공고 수·기관 수). 못 가져오면 **숫자 칸을
 * 아예 안 보여 준다** — 0 을 띄우면 "공고가 없는 서비스"로 읽히고, 그건
 * 사실과 반대다.
 */
function Stats() {
  const [stats, setStats] = useState<{
    open: number;
    closingThisWeek: number;
    agencies: number;
  } | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch('/api/grants/stats')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (alive && d) setStats(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  if (!stats) return <div className="mt-10 h-[92px] sm:h-[104px]" />;

  const items = [
    { n: stats.open, unit: '건', label: '지금 접수 중인 공고' },
    { n: stats.agencies, unit: '곳', label: '공고를 내는 기관' },
    /*
     * 좁은 화면에서는 뺀다. 셋을 넣으면 2+1 로 접혀 한 줄이 외톨이가 되고,
     * 그 어긋난 줄이 먼저 눈에 띈다. 이건 곁가지 숫자라 빠져도 괜찮다.
     */
    { n: stats.closingThisWeek, unit: '건', label: '이번 주에 마감', wide: true },
  ];

  return (
    <dl className="mt-10 flex flex-wrap gap-x-12 gap-y-6 sm:gap-x-16">
      {items.map((it) => (
        <div key={it.label} className={it.wide ? 'hidden sm:block' : ''}>
          <dd className="tabular text-[40px] font-extrabold leading-none tracking-[-0.02em] text-[var(--moai-ink)] sm:text-[52px]">
            {it.n.toLocaleString()}
            <span className="ml-1 text-[20px] font-bold text-[var(--moai-muted)] sm:text-[24px]">
              {it.unit}
            </span>
          </dd>
          <dt className="mt-2 text-[14px] font-medium text-[var(--moai-muted)] sm:text-[15px]">
            {it.label}
          </dt>
        </div>
      ))}
    </dl>
  );
}
