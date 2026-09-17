'use client';

import type {
  ComponentPropsWithRef, ReactNode, SelectHTMLAttributes,
} from 'react';

const BASE =
  'h-13 w-full rounded-xl border border-grey-200 bg-white px-4 text-[15px] text-grey-900 placeholder:text-grey-400 transition-colors focus:border-brand';

export function Label({
  children, required, hint,
}: {
  children: ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-2">
      <label className="text-sm font-semibold text-grey-700">
        {children}
        {required && <span className="ml-0.5 text-brand">*</span>}
      </label>
      {hint && <p className="mt-0.5 text-xs text-grey-500">{hint}</p>}
    </div>
  );
}

/**
 * ref 를 받는 이유는 칸이 여러 개인 입력(사업자등록번호) 때문이다 —
 * 한 칸이 차면 다음 칸으로 옮겨 줘야 한다. React 19 부터 ref 는 그냥
 * 속성이라 `ComponentPropsWithRef` 로 받으면 그대로 흘러간다.
 *
 * style 은 덮어쓰지 않고 **합친다.** 예전에는 `{...rest}` 가 뒤에 있어서
 * 폭 하나만 넘겨도 높이가 통째로 날아갔다.
 */
export function Input({
  className = '', style, ...rest
}: ComponentPropsWithRef<'input'>) {
  return (
    <input
      className={`${BASE} ${className}`}
      style={{ height: 52, ...style }}
      {...rest}
    />
  );
}

export function Select({
  className = '', children, ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={`${BASE} ${className}`} style={{ height: 52 }} {...rest}>
      {children}
    </select>
  );
}

/** 선택형 칩 — 셀렉트보다 탭 수가 적어 모바일에서 유리하다 */
export function ChipGroup<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`h-10 rounded-full px-4 text-sm font-medium transition-colors ${
              active
                ? 'bg-brand text-white'
                : 'bg-grey-100 text-grey-600 hover:bg-grey-200'
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p className="mt-1.5 text-xs text-danger">{children}</p>;
}
