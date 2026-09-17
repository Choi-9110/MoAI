'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ELIGIBILITY_LABELS, ELIGIBILITY_LEVELS, GRANT_CATEGORIES,
  GRANT_CATEGORY_LABELS,
} from '@moai/shared';
import type {
  CalendarItem, EligibilityLevel, GrantCategory,
} from '@moai/shared';
import { calendarApi, savedApi } from '@/lib/api';
import { StarButton } from './star-button';
import {
  GrantDetail, LEVEL_STYLE, formatMoney, matchesKeyword,
} from './calendar-board';
import { Modal } from '@/components/ui/modal';

/* 라벨은 shared 한 곳에서 온다 — 예전에는 여기에만 있어 캘린더 필터와 어긋났다 */
const CATEGORY_LABELS = GRANT_CATEGORY_LABELS;


/**
 * 공고 목록 뷰.
 *
 * 캘린더는 "언제 마감인지"를 보여주지만, 칸이 좁아 하루 여러 건이면 가려진다.
 * 목록은 그 반대다 — 전부 펼쳐 놓고 정렬·필터로 좁혀 들어간다.
 * 같은 데이터를 두 가지 방식으로 보는 것이라 API 는 캘린더와 같은 것을 쓴다.
 */
export function GrantList({
  tenantId, initialCategories,
}: {
  tenantId?: string;
  /** 로드맵에서 넘어온 유형 — 목록은 하나만 걸 수 있어 첫 번째를 쓴다 */
  initialCategories?: GrantCategory[];
}) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [items, setItems] = useState<CalendarItem[]>([]);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [loading, setLoading] = useState(true);

  const [keyword, setKeyword] = useState('');
  const [levels, setLevels] = useState<Set<EligibilityLevel>>(new Set());
  const [category, setCategory] = useState<GrantCategory | 'all'>(
    initialCategories?.[0] ?? 'all',
  );
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await calendarApi.month({ year, month, tenantId });
      setItems(data.days.flatMap((d) => d.items));
    } finally {
      setLoading(false);
    }
  }, [year, month, tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!tenantId) return;
    void savedApi
      .ids(tenantId)
      .then((ids) => setSavedIds(new Set(ids)))
      .catch(() => setSavedIds(new Set()));
  }, [tenantId]);

  async function toggleSaved(grantId: string) {
    if (!tenantId) return;
    const { saved } = await savedApi.toggle(tenantId, grantId);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (saved) next.add(grantId);
      else next.delete(grantId);
      return next;
    });
  }

  function shift(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
    setSelected(null);
  }

  function toggleLevel(l: EligibilityLevel) {
    setLevels((prev) => {
      const next = new Set(prev);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  }

  const visible = useMemo(() => {
    const kw = keyword.trim().toLowerCase();
    const filtered = items.filter((it) => {
      if (levels.size > 0 && !levels.has(it.eligibility.level)) return false;
      if (category !== 'all' && it.grant.category !== category) return false;
      /*
       * 캘린더와 **같은 규칙**으로 찾는다. 예전에는 여기만 제목·기관을
       * 봤는데, 화면마다 찾는 범위가 다르면 같은 말을 넣고도 결과가 달라
       * 어느 쪽이 맞는지 알 수 없게 된다.
       */
      if (kw && !matchesKeyword(it, kw)) return false;
      return true;
    });

    /*
     * 마감 임박순 하나뿐이다.
     *
     * "지원금 많은순"이 있었지만 뺐다. 정렬 코드는 멀쩡했는데 **정렬할 값이
     * 없었다** — 공고 29,834건 중 금액이 담긴 것이 0건이다. 출처인
     * K-Startup API 가 금액을 안 준다(제목에 금액이 적힌 것은 21건,
     * 요약문까지 뒤져도 365건뿐이라 긁어 봐야 1%대다).
     * 금액이 있는 출처를 붙이면 그때 되살린다.
     */
    return filtered.sort((a, b) => (a.dDay ?? 9999) - (b.dDay ?? 9999));
  }, [items, keyword, levels, category]);

  /** 목록에 실제로 등장하는 분류만 셀렉트에 넣는다 */
  const usedCategories = useMemo(() => {
    const set = new Set<GrantCategory>();
    for (const it of items) set.add(it.grant.category);
    return GRANT_CATEGORIES.filter((c) => set.has(c));
  }, [items]);

  return (
    <div>
      {/* 월 이동 + 정렬 */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            aria-label="이전 달"
            className="grid size-9 place-items-center rounded-xl text-grey-500 hover:bg-grey-100"
          >
            ‹
          </button>
          <span className="tabular min-w-[110px] text-center text-lg font-bold text-grey-900">
            {year}년 {month}월
          </span>
          <button
            onClick={() => shift(1)}
            aria-label="다음 달"
            className="grid size-9 place-items-center rounded-xl text-grey-500 hover:bg-grey-100"
          >
            ›
          </button>
        </div>

        <span className="text-sm font-medium text-grey-500">마감 임박순</span>
      </div>

      {/* 검색 + 필터 */}
      <div className="mb-4 space-y-2.5">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="공고명 · 기관명 검색"
          className="h-11 w-full rounded-xl border border-grey-200 bg-white px-4 text-sm outline-none focus:border-brand"
        />

        <div className="flex flex-wrap gap-1.5">
          {ELIGIBILITY_LEVELS.map((l) => {
            const on = levels.has(l);
            return (
              <button
                key={l}
                onClick={() => toggleLevel(l)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  on ? LEVEL_STYLE[l].chip : 'bg-grey-100 text-grey-500'
                }`}
              >
                {ELIGIBILITY_LABELS[l]}
              </button>
            );
          })}

          {usedCategories.length > 0 && (
            <select
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as GrantCategory | 'all')
              }
              className="ml-auto h-8 rounded-full border border-grey-200 bg-white px-3 text-xs text-grey-600"
            >
              <option value="all">전체 분야</option>
              {usedCategories.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      <p className="mb-2 text-sm text-grey-500">
        <span className="tabular font-semibold text-grey-800">
          {visible.length}건
        </span>
        {visible.length !== items.length && ` / 전체 ${items.length}건`}
      </p>

      {/* 목록 */}
      {loading ? (
        <p className="py-16 text-center text-sm text-grey-400">불러오는 중…</p>
      ) : visible.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-grey-300 py-16 text-center text-sm text-grey-400">
          조건에 맞는 공고가 없어요.
        </p>
      ) : (
        <ul className="divide-y divide-grey-100 overflow-hidden rounded-2xl border border-grey-200 bg-white">
          {visible.map((it) => (
            <li key={it.grant.id}>
              {/* 별 버튼이 안에 들어가므로 button 중첩을 피한다 */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelected(it)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setSelected(it);
                }}
                className="flex w-full cursor-pointer items-start gap-3 px-5 py-4 text-left hover:bg-grey-50"
              >
                <span
                  className={`mt-1.5 size-2 shrink-0 rounded-full ${LEVEL_STYLE[it.eligibility.level].dot}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug text-grey-900">
                    {it.grant.title}
                  </span>
                  <span className="tabular mt-1 block text-xs text-grey-500">
                    {it.dDay != null && it.dDay >= 0 && (
                      <span
                        className={
                          it.dDay <= 7 ? 'font-bold text-danger' : 'font-semibold'
                        }
                      >
                        D-{it.dDay}
                      </span>
                    )}
                    {' · '}
                    {it.grant.agency}
                    {it.grant.amountMax != null &&
                      ` · 최대 ${formatMoney(it.grant.amountMax)}`}
                    {` · ${CATEGORY_LABELS[it.grant.category]}`}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${LEVEL_STYLE[it.eligibility.level].chip}`}
                >
                  {ELIGIBILITY_LABELS[it.eligibility.level]}
                </span>
                <StarButton
                  size="sm"
                  active={savedIds.has(it.grant.id)}
                  title={it.grant.title}
                  onToggle={() => toggleSaved(it.grant.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* 목록에서는 팝업으로 띄운다 — 목록 위치를 잃지 않는다 */}
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
            saved={savedIds.has(selected.grant.id)}
            onToggleSaved={() => toggleSaved(selected.grant.id)}
            tenantId={tenantId}
            onRefresh={load}
          />
        )}
      </Modal>
    </div>
  );
}
