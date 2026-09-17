'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ELIGIBILITY_LABELS, ROADMAP, ROADMAP_KIND_LABELS, businessYearsOf,
  roadmapStepsFor,
} from '@moai/shared';
import type {
  CalendarItem, CompanyProfile, RoadmapKind, RoadmapSchedule, RoadmapStep,
} from '@moai/shared';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import {
  GrantDetail, LEVEL_STYLE, formatMoney,
} from '@/components/calendar/calendar-board';
import { calendarApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * 창업 자금 로드맵.
 *
 * 공고 목록은 "지금 열려 있는 것"만 보여 준다. 그래서 처음 오는 사람은
 * 예비창업패키지와 창업도약패키지가 어떻게 다른지, **자기가 지금 어디쯤인지**
 * 를 알 수 없다. 이 화면이 그 숲을 보여 준다.
 */
const KIND_STYLE: Record<
  RoadmapKind,
  { dot: string; chip: string; text: string }
> = {
  grant: {
    dot: 'bg-kind-grant',
    chip: 'bg-kind-grant-soft text-kind-grant',
    text: 'text-kind-grant',
  },
  invest: {
    dot: 'bg-kind-invest',
    chip: 'bg-kind-invest-soft text-kind-invest',
    text: 'text-kind-invest',
  },
  loan: {
    dot: 'bg-kind-loan',
    chip: 'bg-kind-loan-soft text-kind-loan',
    text: 'text-kind-loan',
  },
  tips: {
    dot: 'bg-kind-tips',
    chip: 'bg-kind-tips-soft text-kind-tips',
    text: 'text-kind-tips',
  },
};

export default function RoadmapPage() {
  const { session } = useAuth();
  const tenantId = session?.tenantId ?? '';
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setLoading(false);
      return;
    }
    void calendarApi
      .defaultProfile(tenantId)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const years = useMemo(
    () => businessYearsOf(profile?.foundedAt, profile?.stage),
    [profile],
  );

  /**
   * 펼쳐 본 칸.
   *
   * 칸마다 자세한 내용을 안에 넣으면 격자가 무너진다. 아래 한 곳에서만
   * 펼쳐 격자는 격자대로 남긴다.
   */
  const [openNo, setOpenNo] = useState<number | null>(null);
  const opened = ROADMAP.find((s) => s.no === openNo) ?? null;

  /** 팝업 안에서 골라 본 공고 — 있으면 단계 대신 이것을 보여 준다 */
  const [grant, setGrant] = useState<CalendarItem | null>(null);

  /** 지금 해당하는 단계들 — 하나만 찍지 않는다 */
  const mine = useMemo(() => {
    const set = new Set(roadmapStepsFor(years).map((s) => s.no));
    return set;
  }, [years]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      {/*
        **내 단계는 제목 옆에 둔다.**

        예전에는 카드 하나를 통째로 써서 "지금 여기 표시가 붙은 것이 지금
        단계입니다" 같은 설명을 적었다. 화면을 보면 아는 것을 글로 또 적은
        셈이라 자리만 먹었다. 몇 년차인지만 남기고, 어떤 단계인지는 마우스를
        올렸을 때 보여 준다.
      */}
      <header className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-grey-900">자금 로드맵</h1>
          <p className="mt-1 text-sm leading-6 text-grey-600">
            창업 자금은 이런 순서로 이어집니다.
          </p>
        </div>

        {!loading && years !== null && (
          <span
            title={roadmapStepsFor(years).map((s) => s.title).join(' · ')}
            className="shrink-0 rounded-full bg-brand-light px-3 py-1.5 text-sm font-bold text-brand"
          >
            {years < 0 ? '예비창업자' : `창업 ${years}년차`}
          </span>
        )}
      </header>

      {/*
        위치를 **모를 때만** 안내를 띄운다. 아는 사람에게는 제목 옆 배지로
        충분하고, 화면에서 아는 것을 글로 다시 적을 이유가 없다.
      */}
      {!loading && years === null && (
        <Card className="mb-5 p-4">
          <p className="text-sm font-semibold text-grey-800">
            지금 어디쯤인지 아직 모릅니다.
          </p>
          <p className="mt-1 text-sm leading-6 text-grey-600">
            내 정보에 <b>사업자 형태</b>와 <b>창업일</b>을 넣으면 이 로드맵에
            지금 위치를 표시해 드립니다.
          </p>
          <Link
            href="/profile"
            className="mt-2.5 inline-block text-sm font-semibold text-brand"
          >
            내 정보 채우기 →
          </Link>
        </Card>
      )}

      {/*
        **격자로 놓는다.**

        세로로 한 줄씩 쌓으면 열일곱 칸이 화면 네 개 분량이 되어, 스크롤하는
        내내 "아직도 남았나" 가 된다. 전체가 몇 단계인지, 내가 어디쯤인지는
        **한눈에 들어와야** 로드맵이다.

        왼쪽에서 오른쪽으로 읽고 다음 줄로 내려간다 — 글 읽는 방향과 같아서
        따로 배우지 않아도 된다.
      */}
      {/*
        **뱀이 기어가듯 놓는다.**

        1→2→3→4 로 가다 줄 끝에서 아래로 내려오고, 다음 줄은 8←7←6←5 로
        되돌아온다. 줄마다 왼쪽에서 다시 시작하면 눈이 매번 화면 왼쪽 끝까지
        건너뛰어야 하는데, 이렇게 두면 **선이 끊기지 않고 이어진다.**

        넓은 화면(4열)에서만 이렇게 한다. 2~3열에서는 한 줄에 든 칸이 적어
        되돌아오는 모양이 오히려 순서를 헷갈리게 만든다.
      */}
      <div className="hidden space-y-6 lg:block">
        {chunk(ROADMAP, 4).map((row, ri) => {
          const rightward = ri % 2 === 0;
          const cells = rightward ? row : [...row].reverse();

          return (
            <div key={ri} className="grid grid-cols-4 gap-x-8">
              {cells.map((step, ci) => (
                <div key={step.no} className="relative">
                  <StepCard
                    step={step}
                    mine={mine.has(step.no)}
                    open={openNo === step.no}
                    onToggle={() =>
                      setOpenNo(openNo === step.no ? null : step.no)
                    }
                  />

                  {/*
                    줄 안에서 다음 칸으로 가는 선. 줄의 마지막 칸에는 없다 —
                    거기서는 아래로 내려가기 때문이다.
                  */}
                  {ci < cells.length - 1 && (
                    <span
                      aria-hidden
                      className="absolute right-[-32px] top-1/2 h-0.5 w-8 rounded-full bg-grey-300"
                    />
                  )}

                  {/*
                    줄이 바뀌는 자리.

                    **되돌아오는 줄에서는 왼쪽 끝이 마지막이다.** 오른쪽
                    끝에만 선을 그렸더니 `05 → 12`, `13 → 17` 처럼 번호를
                    거스르는 선이 생겼다. 화면에서 마지막인 칸이 아니라
                    **번호가 마지막인 칸**에서 내려가야 한다.
                  */}
                  {(rightward ? ci === cells.length - 1 : ci === 0) &&
                    ri < chunk(ROADMAP, 4).length - 1 &&
                    row.length === 4 && (
                      <span
                        aria-hidden
                        className="absolute bottom-[-24px] left-1/2 h-6 w-0.5 -translate-x-1/2 rounded-full bg-grey-300"
                      />
                    )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* 좁은 화면 — 되돌아오지 않고 그냥 순서대로 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:hidden">
        {ROADMAP.map((step) => (
          <StepCard
            key={step.no}
            step={step}
            mine={mine.has(step.no)}
            open={openNo === step.no}
            onToggle={() => setOpenNo(openNo === step.no ? null : step.no)}
          />
        ))}
      </div>

      {/*
        자세한 내용은 **팝업으로 띄운다.**

        아래에 펼치면 격자가 밀려 내려가고, 방금 누른 칸이 화면 밖으로
        나가 버린다. 무엇을 눌렀는지 잃지 않으려면 자리를 안 건드려야 한다.
      */}
      <Modal
        open={opened !== null}
        onClose={() => {
          setOpenNo(null);
          setGrant(null);
        }}
        title={
          grant
            ? grant.grant.title
            : opened
              ? `${opened.no}. ${opened.title}`
              : ''
        }
      >
        {/*
          공고를 고르면 **같은 팝업 안에서** 상세로 바뀐다.
          팝업 위에 팝업을 얹으면 닫는 순서가 헷갈리고, 뒤엣것이 가려져
          어디로 돌아가는지 알 수 없다.
        */}
        {grant ? (
          <div>
            <button
              type="button"
              onClick={() => setGrant(null)}
              className="mb-3 flex min-h-[36px] items-center gap-1 text-sm font-semibold text-grey-600 hover:text-grey-900"
            >
              ← {opened ? `${opened.no}. ${opened.title}` : '단계'} 로 돌아가기
            </button>
            <GrantDetail
              item={grant}
              onClose={() => setGrant(null)}
              embedded
              tenantId={tenantId}
            />
          </div>
        ) : (
          opened && (
            <StepDetail
              step={opened}
              mine={mine.has(opened.no)}
              tenantId={tenantId}
              onPick={setGrant}
            />
          )
        )}
      </Modal>

      <p className="mt-5 text-xs leading-6 text-grey-500">
        금액은 사업별 최대 규모이며 해마다 바뀝니다. 실제 조건은 공고 원문을
        확인해 주세요.
      </p>
    </div>
  );
}

/**
 * 격자의 칸 하나.
 *
 * **작게, 네모나게.** 열일곱 칸이 한눈에 들어와야 하므로 이름과 규모만
 * 남기고 나머지는 눌렀을 때 아래에서 편다.
 */
function StepCard({
  step, mine, open, onToggle,
}: {
  step: RoadmapStep;
  mine: boolean;
  /** 지금 열려 있는 칸인가 — 테두리로만 나타낸다 */
  open: boolean;
  onToggle: () => void;
}) {
  const style = KIND_STYLE[step.kind];

  return (
    <button
      type="button"
      onClick={onToggle}
      /*
       * **칸을 꽉 채운다.** `w-full` 이 없어 내용만큼만 차지하다 보니, 격자에
       * 놓았는데도 카드 너비가 제각각이었다. 크기가 들쭉날쭉하면 격자로
       * 안 보이고 그냥 흩어 놓은 것처럼 읽힌다.
       */
      className={`relative flex h-full w-full flex-col items-start overflow-hidden rounded-xl border pb-3 pl-4 pr-3 pt-3 text-left transition-colors ${
        open
          ? 'border-grey-900 bg-white shadow-sm'
          : mine
            ? 'border-brand bg-brand-light/30'
            : 'border-grey-200 bg-white hover:border-grey-300 hover:bg-grey-50'
      }`}
    >
      {/*
        종류는 **왼쪽 띠 하나로** 나타낸다. 예전에는 번호 원과 아래 칩에
        같은 색을 두 번 칠했는데, 작은 카드에 색이 두 군데 흩어져 있으면
        어수선하다. 띠는 카드 높이를 따라가므로 세로줄이 맞아 정돈되어 보인다.
      */}
      <span className={`absolute inset-y-0 left-0 w-1 ${style.dot}`} />

      <div className="flex w-full items-center gap-1.5">
        <span className="text-[10px] font-bold tracking-wider text-grey-400">
          STEP {String(step.no).padStart(2, '0')}
        </span>

        {/* 지금 단계는 점이 깜박인다 — 움직이는 것이 하나뿐이라 바로 찾는다 */}
        {mine && (
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-brand" />
          </span>
        )}

      </div>

      <p className="mt-1 text-[13.5px] font-bold leading-snug text-grey-900">
        {step.title}
      </p>

      {/*
        금액이 없는 단계도 있다(사업자등록 등). 빈 줄을 두어 자리를 맞추면
        카드 아래쪽이 들쑥날쑥해지지 않는다.
      */}
      <p className="mt-0.5 min-h-[16px] text-[11px] font-semibold text-grey-500">
        {step.amount ?? ''}
      </p>

      <span
        className={`mt-auto pt-1.5 text-[10px] font-semibold ${style.text}`}
      >
        {ROADMAP_KIND_LABELS[step.kind]}
      </span>
    </button>
  );
}

/** 고른 칸의 자세한 내용 */
function StepDetail({
  step, mine, tenantId, onPick,
}: {
  step: RoadmapStep;
  mine: boolean;
  tenantId: string;
  onPick: (item: CalendarItem) => void;
}) {
  const href = step.categories?.length
    ? `/calendar?view=list&categories=${step.categories.join(',')}`
    : null;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${KIND_STYLE[step.kind].chip}`}
        >
          {ROADMAP_KIND_LABELS[step.kind]}
        </span>
        {mine && (
          <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-white">
            지금 여기
          </span>
        )}
      </div>

      <p className="mt-1.5 text-sm leading-6 text-grey-600">
        {step.note}
        {step.amount && (
          <>
            <span className="mx-1.5 text-grey-300">·</span>
            <span className="font-semibold text-grey-800">{step.amount}</span>
          </>
        )}
      </p>

      {step.schedule && <Schedule schedule={step.schedule} />}

      {/* 지금 열려 있는 공고 — 단계 이름만으로는 다음 걸음이 안 정해진다 */}
      <RelatedGrants step={step} tenantId={tenantId} onPick={onPick} />

      {href && (
        <Link
          href={href}
          className="mt-3 inline-block text-sm font-semibold text-brand"
        >
          이 단계 공고 더 보기 →
        </Link>
      )}
    </div>
  );
}

/**
 * 이 단계에 지금 열려 있는 공고.
 *
 * **넣을 수 있는 것, 돈이 되는 것부터 넷까지.** 다 늘어놓으면 목록이
 * 되어 버리는데, 그건 지원사업 화면이 이미 한다.
 *
 * 금액순으로 못 하는 이유는 **원본에 금액 칸이 없어서**다. 그래서 유형으로
 * 가른다 — 사업화 자금·R&D·융자는 돈이 오가고, 행사·교육은 아니다.
 */
function RelatedGrants({
  step, tenantId, onPick,
}: {
  step: RoadmapStep;
  tenantId: string;
  onPick: (item: CalendarItem) => void;
}) {
  const [items, setItems] = useState<CalendarItem[] | null>(null);

  useEffect(() => {
    let alive = true;
    setItems(null);
    void calendarApi
      .relatedToStep({
        keyword: step.keyword,
        categories: step.categories,
        tenantId: tenantId || undefined,
        limit: 4,
      })
      .then((r) => {
        if (alive) setItems(r);
      })
      .catch(() => {
        if (alive) setItems([]);
      });
    return () => {
      alive = false;
    };
  }, [step.keyword, step.categories, tenantId]);

  if (items === null) {
    return (
      <p className="mt-4 text-sm text-grey-400">지금 열린 공고를 찾는 중…</p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="mt-4 text-sm text-grey-500">
        지금은 이 단계로 열려 있는 공고가 없습니다. 대개 {step.schedule
          ? step.schedule.phases[0].when
          : '연초'}에 나옵니다.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <p className="mb-2 text-xs font-bold text-grey-700">
        같이 지원해볼 공고 {items.length}건
      </p>
      <div className="space-y-1.5">
        {items.map((it) => (
          <button
            key={it.grant.id}
            type="button"
            onClick={() => onPick(it)}
            className="w-full rounded-xl border border-grey-200 p-3 text-left transition-colors hover:border-brand hover:bg-grey-50"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 flex-1 text-sm font-semibold leading-snug text-grey-900">
                {it.grant.title}
              </p>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEVEL_STYLE[it.eligibility.level].chip}`}
              >
                {ELIGIBILITY_LABELS[it.eligibility.level]}
              </span>
            </div>
            <p className="tabular mt-1 text-xs text-grey-500">
              {it.dDay != null && it.dDay >= 0 && (
                <span className={it.dDay <= 7 ? 'font-bold text-danger' : ''}>
                  D-{it.dDay}
                </span>
              )}
              {' · '}
              {it.grant.agency}
              {it.grant.amountMax != null &&
                ` · 최대 ${formatMoney(it.grant.amountMax)}`}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function Schedule({ schedule }: { schedule: RoadmapSchedule }) {
  /* 칸을 눌러서 연 자리라 여기서 또 접어 둘 이유가 없다 */
  const [open, setOpen] = useState(true);
  const announced = schedule.basis === 'announced';

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-[32px] items-center gap-1.5 text-xs font-semibold text-grey-600 hover:text-grey-800"
      >
        <span>
          지원부터 자금까지 약 {schedule.months}개월
        </span>
        <span className="text-[10px] text-grey-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-grey-200 bg-grey-50 p-3">
          {/* 단계는 가로로 — 순서라는 것이 모양에서 읽혀야 한다 */}
          <div className="flex flex-wrap items-stretch gap-1.5">
            {schedule.phases.map((p, i) => (
              <div key={p.label} className="flex items-center gap-1.5">
                <div className="rounded-lg bg-white px-2.5 py-1.5 text-center ring-1 ring-grey-200">
                  <p className="text-[11px] font-bold text-grey-800">{p.label}</p>
                  <p className="tabular mt-0.5 text-[11px] text-grey-500">
                    {p.when}
                  </p>
                </div>
                {i < schedule.phases.length - 1 && (
                  <span className="text-[10px] text-grey-300">›</span>
                )}
              </div>
            ))}
          </div>

          {(schedule.applyVia || schedule.documents?.length) && (
            <div className="mt-2.5 space-y-0.5 text-[11px] leading-5 text-grey-600">
              {schedule.applyVia && <p>신청 · {schedule.applyVia}</p>}
              {schedule.documents?.length ? (
                <p>제출 · {schedule.documents.join(', ')}</p>
              ) : null}
            </div>
          )}

          {/*
            **어림을 확정처럼 보이게 하면 안 된다.** 그 날짜를 믿고 자금
            계획을 세웠다가 어긋나면, 없느니만 못한 정보가 된다.
          */}
          <p className="mt-2 border-t border-grey-200 pt-2 text-[11px] leading-5 text-grey-500">
            {announced ? (
              <>
                <b className="text-grey-700">{schedule.source}</b> 기준입니다.
              </>
            ) : (
              <>
                예년 흐름을 본 <b className="text-grey-700">어림</b>입니다. 해마다
                달라지니 공고 원문을 확인해 주세요.
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}

/** 배열을 `size` 개씩 자른다 — 줄 단위로 놓기 위해 */
function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
