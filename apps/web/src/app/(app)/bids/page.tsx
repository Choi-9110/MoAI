'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  BID_KIND_LABELS, BID_LEVEL_LABELS, BID_LEVEL_STYLES,
  countByLevel, decisionFromMethod, formatMoney, judgeBid, reasonBreakdown,
} from '@moai/shared';
import type { BidJudgement, BidLevel, BidNotice, CompanyProfile } from '@moai/shared';
import { BidTimeline, type TimelineRow } from '@/components/bids/bid-timeline';
import { BriefView } from '@/components/bids/brief-view';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import {
  calendarApi, procurementApi, type BidDraft, type BidListResponse,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * 이유를 사람 말로 옮긴다.
 *
 * 판정이 쓰는 이름(`지역`·`규모`)은 짧아서 표에는 맞지만, 요약에서는
 * "그래서 뭐가 문제인지" 가 바로 읽혀야 한다.
 */
const REASON_TEXT: Record<string, string> = {
  마감: '이미 마감됐습니다',
  지역: '참가 가능 지역이 아닙니다',
  업종: '업종이 맞지 않습니다',
  '조달청 등록': '조달청 입찰참가자격 등록이 필요합니다',
  규모: '공고 규모가 실적에 비해 큽니다',
};

/** 내 정보를 고치면 달라지는 것들 — 마감처럼 어쩔 수 없는 것과 구분한다 */
const FIXABLE = ['지역', '업종', '조달청 등록', '규모'];

/** 층별 색 — 신호등 그대로다. 기호와 이름이 함께 가야 색약에서도 읽힌다. */
const TONE: Record<BidLevel, { chip: string; dot: string; border: string }> = {
  eligible: {
    chip: 'bg-success-soft text-success-deep',
    dot: 'text-success-strong',
    border: 'border-l-success-strong',
  },
  actionable: {
    chip: 'bg-warning-soft text-warning-strong',
    dot: 'text-warning-strong',
    border: 'border-l-warning-strong',
  },
  growing: {
    chip: 'bg-caution-soft text-caution',
    dot: 'text-caution',
    border: 'border-l-caution',
  },
  ineligible: {
    chip: 'bg-grey-100 text-grey-500',
    dot: 'text-grey-400',
    border: 'border-l-grey-300',
  },
};

/** 화면에 쌓는 순서 — 지금 할 수 있는 것이 위 */
const ORDER: BidLevel[] = ['eligible', 'actionable', 'growing', 'ineligible'];

export default function BidsPage() {
  const { session } = useAuth();

  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [data, setData] = useState<BidListResponse | null>(null);
  /**
   * 공고번호 → 준비 메모.
   *
   * 어떤 공고를 이미 읽었는지, 별을 달아 뒀는지 목록에서 바로 보이게 한다.
   * 이게 없으면 스무 건 중 어디까지 봤는지 알 수가 없어 같은 것을 또 연다.
   */
  const [drafts, setDrafts] = useState<Record<string, BidDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 넣을 수 없는 것은 접어 둔다 — 지우지는 않는다 */
  const [showClosed, setShowClosed] = useState(false);
  /** 별 단 것만 보기 — 준비하려는 공고만 추려 볼 때 */
  const [onlyStarred, setOnlyStarred] = useState(false);
  /**
   * 읽고 있는 공고.
   *
   * 별도 주소로 두지 않는 이유는 목록이 DB 가 아니라 캐시에 있어서다 —
   * 주소로 들어오면 그 공고를 되찾을 방법이 없다.
   */
  const [reading, setReading] = useState<BidNotice | null>(null);

  /** 조달청에서 받아 오는 중인가 — 기다리는 동안 무엇을 하는지 알려 준다 */
  const [waiting, setWaiting] = useState(false);
  const [waitedSec, setWaitedSec] = useState(0);

  const load = useCallback(async (refresh = false) => {
    if (!session) return;
    setLoading(true);
    try {
      const p = await calendarApi.defaultProfile(session.tenantId).catch(() => null);
      setProfile(p);

      if (p && (p.interests ?? []).includes('bid')) {
        const [list, saved] = await Promise.all([
          procurementApi.bids(session.tenantId, 14, refresh),
          procurementApi.drafts(session.tenantId).catch(() => []),
        ]);
        setDrafts(Object.fromEntries(saved.map((d) => [d.bidNo, d])));

        /*
         * **아직 도는 중이면 기다리지 않는다.**
         *
         * 조달청은 업종마다 한 번씩 물어야 해서 30초를 넘기기도 한다.
         * 화면을 붙잡아 두면 멈춘 줄 알고 새로고침을 누르고, 그러면
         * 처음부터 다시 돈다. 대신 몇 초마다 다 됐는지 물어본다 —
         * 다른 화면으로 가도 알림이 대신 알려 준다.
         */
        if (list.status === 'running') {
          setWaiting(true);
          setData(null);
        } else {
          setWaiting(false);
          setData(list);
        }
      } else {
        setData(null);
        setDrafts({});
      }
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * 도는 동안 몇 초마다 물어본다.
   *
   * 3초는 조달청이 한 업종을 받아 오는 시간보다 짧다. 더 뜸하게 물으면
   * 다 끝났는데도 화면이 한참 기다리는 것처럼 보인다.
   */
  useEffect(() => {
    if (!waiting || !session) return;

    const startedAt = Date.now();
    const tick = setInterval(() => {
      setWaitedSec(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);

    const poll = setInterval(() => {
      void procurementApi
        .bidsStatus(session.tenantId)
        .then((s) => {
          if (s.status === 'done' && s.result) {
            setWaiting(false);
            setData(s.result);
          } else if (s.status === 'failed') {
            setWaiting(false);
            setError(s.error ?? '입찰 공고를 가져오지 못했습니다.');
          }
        })
        .catch(() => {});
    }, 3000);

    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [waiting, session]);

  /** 별 켜고 끄기 — 화면을 먼저 바꾸고 저장한다 */
  const toggleStar = useCallback(
    async (notice: BidNotice) => {
      if (!session) return;
      const next = !drafts[notice.bidNo]?.starred;

      setDrafts((prev) => ({
        ...prev,
        [notice.bidNo]: {
          ...(prev[notice.bidNo] ?? ({} as BidDraft)),
          bidNo: notice.bidNo,
          notice,
          starred: next,
        } as BidDraft,
      }));

      await procurementApi
        .saveDraft(session.tenantId, notice.bidNo, { notice, starred: next })
        .catch(() => void load());
    },
    [session, drafts, load],
  );

  /** 판정은 화면에서 한다 — 프로필이 바뀌면 다시 부르지 않아도 즉시 반영된다 */
  const judged = useMemo(() => {
    if (!data || !profile) return [];
    return data.items.map((notice) => ({
      notice,
      judgement: judgeBid(notice, {
        region: profile.region,
        regionDetail: profile.regionDetail,
        industries: profile.procurementIndustries ?? [],
        registered: profile.procurementRegistered,
        performance: profile.procurementPerformance,
      }),
    }));
  }, [data, profile]);

  const counts = useMemo(
    () => countByLevel(judged.map((j) => j.judgement)),
    [judged],
  );

  /** 층을 눌러 펼친 것 — 왜 그 층인지 보여 준다 */
  const [openLevel, setOpenLevel] = useState<BidLevel | null>(null);

  const breakdown = useMemo(
    () => reasonBreakdown(judged.map((j) => j.judgement)),
    [judged],
  );

  const starredCount = useMemo(
    () => judged.filter((j) => drafts[j.notice.bidNo]?.starred).length,
    [judged, drafts],
  );

  /** 화면에 실제로 그릴 목록 — 관심 필터와 마감 접기를 함께 적용한다 */
  const visibleRows = useMemo(() => {
    let rows = judged;
    if (onlyStarred) rows = rows.filter((j) => drafts[j.notice.bidNo]?.starred);
    if (!showClosed) rows = rows.filter((j) => j.judgement.level !== 'ineligible');
    return rows;
  }, [judged, drafts, onlyStarred, showClosed]);

  if (loading) return <Center>불러오는 중…</Center>;

  /*
   * **기다리는 동안 무엇을 하는지 말해 준다.**
   *
   * "불러오는 중" 만 띄우면 30초가 멈춘 것처럼 느껴진다. 조달청에서 받아
   * 오는 중이라는 것, 오래 걸린다는 것, 그리고 **여기 있지 않아도 된다는
   * 것**을 알려야 사람이 다른 일을 하러 간다.
   */
  if (waiting) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <Card className="p-8 text-center">
          <span className="inline-block animate-pulse text-2xl">◍</span>
          <p className="mt-3 font-bold text-grey-900">
            나라장터에서 공고를 받아오고 있어요
          </p>
          <p className="mt-2 text-sm leading-6 text-grey-600">
            업종마다 조달청에 따로 물어야 해서 <b>30초쯤</b> 걸립니다.
            <br />
            <b>이 화면에 계시지 않아도 됩니다</b> — 다 되면 알려 드릴게요.
          </p>
          <p className="tabular mt-3 text-sm text-grey-400">
            {waitedSec}초째 기다리는 중
          </p>
        </Card>
      </div>
    );
  }

  /* ── 켜지 않은 사람 — 잔소리하지 않고 무엇인지만 알려 준다 ── */
  if (!profile || !(profile.interests ?? []).includes('bid')) {
    return (
      <Empty
        title="공공 입찰은 아직 꺼져 있어요"
        body="관공서가 발주하는 공사·용역을 수주하려는 분을 위한 기능입니다. 내 정보에서 켜면 보유 업종에 맞는 공고만 골라 드려요."
        action={{ href: '/profile', label: '내 정보에서 켜기' }}
      />
    );
  }

  /* ── 켰지만 업종이 없는 경우 — 여기가 가장 흔하다 ── */
  if ((profile.procurementIndustries ?? []).length === 0) {
    return (
      <Empty
        title="업종을 고르면 공고가 보여요"
        body="어떤 면허를 갖고 계신지 알아야 넣을 수 있는 공고를 골라 드릴 수 있어요. 하나만 골라도 바로 보입니다."
        action={{ href: '/profile', label: '업종 고르기' }}
      />
    );
  }

  if (error) {
    return (
      <Empty
        title="공고를 불러오지 못했어요"
        body={error}
        action={{ onClick: () => void load(), label: '다시 시도' }}
      />
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-grey-900">
            공공 입찰
          </h1>
          <p className="mt-1 text-[15px] text-grey-600">
            {profile.region && <b className="text-grey-800">{profile.region}</b>}
            {profile.region && ' · '}
            {(profile.procurementIndustries ?? []).length}개 업종 기준 · 최근 14일
          </p>
        </div>

      </header>

      {/*
        층별 요약 — 이 화면에서 가장 먼저 읽히는 줄.

        **숫자만으로는 할 일을 못 정한다.** `넣을 수 없음 264` 가 전부
        마감된 것인지, 지역이 안 맞는 것인지에 따라 사람이 할 일이 다르다.
        마감은 어쩔 수 없지만 지역이라면 내 정보를 고치면 되기 때문이다.

        그래서 눌러서 펼치게 했다. 마우스를 올리는 방식이 아닌 이유는
        휴대폰에는 올릴 마우스가 없어서다.
      */}
      <Card className="mb-5">
        <div className="flex flex-wrap gap-x-6 gap-y-3">
          {ORDER.map((lv) => {
            const why = breakdown[lv];
            const open = openLevel === lv;
            return (
              <button
                key={lv}
                type="button"
                onClick={() => setOpenLevel(open ? null : lv)}
                disabled={why.length === 0}
                className={`flex min-h-[40px] items-center gap-2 rounded-lg px-2 py-2 transition ${
                  why.length > 0 ? 'hover:bg-grey-100' : 'cursor-default'
                } ${open ? 'bg-grey-100' : ''}`}
              >
                <span className={`text-lg leading-none ${TONE[lv].dot}`}>
                  {BID_LEVEL_STYLES[lv].mark}
                </span>
                <span className="text-sm text-grey-600">
                  {BID_LEVEL_LABELS[lv]}
                </span>
                <span className="tabular text-sm font-bold text-grey-900">
                  {counts[lv]}
                </span>
                {why.length > 0 && (
                  <span className="text-[10px] text-grey-400">
                    {open ? '▲' : '▼'}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {openLevel && breakdown[openLevel].length > 0 && (
          <div className="mt-3 border-t border-grey-100 pt-3">
            <p className="mb-1.5 text-xs font-semibold text-grey-500">
              {BID_LEVEL_LABELS[openLevel]} — 이유
            </p>
            <div className="space-y-1">
              {breakdown[openLevel].map(({ field, count }) => (
                <div
                  key={field}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span className="text-grey-700">
                    {REASON_TEXT[field] ?? `${field} 조건이 맞지 않습니다`}
                  </span>
                  <span className="tabular shrink-0 font-semibold text-grey-900">
                    {count}건
                  </span>
                </div>
              ))}
            </div>
            {/* 고칠 수 있는 것이면 어디서 고치는지까지 알려 준다 */}
            {breakdown[openLevel].some((r) => FIXABLE.includes(r.field)) && (
              <Link
                href="/profile"
                className="mt-2 inline-block text-xs font-semibold text-brand"
              >
                내 정보에서 고치기 →
              </Link>
            )}
          </div>
        )}
      </Card>

      {judged.length === 0 ? (
        <Empty
          inline
          title="지금 올라온 공고가 없어요"
          body="새 공고는 계속 올라옵니다. 조건에 맞는 것이 생기면 여기에 보여요."
          action={{ onClick: () => void load(true), label: '새로고침' }}
        />
      ) : (
        <BidTimeline
          rows={visibleRows}
          renderCard={({ notice, judgement }: TimelineRow) => (
            <BidCard
              key={notice.id}
              notice={notice}
              judgement={judgement}
              draft={drafts[notice.bidNo]}
              onRead={() => setReading(notice)}
              onStar={() => void toggleStar(notice)}
            />
          )}
          emptyNote={
            <Empty
              inline
              title="마감이 남은 공고가 없어요"
              body="받아온 공고가 모두 마감됐습니다. 새 공고는 계속 올라옵니다."
              action={{ onClick: () => void load(), label: '새로고침' }}
            />
          }
        />
      )}

      {/*
        넣을 수 없는 공고도 지우지 않는다. 아무것도 안 보이면 고장인지
        진짜 없는 건지 구분이 안 된다.
      */}
      {judged.length > 0 && counts.ineligible > 0 && (
        <button
          type="button"
          onClick={() => setShowClosed((v) => !v)}
          className="mt-4 w-full rounded-xl border border-dashed border-grey-200 py-2.5 text-sm text-grey-500 hover:bg-grey-50"
        >
          {showClosed
            ? '넣을 수 없는 공고 접기'
            : `넣을 수 없는 공고 ${counts.ineligible}건 보기`}
        </button>
      )}


      {/*
        공고 상세는 팝업으로 연다 — 지원사업 쪽과 같은 방식이다.
        화면을 통째로 바꾸면 목록에서 어디를 보고 있었는지 잃는다.
      */}
      <Modal
        open={reading !== null}
        onClose={() => setReading(null)}
        title="공고 읽기"
        wide
      >
        {reading && (
          <BriefView
            notice={reading}
            tenantId={session?.tenantId ?? null}
            onClose={() => setReading(null)}
          />
        )}
      </Modal>

      {data && (
        <p className="mt-6 text-xs leading-relaxed text-grey-400">
          나라장터에서 직접 받아온 공고입니다 (호출 {data.calls} · 캐시{' '}
          {data.cached}). 투찰은 나라장터에서 직접 하셔야 하며, 자격 요건은
          공고 원문을 확인해 주세요.
        </p>
      )}
    </main>
  );
}

/* ────────────── 조각 ────────────── */

function BidCard({
  notice, judgement, draft, onRead, onStar,
}: {
  notice: BidNotice;
  judgement: BidJudgement;
  draft?: BidDraft;
  onRead: () => void;
  onStar: () => void;
}) {
  const tone = TONE[judgement.level];
  const money = notice.estimate ?? notice.budget;

  /** 수치로 얼마나 모자란지 보여 줄 수 있는 근거만 고른다 */
  const gap = judgement.reasons.find((r) => r.progress);

  return (
    /*
     * 카드 아무 데나 눌러 상세로 간다.
     *
     * 버튼 하나만 누를 수 있게 두면, 첨부가 없어 그 버튼이 사라진 공고는
     * 아예 열 방법이 없어진다(전체의 8%쯤 된다). 안쪽 링크는 그대로
     * 동작해야 하므로 그쪽에서 이벤트를 멈춘다.
     */
    <article
      role="button"
      tabIndex={0}
      onClick={onRead}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onRead();
        }
      }}
      className={`cursor-pointer rounded-xl border border-grey-200 border-l-4 bg-white p-4 transition-colors hover:bg-grey-50 ${tone.border}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold leading-snug text-grey-900">
            {notice.title}
          </p>
          <p className="mt-1 text-xs text-grey-500">
            {notice.agency}
            {notice.demandAgency && notice.demandAgency !== notice.agency && (
              <> · 수요 {notice.demandAgency}</>
            )}
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          <span
            className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone.chip}`}
          >
            {BID_LEVEL_STYLES[judgement.level].mark}{' '}
            {BID_LEVEL_LABELS[judgement.level]}
          </span>
          {/* 목록에서 바로 담고 끈다 — 상세까지 들어갈 일이 아니다 */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onStar();
            }}
            title={draft?.starred ? '관심 해제' : '관심 공고로 담기'}
            /* 별 하나는 18px 밖에 안 돼 손가락으로 겨냥하기 어렵다 */
            className={`-m-1.5 flex h-10 w-10 items-center justify-center text-lg leading-none ${
              draft?.starred
                ? 'text-star'
                : 'text-grey-300 hover:text-grey-400'
            }`}
          >
            {draft?.starred ? '★' : '☆'}
          </button>
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-grey-600">
        <span className="rounded bg-grey-100 px-1.5 py-0.5 font-medium">
          {BID_KIND_LABELS[notice.kind]}
        </span>
        {notice.contractMethod && <span>{notice.contractMethod}</span>}
        {money != null && (
          <span className="font-semibold text-grey-800">{formatMoney(money)}</span>
        )}
        {notice.bidCloseAt && <Deadline at={notice.bidCloseAt} />}

        {/*
          제안서가 필요한 건인지 — 공고문을 읽지 않아도 낙찰방법에 적혀 있다.
          가격형 공고에 며칠 들여 제안서를 쓰는 것이 가장 큰 손해라 목록에서
          바로 가른다.
        */}
        {(() => {
          const d = decisionFromMethod(notice.successMethod);
          if (d === 'technical' || d === 'mixed') {
            return (
              <span className="rounded-full bg-brand/10 px-2 py-0.5 font-semibold text-brand">
                제안서 필요
              </span>
            );
          }
          if (d === 'price') {
            return <span className="text-grey-500">입찰가만</span>;
          }
          return null;
        })()}

        {notice.reNotice && (
          <span
            className="rounded-full bg-grey-100 px-2 py-0.5 font-medium text-grey-600"
            title="지난번에 유찰된 공고입니다. 경쟁이 덜할 수 있어요."
          >
            재공고
          </span>
        )}

        {/*
          참가 가능 지역 — **시·군까지** 온다(`전북특별자치도 군산시`).
          목록의 시·도보다 훨씬 좁아서, 열어 보기 전에 여기서 걸러진다.
        */}
        {notice.allowedRegions?.length ? (
          <span className="rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success-strong">
            {notice.allowedRegions.length > 1
              ? `${notice.allowedRegions[0]} 외 ${notice.allowedRegions.length - 1}`
              : notice.allowedRegions[0]}
            만
          </span>
        ) : null}

        {/* 참가 수수료 — 드물지만 크다. 열어보기 전에 보여야 한다 */}
        {notice.participationFee != null && notice.participationFee > 0 && (
          <span className="rounded-full bg-warning-soft px-2 py-0.5 font-semibold text-warning-strong">
            참가비 {formatMoney(notice.participationFee)}
          </span>
        )}

        {/*
          이미 읽어 둔 공고인지. 요건 개수까지 보여 주면 "얼마나 까다로운
          건인지"가 목록에서 바로 가늠된다.
        */}
        {draft?.briefStatus === 'done' && draft.brief && (
          <span className="rounded-full bg-success-soft px-2 py-0.5 font-semibold text-success-deep">
            분석 완료 · 요건 {draft.brief.requirements.length}
          </span>
        )}
        {draft?.briefStatus === 'running' && (
          <span className="rounded-full bg-grey-100 px-2 py-0.5 font-semibold text-grey-500">
            읽는 중…
          </span>
        )}
      </div>

      {/* 모자란 것을 수치로 — "3천만 / 1.5억" */}
      {gap?.progress && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-xs text-grey-500">
            <span>{gap.message}</span>
            <span className="tabular ml-2 shrink-0 font-semibold text-grey-700">
              {formatMoney(gap.progress.have)} / {formatMoney(gap.progress.need)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-grey-100">
            <div
              className="h-full rounded-full bg-grey-400"
              style={{ width: `${Math.max(gap.progress.ratio * 100, 2)}%` }}
            />
          </div>
        </div>
      )}

      {/* 지금 하면 되는 일이 있으면 그것만 굵게 */}
      {judgement.todo && (
        <p className="mt-2.5 text-xs font-semibold text-warning-strong">
          → {judgement.todo}만 하면 넣을 수 있어요
        </p>
      )}

      {judgement.level === 'ineligible' && (
        <p className="mt-2.5 text-xs text-grey-500">
          {judgement.reasons.find((r) => r.verdict === 'fail')?.message}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {notice.url && (
          <a
            href={notice.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="-my-2 inline-flex min-h-[40px] items-center gap-1 py-2 text-xs font-semibold text-brand"
          >
            나라장터에서 보기
            <Icon name="arrow" size={12} />
          </a>
        )}
      </div>
    </article>
  );
}

/** 남은 날짜 — 입찰은 마감이 짧아 이 한 줄이 제일 급하다 */
function Deadline({ at }: { at: string }) {
  const ms = Date.parse(at) - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  const label = at.slice(5, 16).replace('T', ' ');

  if (ms < 0) return <span className="text-grey-400">{label} 마감됨</span>;
  if (days <= 3) {
    return (
      <span className="font-semibold text-danger-strong">
        {label} · D-{Math.max(days, 0)}
      </span>
    );
  }
  return (
    <span>
      {label} · D-{days}
    </span>
  );
}

function Empty({
  title, body, action, inline,
}: {
  title: string;
  body: string;
  action?: { href?: string; onClick?: () => void; label: string };
  inline?: boolean;
}) {
  const inner = (
    <div className="mx-auto max-w-md text-center">
      <p className="text-base font-bold text-grey-900">{title}</p>
      <p className="mt-2 text-sm leading-relaxed text-grey-600">{body}</p>
      {action && (
        <div className="mt-4">
          {action.href ? (
            <Link href={action.href}>
              <Button variant="brand">{action.label}</Button>
            </Link>
          ) : (
            <Button variant="secondary" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (inline) return <Card className="py-10">{inner}</Card>;
  return (
    <main className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">{inner}</main>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid h-full place-items-center">
      <p className="text-sm text-grey-400">{children}</p>
    </main>
  );
}
