'use client';

import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { GUIDE_TYPES } from './guide-data';
import type { GuideBlock } from './guide-data';

/**
 * 공고 유형별 작성 가이드.
 *
 * 같은 아이템이라도 어디에 내느냐에 따라 심사자가 보는 것이 다르다. 그걸
 * 모르고 쓰면 열심히 쓴 것이 배점 없는 칸에 들어간다.
 *
 * **한 화면에 다 쏟지 않는다.** 유형을 고르고, 그 안에서 절을 골라 본다.
 * 지침 원문은 20쪽이 넘는데 그걸 통째로 띄우면 아무도 안 읽는다.
 */

/** `**굵게**` 만 처리한다 — 마크다운 전체를 끌어올 만한 자리가 아니다 */
function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') && p.endsWith('**') ? (
          <b key={i} className="font-bold text-[var(--moai-ink)]">
            {p.slice(2, -2)}
          </b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function Block({ block }: { block: GuideBlock }) {
  switch (block.kind) {
    case 'text':
      return (
        <p className="text-sm leading-relaxed text-[var(--moai-muted)]">
          <Rich text={block.text} />
        </p>
      );

    case 'list':
      return (
        <ul className="space-y-1.5">
          {block.items.map((it, i) => (
            <li
              key={i}
              className="flex gap-2 text-sm leading-relaxed text-[var(--moai-muted)]"
            >
              <span className="mt-[7px] size-1 shrink-0 rounded-full bg-[var(--moai-subtle)]" />
              <span>
                <Rich text={it} />
              </span>
            </li>
          ))}
        </ul>
      );

    case 'table':
      // 좁은 화면에서 표가 화면을 밀어내지 않도록 가로로만 스크롤시킨다.
      return (
        <div className="thin-scroll overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--moai-border)]">
                {block.head.map((h, i) => (
                  <th
                    key={i}
                    className="py-2 pr-3 font-bold text-[var(--moai-ink)]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--moai-border)]">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="py-2 pr-3 align-top leading-relaxed text-[var(--moai-muted)]"
                    >
                      <Rich text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'compare':
      return (
        <div className="space-y-2">
          {block.rows.map((r, i) => (
            <div key={i} className="border border-[var(--moai-border)]">
              <p className="border-b border-[var(--moai-border)] bg-[var(--moai-risk-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--moai-risk-fg)]">
                ✗ {r.bad}
              </p>
              <p className="px-3 py-2 text-xs leading-relaxed text-[var(--moai-ink)]">
                ✓ {r.good}
              </p>
            </div>
          ))}
        </div>
      );

    case 'note':
      return (
        <p className="border-l-2 border-[var(--moai-accent)] bg-[var(--moai-accent-50)] px-3 py-2.5 text-xs leading-relaxed text-[var(--moai-muted)]">
          <Rich text={block.text} />
        </p>
      );
  }
}

export function NoticeGuide({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [typeKey, setTypeKey] = useState(GUIDE_TYPES[0].key);
  const [sectionIndex, setSectionIndex] = useState(0);

  const type = GUIDE_TYPES.find((t) => t.key === typeKey) ?? GUIDE_TYPES[0];
  const section = type.sections[sectionIndex] ?? type.sections[0];

  return (
    <Modal open={open} onClose={onClose} title="공고별 가이드" wide>
      {/* 어떤 공고인가 */}
      <div className="flex flex-wrap gap-1.5">
        {GUIDE_TYPES.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTypeKey(t.key);
              setSectionIndex(0);
            }}
            className={`border px-3 py-1.5 text-xs font-bold transition-colors ${
              t.key === typeKey
                ? 'border-[var(--moai-accent)] bg-[var(--moai-accent-50)] text-[var(--moai-accent)]'
                : 'border-[var(--moai-border)] bg-white text-[var(--moai-muted)] hover:border-[var(--moai-accent-100)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mt-2.5 text-xs leading-relaxed text-[var(--moai-subtle)]">
        <Rich text={type.when} />
      </p>

      {/* 절 고르기 */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 border-b border-[var(--moai-border)] pb-2.5">
        {type.sections.map((s, i) => (
          <button
            key={s.title}
            onClick={() => setSectionIndex(i)}
            className={`text-xs font-bold transition-colors ${
              i === sectionIndex
                ? 'text-[var(--moai-accent)] underline underline-offset-4'
                : 'text-[var(--moai-subtle)] hover:text-[var(--moai-muted)]'
            }`}
          >
            {s.title}
          </button>
        ))}
      </div>

      {/*
        한 절씩만 보여 준다. 높이를 묶어 두는 것은 절마다 분량이 달라서다 —
        묶지 않으면 절을 바꿀 때마다 팝업이 늘었다 줄었다 한다.
      */}
      <div className="thin-scroll mt-4 max-h-[52vh] space-y-3 overflow-y-auto pr-1">
        {section.blocks.map((b, i) => (
          <Block key={i} block={b} />
        ))}
      </div>

      <p className="mt-4 border-t border-[var(--moai-border)] pt-3 text-xs text-[var(--moai-subtle)]">
        사업계획서를 쓸 때 AI 도 같은 지침을 따릅니다. 여기 적힌 것과 결과물이
        어긋나면 알려주세요.
      </p>
    </Modal>
  );
}
