'use client';

import { useMemo, useState } from 'react';
import {
  CHANGE_LABELS, collectSlots, findOverflows, openGaps, slotKey,
} from '@moai/shared';
import type {
  PosterDoc, PosterSlot, SlotChange, SlotNote, SlotRef,
} from '@moai/shared';
import { Icon } from '@/components/brand/icon';
import { PosterView } from '@/components/poster/poster-view';
import { SAMPLE_POSTER } from '@/components/poster/sample';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { posterApi } from '@/lib/api';

/**
 * 사업 요약 한 장.
 *
 * 사업계획서 전체를 한 장으로 압축해 보여주고, **칸마다 따로 보완**받는다.
 * 압축하는 과정에서 무엇이 비어 있는지 드러나기 때문에,
 * 이 화면은 요약이자 점검표다.
 *
 * 흐름
 *   칸 클릭 → 현재 내용 확인 → 보완 지시 작성 → 저장
 *   → (반영하여 다시 만들기) 또는 (사업계획서 작성)
 */
export default function PosterPage() {
  const [doc, setDoc] = useState<PosterDoc>(SAMPLE_POSTER);

  const slots = useMemo(() => collectSlots(doc), [doc]);
  const gaps = useMemo(() => openGaps(doc), [doc]);
  const overflows = useMemo(() => findOverflows(doc), [doc]);

  /** 칸별 보완 지시 — 키는 blockId::slot */
  const [notes, setNotes] = useState<Record<string, SlotNote>>({});
  const [picked, setPicked] = useState<PosterSlot | null>(null);
  const [draft, setDraft] = useState('');

  /** 직전 재작성에서 무엇이 바뀌었는지 */
  const [changes, setChanges] = useState<SlotChange[] | null>(null);
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noteCount = Object.keys(notes).length;

  const changeMap = useMemo(() => {
    const m = new Map<string, SlotChange>();
    for (const c of changes ?? []) m.set(slotKey(c), c);
    return m;
  }, [changes]);

  /**
   * 보완 요청을 반영해 다시 만든다.
   *
   * 요청한 칸만 고치면 앞뒤가 안 맞는다 — 내부 문제점이 바뀌면 그 문제를
   * 겨냥하던 해결 방안도 바뀌어야 한다. 그래서 문서 전체를 다시 만들고,
   * 대신 무엇이 따라 바뀌었는지 아래에 그대로 보여준다.
   */
  async function revise() {
    setRevising(true);
    setError(null);
    try {
      // 이 화면은 레이아웃 확인용 샘플이라 저장할 사업이 없다.
      // 실제 편집은 /plans/[id] 에서 한다.
      setError('요약 편집은 사업 시작 후 해당 사업 화면에서 할 수 있습니다.');
    } catch (err) {
      setError(err instanceof Error ? err.message : '다시 만들지 못했습니다.');
    } finally {
      setRevising(false);
    }
  }

  function pick(ref: SlotRef) {
    const slot = slots.find(
      (s) => s.blockId === ref.blockId && s.slot === ref.slot,
    );
    if (!slot) return;
    setPicked(slot);
    setDraft(notes[slotKey(ref)]?.request ?? '');
  }

  function save() {
    if (!picked) return;
    const key = slotKey(picked);
    const request = draft.trim();

    setNotes((prev) => {
      const next = { ...prev };
      // 내용을 지우면 요청도 없앤다 — 빈 지시를 모델에 넘길 이유가 없다.
      if (!request) delete next[key];
      else next[key] = { blockId: picked.blockId, slot: picked.slot, request };
      return next;
    });
    setPicked(null);
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6">
        <h1 className="text-[26px] font-bold tracking-tight text-[var(--moai-ink)]">
          사업 요약 한 장
        </h1>
        <p className="mt-1 text-[15px] text-[var(--moai-muted)]">
          사업계획서를 한눈에 보이게 압축했습니다. 고치고 싶은 칸을 누르면
          보완할 내용을 적을 수 있어요.
        </p>
      </header>

      {/* 지금 상태 — 무엇이 비었고 무엇을 손봤는지 */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Status
          icon="needs-user"
          tone="needs-user"
          label="근거 필요"
          value={`${gaps.length}곳`}
        />
        <Status
          icon="edit"
          tone="accent"
          label="보완 작성"
          value={`${noteCount}곳`}
        />
        <Status
          icon="section"
          tone="neutral"
          label="전체 칸"
          value={`${slots.length}개`}
        />
      </div>

      {/* 분량 초과 — 넘치면 자르지 않고 다시 요약한다 */}
      {overflows.length > 0 && (
        <div className="mb-5 border border-needs-user-soft bg-[var(--moai-needs-user-bg)] px-5 py-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--moai-needs-user-fg)]">
            <Icon name="warning" size={15} />
            분량이 넘치는 항목이 {overflows.length}개 있어요
          </p>
          <ul className="mt-1.5 list-inside list-disc text-xs text-[var(--moai-muted)]">
            {overflows.slice(0, 3).map((o, i) => (
              <li key={i}>{o}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 직전 재작성에서 바뀐 곳 — 특히 요청하지 않았는데 바뀐 칸 */}
      {changes && <ChangeReport changes={changes} onDismiss={() => setChanges(null)} />}

      {error && (
        <div className="mb-5 border border-danger-soft bg-[var(--moai-risk-bg)] px-5 py-4 text-sm text-[var(--moai-risk-fg)]">
          {error}
        </div>
      )}

      <PosterView
        doc={doc}
        handlers={{
          onPick: pick,
          noted: (ref) => slotKey(ref) in notes,
          changed: (ref) => {
            const c = changeMap.get(slotKey(ref));
            if (!c) return null;
            return c.kind === 'requested' ? 'requested' : 'ripple';
          },
        }}
      />

      {/* 하단 실행 — 전체를 다시 만들거나, 사업계획서로 넘어간다 */}
      <div className="mt-6 flex flex-col items-center gap-3 border-t border-[var(--moai-border)] pt-6 sm:flex-row sm:justify-center">
        <Button variant="secondary" disabled>
          반영하여 다시 만들기
        </Button>
        <Button variant="brand" disabled={revising}>
          사업계획서 작성
        </Button>
      </div>
      {noteCount === 0 && !revising && (
        <p className="mt-2 text-center text-xs text-[var(--moai-subtle)]">
          보완할 칸을 누르면 &lsquo;반영하여 다시 만들기&rsquo;가 켜집니다.
        </p>
      )}
      {revising && (
        <p className="mt-2 text-center text-xs text-[var(--moai-muted)]">
          내 PC 의 클로드가 문서 전체를 다시 쓰고 있습니다. 1~2분 걸려요.
        </p>
      )}

      {/* 칸 하나 보완 */}
      <Modal
        open={picked !== null}
        onClose={() => setPicked(null)}
        title={picked ? `${picked.category} — ${picked.title}` : ''}
      >
        {picked && (
          <>
            <div className="mb-4 border border-[var(--moai-border)] bg-[var(--moai-surface)] px-4 py-3">
              <p className="mb-1 text-[11px] font-bold text-[var(--moai-subtle)]">
                현재 내용
              </p>
              <p className="text-sm leading-relaxed text-[var(--moai-ink)]">
                {picked.text || '(비어 있음)'}
              </p>
              {picked.gap && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--moai-needs-user-fg)]">
                  <Icon name="needs-user" size={13} className="mt-px" />
                  {picked.gap.reason}
                </p>
              )}
            </div>

            <label
              htmlFor="slot-note"
              className="mb-1.5 block text-sm font-semibold text-[var(--moai-ink)]"
            >
              이 내용을 어떻게 보완 / 수정하시겠습니까?
            </label>
            <textarea
              id="slot-note"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              autoFocus
              placeholder="예: 실제 운영자 인터뷰 결과를 근거로 넣어줘 / 수치를 빼고 더 짧게 / 전문 용어를 쉽게"
              className="w-full resize-y border border-[var(--moai-border)] px-4 py-3 text-sm leading-relaxed text-[var(--moai-ink)] outline-none focus:border-[var(--moai-accent)]"
            />
            <p className="mt-1.5 text-xs text-[var(--moai-subtle)]">
              지금 바로 다시 쓰지 않습니다. 다 적은 뒤 아래
              &lsquo;반영하여 다시 만들기&rsquo;를 누르면 한 번에 반영돼요.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPicked(null)}>
                취소
              </Button>
              <Button variant="brand" onClick={save}>
                저장
              </Button>
            </div>
          </>
        )}
      </Modal>
    </main>
  );
}

/**
 * 이번 재작성에서 무엇이 바뀌었는지.
 *
 * 요청한 칸보다 **따라 바뀐 칸**을 보여주는 것이 이 패널의 목적이다.
 * 문제를 고치면 해결 방안도 바뀌는 게 맞지만, 그걸 말없이 갈아 끼우면
 * 사용자는 자기가 쓰지 않은 문장을 자기 것으로 착각하게 된다.
 */
function ChangeReport({
  changes, onDismiss,
}: {
  changes: SlotChange[];
  onDismiss: () => void;
}) {
  const ripple = changes.filter((c) => c.kind === 'ripple');
  const added = changes.filter((c) => c.kind === 'gap-added');

  return (
    <div className="mb-5 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--moai-accent)]">
            <Icon name="sync" size={15} />
            {changes.length === 0
              ? '바뀐 곳이 없습니다'
              : `${changes.length}곳이 바뀌었습니다`}
          </p>
          <p className="mt-1 text-xs text-[var(--moai-muted)]">
            {ripple.length > 0
              ? `요청한 칸 때문에 ${ripple.length}곳이 함께 조정됐어요.`
              : '요청한 칸만 바뀌었어요.'}
            {added.length > 0 && ` 새로 확인이 필요해진 곳이 ${added.length}곳 있습니다.`}
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="닫기"
          className="shrink-0 text-[var(--moai-subtle)] hover:text-[var(--moai-muted)]"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {changes.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-[var(--moai-accent-100)] pt-3">
          {changes.map((c, i) => (
            <li key={i} className="text-xs leading-relaxed">
              <span
                className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  c.kind === 'ripple'
                    ? 'bg-[var(--moai-needs-user-bg)] text-[var(--moai-needs-user-fg)]'
                    : c.kind === 'gap-added'
                      ? 'bg-[var(--moai-risk-bg)] text-[var(--moai-risk-fg)]'
                      : 'bg-white text-[var(--moai-accent)]'
                }`}
              >
                {CHANGE_LABELS[c.kind]}
              </span>
              <b className="font-bold text-[var(--moai-ink)]">
                {c.category} · {c.title}
              </b>
              {c.kind !== 'gap-added' && (
                <div className="mt-0.5 pl-1">
                  <p className="text-[var(--moai-subtle)] line-through">{c.before}</p>
                  <p className="text-[var(--moai-ink)]">{c.after}</p>
                </div>
              )}
              {c.gapReason && (
                <p className="mt-0.5 pl-1 text-[var(--moai-needs-user-fg)]">
                  {c.gapReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 상단 상태 칩 */
function Status({
  icon, tone, label, value,
}: {
  icon: 'needs-user' | 'edit' | 'section';
  tone: 'needs-user' | 'accent' | 'neutral';
  label: string;
  value: string;
}) {
  const style = {
    'needs-user':
      'border-needs-user-soft bg-[var(--moai-needs-user-bg)] text-[var(--moai-needs-user-fg)]',
    accent:
      'border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] text-[var(--moai-accent)]',
    neutral:
      'border-[var(--moai-border)] bg-[var(--moai-surface)] text-[var(--moai-muted)]',
  }[tone];

  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${style}`}
    >
      <Icon name={icon} size={13} />
      {label}
      <b className="tabular font-bold">{value}</b>
    </span>
  );
}
