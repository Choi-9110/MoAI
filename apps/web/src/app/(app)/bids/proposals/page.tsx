'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BID_DECISION_LABELS, BID_KIND_LABELS, formatMoney } from '@moai/shared';
import { BriefView } from '@/components/bids/brief-view';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { procurementApi, type BidDraft } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * 입찰 제안서.
 *
 * **읽기를 끝낸 공고가 여기 쌓인다.** 공공 입찰 페이지는 "무엇이 올라왔나"를
 * 보는 곳이고, 여기는 "내가 손대고 있는 것"만 남는 곳이다. 둘을 한 화면에
 * 두면 매일 수백 건이 오가는 목록에 내 작업이 묻힌다.
 *
 * 제안서를 쓰지 않아도 되는 공고(가격만 내면 되는 건)도 함께 둔다 —
 * 준비 상태를 확인할 곳이 필요한 것은 마찬가지라서다.
 */
export default function ProposalsPage() {
  const { session } = useAuth();
  const tenantId = session?.tenantId ?? '';

  const [drafts, setDrafts] = useState<BidDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<BidDraft | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      setDrafts(await procurementApi.drafts(tenantId));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 읽기를 끝낸 것만 남긴다.
   *
   * 별만 눌러 둔 공고는 아직 "관심"이지 작업이 아니다. 그건 관심 공고에
   * 있으므로 여기까지 끌고 오면 두 화면이 같아진다.
   */
  const rows = useMemo(
    () =>
      drafts
        .filter((d) => d.briefStatus === 'done' && d.brief)
        .sort((a, b) => {
          /* 마감이 가까운 것부터. 마감이 없는 것은 뒤로 보낸다. */
          const at = a.notice?.bidCloseAt ? Date.parse(a.notice.bidCloseAt) : Infinity;
          const bt = b.notice?.bidCloseAt ? Date.parse(b.notice.bidCloseAt) : Infinity;
          return at - bt;
        }),
    [drafts],
  );

  const running = drafts.filter((d) => d.briefStatus === 'running');

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-5">
        <h1 className="text-xl font-bold text-grey-900">입찰 제안서</h1>
        <p className="mt-1 text-sm text-grey-600">
          읽기를 끝낸 공고가 모입니다. 요건을 채우고 제안서로 이어 갑니다.
        </p>
      </header>

      {/* 읽는 중인 것이 있으면 알린다 — 목록에 아직 안 보이는 이유가 된다 */}
      {running.length > 0 && (
        <Card className="mb-3 flex items-center gap-2.5 p-3.5">
          <span className="animate-pulse text-lg leading-none">◍</span>
          <p className="text-sm text-grey-700">
            {running.length}건을 읽고 있습니다. 끝나면 여기에 올라옵니다.
          </p>
        </Card>
      )}

      {loading ? (
        <Card className="p-8 text-center text-sm text-grey-500">
          불러오는 중입니다…
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold text-grey-800">
            아직 읽은 공고가 없습니다.
          </p>
          <p className="mt-1.5 text-sm leading-6 text-grey-600">
            공공 입찰에서 마음에 드는 공고를 열고 <b>공고 읽기</b>를 누르면,
            무엇을 준비해야 하는지 정리해 여기로 보냅니다.
          </p>
          <Link href="/bids" className="mt-4 inline-block">
            <Button>공공 입찰 보러 가기</Button>
          </Link>
        </Card>
      ) : (
        <div className="space-y-2">
          {rows.map((draft) => (
            <ProposalRow
              key={draft.bidNo}
              draft={draft}
              onOpen={() => setOpen(draft)}
            />
          ))}
        </div>
      )}

      <Modal
        open={open !== null}
        onClose={() => {
          setOpen(null);
          void load();
        }}
        title={open?.notice?.title ?? '입찰 제안서'}
      >
        {open?.notice && (
          <BriefView
            notice={open.notice}
            tenantId={tenantId}
            onClose={() => {
              setOpen(null);
              void load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * 한 줄에 최대한 담는다.
 *
 * 열어 봐야 아는 것이 많을수록 손이 간다. 마감·금액·낙찰 방식·요건 진행까지
 * 여기서 보이면, 다시 열 이유가 줄어든다.
 */
function ProposalRow({
  draft, onOpen,
}: {
  draft: BidDraft;
  onOpen: () => void;
}) {
  const notice = draft.notice;
  if (!notice) return null;

  const answers = draft.answers ?? [];
  const reqs = draft.brief?.requirements ?? [];
  const answerOf = (id: string) => answers.find((a) => a.requirementId === id);

  const answered = reqs.filter((r) => answerOf(r.id)?.have != null).length;

  /** 필수인데 부적합으로 답한 것 — 있으면 먼저 알아야 한다 */
  const missing = reqs.filter(
    (r) => r.required && answerOf(r.id)?.have === false,
  ).length;

  const days = notice.bidCloseAt
    ? Math.floor((Date.parse(notice.bidCloseAt) - Date.now()) / 86_400_000)
    : null;
  const closed = days != null && days < 0;

  return (
    <div onClick={onOpen} role="button" tabIndex={0}>
      <Card
        className={`cursor-pointer p-3.5 transition hover:border-brand ${
          closed ? 'opacity-55' : ''
        }`}
      >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-sm font-semibold leading-6 text-grey-900">
          {notice.title}
        </p>
        {days != null && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
              closed
                ? 'bg-grey-100 text-grey-500'
                : days <= 3
                  ? 'bg-danger-soft text-danger-strong'
                  : 'bg-grey-100 text-grey-600'
            }`}
          >
            {closed ? '마감' : days === 0 ? '오늘' : `D-${days}`}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-grey-600">
        <span>{notice.agency}</span>
        <span className="text-grey-300">·</span>
        <span>{BID_KIND_LABELS[notice.kind]}</span>
        {notice.estimate != null && (
          <>
            <span className="text-grey-300">·</span>
            <span className="font-medium text-grey-800">
              {formatMoney(notice.estimate)}
            </span>
          </>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        {draft.brief && (
          <span className="rounded-full bg-kind-tips-soft px-2 py-0.5 font-semibold text-kind-tips">
            {BID_DECISION_LABELS[draft.brief.decision]}
          </span>
        )}
        {reqs.length > 0 && (
          <span
            className={`rounded-full px-2 py-0.5 font-semibold ${
              answered === reqs.length
                ? 'bg-success-soft text-success-deep'
                : 'bg-grey-100 text-grey-600'
            }`}
          >
            요건 {answered}/{reqs.length}
          </span>
        )}
        {missing > 0 && (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 font-semibold text-danger-strong">
            필수 {missing}건 부적합
          </span>
          )}
        </div>
      </Card>
    </div>
  );
}
