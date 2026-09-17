'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CalendarMonth } from '@moai/shared';
import { LEVEL_STYLE, WEEKDAYS, buildCells, dateKey } from './calendar-board';

/**
 * 대시보드용 축소 캘린더.
 *
 * **관심 공고(별표)만 점을 찍는다.** 접수 중인 공고가 수백 건이라 전부
 * 찍으면 달력이 점으로 덮여서 아무것도 안 보인다. 내가 담아 둔 것만
 * 보여야 "내 달력"이 된다. 전체는 펼쳐서 본다.
 *
 * 공고 제목은 생략하고 점만 찍는다.
 * 클릭하면 부모가 모달로 전체 캘린더를 띄운다.
 */
export function MiniCalendar({
  data, onExpand,
}: {
  data: CalendarMonth | null;
  onExpand: () => void;
}) {
  const today = useMemo(() => new Date(), []);
  const year = data?.year ?? today.getFullYear();
  const month = data?.month ?? today.getMonth() + 1;

  const cells = useMemo(() => buildCells(year, month), [year, month]);

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarMonth['days'][number]['items']>();
    for (const d of data?.days ?? []) {
      const mine = d.items.filter((it) => it.saved);
      if (mine.length > 0) map.set(d.date, mine);
    }
    return map;
  }, [data]);

  const savedCount = data?.summary.saved ?? 0;

  /*
   * 담아 둔 것이 없을 때의 안내.
   *
   * 늘 펼쳐 두면 자리를 차지하는 데다, 며칠 지나면 읽지도 않으면서 계속
   * 눈에 걸린다. 그래서 **처음 들어왔을 때 3초만** 띄우고 접는다.
   * 다시 보고 싶으면 "관심 공고 0건" 위에 마우스를 올리면 된다.
   *
   * 마우스가 없는 기기에서는 hover 가 없으므로, 처음 3초가 안내를 볼 수
   * 있는 유일한 기회다. 그래서 자동 표시를 없애지 않는다.
   */
  const [autoHint, setAutoHint] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    if (!data || savedCount !== 0) return;
    setAutoHint(true);
    const timer = setTimeout(() => setAutoHint(false), 3000);
    return () => clearTimeout(timer);
  }, [data, savedCount]);

  const hintOpen = savedCount === 0 && (autoHint || hovered);

  const isToday = (day: number) =>
    today.getFullYear() === year &&
    today.getMonth() + 1 === month &&
    today.getDate() === day;

  return (
    <button
      onClick={onExpand}
      className="w-full rounded-2xl bg-white p-5 text-left transition-colors hover:bg-grey-50"
    >
      <div className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <p className="text-[17px] font-bold text-grey-900">
            {month}월 지원사업
          </p>
          <p className="tabular mt-0.5 text-sm text-grey-500">
            오늘 {today.getMonth() + 1}월 {today.getDate()}일 ·{' '}
            <span
              className="relative inline-block"
              onMouseEnter={() => setHovered(true)}
              onMouseLeave={() => setHovered(false)}
            >
              관심 공고{' '}
              <span className="font-semibold text-warning">{savedCount}건</span>
              {hintOpen && (
                <span
                  role="tooltip"
                  className="absolute left-0 top-full z-30 mt-2 block w-64 rounded-xl bg-grey-900 px-3 py-2.5 text-left text-xs font-normal leading-relaxed text-white shadow-lg"
                >
                  담아 둔 관심 공고가 없어요. 공고 옆의 ☆ 를 누르면 여기에
                  표시됩니다.
                  <br />
                  이번 달 전체 {data?.summary.total ?? 0}건은 <b>펼치기</b>에서
                  볼 수 있어요.
                </span>
              )}
            </span>
            {' · '}이번 달 전체 {data?.summary.total ?? 0}건
          </p>
        </div>
        <span className="shrink-0 text-sm font-semibold text-brand">
          펼치기
        </span>
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`pb-1 text-center text-[11px] font-semibold ${
              i === 0 ? 'text-danger' : i === 6 ? 'text-brand' : 'text-grey-400'
            }`}
          >
            {w}
          </div>
        ))}

        {cells.map((day, idx) => {
          const items = day ? (byDate.get(dateKey(year, month, day)) ?? []) : [];
          return (
            <div key={idx} className="flex flex-col items-center gap-1 py-1">
              {day !== null && (
                <>
                  <span
                    className={`tabular grid size-7 place-items-center rounded-full text-xs ${
                      isToday(day)
                        ? 'bg-brand font-bold text-white'
                        : 'text-grey-600'
                    }`}
                  >
                    {day}
                  </span>
                  <span className="flex h-1.5 gap-0.5">
                    {items.slice(0, 3).map((it) => (
                      <span
                        key={it.grant.id}
                        className={`size-1.5 rounded-full ${LEVEL_STYLE[it.eligibility.level].dot}`}
                      />
                    ))}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </button>
  );
}
