'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { describeAudience } from '@moai/shared';
import type { BriefItem } from '@moai/shared';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { briefApi, type BriefDetail, type BriefListItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * 정책 브리핑.
 *
 * **뉴스를 늘어놓는 곳이 아니다.** 예산안 한 건에 변화가 스무 개씩 들어 있고
 * 그중 나에게 해당하는 것은 두어 개다. 나머지를 읽느라 그 둘을 놓치는 것이
 * 지금까지의 문제였다. 그래서 **내 것을 위로 올리고 나머지는 접어 둔다.**
 */
export function BriefsModal({
  open: isOpen, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { session } = useAuth();
  const tenantId = session?.tenantId;

  const [list, setList] = useState<BriefListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<BriefDetail | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(await briefApi.list(tenantId));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  /* 닫았다 열면 목록부터 — 지난번에 보던 글이 남아 있으면 어리둥절하다 */
  useEffect(() => {
    if (!isOpen) setOpen(null);
  }, [isOpen]);

  async function openBrief(id: string) {
    setOpen(await briefApi.detail(id, tenantId));
  }

  return (
    <Modal
      open={isOpen}
      onClose={onClose}
      title={open ? open.title : '정책 브리핑'}
    >
      {open ? (
        <div>
          {/*
            **팝업 안에서 되돌아간다.** 글을 열었다고 페이지를 옮기면
            보던 자리를 잃고, 돌아오려면 뒤로가기를 눌러야 한다.
          */}
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="mb-3 flex min-h-[36px] items-center gap-1 text-sm font-semibold text-grey-600 hover:text-grey-900"
          >
            ← 목록으로
          </button>
          <BriefBody brief={open} />
        </div>
      ) : (
        <BriefList
          list={list}
          loading={loading}
          onPick={(id) => void openBrief(id)}
        />
      )}
    </Modal>
  );
}

/** 목록 — 어느 글이 나와 상관있는지 세어 보여 준다 */
function BriefList({
  list, loading, onPick,
}: {
  list: BriefListItem[];
  loading: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div>
      <p className="mb-4 text-sm leading-6 text-grey-600">
        예산안과 정책 발표는 곧 공고로 바뀝니다. 그중 <b>내 조건에 걸리는
        것</b>을 먼저 보여 드립니다.
      </p>

      {loading ? (
        <Card className="p-8 text-center text-sm text-grey-500">
          불러오는 중입니다…
        </Card>
      ) : list.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-semibold text-grey-800">
            아직 올라온 브리핑이 없습니다.
          </p>
          <p className="mt-1.5 text-sm leading-6 text-grey-600">
            정부 예산안·정책 발표가 나오면 여기에 정리해 올립니다.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map((b) => (
            <Card
              key={b.id}
              className="cursor-pointer p-4 transition-colors hover:border-brand"
            >
              <div onClick={() => onPick(b.id)} role="button" tabIndex={0}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] font-bold leading-snug text-grey-900">
                    {b.title}
                  </p>
                  {/*
                    나에게 걸리는 것이 있으면 그것부터 알린다 — 목록에서
                    "이 글이 나와 상관있나"를 알아야 열지 말지 정한다.
                  */}
                  {b.matchedCount > 0 && (
                    <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-white">
                      내 조건 {b.matchedCount}개
                    </span>
                  )}
                </div>

                <p className="mt-1 text-xs text-grey-500">
                  {b.source}
                  <span className="mx-1.5 text-grey-300">·</span>
                  {b.publishedAt}
                  <span className="mx-1.5 text-grey-300">·</span>
                  변화 {b.totalCount}개
                </p>

                <p className="mt-2 text-sm leading-6 text-grey-700">
                  {b.summary}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

    </div>
  );
}

function BriefBody({ brief }: { brief: BriefDetail }) {
  const matched = new Set(brief.matchedIds);
  const mine = brief.items.filter((i) => matched.has(i.id));
  const others = brief.items.filter((i) => !matched.has(i.id));

  /** 프로필이 비어 있으면 고를 근거가 없다 — 그 사실을 숨기지 않는다 */
  const knowsNothing =
    !brief.basis.stage && brief.basis.years === null && !brief.basis.region;

  return (
    <div>
      <p className="text-xs text-grey-500">
        {brief.source}
        <span className="mx-1.5 text-grey-300">·</span>
        {brief.publishedAt}
      </p>
      <p className="mt-2 text-sm leading-6 text-grey-700">{brief.summary}</p>

      {/*
        프로필이 비어 있으면 **가르지 않고 전부 보여 준다.**

        조건을 모르면 매칭은 전부 통과하므로(모르는 것으로 막지 않는다),
        갈라 봐야 한쪽이 텅 빈다. 예전에는 이 경우 안내만 뜨고 항목이 하나도
        안 보였다 — 정작 읽으러 온 내용이 사라진 것이다.
      */}
      {knowsNothing && (
        <div className="mt-4 rounded-xl bg-grey-50 p-3.5">
          <p className="text-sm font-semibold text-grey-800">
            내 조건을 아직 모릅니다.
          </p>
          <p className="mt-1 text-sm leading-6 text-grey-600">
            내 정보에 사업자 형태·창업일·지역을 넣으면, 이 중 나에게 해당하는
            것만 골라 위로 올려 드립니다.
          </p>
          <Link
            href="/profile"
            className="mt-2 inline-block text-sm font-semibold text-brand"
          >
            내 정보 채우기 →
          </Link>
        </div>
      )}

      {!knowsNothing && mine.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-brand">
            나에게 해당하는 변화 {mine.length}개
          </p>
          <div className="space-y-2">
            {mine.map((it) => (
              <ItemRow key={it.id} item={it} mine />
            ))}
          </div>
        </div>
      )}

      {/* 조건을 모를 때는 여기에 전부 들어온다 */}
      {(knowsNothing ? brief.items : others).length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-grey-500">
            {knowsNothing
              ? `변화 ${brief.items.length}개`
              : mine.length > 0
                ? `나머지 변화 ${others.length}개`
                : `변화 ${others.length}개`}
          </p>
          <div className="space-y-2">
            {(knowsNothing ? brief.items : others).map((it) => (
              <ItemRow key={it.id} item={it} />
            ))}
          </div>
        </div>
      )}

      {brief.sourceUrl && (
        <a
          href={brief.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block text-sm font-semibold text-brand"
        >
          원문 보러 가기 →
        </a>
      )}
    </div>
  );
}

function ItemRow({ item, mine = false }: { item: BriefItem; mine?: boolean }) {
  const who = describeAudience(item.audience);

  return (
    <div
      className={`rounded-xl border p-3.5 ${
        mine ? 'border-brand bg-brand-light/30' : 'border-grey-200 bg-white'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <p className="text-sm font-bold text-grey-900">{item.label}</p>
        {/* 새로 생긴 것은 따로 짚는다 — 기존 사업의 증액과 무게가 다르다 */}
        {item.isNew && (
          <span className="rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-deep">
            신설
          </span>
        )}
      </div>

      {item.amount && (
        <p className="mt-1 text-sm font-semibold text-grey-800">
          {item.amount}
        </p>
      )}
      <p className="mt-1 text-sm leading-6 text-grey-600">{item.detail}</p>

      {who && (
        <p className="mt-1.5 text-xs text-grey-500">대상 · {who}</p>
      )}
    </div>
  );
}
