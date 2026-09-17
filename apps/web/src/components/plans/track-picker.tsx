'use client';

import { PROJECT_TRACKS, TRACK_SPECS } from '@moai/shared';
import type { ProjectTrack } from '@moai/shared';
import { Icon } from '@/components/brand/icon';
import type { IconName } from '@/components/brand/icon';
import { Modal } from '@/components/ui/modal';

const ICONS: Record<ProjectTrack, IconName> = {
  modoo: 'award',
  gov: 'grant',
};

/**
 * 어느 트랙으로 시작할지 고르는 팝업.
 *
 * 뒤에 폼이 이미 그려져 있어서 **그냥 닫아 두면 안 된다** — 트랙을 안 고른
 * 채로 폼을 만지면 어느 쪽으로 가는지 알 수 없다. 그래서 닫기는 취소로
 * 이어진다: X·바깥 클릭·ESC 는 전부 앞 화면으로 돌아간다.
 *
 * 예전에는 닫기를 아예 막아 두었는데, 눌러도 아무 일이 없으니 고장으로
 * 보였다. 못 닫게 하는 것과 눌러도 반응이 없는 것은 다르다.
 */
export function TrackPicker({
  open, onPick, onCancel,
}: {
  open: boolean;
  onPick: (track: ProjectTrack) => void;
  /** 닫기 — 고르지 않고 빠져나간다 */
  onCancel: () => void;
}) {
  return (
    <Modal open={open} onClose={onCancel} title="어떤 사업으로 시작할까요?">
      <div className="space-y-3">
        {PROJECT_TRACKS.map((track) => {
          const spec = TRACK_SPECS[track];
          return (
            <button
              key={track}
              type="button"
              onClick={() => onPick(track)}
              className="group flex w-full items-start gap-4 border border-[var(--moai-border)] bg-white px-5 py-4 text-left transition-colors hover:border-[var(--moai-accent)] hover:bg-[var(--moai-accent-50)]"
            >
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center border border-[var(--moai-border)] bg-[var(--moai-surface)] text-[var(--moai-muted)] group-hover:border-[var(--moai-accent-100)] group-hover:bg-white group-hover:text-[var(--moai-accent)]">
                <Icon name={ICONS[track]} size={17} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-[var(--moai-ink)]">
                  {spec.label}
                </span>
                <span className="mt-1 block text-[13px] leading-relaxed text-[var(--moai-muted)]">
                  {spec.summary}
                </span>
                <span className="mt-1 block text-xs text-[var(--moai-subtle)]">
                  {spec.when}
                </span>
              </span>
              <Icon
                name="arrow"
                size={16}
                className="mt-1 shrink-0 text-[var(--moai-subtle)] group-hover:text-[var(--moai-accent)]"
              />
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
