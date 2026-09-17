'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ELIGIBILITY_LABELS, GRANT_OUTCOME_SHORT } from '@moai/shared';
import {
  BID_LEVEL_LABELS, BID_LEVEL_STYLES, decisionFromMethod, judgeBid,
} from '@moai/shared';
import type { BidNotice, CalendarItem, CompanyProfile } from '@moai/shared';
import {
  GrantDetail, LEVEL_STYLE, formatMoney,
} from '@/components/calendar/calendar-board';
import { BriefView } from '@/components/bids/brief-view';
import { StarButton } from '@/components/calendar/star-button';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { calendarApi, procurementApi, savedApi, type BidDraft } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * 관심 공고.
 *
 * 별을 눌러 모아둔 공고만 보여준다.
 * 마감이 지난 것도 지우지 않고 뒤로 밀어둔다 — 놓친 공고를 확인하는 것도 정보다.
 */
export default function SavedPage() {
  const { session } = useAuth();
  const [items, setItems] = useState<CalendarItem[]>([]);
  /**
   * 별을 단 입찰 공고.
   *
   * 입찰은 목록을 DB 에 쌓지 않아 공고 id 로 관리할 수 없어서, 준비 메모에
   * 별을 함께 담는다. 그래서 지원사업과 다른 곳에서 가져온다.
   */
  const [bids, setBids] = useState<BidDraft[]>([]);
  /** 여기서 바로 여는 입찰 공고 — 다른 페이지로 보내지 않는다 */
  const [readingBid, setReadingBid] = useState<BidNotice | null>(null);
  /** 입찰 판정에 쓴다 — 지원사업처럼 층 배지를 보여주려면 프로필이 필요하다 */
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    try {
      const [grants, drafts, p] = await Promise.all([
        savedApi.list(session.tenantId),
        procurementApi.drafts(session.tenantId).catch(() => []),
        calendarApi.defaultProfile(session.tenantId).catch(() => null),
      ]);
      setItems(grants);
      setBids(drafts.filter((d) => d.starred));
      setProfile(p);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  /** 입찰 관심 해제 — 목록에서 바로 끌 수 있어야 한다 */
  async function unstarBid(bidNo: string) {
    if (!session) return;
    setBids((prev) => prev.filter((d) => d.bidNo !== bidNo));
    await procurementApi
      .saveDraft(session.tenantId, bidNo, { starred: false })
      .catch(() => void load());
  }

  async function unsave(grantId: string) {
    if (!session) return;
    await savedApi.toggle(session.tenantId, grantId);
    setItems((prev) => prev.filter((i) => i.grant.id !== grantId));
    setSelected(null);
  }

  const { open, closed } = useMemo(
    () => ({
      open: items.filter((i) => (i.dDay ?? 0) >= 0),
      closed: items.filter((i) => (i.dDay ?? 0) < 0),
    }),
    [items],
  );

  /** 입찰도 마감 여부로 가른다 — 마감된 것은 아래 "마감됨"으로 내린다 */
  const { openBids, closedBids } = useMemo(() => {
    const now = Date.now();
    const done = (d: BidDraft) =>
      d.notice.bidCloseAt ? Date.parse(d.notice.bidCloseAt) < now : false;
    return {
      openBids: bids.filter((d) => !done(d)),
      closedBids: bids.filter(done),
    };
  }, [bids]);

  /**
   * 마감된 것은 접어 둔다.
   *
   * 지우지는 않는다 — 놓친 공고를 확인하는 것도 정보다. 다만 펴 두면
   * 지금 넣을 수 있는 공고가 아래로 밀린다.
   */
  const [showClosed, setShowClosed] = useState(false);
  const closedCount = closed.length + closedBids.length;

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-grey-900">
          관심 공고
        </h1>
        <p className="mt-1 text-grey-600">
          별을 눌러 모아둔 공고입니다. 마감 알림과 세부 분석이 여기부터
          우선 처리됩니다.
        </p>
      </header>

      {loading ? (
        <p className="py-20 text-center text-sm text-grey-400">불러오는 중…</p>
      ) : items.length === 0 && bids.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-grey-300 py-20 text-center">
          <p className="text-3xl text-grey-300">☆</p>
          <p className="mt-3 text-sm text-grey-500">
            아직 저장한 공고가 없어요.
          </p>
          <p className="mt-1 text-xs text-grey-400">
            지원사업이나 공공 입찰에서 별을 누르면 여기에 모입니다.
          </p>
          <Link href="/calendar" className="mt-5 inline-block">
            <Button size="sm">지원사업 보러 가기</Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {/*
            순서는 급한 것부터다 — 지금 넣을 수 있는 것, 그 다음 입찰,
            마감된 것은 맨 아래에 접어 둔다.
          */}
          <Fold title="접수 중" count={open.length} defaultOpen>
            <Section items={open} onPick={setSelected} onUnsave={unsave} />
          </Fold>

          <Fold title="공공 입찰" count={openBids.length} defaultOpen>
            <BidList
              drafts={openBids}
              profile={profile}
              onPick={setReadingBid}
              onUnstar={unstarBid}
            />
          </Fold>

          <Fold title="마감됨" count={closedCount}>
            {closed.length > 0 && (
              <Section items={closed} onPick={setSelected} onUnsave={unsave} muted />
            )}
            {closedBids.length > 0 && (
              <div className={closed.length > 0 ? 'mt-3' : ''}>
                <BidList
                  drafts={closedBids}
                  profile={profile}
                  onPick={setReadingBid}
                  onUnstar={unstarBid}
                  muted
                />
              </div>
            )}
          </Fold>
        </div>
      )}

      {/*
        입찰 공고도 여기서 바로 연다. 목록에서 눌렀는데 다른 페이지로
        보내면 보던 자리를 잃고 다시 찾아 들어와야 한다.
      */}
      <Modal
        open={readingBid !== null}
        onClose={() => setReadingBid(null)}
        title="공고 읽기"
        wide
      >
        {readingBid && (
          <BriefView
            notice={readingBid}
            tenantId={session?.tenantId ?? null}
            onClose={() => setReadingBid(null)}
          />
        )}
      </Modal>

      <Modal
        open={selected !== null}
        onClose={() => setSelected(null)}
        title="공고 상세"
        wide
      >
        {selected && (
          <GrantDetail
            item={selected}
            onClose={() => setSelected(null)}
            embedded
            saved
            onToggleSaved={() => unsave(selected.grant.id)}
            tenantId={session?.tenantId}
            onRefresh={load}
          />
        )}
      </Modal>
    </main>
  );
}

/** 지원사업 공고 줄 — 제목은 감싸는 `Fold` 가 그린다 */
function Section({
  items, onPick, onUnsave, muted,
}: {
  items: CalendarItem[];
  onPick: (i: CalendarItem) => void;
  onUnsave: (grantId: string) => Promise<void>;
  muted?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <ul className="divide-y divide-grey-100 overflow-hidden rounded-xl border border-grey-200 bg-white">
        {items.map((it) => (
          <li key={it.grant.id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onPick(it)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onPick(it);
              }}
              className={`flex w-full cursor-pointer items-start gap-3 px-5 py-4 hover:bg-grey-50 ${
                muted ? 'opacity-60' : ''
              }`}
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${LEVEL_STYLE[it.eligibility.level].dot}`}
              />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug text-grey-900">
                  {it.grant.title}
                </span>
                {/*
                  지원 결과는 제목 바로 밑에 둔다. 선정된 사업은 다른 공고의
                  중복 수혜 제한에 걸리는 근거라, 목록에서 바로 보여야 한다.
                */}
                {it.outcome && (
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      it.outcome === 'won'
                        ? 'bg-success-soft text-success-deep'
                        : it.outcome === 'lost'
                          ? 'bg-grey-100 text-grey-600'
                          : 'bg-brand-light text-brand'
                    }`}
                  >
                    {GRANT_OUTCOME_SHORT[it.outcome]}
                  </span>
                )}
                <span className="tabular mt-1 block text-xs text-grey-500">
                  {it.dDay != null &&
                    (it.dDay >= 0 ? (
                      <span
                        className={
                          it.dDay <= 7 ? 'font-bold text-danger' : 'font-semibold'
                        }
                      >
                        D-{it.dDay}
                      </span>
                    ) : (
                      <span>마감</span>
                    ))}
                  {' · '}
                  {it.grant.agency}
                  {it.grant.amountMax != null &&
                    ` · 최대 ${formatMoney(it.grant.amountMax)}`}
                </span>
              </span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEVEL_STYLE[it.eligibility.level].chip}`}
              >
                {ELIGIBILITY_LABELS[it.eligibility.level]}
              </span>
              {/*
                목록에서는 누를 수 없다. 줄을 누르면 상세가 열리고,
                해제는 거기서 내용을 보고 한다.
              */}
              <StarButton size="sm" active readOnly onToggle={() => undefined} />
            </div>
          </li>
        ))}
    </ul>
  );
}

/* ────────────── 조각 ────────────── */

/**
 * 접었다 펼 수 있는 묶음.
 *
 * 관심 공고는 세 종류가 한 화면에 쌓인다. 전부 펴 두면 지금 넣을 수 있는
 * 공고가 아래로 밀려서, 정작 급한 것을 스크롤로 찾아야 한다.
 * 마감된 것은 처음부터 접어 두되 **지우지는 않는다** — 놓친 공고를
 * 확인하는 것도 정보다.
 */
function Fold({
  title, count, defaultOpen, children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  if (count === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-grey-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-4 py-3 text-left hover:bg-grey-50"
      >
        <span className="text-xs text-grey-400">{open ? '▾' : '▸'}</span>
        <span className="text-sm font-bold text-grey-800">{title}</span>
        <span className="tabular text-sm text-grey-400">{count}</span>
      </button>
      {open && <div className="border-t border-grey-100 p-3">{children}</div>}
    </section>
  );
}

/**
 * 별을 단 입찰 공고 줄.
 *
 * 지원사업 줄과 **같은 모양**으로 맞춘다 — 왼쪽에 층 점, 가운데 제목과
 * 정보, 오른쪽에 판정 배지와 별. 한 화면에 두 종류가 쌓이는데 생김새가
 * 다르면 눈이 매번 다시 적응해야 한다.
 *
 * 목록에 최대한 담는 이유는, 여기서 걸러내지 못하면 하나씩 열어 봐야 하기
 * 때문이다. 제안서가 필요한지·참가비가 있는지는 열기 전에 알아야 한다.
 */
function BidList({
  drafts, profile, onPick, onUnstar, muted,
}: {
  drafts: BidDraft[];
  profile: CompanyProfile | null;
  onPick: (notice: BidNotice) => void;
  onUnstar: (bidNo: string) => void;
  muted?: boolean;
}) {
  const now = Date.now();

  return (
    <ul className="divide-y divide-grey-100 overflow-hidden rounded-xl border border-grey-200 bg-white">
      {drafts.map((d) => {
        const n = d.notice;
        const judgement = profile
          ? judgeBid(n, {
              region: profile.region,
              regionDetail: profile.regionDetail,
              industries: profile.procurementIndustries ?? [],
              registered: profile.procurementRegistered,
              performance: profile.procurementPerformance,
            })
          : null;

        const days = n.bidCloseAt
          ? Math.ceil((Date.parse(n.bidCloseAt) - now) / 86_400_000)
          : null;
        const decision = decisionFromMethod(n.successMethod);

        return (
          <li key={d.bidNo}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => onPick(n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onPick(n);
              }}
              className={`flex w-full cursor-pointer items-start gap-3 px-5 py-4 hover:bg-grey-50 ${
                muted ? 'opacity-60' : ''
              }`}
            >
              <span
                className={`mt-1.5 size-2 shrink-0 rounded-full ${
                  judgement
                    ? {
                        eligible: 'bg-success-strong',
                        actionable: 'bg-warning-strong',
                        growing: 'bg-caution',
                        ineligible: 'bg-grey-300',
                      }[judgement.level]
                    : 'bg-grey-300'
                }`}
              />

              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug text-grey-900">
                  {n.title}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-grey-500">
                  {days != null && (
                    <span
                      className={
                        days < 0
                          ? ''
                          : days <= 3
                            ? 'font-semibold text-danger-strong'
                            : 'font-medium text-grey-700'
                      }
                    >
                      {days < 0 ? '마감' : `D-${days}`}
                    </span>
                  )}
                  <span>{n.agency}</span>
                  {n.estimate != null && (
                    <span className="font-semibold text-grey-700">
                      {formatMoney(n.estimate)}
                    </span>
                  )}

                  {(decision === 'technical' || decision === 'mixed') && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">
                      제안서 필요
                    </span>
                  )}
                  {n.participationFee != null && n.participationFee > 0 && (
                    <span className="rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning-strong">
                      참가비 {formatMoney(n.participationFee)}
                    </span>
                  )}
                  {d.briefStatus === 'done' && d.brief && (
                    <span className="rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success-deep">
                      분석 완료 · 요건 {d.brief.requirements.length}
                    </span>
                  )}
                  {d.briefStatus === 'running' && (
                    <span className="rounded-full bg-grey-100 px-2 py-0.5 font-semibold text-grey-500">
                      읽는 중…
                    </span>
                  )}
                  {d.answers.filter((a) => a.have !== null).length > 0 && (
                    <span className="text-grey-400">
                      답변 {d.answers.filter((a) => a.have !== null).length}개
                    </span>
                  )}
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-2">
                {judgement && (
                  <span
                    className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                      {
                        eligible: 'bg-success-soft text-success-deep',
                        actionable: 'bg-warning-soft text-warning-strong',
                        growing: 'bg-caution-soft text-caution',
                        ineligible: 'bg-grey-100 text-grey-500',
                      }[judgement.level]
                    }`}
                  >
                    {BID_LEVEL_STYLES[judgement.level].mark}{' '}
                    {BID_LEVEL_LABELS[judgement.level]}
                  </span>
                )}

                {/* 여기서 바로 끌 수 있다 — 상세까지 들어갈 일이 아니다 */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnstar(d.bidNo);
                  }}
                  title="관심 해제"
                  className="text-lg leading-none text-star hover:text-grey-400"
                >
                  ★
                </button>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
