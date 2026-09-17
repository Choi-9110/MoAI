/**
 * 되돌린 결과가 망가졌는지.
 *
 * 대체 문자(U+FFFD)나 제어 문자가 생겼으면 되돌리지 말았어야 했다는 뜻이다.
 * 탭·줄바꿈·복귀는 사람이 넣을 수 있으므로 뺀다.
 *
 * 정규식 대신 코드로 세는 이유 — 문자 클래스에 제어 문자를 직접 적으면
 * 편집기와 diff 에서 보이지 않아, 나중에 읽는 사람이 무엇을 거르는지 알 수 없다.
 */
function looksBroken(value: string): boolean {
  for (const ch of value) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0xfffd) return true;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) {
      return true;
    }
  }
  return false;
}

/**
 * multipart 로 온 글자를 UTF-8 로 되돌린다.
 *
 * busboy 는 파일명을 latin1 로 읽어 넘긴다. 한글 파일명이
 * `2026ë__ìë¹ì°½ì……` 처럼 깨져 보이는 원인이다.
 *
 * **되돌리기가 늘 안전하지는 않다.** 이미 UTF-8 로 온 글자를 한 번 더
 * 되돌리면 오히려 깨진다. `'가'`(U+AC00)를 latin1 로 인코딩하면 하위 바이트만
 * 남아 **0x00(널 문자)** 이 되고, 그대로 저장하면 데이터베이스가
 * `invalid byte sequence for encoding "UTF8": 0x00` 으로 거부한다.
 *
 * 대부분의 한글은 되돌린 결과가 깨져서(U+FFFD) 걸러졌지만, 하위 바이트가
 * 0x00 인 글자만 그 그물을 빠져나갔다. 그래서 대체 문자뿐 아니라 **제어
 * 문자까지** 보고 판단한다.
 */
export function decodeMultipart(value: string): string {
  if (!value) return value;
  try {
    const restored = Buffer.from(value, 'latin1').toString('utf8');
    return looksBroken(restored) ? value : restored;
  } catch {
    return value;
  }
}
