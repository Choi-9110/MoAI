'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

/**
 * 화면 중앙 모달.
 *
 * **body 로 옮겨서 그린다.** 자기가 놓인 자리에서 그대로 그리면 조상에 걸린
 * 스타일을 뒤집어쓴다 — 실제로 관심 공고 목록에서 마감된 줄에 `opacity-60`
 * 이 걸려 있어, 그 줄에서 연 팝업이 통째로 비쳐 보였다. `position: fixed`
 * 도 소용없다. opacity·transform·filter 는 새 기준을 만들고 자식 전부에
 * 적용되기 때문이다.
 */
export function Modal({
  open, onClose, title, children, wide,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  /*
   * 서버에서는 document 가 없다. 처음 그릴 때는 아무것도 내지 않고,
   * 브라우저에 붙은 뒤부터 portal 로 보낸다.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!open || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-grey-900/40 p-4 sm:py-8"
      onClick={onClose}
    >
      <div
        className={`thin-scroll w-full rounded-2xl bg-white p-5 shadow-xl sm:p-6 ${wide ? 'max-w-5xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-lg font-bold text-grey-900">{title}</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="grid size-8 place-items-center rounded-lg text-grey-400 hover:bg-grey-100"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
