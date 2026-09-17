'use client';

import { useState } from 'react';
import { GRANT_OUTCOMES, GRANT_OUTCOME_LABELS } from '@moai/shared';
import type { GrantOutcome } from '@moai/shared';
import { savedApi } from '@/lib/api';

/**
 * 지원 결과 적기.
 *
 * **왜 사용자가 직접 적어야 하나.** 선정 결과는 기관마다 제각각으로 공고되고
 * 우리가 읽을 수 있는 곳에 남지 않는다. 자동으로는 알 방법이 없다.
 *
 * **왜 적을 만한가.** 지원사업에는 "OOO사업 수혜 기업 제외" 같은 제한이
 * 흔한데, 무엇을 받았는지 알아야 그런 공고를 미리 걸러 줄 수 있다. 그래서
 * 적는 수고가 나중에 헛걸음을 막는 쪽으로 돌아온다 — 그 이유를 화면에도
 * 적어 둔다. 이유 없이 물으면 아무도 적지 않는다.
 */
export function OutcomePicker({
  tenantId, grantId, value, onChange,
}: {
  tenantId: string | null;
  grantId: string;
  value: GrantOutcome | null;
  onChange?: (next: GrantOutcome | null) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<GrantOutcome | null>(value);

  async function pick(next: GrantOutcome | null) {
    if (!tenantId || saving) return;
    const prev = current;

    // 먼저 반영하고 실패하면 되돌린다 — 누르고 기다리는 느낌을 없앤다
    setCurrent(next);
    setSaving(true);
    setError(null);
    try {
      await savedApi.setOutcome(tenantId, grantId, next);
      onChange?.(next);
    } catch (err) {
      setCurrent(prev);
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-grey-200 bg-grey-50 p-3.5">
      <p className="text-xs font-bold text-grey-700">지원했다면 결과를 남겨주세요</p>
      <p className="mt-1 text-xs leading-5 text-grey-500">
        “○○사업 수혜 기업 제외” 조건이 붙은 공고를 걸러 드리는 데 씁니다.
      </p>

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {GRANT_OUTCOMES.map((o) => {
          const on = current === o;
          return (
            <button
              key={o}
              type="button"
              disabled={saving || !tenantId}
              /* 다시 누르면 해제된다 — 잘못 눌렀을 때 되돌릴 길이 있어야 한다 */
              onClick={() => void pick(on ? null : o)}
              className={`min-h-[36px] rounded-full px-3 text-xs font-semibold transition-colors disabled:opacity-50 ${
                on
                  ? o === 'won'
                    ? 'bg-success-strong text-white'
                    : o === 'lost'
                      ? 'bg-grey-500 text-white'
                      : 'bg-brand text-white'
                  : 'bg-white text-grey-600 ring-1 ring-grey-200 hover:bg-grey-100'
              }`}
            >
              {GRANT_OUTCOME_LABELS[o]}
            </button>
          );
        })}
      </div>

      {current && (
        <p className="mt-2 text-xs text-grey-500">
          다시 누르면 지웁니다.
          {current === 'won' && ' 이 사업은 중복 수혜 확인에 쓰입니다.'}
        </p>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {!tenantId && (
        <p className="mt-2 text-xs text-grey-500">로그인하면 기록할 수 있어요.</p>
      )}
    </div>
  );
}
