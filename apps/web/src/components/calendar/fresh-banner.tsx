'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatMoney } from '@moai/shared';
import type { CalendarItem } from '@moai/shared';
import { Card } from '@/components/ui/card';
import { calendarApi } from '@/lib/api';

/**
 * 어제 새로 올라온 공고.
 *
 * **몰아서 주지 않는다.** 쌓아 두었다가 한 번에 스무 건을 내밀면 그날 하루도
 * 안 본다. 하루치만, 대신 매일 준다 — 그래야 매일 들어온다.
 *
 * **기간을 정확히 적는다.** "어제"라고만 하면 언제부터인지 알 수 없다.
 * 수집은 새벽에 도는데 사람은 낮에 보기 때문이다.
 */
export function FreshBanner({ tenantId }: { tenantId?: string }) {
  const [data, setData] = useState<{
    from: string | null;
    to: string | null;
    total: number;
    matched: number;
    items: CalendarItem[];
  } | null>(null);

  /** 오늘 것을 닫았는지 — 닫아도 내일이면 다시 뜬다 */
  const [closed, setClosed] = useState(false);

  useEffect(() => {
    void calendarApi
      .fresh(tenantId)
      .then(setData)
      .catch(() => setData(null));
  }, [tenantId]);

  useEffect(() => {
    if (!data?.to) return;
    try {
      setClosed(localStorage.getItem('moai.fresh.closed') === data.to);
    } catch {
      /* 사생활 보호 모드 등 — 못 읽으면 그냥 띄운다 */
    }
  }, [data?.to]);

  if (!data || data.total === 0 || closed) return null;

  return (
    <Card className="mb-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-bold text-grey-900">
            새로 올라온 공고 {data.total}건
            {data.matched > 0 && (
              <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">
                내 조건 {data.matched}건
              </span>
            )}
          </p>

          {/* 기간 — 이게 있어야 "어제"가 언제인지 안다 */}
          <p className="tabular mt-1 text-xs text-grey-500">
            {span(data.from, data.to)}
          </p>

          {/*
            맞는 것만 보여 준다. 안 맞는 것까지 늘어놓으면 하루치가 다시
            스무 줄이 되고, 그러면 몰아 준 것과 같아진다.
          */}
          {data.matched > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {data.items.slice(0, 3).map((it) => (
                <li key={it.grant.id} className="flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-success-strong" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium leading-snug text-grey-800">
                      {it.grant.title}
                    </span>
                    <span className="tabular text-xs text-grey-500">
                      {it.dDay != null && it.dDay >= 0 && `D-${it.dDay}`}
                      {it.grant.amountMax != null &&
                        ` · 최대 ${formatMoney(it.grant.amountMax)}`}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}

          {data.matched === 0 && (
            <p className="mt-1.5 text-sm leading-6 text-grey-600">
              그중 내 조건에 맞는 것은 없었습니다.
            </p>
          )}

          <Link
            href="/calendar?view=list"
            className="mt-2.5 inline-block text-sm font-semibold text-brand"
          >
            전체 보기 →
          </Link>
        </div>

        <button
          type="button"
          onClick={() => {
            setClosed(true);
            try {
              if (data.to) localStorage.setItem('moai.fresh.closed', data.to);
            } catch {
              /* 못 써도 이번 화면에서는 닫힌다 */
            }
          }}
          aria-label="오늘은 닫기"
          className="-m-2 flex size-10 shrink-0 items-center justify-center text-grey-400 hover:text-grey-600"
        >
          ✕
        </button>
      </div>
    </Card>
  );
}

/**
 * `09/01 04:12 ~ 09/02 04:08` 로 적는다.
 *
 * 날짜를 빼고 시각만 적으면 하루를 넘겼는지 알 수 없고, 연도까지 적으면
 * 길어져서 안 읽힌다.
 */
function span(from: string | null, to: string | null): string {
  if (!from || !to) return '';
  const f = new Date(from);
  const t = new Date(to);
  const p = (n: number) => String(n).padStart(2, '0');
  const one = (d: Date) =>
    `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
  return `${one(f)} ~ ${one(t)} 사이에 들어온 공고`;
}
