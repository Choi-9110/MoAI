/**
 * 공고 원문 텍스트를 읽기 좋게 줄로 나눈다.
 *
 * 공공 API 는 항목을 줄바꿈 없이 한 줄로 붙여서 준다.
 *
 *   "1. 국세 또는 지방세를 체납 중인 자 2. 한국신용정보원의 … 3. 신청요건에 …"
 *
 * 이대로 두면 사람이 읽을 수 없으므로 번호와 기호 앞에서 끊는다.
 */

/**
 * 날짜를 목록 번호로 오인하지 않도록 주의한다.
 *
 *   "설립연월일 : 2019. 8. 5. 이후"
 *
 * 여기서 `2019.` `8.` `5.` 는 항목 번호가 아니다.
 * 그래서 **1~2자리 숫자 + 점 + 한글/영문/괄호** 인 경우만 항목으로 본다.
 */
const NUMBERED = /\s+(?=\d{1,2}\.\s*[가-힣A-Za-z(\[])/g;

/** ◦ ○ ● ▪ · ※ □ ■ - 등 글머리 기호 */
const BULLET = /\s+(?=[◦○●▪▫·※□■◆◇▶▷–—]\s*\S)/g;

/** (1) (가) ① 같은 괄호·원문자 번호 */
const PAREN_NUM = /\s+(?=\(\s*[0-9가-힣]{1,2}\s*\)\s*\S)/g;
const CIRCLED = /\s+(?=[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮]\s*\S)/g;

/**
 * 한 덩어리 텍스트를 줄 배열로 나눈다.
 * 나눌 지점이 없으면 원문 한 줄을 그대로 돌려준다.
 */
export function splitIntoLines(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const marked = normalized
    .replace(NUMBERED, '\n')
    .replace(BULLET, '\n')
    .replace(PAREN_NUM, '\n')
    .replace(CIRCLED, '\n');

  const lines = marked
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  return lines.length > 0 ? lines : [normalized];
}

/** 줄이 목록 항목처럼 보이는지 — 들여쓰기 여부를 정할 때 쓴다 */
export function isListItem(line: string): boolean {
  return /^(\d{1,2}\.|[◦○●▪▫·※□■◆◇▶▷–—]|\(\s*[0-9가-힣]{1,2}\s*\)|[①-⑮])/.test(
    line,
  );
}
