'use client';

import { useRef } from 'react';
import type { ClipboardEvent, KeyboardEvent } from 'react';
import {
  BUSINESS_NUMBER_LENGTH, BUSINESS_NUMBER_PARTS,
  normalizeBusinessNumber, splitBusinessNumber,
} from '@moai/shared';
import { Input } from './ui/field';

/**
 * 사업자등록번호 입력 — 세 칸.
 *
 * **왜 칸을 나누는가.** 한 칸이면 사람마다 `862-16-02751` 로도
 * `8621602751` 로도 적는다. 실제로 두 형태가 DB 에 섞여 쌓였다. 칸을
 * 나눠 두면 어디까지가 한 토막인지 눈에 보여서 하이픈을 칠 일이 없고,
 * 자리수가 모자란 것도 그 자리에서 보인다.
 *
 * 밖으로는 **숫자 10자리 하나**로만 오간다. 하이픈은 화면에만 있다.
 */
export function BusinessNumberInput({
  value, onChange, disabled,
}: {
  value: string;
  onChange: (digits: string) => void;
  disabled?: boolean;
}) {
  const parts = splitBusinessNumber(value);
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  /** 한 칸이 바뀌면 세 칸을 다시 이어 붙여 밖으로 넘긴다 */
  const setPart = (index: number, raw: string): void => {
    const digits = raw.replace(/\D/g, '').slice(0, BUSINESS_NUMBER_PARTS[index]);
    const next = [...parts];
    next[index] = digits;
    onChange(normalizeBusinessNumber(next.join('')));

    // 칸이 다 차면 다음 칸으로 넘어간다 — 탭을 누르게 하지 않는다.
    if (digits.length === BUSINESS_NUMBER_PARTS[index]) {
      refs.current[index + 1]?.focus();
    }
  };

  /** 빈 칸에서 지우면 앞 칸으로 돌아간다 */
  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Backspace' && parts[index] === '' && index > 0) {
      e.preventDefault();
      refs.current[index - 1]?.focus();
    }
  };

  /**
   * 붙여넣기는 어느 칸에 넣든 전체로 받는다.
   *
   * 등록증에서 `862-16-02751` 을 통째로 복사해 오는 게 보통인데, 그걸
   * 첫 칸에 넣으면 앞 세 자리만 남고 나머지가 잘린다.
   */
  const onPaste = (e: ClipboardEvent<HTMLInputElement>): void => {
    // 뒤에 딸려 온 글자는 버린다 — 붙여넣는 건 대개 번호 그 자체다.
    const digits = normalizeBusinessNumber(e.clipboardData.getData('text')).slice(
      0,
      BUSINESS_NUMBER_LENGTH,
    );
    if (!digits) return;
    e.preventDefault();
    onChange(digits);
    refs.current[BUSINESS_NUMBER_PARTS.length - 1]?.focus();
  };

  return (
    <div className="flex items-center gap-2">
      {BUSINESS_NUMBER_PARTS.map((size, i) => (
        <div key={i} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-grey-400">-</span>}
          <Input
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={parts[i]}
            onChange={(e) => setPart(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onPaste={onPaste}
            disabled={disabled}
            inputMode="numeric"
            /*
             * type="number" 를 쓰면 앞자리 0 이 사라지고 위아래 화살표가
             * 붙는다. 숫자 자판은 inputMode 로 부른다.
             */
            type="text"
            maxLength={size}
            placeholder={'0'.repeat(size)}
            aria-label={`사업자등록번호 ${i + 1}번째 자리`}
            className="text-center"
            style={{ width: `${size * 1.15 + 1.6}rem` }}
          />
        </div>
      ))}
    </div>
  );
}
