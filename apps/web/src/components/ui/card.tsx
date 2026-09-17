import type { ReactNode } from 'react';

/** 회색 배경 위의 흰 카드 — 화면의 기본 단위 */
export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={`rounded-2xl bg-white ${padded ? 'p-6' : ''} ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-[17px] font-bold text-grey-900">{children}</h2>
      {action}
    </div>
  );
}
