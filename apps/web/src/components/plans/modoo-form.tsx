'use client';

import { useState } from 'react';
import { MODOO_QUESTIONS, missingModooAnswers } from '@moai/shared';
import type { ModooAnswers, ModooQuestion } from '@moai/shared';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';

/**
 * 모두의창업 지원서 문항.
 *
 * 주최측 지원서와 **같은 번호·같은 문구**를 쓴다. 여기 쓴 답을 그대로
 * 옮겨 붙일 수 있어야 하는데, 우리가 문구를 고쳐 두면 옮길 때마다
 * 다시 읽고 맞춰 봐야 한다.
 *
 * Q5(영상)·Q6(분야)·Q7(창업 여부)는 없다 — 영상은 분석하지 않고,
 * 나머지 둘은 기업 프로필에 이미 있다.
 */
export function ModooForm({
  onSubmit, submitting,
}: {
  onSubmit: (answers: ModooAnswers) => void;
  submitting: boolean;
}) {
  const [answers, setAnswers] = useState<ModooAnswers>({});
  /** 제출을 한 번 눌러 본 뒤에야 빨간 표시를 켠다 */
  const [touched, setTouched] = useState(false);

  const missing = missingModooAnswers(answers);

  function set(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (missing.length > 0) {
      document
        .getElementById(`q-${missing[0].id}`)
        ?.scrollIntoView({ block: 'center' });
      return;
    }
    onSubmit(answers);
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {MODOO_QUESTIONS.map((q) => (
        <Question
          key={q.id}
          q={q}
          value={answers[q.id] ?? ''}
          onChange={(v) => set(q.id, v)}
          invalid={touched && missing.some((m) => m.id === q.id)}
        />
      ))}

      {touched && missing.length > 0 && (
        <p className="border border-danger-soft bg-[var(--moai-risk-bg)] px-4 py-3 text-sm text-[var(--moai-risk-fg)]">
          필수 문항이 비어 있습니다 — {missing.map((m) => m.no).join(', ')}
        </p>
      )}

      <Button type="submit" variant="brand" size="lg" full disabled={submitting}>
        {submitting ? '시작하는 중…' : '사업 시작하기'}
      </Button>
    </form>
  );
}

function Question({
  q, value, onChange, invalid,
}: {
  q: ModooQuestion;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  const border = invalid
    ? 'border-danger-soft'
    : 'border-[var(--moai-border)] focus:border-[var(--moai-accent)]';

  return (
    <div id={`q-${q.id}`}>
      <div className="mb-1.5 flex flex-wrap items-baseline gap-x-2">
        <span className="text-xs font-bold text-[var(--moai-accent)]">
          {q.no}
        </span>
        <label className="text-sm font-bold text-[var(--moai-ink)]">
          {q.label}
        </label>
        {q.required ? (
          <span className="text-xs font-semibold text-[var(--moai-risk-fg)]">
            필수
          </span>
        ) : (
          <span className="text-xs text-[var(--moai-subtle)]">선택</span>
        )}
      </div>

      {q.hint && (
        <p className="mb-2 text-xs leading-relaxed text-[var(--moai-subtle)]">
          {q.hint}
        </p>
      )}

      {q.kind === 'select' ? (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full border bg-white px-4 py-3 text-sm text-[var(--moai-ink)] outline-none ${border}`}
        >
          <option value="">선택 안 함</option>
          {q.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : q.kind === 'line' ? (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, q.max))}
          maxLength={q.max}
          className={`w-full border px-4 py-3 text-sm text-[var(--moai-ink)] outline-none ${border}`}
        />
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, q.max))}
          rows={6}
          maxLength={q.max}
          className={`w-full resize-none border px-4 py-3 text-sm leading-relaxed text-[var(--moai-ink)] outline-none ${border}`}
        />
      )}

      {q.kind !== 'select' && (
        <div className="mt-1 flex items-center justify-between gap-2 text-xs">
          <span className="flex items-center gap-1 text-[var(--moai-subtle)]">
            <Icon name="arrow" size={11} />
            {q.feeds}
          </span>
          <span
            className={
              q.min && value.trim().length > 0 && value.trim().length < q.min
                ? 'text-[var(--moai-risk-fg)]'
                : 'text-[var(--moai-subtle)]'
            }
          >
            {q.min && value.trim().length > 0 && value.trim().length < q.min
              ? `${q.min - value.trim().length}자 더 필요합니다`
              : `${value.length} / ${q.max}`}
          </span>
        </div>
      )}
    </div>
  );
}
