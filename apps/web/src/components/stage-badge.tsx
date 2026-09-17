'use client';

import type { ApplicantType } from '@moai/shared';

const STYLES: Record<
  ApplicantType,
  { label: string; className: string; dot: string }
> = {
  preliminary: {
    label: '일반',
    className: 'bg-grey-100 text-grey-600',
    dot: 'bg-grey-400',
  },
  individual: {
    label: '개인사업자',
    className: 'bg-brand-light text-brand',
    dot: 'bg-brand',
  },
  corporate: {
    label: '법인사업자',
    className: 'bg-success-light text-success',
    dot: 'bg-success',
  },
};

/**
 * 사업자 형태 배지.
 * 클릭하면 형태를 다시 고를 수 있다 — 사업자등록을 마치면 바꿔야 하므로.
 */
export function StageBadge({
  stage, onClick,
}: {
  stage: ApplicantType | null;
  onClick?: () => void;
}) {
  if (!stage) {
    return (
      <button
        onClick={onClick}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-warning-light px-3.5 py-2 text-xs font-semibold text-warning transition-opacity hover:opacity-80"
      >
        <span className="size-1.5 rounded-full bg-warning" />
        형태 선택하기
      </button>
    );
  }

  const s = STYLES[stage];
  const Tag = onClick ? 'button' : 'span';

  return (
    <Tag
      onClick={onClick}
      /*
        누를 수 있을 때만 키운다 — 단순 표시일 때는 배지답게 작은 편이 낫다.
      */
      className={`inline-flex items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${s.className} ${
        onClick
          ? 'min-h-[36px] px-3.5 py-2 transition-opacity hover:opacity-80'
          : 'py-1'
      }`}
    >
      <span className={`size-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </Tag>
  );
}
