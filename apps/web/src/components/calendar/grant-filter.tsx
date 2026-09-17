'use client';

import { useState } from 'react';
import {
  GRANT_CATEGORIES, GRANT_CATEGORY_LABELS, GRANT_STAGES, GRANT_STAGE_LABELS,
} from '@moai/shared';
import type { GrantCategory, GrantStage } from '@moai/shared';

/**
 * 유형·업력 골라 보기.
 *
 * **내 정보로 하는 판정과는 목적이 다르다.** 판정은 "넣을 수 있나"를 가리지만
 * 여기는 그 뒤에 오는 일 — 넣을 수 있는 것이 수백 건일 때 **지금 보고 싶은
 * 것만 추리는** 자리다. 그래서 조건을 걸어도 판정은 그대로 두고, 목록에서
 * 무엇을 보일지만 정한다.
 *
 * **펼쳐 둔 채로 시작한다.** 처음에는 접어 뒀는데, 그러면 이런 것을 고를 수
 * 있다는 사실 자체를 모른 채 지나간다. 화면이 밀리지 않는 것도 확인했다.
 * 자리가 거슬리면 사용자가 접으면 된다 — 열어 두고 닫게 하는 쪽이,
 * 닫아 두고 열게 하는 쪽보다 발견에 낫다.
 */
export function GrantFilter({
  categories, stages, keyword, onChange, onKeyword,
}: {
  categories: GrantCategory[];
  stages: GrantStage[];
  /** 제목에서 찾을 말 — `농업` 처럼 한 낱말이면 충분하다 */
  keyword: string;
  onChange: (next: { categories: GrantCategory[]; stages: GrantStage[] }) => void;
  onKeyword: (v: string) => void;
}) {
  const [open, setOpen] = useState(true);

  const toggle = <T,>(list: T[], v: T): T[] =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  /** 고른 것이 없으면 "전부"다 — 0개 선택과 전체 선택은 결과가 같다 */
  const catText = categories.length
    ? `유형 ${categories.length}개`
    : '전체 유형';
  const stageText = stages.length ? `업력 ${stages.length}개` : '전체 업력';
  const active = categories.length + stages.length + (keyword.trim() ? 1 : 0);

  return (
    <div className="mb-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
            active > 0
              ? 'border-brand bg-brand-light text-brand'
              : 'border-grey-200 bg-white text-grey-600 hover:bg-grey-50'
          }`}
        >
          <span>
            {catText} · {stageText}
          </span>
          <span className="text-[10px]">{open ? '▲' : '▼'}</span>
        </button>

        {/* 걸린 조건이 있을 때만 푸는 길을 보여 준다 */}
        {active > 0 && (
          <button
            type="button"
            onClick={() => {
              onChange({ categories: [], stages: [] });
              onKeyword('');
            }}
            className="min-h-[36px] px-1 text-xs font-semibold text-grey-500 hover:text-grey-700"
          >
            전체 보기
          </button>
        )}
      </div>

      {open && (
        <div className="mt-2 rounded-2xl border border-grey-200 bg-white p-3">
          <Group
            title="유형"
            allLabel="전체 유형"
            selected={categories.length}
            onAll={() => onChange({ categories: [], stages })}
          >
            {GRANT_CATEGORIES.map((c) => (
              <Chip
                key={c}
                on={categories.includes(c)}
                onClick={() =>
                  onChange({ categories: toggle(categories, c), stages })
                }
              >
                {GRANT_CATEGORY_LABELS[c]}
              </Chip>
            ))}
          </Group>

          <div className="my-2.5 border-t border-grey-100" />

          {/*
            **찾는 말은 업력 옆 빈자리에 둔다.**

            업력은 칩이 다섯 개뿐이라 오른쪽이 늘 비어 있었다. 검색을 따로
            한 줄 차지하게 두면 패널만 길어지는데, 여기 붙이면 자리를 안
            늘리고도 들어간다.
          */}
          <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
            <div className="min-w-0 flex-1">
              <Group
                title="업력"
                allLabel="전체 업력"
                selected={stages.length}
                onAll={() => onChange({ categories, stages: [] })}
              >
                {GRANT_STAGES.map((s) => (
                  <Chip
                    key={s}
                    on={stages.includes(s)}
                    onClick={() =>
                      onChange({ categories, stages: toggle(stages, s) })
                    }
                  >
                    {GRANT_STAGE_LABELS[s]}
                  </Chip>
                ))}
              </Group>
            </div>

            <div className="w-full sm:w-56">
              <p className="mb-2 text-xs font-bold text-grey-700">찾는 말</p>
              <div className="relative">
                <input
                  value={keyword}
                  onChange={(e) => onKeyword(e.target.value)}
                  placeholder="농업, 수출, AI …"
                  className="h-8 w-full rounded-full border border-grey-200 pl-3 pr-8 text-xs text-grey-900 placeholder:text-grey-400 focus:border-brand focus:outline-none"
                />
                {keyword && (
                  <button
                    type="button"
                    onClick={() => onKeyword('')}
                    aria-label="지우기"
                    className="absolute right-0.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-xs text-grey-400 hover:bg-grey-100 hover:text-grey-600"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          </div>

          {/*
            업력 제한이 걸린 공고는 열린 것의 22% 뿐이라, 나머지를 담은
            "업력 무관"을 빼고 고르면 대부분이 사라진다. 그것을 필터가 고장난
            것으로 읽지 않도록 미리 적어 둔다.
          */}
          {stages.length > 0 && !stages.includes('any') && (
            <p className="mt-2.5 text-xs leading-5 text-grey-500">
              업력 제한이 없는 공고는 빠집니다. 함께 보려면{' '}
              <button
                type="button"
                onClick={() => onChange({ categories, stages: [...stages, 'any'] })}
                className="font-semibold text-brand underline"
              >
                업력 무관
              </button>
              도 골라 주세요.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  title, allLabel, selected, onAll, children,
}: {
  title: string;
  allLabel: string;
  selected: number;
  onAll: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="text-xs font-bold text-grey-700">{title}</p>
        <button
          type="button"
          onClick={onAll}
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-colors ${
            selected === 0
              ? 'bg-brand text-white'
              : 'bg-grey-100 text-grey-600 hover:bg-grey-200'
          }`}
        >
          {allLabel}
        </button>
      </div>
      <div className="flex flex-wrap gap-1">{children}</div>
    </div>
  );
}

function Chip({
  on, onClick, children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-[34px] rounded-full px-3 text-xs font-medium transition-colors ${
        on
          ? 'bg-brand text-white'
          : 'bg-grey-100 text-grey-600 hover:bg-grey-200'
      }`}
    >
      {children}
    </button>
  );
}
