'use client';

import { useState } from 'react';
import type { ConditionAnswer, OpenCondition } from '@moai/shared';
import { conditionApi } from '@/lib/api';

/**
 * 판정기가 스스로 못 정한 조건을 사용자에게 직접 묻는다.
 *
 * 공고 원문을 다시 파싱하지 않고 판정 결과(`eligibility.openConditions`)만
 * 그리므로, 화면에 뜬 질문과 판정에 쓰이는 조건이 어긋날 수 없다.
 *
 * 답은 **조건 문장**을 키로 저장한다. "유흥주점업 제외" 같은 문구는
 * 수십 개 공고에 똑같이 들어가므로, 한 번 답하면 계속 재사용된다.
 */
export function ConditionChecklist({
  conditions,
  profileId,
  onAnswered,
}: {
  conditions: OpenCondition[];
  profileId: string | null;
  /** 저장 후 판정을 다시 불러오기 위해 부모가 넘긴다 */
  onAnswered: () => void | Promise<void>;
}) {
  /** 방금 답한 항목 — 저장 직후에도 되돌릴 수 있게 화면에 남겨 둔다 */
  const [justAnswered, setJustAnswered] = useState<
    Record<string, ConditionAnswer>
  >({});
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 같은 문구가 여러 번 나오면 한 번만 묻는다.
  const unique = conditions.filter(
    (c, i) => conditions.findIndex((o) => o.key === c.key) === i,
  );

  const answeredKeys = Object.keys(justAnswered);
  if (unique.length === 0 && answeredKeys.length === 0) return null;

  async function save(key: string, value: ConditionAnswer | null) {
    if (!profileId) {
      setError('기업 프로필을 먼저 등록해 주세요.');
      return;
    }

    setSaving(key);
    setError(null);
    try {
      await conditionApi.answer(profileId, { [key]: value });

      setJustAnswered((prev) => {
        const next = { ...prev };
        if (value === null) delete next[key];
        else next[key] = value;
        return next;
      });

      await onAnswered();
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장하지 못했습니다.');
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-warning/30 bg-warning/5 p-4">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm">🟠</span>
        <p className="text-xs font-bold text-grey-800">
          직접 확인이 필요한 조건 {unique.length}건
        </p>
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-grey-500">
        공고에만 있는 조건이라 시스템이 알 수 없습니다. 한 번 답하면 같은 조건이
        있는 다른 공고에도 자동으로 적용됩니다.
      </p>

      <ul className="space-y-2">
        {unique.map((c) => (
          <li
            key={c.key}
            className="rounded-lg bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
          >
            <div className="mb-2 flex items-start gap-2">
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  c.kind === 'exclusion'
                    ? 'bg-danger/10 text-danger'
                    : 'bg-primary/10 text-primary'
                }`}
              >
                {c.kind === 'exclusion' ? '제외 조건' : '신청 조건'}
              </span>
              <p className="text-xs leading-relaxed text-grey-700">{c.clause}</p>
            </div>

            <div className="flex items-center gap-1.5 pl-1">
              <span className="mr-1 text-[11px] text-grey-500">
                해당하시나요?
              </span>
              <AnswerButton
                label="예"
                busy={saving === c.key}
                onClick={() => save(c.key, 'yes')}
              />
              <AnswerButton
                label="아니오"
                busy={saving === c.key}
                onClick={() => save(c.key, 'no')}
              />
              <span className="text-[11px] text-grey-400">
                · 모르면 답하지 않아도 됩니다
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* 방금 답한 항목 — 잘못 눌렀을 때 바로 되돌릴 수 있게 남겨 둔다 */}
      {answeredKeys.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-warning/20 pt-3">
          {answeredKeys.map((key) => (
            <li
              key={key}
              className="flex items-center gap-2 text-[11px] text-grey-500"
            >
              <span className="text-success">✓</span>
              <span className="min-w-0 flex-1 truncate">{key}</span>
              <span className="shrink-0 font-semibold text-grey-600">
                {justAnswered[key] === 'yes' ? '예' : '아니오'}
              </span>
              <button
                onClick={() => save(key, null)}
                disabled={saving === key}
                className="shrink-0 text-grey-400 underline underline-offset-2 hover:text-grey-600 disabled:opacity-50"
              >
                되돌리기
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

function AnswerButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-md border border-grey-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-grey-700 transition hover:border-primary hover:text-primary disabled:opacity-40"
    >
      {label}
    </button>
  );
}
