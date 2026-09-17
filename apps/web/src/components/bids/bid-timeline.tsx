'use client';

import { useState, type ReactNode } from 'react';
import type { BidJudgement, BidNotice } from '@moai/shared';

/**
 * 마감 임박 타임라인.
 *
 * **왜 달력이 아니라 이것이 기본인가.** 입찰은 마감이 3~10일이라 달력에
 * 얹으면 이번 주 칸만 꽉 차고 나머지가 텅 빈다. 사람이 궁금한 것도
 * "며칠 남았나"이지 "몇 일에 마감인가"가 아니다.
 *
 * 그래서 남은 날짜로 묶는다. 오늘·내일이 맨 위에 오고, 그 아래로 멀어진다.
 */
export interface TimelineRow {
  notice: BidNotice;
  judgement: BidJudgement;
}

interface Bucket {
  key: string;
  label: string;
  /** 남은 날짜 하한 (이상) */
  from: number;
  /** 남은 날짜 상한 (미만) */
  to: number;
  urgent?: boolean;
}

/**
 * 묶는 단위.
 *
 * 앞쪽은 하루 단위로 쪼개고 뒤로 갈수록 넓게 묶는다 — 오늘과 내일은 전혀
 * 다른 일이지만, 12일 뒤와 13일 뒤는 사실상 같기 때문이다.
 */
const BUCKETS: Bucket[] = [
  { key: 'today', label: '오늘 마감', from: 0, to: 1, urgent: true },
  { key: 'tomorrow', label: '내일 마감', from: 1, to: 2, urgent: true },
  { key: 'd3', label: '3일 안', from: 2, to: 4, urgent: true },
  { key: 'week', label: '이번 주', from: 4, to: 8 },
  { key: 'next', label: '다음 주', from: 8, to: 15 },
  { key: 'later', label: '2주 뒤부터', from: 15, to: Infinity },
];

export function BidTimeline({
  rows, renderCard, emptyNote,
}: {
  rows: TimelineRow[];
  renderCard: (row: TimelineRow) => ReactNode;
  emptyNote: ReactNode;
}) {
  const now = Date.now();

  /** 마감이 없는 것은 따로 모은다 — 급하지 않지만 사라지면 안 된다 */
  const undated = rows.filter((r) => !r.notice.bidCloseAt);
  const dated = rows.filter((r) => r.notice.bidCloseAt);

  const daysLeft = (row: TimelineRow): number =>
    Math.floor((Date.parse(row.notice.bidCloseAt!) - now) / 86_400_000);

  const groups = BUCKETS.map((bucket) => ({
    bucket,
    items: dated
      .filter((r) => {
        const d = daysLeft(r);
        return d >= bucket.from && d < bucket.to;
      })
      .sort(
        (a, b) =>
          Date.parse(a.notice.bidCloseAt!) - Date.parse(b.notice.bidCloseAt!),
      ),
  })).filter((g) => g.items.length > 0);

  if (groups.length === 0 && undated.length === 0) return <>{emptyNote}</>;

  return (
    <div className="space-y-6">
      {groups.map(({ bucket, items }) => (
        <Section
          key={bucket.key}
          label={bucket.label}
          count={items.length}
          urgent={bucket.urgent}
        >
          {items.map(renderCard)}
        </Section>
      ))}

      {undated.length > 0 && (
        <Section label="마감일 미정" count={undated.length}>
          {undated.map(renderCard)}
        </Section>
      )}
    </div>
  );
}

/**
 * 접을 수 있는 묶음.
 *
 * 한 묶음에 수십 건이 들어가면 그 아래 묶음은 화면 밖으로 밀려난다.
 * 다 본 묶음을 접어 두면 다음 것이 바로 올라온다.
 *
 * **처음에는 모두 펼쳐 둔다.** 접힌 채로 시작하면 공고가 있는데 없는 것처럼
 * 보인다 — 목록에서 그보다 나쁜 일은 없다.
 */
function Section({
  label, count, urgent, children,
}: {
  label: string;
  count: number;
  urgent?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        /* 손가락으로 누르는 곳이라 40px 은 확보한다 */
        className="mb-1 flex min-h-[40px] w-full items-center gap-2 py-1 text-sm font-bold"
      >
        <span className={urgent ? 'text-danger-strong' : 'text-grey-700'}>
          {label}
        </span>
        <span className="tabular font-normal text-grey-400">{count}</span>
        {urgent && (
          <span className="rounded-full bg-danger-soft px-2 py-0.5 text-[11px] font-semibold text-danger-strong">
            서두르세요
          </span>
        )}
        <span className="ml-auto text-[10px] font-normal text-grey-400">
          {open ? '▲ 접기' : '▼ 펼치기'}
        </span>
      </button>
      {open && <div className="space-y-2">{children}</div>}
    </section>
  );
}
