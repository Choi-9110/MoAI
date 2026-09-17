import type { CSSProperties } from 'react';
import { BRAND_ICONS } from './icons';
import type { IconName } from './icons';

export type { IconName };
export { BRAND_ICONS };

/**
 * 브랜드 선형 아이콘.
 *
 * 획 스타일(fill:none / stroke:currentColor / 1.6px / round)은
 * 브랜드킷에서 컨테이너가 상속시키던 값이다. 여기서 직접 준다.
 * 색은 지정하지 않는다 — 놓인 자리의 글자색을 따라간다.
 */
export function Icon({
  name,
  size = 20,
  className,
  style,
  title,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
  /** 아이콘만으로 뜻이 전달돼야 할 때만 넣는다. 곁에 글자가 있으면 생략할 것. */
  title?: string;
}) {
  const icon = BRAND_ICONS[name];

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ display: 'block', flexShrink: 0, ...style }}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      // 빌드 시점에 고정된 브랜드킷 도형이다. 외부 입력이 섞이지 않는다.
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  );
}
