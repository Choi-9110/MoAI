/**
 * 사업자등록번호 — 저장 형태와 보여 주는 형태를 갈라 둔다.
 *
 * **왜 필요한가.** 사람마다 `862-16-02751` 로도 `8621602751` 로도 적는다.
 * 실제로 DB 에 두 형태가 섞여 쌓여 있었다. 표시만 할 때는 티가 안 나지만,
 * 같은 사업자인지 맞춰 봐야 하는 순간 — 중복 가입을 막거나 국세청 휴폐업을
 * 조회할 때 — 두 값이 서로 다른 사업자로 보인다.
 *
 * 그래서 **저장은 숫자 10자리 하나로 통일**하고, 하이픈은 보여 줄 때만 넣는다.
 */

/** 사업자등록번호 자리수 */
export const BUSINESS_NUMBER_LENGTH = 10;

/** 하이픈 위치 — 3-2-5 */
export const BUSINESS_NUMBER_PARTS = [3, 2, 5] as const;

/**
 * 저장 형태로 바꾼다 — 숫자만 남긴다.
 *
 * 값이 없거나 숫자가 하나도 없으면 빈 문자열이다. 자리수는 보지 않는다 —
 * 입력 도중에도 불리기 때문이다(세 칸을 채워 나가는 동안).
 *
 * **넘치는 자리를 잘라내지 않는다.** 11자리가 들어오면 앞 10자리를 취하는
 * 편이 친절해 보이지만, 그러면 오타가 멀쩡한 번호로 둔갑해 저장된다.
 * 넘치면 넘치는 채로 두고 `isBusinessNumber` 에서 걸러 사람에게 알린다.
 */
export function normalizeBusinessNumber(raw: string | null | undefined): string {
  return (raw ?? '').replace(/\D/g, '');
}

/**
 * 온전한 번호인지 본다.
 *
 * **자리수만 본다.** 국세청 검증식으로 오타까지 잡을 수 있지만, 그 식이
 * 틀리면 멀쩡한 번호를 가진 사람이 저장을 못 하게 된다. 우리는 이 번호로
 * 무엇을 승인하지 않고 서류에 옮겨 적을 뿐이라 자리수면 충분하다.
 */
export function isBusinessNumber(raw: string | null | undefined): boolean {
  return normalizeBusinessNumber(raw).length === BUSINESS_NUMBER_LENGTH;
}

/** 보여 주는 형태로 바꾼다 — `862-16-02751`. 덜 찬 값은 있는 데까지 끊는다. */
export function formatBusinessNumber(raw: string | null | undefined): string {
  const digits = normalizeBusinessNumber(raw);
  if (digits.length === 0) return '';

  const parts: string[] = [];
  let at = 0;
  for (const size of BUSINESS_NUMBER_PARTS) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  return parts.join('-');
}

/** 세 칸으로 쪼갠다 — 입력 칸에 그대로 얹는다 */
export function splitBusinessNumber(raw: string | null | undefined): string[] {
  const digits = normalizeBusinessNumber(raw);
  const parts: string[] = [];
  let at = 0;
  for (const size of BUSINESS_NUMBER_PARTS) {
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  return parts;
}
