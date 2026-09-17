'use client';

import {
  BID_KIND_LABELS, INTERESTS, INTEREST_HINTS, INTEREST_LABELS,
  PROCUREMENT_INDUSTRIES,
} from '@moai/shared';
import type { BidKind, Interest } from '@moai/shared';
import { Input, Label } from '@/components/ui/field';

/**
 * 무엇을 찾고 있는지 고르는 곳 — 내 정보 화면 맨 위.
 *
 * **여기서 고른 것이 아래에 무엇을 물을지를 정한다.** 사업자 형태를 고르면
 * 사업자 항목이 나타났다 사라지는 것과 같은 원리인데, 한 단계 위에 있다.
 *
 * 세 갈래로 나누는 이유는 사람마다 필요한 것이 다르기 때문이다. 시공업체에게
 * 창업교육 공고는 소음이고, 기술만 하는 1인 사업자에게 입찰 공고도 그렇다.
 * **기본은 꺼짐**이라 원하는 사람만 켠다.
 */
export function InterestPicker({
  interests, onInterests,
  industries, onIndustries,
  registered, onRegistered,
  performance, onPerformance,
}: {
  interests: Interest[];
  onInterests: (v: Interest[]) => void;
  industries: string[];
  onIndustries: (v: string[]) => void;
  registered: boolean | null;
  onRegistered: (v: boolean | null) => void;
  performance: string;
  onPerformance: (v: string) => void;
}) {
  const wantsBid = interests.includes('bid');

  const toggle = (key: Interest) => {
    onInterests(
      interests.includes(key)
        ? interests.filter((i) => i !== key)
        : [...interests, key],
    );
  };

  const toggleIndustry = (value: string) => {
    onIndustries(
      industries.includes(value)
        ? industries.filter((v) => v !== value)
        : [...industries, value],
    );
  };

  /** 공사·용역·물품으로 묶어 보여 준다 — 한 줄로 늘어놓으면 못 찾는다 */
  const byKind = PROCUREMENT_INDUSTRIES.reduce<Record<string, typeof PROCUREMENT_INDUSTRIES>>(
    (acc, item) => {
      (acc[item.kind] ??= []).push(item);
      return acc;
    },
    {},
  );

  return (
    <div>
      <Label hint="고른 것만 목록에 나옵니다. 여러 개 고를 수 있어요.">
        어떤 지원을 찾고 계세요?
      </Label>

      <div className="space-y-2">
        {INTERESTS.map((key) => {
          const on = interests.includes(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => toggle(key)}
              aria-pressed={on}
              className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${
                on
                  ? 'border-brand bg-brand/5'
                  : 'border-grey-200 bg-white hover:bg-grey-50'
              }`}
            >
              <span
                aria-hidden
                className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-[11px] font-bold ${
                  on
                    ? 'border-brand bg-brand text-white'
                    : 'border-grey-300 text-transparent'
                }`}
              >
                ✓
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-semibold text-grey-900">
                  {INTEREST_LABELS[key]}
                </span>
                <span className="mt-0.5 block text-xs text-grey-500">
                  {INTEREST_HINTS[key]}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/*
        입찰을 켠 사람에게만 묻는다.

        업종은 필수다 — 이것 없이는 어떤 공고를 골라 줄지 알 수가 없다.
        반면 조달등록·실적은 판정을 더 정확하게 할 뿐이라 접어 둔다.
        넷 다 필수로 걸면 입력 앞에서 그냥 닫아 버린다.
      */}
      {wantsBid && (
        <div className="mt-4 rounded-xl border border-brand/30 bg-brand/[0.03] p-4">
          <Label
            required
            hint="가진 면허를 모두 고르세요. 이 업종의 공고만 골라 드립니다."
          >
            보유 업종·면허
          </Label>

          <div className="space-y-3">
            {(Object.keys(byKind) as BidKind[]).map((kind) => (
              <div key={kind}>
                <p className="mb-1.5 text-xs font-semibold text-grey-500">
                  {BID_KIND_LABELS[kind]}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {byKind[kind].map((item) => {
                    const on = industries.includes(item.value);
                    return (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => toggleIndustry(item.value)}
                        aria-pressed={on}
                        className={`h-9 rounded-full px-3.5 text-sm font-medium transition-colors ${
                          on
                            ? 'bg-brand text-white'
                            : 'bg-grey-100 text-grey-600 hover:bg-grey-200'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {industries.length === 0 && (
            <p className="mt-2.5 text-xs text-grey-500">
              업종을 하나 이상 고르면 입찰 공고가 보이기 시작해요.
            </p>
          )}

          <p className="mt-3 border-t border-brand/20 pt-3 text-xs text-grey-500">
            사업장 지역은 아래에서 입력하신 값을 그대로 씁니다 — 다시 묻지 않아요.
          </p>

          {/*
            **접지 않는다.** 안 채워도 공고는 보이지만, 접어 두면 이런 것을
            물어본다는 사실 자체를 모른 채 지나간다. 채우면 판정이 정확해지는
            항목이라 눈에 보이는 편이 낫다. 대신 `(선택)` 을 붙여 안 채워도
            된다는 것을 항목마다 알린다.
          */}
          <div className="mt-3 space-y-3">
              <div>
                <Label hint="등록되어 있지 않으면 투찰 자체가 불가능합니다">
                  조달청 입찰참가자격 등록 <Optional />
                </Label>
                <div className="flex gap-2">
                  {[
                    { v: true, t: '등록했어요' },
                    { v: false, t: '아직이에요' },
                  ].map((o) => (
                    <button
                      key={String(o.v)}
                      type="button"
                      onClick={() => onRegistered(registered === o.v ? null : o.v)}
                      className={`h-10 rounded-full px-4 text-sm font-medium transition-colors ${
                        registered === o.v
                          ? 'bg-brand text-white'
                          : 'bg-grey-100 text-grey-600 hover:bg-grey-200'
                      }`}
                    >
                      {o.t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <Label hint="원 단위. 큰 공고의 자격 판정에 씁니다">
                  최근 3년 조달 실적 <Optional />
                </Label>
                <Input
                  value={performance}
                  onChange={(e) =>
                    onPerformance(e.target.value.replace(/[^\d]/g, ''))
                  }
                  inputMode="numeric"
                  placeholder="0"
                />
              </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 안 채워도 된다는 표시.
 *
 * 예전에는 이 항목들을 통째로 접어 두고 "더 정확하게 받기 (선택)" 이라고
 * 적었다. 그런데 접혀 있으면 이런 것을 물어본다는 사실 자체를 모른 채
 * 지나가서, 판정이 흐려지는 줄도 모르게 된다. 그래서 펼쳐 두고 표시만 남겼다.
 */
function Optional() {
  return (
    <span className="ml-1 text-xs font-normal text-grey-400">(선택)</span>
  );
}
