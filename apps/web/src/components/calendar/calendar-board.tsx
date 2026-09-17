'use client';

import Link from 'next/link';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ELIGIBILITY_LABELS, GRANT_SOURCE_LABELS, GRANT_STATUS_LABELS,
  numberReasons, reasonCounter,
} from '@moai/shared';
import type {
  CalendarItem, CalendarMonth, EligibilityLevel, GrantCategory, GrantSource,
  GrantStage,
} from '@moai/shared';
import { calendarApi, savedApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { ConditionChecklist } from './condition-checklist';
import { GrantFilter } from './grant-filter';
import { OutcomePicker } from './outcome-picker';
import { StarButton } from './star-button';
import { isListItem, splitIntoLines } from './format-text';

export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 지원 가능 여부별 표시 스타일 */
export const LEVEL_STYLE: Record<
  EligibilityLevel,
  { dot: string; chip: string; tile: string }
> = {
  eligible: {
    dot: 'bg-success',
    chip: 'bg-success-light text-success',
    tile: 'bg-success-light text-grey-800',
  },
  conditional: {
    dot: 'bg-warning',
    chip: 'bg-warning-light text-warning',
    tile: 'bg-warning-light text-grey-800',
  },
  ineligible: {
    dot: 'bg-danger',
    chip: 'bg-danger-light text-danger',
    tile: 'bg-danger-light text-grey-800',
  },
  unknown: {
    dot: 'bg-grey-400',
    chip: 'bg-grey-100 text-grey-500',
    tile: 'bg-grey-100 text-grey-600',
  },
};

/** 달력 그리드 칸 계산 — 앞뒤 빈 칸 포함 */
export function buildCells(year: number, month: number): (number | null)[] {
  const lead = new Date(year, month - 1, 1).getDay();
  const lastDate = new Date(year, month, 0).getDate();

  const cells: (number | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= lastDate; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * 월간 캘린더 본체.
 * 전체 화면(`/calendar`)과 대시보드 모달에서 같은 컴포넌트를 쓴다.
 */
export function CalendarBoard({
  tenantId, compact = false, withSidePanel = false, fitHeight = false,
  savedOnlyDefault = false, onSavedChange, initialCategories,
}: {
  tenantId?: string;
  /**
   * 처음부터 걸어 둘 유형.
   *
   * 로드맵에서 "이 단계 공고 보기"로 넘어올 때 주소에 실려 온다. 화면을
   * 연 다음 사용자가 다시 고르는 것은 그대로 된다 — 여기서는 시작값만 준다.
   */
  initialCategories?: GrantCategory[];
  /** 모달 안처럼 좁은 곳에서 쓸 때 — 셀 높이와 여백을 줄인다 */
  compact?: boolean;
  /**
   * 우측에 목록 패널을 상시 띄운다.
   * 날짜를 옮겨가며 비교할 때 모달을 여닫지 않아도 된다.
   */
  withSidePanel?: boolean;
  /**
   * 남은 높이를 꽉 채운다.
   * 페이지가 세로로 스크롤되지 않게 하려는 것으로, 격자 행을 균등 분배한다.
   */
  fitHeight?: boolean;
  /**
   * 관심 공고만 보여준 채로 시작할 것인가.
   *
   * 대시보드는 그렇다 — 접수 중인 공고가 수백 건이라 전부 띄우면
   * 내가 담아 둔 것이 그 안에 묻힌다. 전체 목록을 훑는 `/calendar` 는
   * 반대로 전부 보여주고 시작한다.
   */
  savedOnlyDefault?: boolean;
  /**
   * 별을 껐다 켰을 때 부모에게 알린다.
   *
   * 대시보드는 미니 캘린더를 자기 상태로 따로 들고 있어서, 이 모달 안에서
   * 별을 눌러도 뒤쪽 달력은 그대로다. 새로고침해야 반영되는 게 그 때문이다.
   */
  onSavedChange?: () => void;
}) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const [data, setData] = useState<CalendarMonth | null>(null);
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  /** 관심 공고만 볼 것인가 — 끄면 이번 달 전체가 나온다 (대시보드) */
  const [savedOnly, setSavedOnly] = useState(savedOnlyDefault);
  /** 지원 불가를 감출 것인가 (지원사업 페이지) */
  const [eligibleOnly, setEligibleOnly] = useState(false);

  /*
   * 유형·업력 골라 보기.
   *
   * 비어 있으면 조건을 안 건다 — "아무것도 안 고름" 과 "전부 고름" 은 결과가
   * 같으므로, 굳이 열두 개를 다 켜 둔 상태로 시작할 이유가 없다.
   */
  const [categories, setCategories] = useState<GrantCategory[]>(
    initialCategories ?? [],
  );
  const [stages, setStages] = useState<GrantStage[]>([]);

  /**
   * 찾는 말.
   *
   * **서버에 다시 묻지 않는다.** 이 달 것은 이미 받아 왔으므로 그 안에서
   * 거른다 — 글자 하나 칠 때마다 요청을 보내면 느리고, 지웠을 때 되돌리는
   * 것도 한 박자 늦는다.
   */
  const [keyword, setKeyword] = useState('');
  const [dayOpen, setDayOpen] = useState<number | null>(null);
  /** 캘린더에서 고른 공고 — 우측 목록에서 잠깐 깜빡여 위치를 알린다 */
  const [highlightId, setHighlightId] = useState<string | null>(null);
  /** 관심 공고로 저장된 공고 ID — 별을 채울지 판단한다 */
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setError(null);
      setData(
        await calendarApi.month({ year, month, tenantId, categories, stages }),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [year, month, tenantId, categories, stages]);

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

  /** 별 토글 — 서버 결과로 상태를 맞춘다 */
  const toggleSaved = useCallback(
    async (grantId: string) => {
      if (!tenantId) return;
      const { saved } = await savedApi.toggle(tenantId, grantId);

      setSavedIds((prev) => {
        const next = new Set(prev);
        if (saved) next.add(grantId);
        else next.delete(grantId);
        return next;
      });

      /*
       * 캘린더가 들고 있는 항목의 saved 값도 같이 바꾼다.
       * 서버를 다시 부르지 않는 이유는, 관심 공고만 보는 중에 별을 끄면
       * 그 항목이 **바로** 사라져야 하기 때문이다. 응답을 기다리는 동안
       * 남아 있으면 눌러도 반응이 없는 것처럼 보인다.
       */
      setData((prev) =>
        prev
          ? {
              ...prev,
              summary: {
                ...prev.summary,
                saved: prev.summary.saved + (saved ? 1 : -1),
              },
              days: prev.days.map((d) => ({
                ...d,
                items: d.items.map((it) =>
                  it.grant.id === grantId ? { ...it, saved } : it,
                ),
              })),
            }
          : prev,
      );

      onSavedChange?.();
    },
    [tenantId, onSavedChange],
  );

  /*
   * 걸러진 결과를 한 곳에서 만든다.
   * 격자·우측 목록·요약 칩이 전부 이걸 보므로, 여기서 한 번만 거르면
   * 세 군데가 어긋날 일이 없다.
   */
  /** 견줄 때는 대소문자를 가리지 않는다 — `AI` 든 `ai` 든 같게 찾는다 */
  const kw = keyword.trim().toLowerCase();

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const d of data?.days ?? []) {
      let items = d.items;
      if (savedOnly) items = items.filter((it) => it.saved);
      if (eligibleOnly) {
        items = items.filter((it) => it.eligibility.level !== 'ineligible');
      }
      if (kw) items = items.filter((it) => matchesKeyword(it, kw));
      if (items.length > 0) map.set(d.date, items);
    }
    return map;
  }, [data, savedOnly, eligibleOnly, kw]);

  /** 화면에 실제로 보이는 것만 센다 */
  const shown = useMemo(() => {
    const counts = {
      total: 0, eligible: 0, conditional: 0, ineligible: 0, unknown: 0,
    };
    for (const items of byDate.values()) {
      for (const it of items) {
        counts.total += 1;
        counts[it.eligibility.level] += 1;
      }
    }
    return counts;
  }, [byDate]);

  const cells = useMemo(() => buildCells(year, month), [year, month]);

  /**
   * 우측 패널 내용.
   * 날짜를 고르면 그날 것만, 안 골랐으면 이번 달 전체를 마감 임박순으로 보여준다.
   */
  const panelItems = useMemo(() => {
    if (dayOpen !== null) {
      return byDate.get(dateKey(year, month, dayOpen)) ?? [];
    }
    // 걸러진 결과를 쓴다. 격자에 없는 것이 목록에만 있으면 안 된다.
    return [...byDate.values()]
      .flat()
      .sort((a, b) => (a.dDay ?? 9999) - (b.dDay ?? 9999));
  }, [dayOpen, byDate, year, month]);

  function shift(delta: number) {
    const next = new Date(year, month - 1 + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth() + 1);
    setSelected(null);
    setDayOpen(null);
    setHighlightId(null);
  }

  const isToday = (day: number) =>
    today.getFullYear() === year &&
    today.getMonth() + 1 === month &&
    today.getDate() === day;

  const rowCount = Math.ceil(cells.length / 7);

  return (
    <div className={fitHeight ? "flex flex-col md:h-full md:min-h-0" : ""}>
      {/* 월 이동 + 요약 + 필터 */}
      <div className={`flex flex-wrap items-center gap-x-3 gap-y-2 ${compact ? "mb-2.5" : "mb-4"}`}>
        <div className="flex items-center gap-1">
          <button
            onClick={() => shift(-1)}
            aria-label="이전 달"
            className={`grid place-items-center rounded-xl text-grey-500 hover:bg-grey-100 ${compact ? "size-8" : "size-9"}`}
          >
            ‹
          </button>
          <span className={`tabular text-center font-bold text-grey-900 ${compact ? "min-w-[92px] text-base" : "min-w-[110px] text-lg"}`}>
            {year}년 {month}월
          </span>
          <button
            onClick={() => shift(1)}
            aria-label="다음 달"
            className={`grid place-items-center rounded-xl text-grey-500 hover:bg-grey-100 ${compact ? "size-8" : "size-9"}`}
          >
            ›
          </button>
        </div>

        {/* 요약 — 월 이동과 같은 줄. 0건은 자리만 차지하므로 감춘다 */}
        {data && (
          <div className="flex flex-wrap items-center gap-1 text-[11px] font-semibold">
            <Chip className="bg-grey-100 text-grey-600">
              {savedOnly ? '관심' : '전체'} {shown.total}
            </Chip>
            {shown.eligible > 0 && (
              <Chip className={LEVEL_STYLE.eligible.chip}>
                {ELIGIBILITY_LABELS.eligible} {shown.eligible}
              </Chip>
            )}
            {shown.conditional > 0 && (
              <Chip className={LEVEL_STYLE.conditional.chip}>
                {ELIGIBILITY_LABELS.conditional} {shown.conditional}
              </Chip>
            )}
            {shown.unknown > 0 && (
              <Chip className={LEVEL_STYLE.unknown.chip}>
                {ELIGIBILITY_LABELS.unknown} {shown.unknown}
              </Chip>
            )}
            {shown.ineligible > 0 && (
              <Chip className={LEVEL_STYLE.ineligible.chip}>
                {ELIGIBILITY_LABELS.ineligible} {shown.ineligible}
              </Chip>
            )}
          </div>
        )}

        {/*
          대시보드와 지원사업 페이지는 보는 목적이 다르다.
          대시보드는 내가 담아 둔 것을 챙기는 곳이라 관심 공고가 기본이고,
          지원사업 페이지는 전체를 훑는 곳이라 지원 불가만 감출 수 있으면 된다.
        */}
        {savedOnlyDefault ? (
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-grey-600">
            <input
              type="checkbox"
              checked={!savedOnly}
              onChange={(e) => setSavedOnly(!e.target.checked)}
              className="size-3.5 rounded border-grey-300 accent-[var(--blue)]"
            />
            모든 사업 보기
            {data ? ` (${data.summary.total})` : ''}
          </label>
        ) : (
          <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-grey-600">
            <input
              type="checkbox"
              checked={eligibleOnly}
              onChange={(e) => setEligibleOnly(e.target.checked)}
              className="size-3.5 rounded border-grey-300 accent-[var(--blue)]"
            />
            지원 불가 숨기기
          </label>
        )}
      </div>

      {error && (
        <p className="mb-4 rounded-xl bg-danger-light px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/*
        담아 둔 것이 없으면 달력이 통째로 비어 고장처럼 보인다.
        왜 비었는지와 무엇을 하면 되는지를 알려 준다.
      */}
      {data && savedOnly && data.summary.saved === 0 && (
        <p className="mb-3 rounded-xl bg-grey-50 px-4 py-3 text-xs leading-relaxed text-grey-500">
          담아 둔 관심 공고가 없어요. 공고 옆의 ☆ 를 누르면 여기에 모입니다.
          이번 달 전체 {data.summary.total}건은 위의{' '}
          <b>모든 사업 보기</b> 를 켜면 보여요.
        </p>
      )}

      {/* 유형·업력 — 판정으로 좁힌 다음, 보고 싶은 것만 다시 추린다 */}
      <GrantFilter
        categories={categories}
        stages={stages}
        keyword={keyword}
        onChange={(next) => {
          setCategories(next.categories);
          setStages(next.stages);
        }}
        onKeyword={setKeyword}
      />

      <div
        className={`${
          withSidePanel
            ? `grid gap-3 ${compact ? "lg:grid-cols-[1fr_260px]" : "lg:grid-cols-[1fr_300px]"}`
            : ""
        } ${fitHeight ? "md:min-h-0 md:flex-1" : ""}`}
      >
      <div className={fitHeight ? "flex flex-col md:min-h-0" : ""}>
      {/* 그리드 — 타일 확대가 모서리에서 잘리지 않도록 overflow 를 감추지 않는다 */}
      <div className={`rounded-2xl border border-grey-200 bg-white ${fitHeight ? "flex flex-col md:min-h-0" : ""}`}>
        <div className="grid grid-cols-7 border-b border-grey-200">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`text-center text-xs font-bold ${compact ? "py-1.5" : "py-2.5"} ${
                i === 0 ? 'text-danger' : i === 6 ? 'text-brand' : 'text-grey-400'
              }`}
            >
              {w}
            </div>
          ))}
        </div>

        <div
          /*
           * 화면에 맞출 때도 **행을 늘려 채우지 않는다.**
           *
           * `flex-1` 로 두면 여섯 줄이 남은 높이를 똑같이 나눠 갖는다. 그러면
           * 공고가 없는 주도 있는 주와 같은 높이가 되어, 칸 안에 "더보기"를
           * 지나고도 빈 공간이 남는다. 내용만큼만 쓰게 두면 달력 전체가
           * 짧아져 마지막 주까지 한 화면에 들어온다.
           */
          className="grid grid-cols-7"
          style={
            fitHeight
              ? { gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }
              : undefined
          }
        >
          {cells.map((day, idx) => {
            const items = day ? (byDate.get(dateKey(year, month, day)) ?? []) : [];
            // 칸 높이가 화면에 맞춰 줄어들므로 표시 개수도 함께 줄인다
            const shown = compact || fitHeight ? 2 : 3;
            return (
              <div
                key={idx}
                /*
                 * **칸 전체가 누르는 자리다.**
                 *
                 * 칸 안의 공고 한 줄은 19px 밖에 안 되고, 좁은 화면에서는
                 * 제목도 `202…` 로 잘려 어차피 못 읽는다. 그 작은 줄을
                 * 정확히 겨냥하게 두는 대신 칸 아무 데나 누르면 그날 목록이
                 * 열리게 했다. 안쪽 줄을 눌러도 결과는 같으므로 빗나가도
                 * 손해가 없다.
                 */
                onClick={() => day !== null && items.length > 0 && setDayOpen(day)}
                // 타일이 확대될 때 잘리지 않도록 overflow 를 열어둔다
                className={`relative overflow-visible border-b border-r border-grey-100 ${
                  items.length > 0 ? 'cursor-pointer' : ''
                } ${
                  compact || fitHeight ? 'p-1' : 'p-1.5'
                } ${
                  fitHeight ? 'min-h-[46px]' : compact ? 'min-h-[78px]' : 'min-h-[104px]'
                } ${day === null ? 'bg-grey-50' : ''}`}
              >
                {day !== null && (
                  <>
                    {/* 공고가 있는 날은 날짜를 눌러 그날 전체를 볼 수 있다 */}
                    <button
                      onClick={() => items.length > 0 && setDayOpen(day)}
                      disabled={items.length === 0}
                      className={`tabular inline-grid place-items-center rounded-full font-semibold ${
                        compact ? 'mb-0.5 size-5 text-[11px]' : 'mb-1 size-6 text-xs'
                      } ${
                        isToday(day)
                          ? 'bg-brand text-white'
                          : items.length > 0
                            ? 'text-grey-600 hover:bg-grey-100'
                            : 'text-grey-400'
                      }`}
                    >
                      {day}
                    </button>

                    <div className="space-y-1">
                      {items.slice(0, shown).map((item) => (
                        <TileWithPreview
                          key={item.grant.id}
                          item={item}
                          /* 오른쪽 끝 열에서는 미리보기를 왼쪽으로 펼친다 */
                          alignRight={idx % 7 >= 5}
                          onClick={() => {
                            if (withSidePanel) {
                              // 캘린더에서는 날짜만 고른다.
                              // 상세는 우측 목록에서 직접 누르게 하고,
                              // 어디를 봐야 하는지 깜빡임으로 알려준다.
                              setDayOpen(day);
                              setHighlightId(item.grant.id);
                            } else {
                              setSelected(item);
                            }
                          }}
                        />
                      ))}
                      {items.length > shown && (
                        // 숨겨진 공고를 죽은 텍스트로 두지 않는다 — 눌러서 전체를 연다
                        <button
                          onClick={() => setDayOpen(day)}
                          className="block w-full rounded-md pl-1 text-left text-[11px] font-semibold leading-5 text-brand hover:bg-brand-light"
                        >
                          {/*
                            좁은 화면에서는 `+19` 까지만 쓴다. 칸 하나가 45px
                            남짓이라 "건 더보기" 를 붙이면 글자가 한 자씩
                            세로로 쌓여 읽을 수 없게 된다.
                          */}
                          +{items.length - shown}
                          <span className="hidden sm:inline">건 더보기</span>
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {loading && (
        <p className="mt-4 text-center text-sm text-grey-400">불러오는 중…</p>
      )}
      {/*
        찾는 말 때문에 비었으면 그렇게 말해 준다. "공고가 없습니다" 만 뜨면
        그 달에 아무것도 없는 줄 알고 다음 달로 넘어가 버린다.
      */}
      {!loading && data && data.summary.total > 0 && shown.total === 0 && (
        <p className="mt-4 text-center text-sm text-grey-500">
          {kw ? (
            <>
              <b className="text-grey-700">{keyword}</b> 로 찾은 공고가 이 달에
              없습니다. 이 달 전체는 {data.summary.total}건입니다.
            </>
          ) : (
            '고른 조건에 맞는 공고가 이 달에 없습니다.'
          )}
        </p>
      )}
      {!loading && data?.summary.total === 0 && (
        <p className="mt-4 text-center text-sm text-grey-400">
          이 달에 마감되는 공고가 없습니다.
        </p>
      )}
      </div>

      {/*
        우측 목록 패널 — 날짜를 고르면 그날 것으로 바뀐다.

        가로 2단일 때 패널은 달력과 같은 높이를 받는다. 목록에 고정 높이를
        걸어 두면 그 아래가 통째로 빈다 — 세로로 세워서 목록이 남는 높이를
        채우게 한다.
      */}
      {withSidePanel && (
        <aside className={`rounded-2xl border border-grey-200 bg-white ${compact ? "p-3" : "p-4"} ${fitHeight ? "flex flex-col md:min-h-0" : "lg:flex lg:min-h-0 lg:flex-col"}`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-grey-900">
              {dayOpen !== null
                ? `${month}월 ${dayOpen}일 마감`
                : "이번 달 마감 임박순"}
            </p>
            {dayOpen !== null && (
              <button
                onClick={() => setDayOpen(null)}
                className="text-xs font-semibold text-brand hover:underline"
              >
                전체 보기
              </button>
            )}
          </div>

          {/*
            세로 1단(좁은 화면)에서는 목록이 제 길이대로 늘어나면 페이지가
            끝없이 길어지므로 높이를 묶어 둔다. 2단이 되는 순간부터는
            패널이 주는 높이를 그대로 쓴다.
          */}
          <div className={`thin-scroll overflow-y-auto pr-1 ${fitHeight ? "max-h-[360px] md:max-h-none md:min-h-0 md:flex-1" : `${compact ? "max-h-[400px]" : "max-h-[560px]"} lg:max-h-none lg:min-h-0 lg:flex-1`}`}>
            <DayList
              items={panelItems}
              activeId={selected?.grant.id}
              highlightId={highlightId}
              savedIds={savedIds}
              onToggleSaved={toggleSaved}
              onPick={(item) => {
                setSelected(item);
                setHighlightId(null); // 직접 눌렀으니 안내를 멈춘다
              }}
            />
          </div>
        </aside>
      )}
      </div>

      {/* 공고 상세는 팝업으로 — 캘린더·패널 위치를 잃지 않는다 */}
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

      {/*
        좁은 화면(대시보드 모달)에서는 옆에 패널을 둘 자리가 없으므로
        날짜를 누르면 모달로 띄운다.
      */}
      {!withSidePanel && (
        <Modal
          open={dayOpen !== null}
          onClose={() => setDayOpen(null)}
          title={`${month}월 ${dayOpen}일 마감 공고`}
        >
          <DayList
            items={
              dayOpen !== null
                ? (byDate.get(dateKey(year, month, dayOpen)) ?? [])
                : []
            }
            onPick={(item) => {
              setSelected(item);
              setDayOpen(null);
            }}
          />
        </Modal>
      )}
    </div>
  );
}

/**
 * 실제로 스크롤되는 조상을 찾는다.
 *
 * 패널 구조가 바뀌어도 따라가도록 고정된 선택자를 쓰지 않는다.
 */
function scrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if (
      (overflow === 'auto' || overflow === 'scroll') &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/** 하루치 공고 목록 — 사이드 패널과 모달이 같이 쓴다 */
function DayList({
  items, onPick, activeId, highlightId, savedIds, onToggleSaved,
}: {
  items: CalendarItem[];
  onPick: (item: CalendarItem) => void;
  activeId?: string;
  /** 캘린더에서 고른 항목 — 잠깐 깜빡여 위치를 알린다 */
  highlightId?: string | null;
  savedIds?: Set<string>;
  onToggleSaved?: (grantId: string) => Promise<void>;
}) {
  const highlighted = useRef<HTMLLIElement | null>(null);

  /*
   * 깜빡이기 전에 그 자리로 스크롤한다.
   *
   * 목록이 길면 고른 공고가 화면 밖에 있을 수 있다. 그때는 깜빡여 봐야
   * 보이지 않아서, 사용자는 아무 일도 안 일어났다고 여긴다.
   */
  useEffect(() => {
    const el = highlighted.current;
    if (!highlightId || !el) return;

    const scroller = scrollParent(el);
    if (!scroller) return;

    /*
     * 고른 공고를 목록 가운데로 가져온다.
     *
     * 두 가지를 피해야 한다.
     *  - `scrollIntoView` : 날짜를 고르면 목록이 통째로 갈리는데, 브라우저가
     *    예전 배치를 기준으로 움직이기 시작해 엉뚱한 곳에서 멈춘다.
     *  - `offsetTop` : 스크롤 박스가 아니라 "위치가 지정된 가장 가까운 조상"
     *    기준이라, 둘이 다르면 수백 px 어긋난다.
     * 그래서 화면 좌표로 직접 잰다. useEffect 는 DOM 이 갱신된 뒤에 돌기
     * 때문에 이 시점의 좌표는 이미 새 목록의 것이다.
     */
    const item = el.getBoundingClientRect();
    const box = scroller.getBoundingClientRect();
    const offsetInBox = item.top - box.top + scroller.scrollTop;

    /*
     * 부드럽게가 아니라 곧바로 옮긴다.
     *
     * 부드러운 스크롤은 애니메이션이라, 탭이 화면에 없거나 사용자가
     * 모션을 줄여 놓은 환경에서는 아예 움직이지 않는다. 실제로 그래서
     * 목록이 제자리에 멈춰 있었다. 어차피 도착한 뒤 깜빡여 알려 주므로
     * 이동 자체는 즉시여도 된다.
     */
    scroller.scrollTo({
      top: Math.max(0, offsetInBox - box.height / 2 + item.height / 2),
      behavior: 'auto',
    });
    // items 도 본다. 같은 공고를 다시 골라도 목록이 바뀌었으면 다시 맞춘다.
  }, [highlightId, items]);

  if (items.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-grey-400">
        마감되는 공고가 없어요.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.grant.id}
          ref={highlightId === item.grant.id ? highlighted : undefined}
        >
          {/* 별 버튼이 안에 들어가므로 button 중첩을 피해 div 로 만든다 */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => onPick(item)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onPick(item);
            }}
            className={`flex w-full cursor-pointer items-start gap-2 rounded-xl border p-3 text-left transition-colors ${
              activeId === item.grant.id
                ? 'border-brand bg-brand-light'
                : 'border-grey-200 hover:bg-grey-50'
            } ${highlightId === item.grant.id ? 'blink-highlight' : ''}`}
          >
            <span
              className={`mt-1.5 size-2 shrink-0 rounded-full ${LEVEL_STYLE[item.eligibility.level].dot}`}
            />
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold leading-snug text-grey-900">
                {item.grant.title}
              </span>
              <span className="tabular mt-1 block text-[11px] text-grey-500">
                {item.dDay != null && item.dDay >= 0 && (
                  <span className={item.dDay <= 7 ? 'font-bold text-danger' : ''}>
                    D-{item.dDay}
                  </span>
                )}
                {' · '}
                {item.grant.agency}
                {item.grant.amountMax != null &&
                  ` · 최대 ${formatMoney(item.grant.amountMax)}`}
              </span>
              <span
                className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${LEVEL_STYLE[item.eligibility.level].chip}`}
              >
                {ELIGIBILITY_LABELS[item.eligibility.level]}
              </span>
            </span>

            {onToggleSaved && (
              <StarButton
                size="sm"
                active={savedIds?.has(item.grant.id) ?? false}
                title={item.grant.title}
                onToggle={() => onToggleSaved(item.grant.id)}
              />
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function Chip({
  children, className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span className={`rounded-full px-2 py-0.5 ${className}`}>{children}</span>
  );
}

/**
 * 공고 원문에서 가져온 부가 정보.
 *
 * 판정에는 쓰지 않지만 사람이 읽을 때 필요한 것들이다.
 * 값이 없는 항목은 줄 자체를 만들지 않는다 — 빈 줄이 늘어지면 오히려 안 읽힌다.
 */
function GrantFacts({
  detail,
}: {
  detail: NonNullable<CalendarItem['grant']['detail']>;
}) {
  const rows: { label: string; value: string; tone?: 'danger' }[] = [];
  const add = (label: string, v?: string | null, tone?: 'danger') => {
    if (v) rows.push({ label, value: v, tone });
  };

  add('신청 대상', detail.applyTargetDetail);
  add('제외 대상', detail.excludeTarget, 'danger');
  add('대상 연령', detail.targetAge);
  add('대상 업력', detail.rawBusinessYears);
  add('지원 지역', detail.rawRegion);
  add('지원 분야', detail.rawCategory);
  add('우대 사항', detail.preferential);
  add('문의', [detail.department, detail.contact].filter(Boolean).join(' · '));

  if (rows.length === 0) return null;

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-grey-200">
      <dl className="divide-y divide-grey-100">
        {rows.map((r) => (
          <div key={r.label} className="flex gap-3 px-4 py-2.5">
            <dt className="w-[68px] shrink-0 text-xs font-semibold text-grey-500">
              {r.label}
            </dt>
            <dd
              className={`flex-1 text-xs leading-relaxed ${
                r.tone === 'danger' ? 'font-medium text-danger' : 'text-grey-700'
              }`}
            >
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * 캘린더 한 칸의 공고 타일.
 *
 * 칸이 좁아 제목이 잘리는데, 타일 자체를 키우면 달력 격자가 흔들린다.
 * 그래서 **원본은 자리를 그대로 지키고**, 마우스를 올렸을 때만
 * 같은 위치에 미리보기 카드를 겹쳐 띄운다. 격자는 전혀 움직이지 않는다.
 */
function TileWithPreview({
  item, alignRight, onClick,
}: {
  item: CalendarItem;
  alignRight: boolean;
  onClick: () => void;
}) {
  const style = LEVEL_STYLE[item.eligibility.level];

  return (
    <div className="group/tile relative">
      {/* 원본 — 크기·위치 고정 */}
      <button
        onClick={onClick}
        title={item.grant.title}
        className={`block w-full truncate rounded-lg px-1.5 py-0.5 text-left text-[11px] leading-snug ${style.tile}`}
      >
        {item.grant.title}
      </button>

      {/*
        미리보기 — 원본 위에 겹쳐 뜬다.
        pointer-events-none 이라 클릭은 아래 원본이 그대로 받는다.
      */}
      <div
        className={`pointer-events-none absolute top-0 z-40 hidden w-[230px] rounded-lg px-2.5 py-2 shadow-xl ring-1 ring-black/10 group-hover/tile:block ${style.tile} ${
          alignRight ? 'right-0' : 'left-0'
        }`}
      >
        <p className="text-[12px] font-semibold leading-snug">
          {item.grant.title}
        </p>
        <p className="tabular mt-1 text-[11px] opacity-70">
          {item.dDay != null && item.dDay >= 0 && `D-${item.dDay} · `}
          {item.grant.agency}
        </p>
        <p className="mt-1 text-[11px] font-semibold opacity-80">
          {ELIGIBILITY_LABELS[item.eligibility.level]}
          {item.eligibility.checked > 0 &&
            ` · ${item.eligibility.passed}/${item.eligibility.checked} 충족`}
        </p>
      </div>
    </div>
  );
}

export function formatMoney(v: number | null): string | null {
  if (v == null) return null;
  if (v >= 100_000_000) {
    return `${(v / 100_000_000).toFixed(1).replace(/\.0$/, '')}억원`;
  }
  return `${Math.round(v / 10_000).toLocaleString()}만원`;
}

/** 공고 상세 + 판정 근거 */
export function GrantDetail({
  item, onClose, embedded = false, saved = false, onToggleSaved,
  tenantId, onRefresh,
}: {
  item: CalendarItem;
  onClose: () => void;
  /** 모달 안에서 쓸 때 — 카드 배경과 닫기 버튼을 생략한다 */
  embedded?: boolean;
  saved?: boolean;
  onToggleSaved?: () => Promise<void> | void;
  /** 조건 체크리스트를 띄우려면 필요하다 — 답변은 기업 프로필에 저장된다 */
  tenantId?: string;
  /** 답변 후 목록의 판정도 갱신하도록 부모에게 알린다 */
  onRefresh?: () => void | Promise<void>;
}) {
  /*
   * 조건에 답하면 이 공고의 판정이 즉시 바뀐다.
   * 부모가 목록을 다시 불러오기 전에도 화면이 맞도록 여기서 따로 들고 있는다.
   */
  const [live, setLive] = useState<CalendarItem>(item);
  useEffect(() => setLive(item), [item]);

  const [profileId, setProfileId] = useState<string | null>(null);
  useEffect(() => {
    if (!tenantId) return;
    void calendarApi
      .defaultProfile(tenantId)
      .then((p) => setProfileId(p?.id ?? null))
      .catch(() => setProfileId(null));
  }, [tenantId]);

  /** 답변 저장 후 — 이 공고만 다시 판정받고, 목록도 갱신한다 */
  const reload = useCallback(async () => {
    try {
      setLive(await calendarApi.eligibility(item.grant.id, tenantId));
    } catch {
      // 재조회에 실패해도 저장은 끝났다. 목록 갱신으로 따라잡는다.
    }
    await onRefresh?.();
  }, [item.grant.id, tenantId, onRefresh]);

  const { grant, eligibility, status, dDay } = live;
  const style = LEVEL_STYLE[eligibility.level];

  const amount =
    grant.amountMax != null
      ? `최대 ${formatMoney(grant.amountMax)}`
      : grant.amountMin != null
        ? `${formatMoney(grant.amountMin)}~`
        : null;

  return (
    <section className={embedded ? "" : "mt-5 rounded-2xl bg-white p-6"}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className={`rounded-full px-2.5 py-1 ${style.chip}`}>
              {ELIGIBILITY_LABELS[eligibility.level]}
            </span>
            <span className="rounded-full bg-grey-100 px-2.5 py-1 text-grey-600">
              {GRANT_STATUS_LABELS[status]}
              {dDay != null && dDay >= 0 && ` · D-${dDay}`}
            </span>
            {/*
              어디서 받아온 공고인지.
              원문을 어느 사이트에서 확인해야 하는지 알려 주는 표시다 —
              기관마다 갱신 시점이 달라 우리 쪽이 뒤처져 있을 수 있다.
            */}
            {grant.sourceApi && (
              <span className="rounded-full border border-grey-200 px-2.5 py-1 font-medium text-grey-500">
                {GRANT_SOURCE_LABELS[grant.sourceApi as GrantSource] ??
                  grant.sourceApi}
              </span>
            )}
          </div>
          <h3 className="text-lg font-bold leading-snug text-grey-900">
            {grant.title}
          </h3>
          <p className="mt-1 text-sm text-grey-500">
            {grant.agency}
            {amount && ` · ${amount}`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {onToggleSaved && (
            <StarButton
              active={saved}
              title={grant.title}
              onToggle={onToggleSaved}
            />
          )}
          {!embedded && (
            <button
              onClick={onClose}
              aria-label="닫기"
              className="grid size-8 place-items-center rounded-lg text-grey-400 hover:bg-grey-100"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {grant.summary && (
        <div className="mb-5 space-y-1.5 text-sm leading-relaxed text-grey-700">
          {splitIntoLines(grant.summary).map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      {/* 공고 원문에서 가져온 부가 정보 */}
      {grant.detail && <GrantFacts detail={grant.detail} />}

      <div className="rounded-xl bg-grey-50 p-4">
        <p className="mb-3 text-xs font-bold text-grey-700">
          지원 자격 검토 ({eligibility.passed}/{eligibility.checked} 충족)
        </p>
        <ul className="space-y-2">
          {numberReasons(eligibility.reasons).map((r) => (
            <li key={r.index} className="flex items-start gap-2 text-xs leading-relaxed">
              {/* 어디서 걸렸는지 한눈에 보이도록 누적 카운터를 붙인다 */}
              <span
                className={`tabular w-8 shrink-0 font-bold ${
                  r.verdict === 'fail' ? 'text-danger' : 'text-grey-400'
                }`}
              >
                {reasonCounter(r)}
              </span>
              <span
                className={`w-3 shrink-0 ${
                  r.verdict === 'pass'
                    ? 'text-success'
                    : r.verdict === 'fail'
                      ? 'text-danger'
                      : 'text-grey-400'
                }`}
              >
                {r.verdict === 'pass' ? '✓' : r.verdict === 'fail' ? '✕' : '?'}
              </span>
              <span className="w-16 shrink-0 font-semibold text-grey-700">
                {r.field}
              </span>
              <span
                className={
                  r.verdict === 'fail' ? 'text-danger' : 'text-grey-500'
                }
              >
                {r.message}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* 판정기가 못 정한 조건 — 사용자가 직접 답한다 */}
      {tenantId && (
        <ConditionChecklist
          conditions={eligibility.openConditions}
          profileId={profileId}
          onAnswered={reload}
        />
      )}

      {/*
        지원 결과 — 버튼들 바로 위에 둔다. 지원하러 나갔다가 돌아오는 자리가
        여기라, 결과를 적을 마음이 드는 순간도 여기다.
      */}
      {tenantId && (
        <div className="mt-5">
          <OutcomePicker
            tenantId={tenantId}
            grantId={grant.id}
            value={live.outcome ?? null}
            onChange={(next) => {
              setLive((v) => ({ ...v, outcome: next, saved: next ? true : v.saved }));
              void onRefresh?.();
            }}
          />
        </div>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        {grant.sourceUrl && (
          <a href={grant.sourceUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              공고 원문 보기
            </Button>
          </a>
        )}
        {grant.detail?.applyOnlineUrl && (
          <a
            href={grant.detail.applyOnlineUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="secondary" size="sm">
              온라인 접수처
            </Button>
          </a>
        )}
        {/* 공고를 들고 넘어간다 — 나중에 "공고 원문 보러가기"가 성립하려면 필요하다 */}
        <Link href={`/plans/new?grantId=${grant.id}`}>
          <Button size="sm">이 공고로 사업계획서 만들기</Button>
        </Link>
      </div>
    </section>
  );
}

/**
 * 찾는 말이 이 공고 어딘가에 있는가.
 *
 * **제목만 보면 놓친다.** 제목은 `2026년 2차 창업도약패키지 모집 공고` 처럼
 * 사업 이름만 적히는 일이 많아서, 정작 무엇을 하는 사업인지는 본문에 있다.
 * `농업` 을 찾는 사람은 제목에 그 말이 없어도 농업 대상 사업을 찾고 싶은
 * 것이므로, 요약과 신청 대상까지 훑는다.
 *
 * 기관 이름도 본다 — `농업기술원` 처럼 기관에만 있는 말이 있다.
 */
export function matchesKeyword(item: CalendarItem, kw: string): boolean {
  const g = item.grant;
  const parts = [
    g.title,
    g.agency,
    g.summary,
    g.detail?.applyTargetDetail,
    g.detail?.preferential,
    g.detail?.rawCategory,
  ];
  return parts.some((v) => v?.toLowerCase().includes(kw));
}
