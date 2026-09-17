import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'brand';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-hover disabled:bg-grey-300',
  secondary: 'bg-grey-100 text-grey-800 hover:bg-grey-200 disabled:text-grey-400',
  ghost: 'text-grey-600 hover:bg-grey-100 disabled:text-grey-300',
  danger: 'bg-danger-light text-danger hover:brightness-95',
  // 문서형 화면(요약 한 장·사업계획서)에서 쓰는 브랜드 딥 그린
  brand:
    'bg-[var(--moai-accent)] text-white hover:bg-[var(--moai-accent-hover)] disabled:bg-[var(--moai-border)] disabled:text-[var(--moai-subtle)]',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3.5 text-sm rounded-[10px]',
  md: 'h-12 px-5 text-[15px] rounded-xl',
  lg: 'h-14 px-6 text-base rounded-xl',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  full,
  className = '',
  children,
  ...rest
}: Props) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${full ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
