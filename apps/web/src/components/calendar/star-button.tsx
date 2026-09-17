'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

/**
 * 관심 공고 별.
 *
 * 단순한 북마크가 아니라 우선순위 신호다 —
 * 마감 알림과 로컬 LLM 판정이 이 표시를 기준으로 먼저 처리된다.
 *
 * **해제는 한 번 물어본다.** 대시보드가 관심 공고만 보여주므로, 해제하는
 * 순간 그 공고는 화면에서 사라진다. 잘못 눌렀을 때 되돌리려면 전체 목록에서
 * 다시 찾아야 하는데, 접수 중인 공고가 수백 건이라 그게 쉽지 않다.
 * 담는 것은 되돌리기 쉬우므로 묻지 않는다.
 */
export function StarButton({
  active, onToggle, size = 'md', title, readOnly = false,
}: {
  active: boolean;
  onToggle: () => Promise<void> | void;
  size?: 'sm' | 'md';
  /** 확인 창에 보여줄 공고명 — 무엇을 지우는지 알고 누르게 한다 */
  title?: string;
  /**
   * 표시만 하고 누를 수 없게 한다.
   *
   * 목록에서 쓴다. 목록의 별은 줄마다 다닥다닥 붙어 있어서 공고를 열려다
   * 잘못 누르기 쉬운데, 그 한 번으로 목록에서 사라진다. **내용을 보고
   * 지우게** 목록에서는 상태만 보여 주고, 해제는 상세 팝업에서 한다.
   */
  readOnly?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);

  async function run() {
    if (busy) return;
    setBusy(true);
    try {
      await onToggle();
    } finally {
      setBusy(false);
      setAsking(false);
    }
  }

  function handle(e: React.MouseEvent) {
    // 목록 항목 안에 있을 때 상세가 같이 열리지 않도록 한다
    e.stopPropagation();
    e.preventDefault();
    if (busy) return;
    if (active) {
      setAsking(true);
      return;
    }
    void run();
  }

  /*
   * 읽기 전용일 때는 button 이 아니라 span 으로 낸다. 클릭을 막기만 하면
   * 줄 전체를 누른 것으로도 안 쳐 줘서 상세가 안 열린다 — 아예 비켜서서
   * 부모가 클릭을 받게 한다.
   */
  if (readOnly) {
    return (
      <span
        aria-hidden
        className={`pointer-events-none grid shrink-0 place-items-center ${
          size === 'sm' ? 'size-6 text-sm' : 'size-8 text-lg'
        } ${active ? 'text-warning' : 'text-grey-300'}`}
      >
        {active ? '★' : '☆'}
      </span>
    );
  }

  return (
    <>
      <button
        onClick={handle}
        disabled={busy}
        aria-label={active ? '관심 공고 해제' : '관심 공고로 저장'}
        title={active ? '관심 공고 해제' : '관심 공고로 저장'}
        className={`grid shrink-0 place-items-center rounded-lg transition-colors ${
          size === 'sm' ? 'size-6 text-sm' : 'size-8 text-lg'
        } ${
          active
            ? 'text-warning hover:bg-warning-light'
            : 'text-grey-300 hover:bg-grey-100 hover:text-grey-400'
        } ${busy ? 'opacity-50' : ''}`}
      >
        {active ? '★' : '☆'}
      </button>

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="관심 공고를 해제할까요?"
      >
        {title && (
          <p className="mb-2 rounded-lg bg-grey-50 px-3 py-2 text-sm font-semibold text-grey-800">
            {title}
          </p>
        )}
        <p className="text-sm leading-relaxed text-grey-600">
          해제하면 대시보드 달력에서 <b>바로 사라집니다.</b> 다시 담으려면 전체
          공고에서 찾아 별을 눌러야 해요.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              setAsking(false);
            }}
          >
            그대로 두기
          </Button>
          <Button
            variant="danger"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              void run();
            }}
          >
            {busy ? '해제하는 중…' : '관심 해제'}
          </Button>
        </div>
      </Modal>
    </>
  );
}
