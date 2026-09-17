import { extractHwpText } from './hwp';
import { extractHwpxText } from './hwpx';

export interface HangulExtraction {
  /** 뽑아낸 글자 */
  text: string;
  /** CLI 에게 넘길 파일명 — 확장자를 .txt 로 바꾼 것 */
  fileName: string;
}

/**
 * 한글 문서(`.hwp` · `.hwpx`)에서 글자를 뽑아 `.txt` 로 바꿔 준다.
 *
 * **왜 우리가 먼저 푸는가.** Claude CLI 는 두 형식을 다 못 읽는다. 그런데
 * 못 읽겠다고 답하는 게 아니라 **여러 방법을 시도하다 턴 한도를 태우고
 * 죽는다** (실제로 `num_turns` 9 / 한도 8 로 실패했다). 그러니 파일을
 * 넘기기 전에 우리가 글자로 바꿔 둔다.
 *
 * 한글 파일이 아니거나 글자를 못 뽑으면 `null` 이다. 그때는 원본을 그대로
 * 넘긴다 — PDF·DOCX 는 CLI 가 직접 읽으므로 그게 맞는 처리다.
 */
export async function extractHangulText(
  fileName: string,
  content: Buffer,
): Promise<HangulExtraction | null> {
  const isHwpx = /\.hwpx$/i.test(fileName);
  const isHwp = /\.hwp$/i.test(fileName);
  if (!isHwpx && !isHwp) return null;

  /*
   * 확장자를 믿지 않고 양쪽을 다 시도한다. `.hwp` 로 저장했지만 실제로는
   * hwpx 인 파일(그 반대도)이 실제로 올라온다 — 한글에서 "다른 이름으로
   * 저장" 할 때 형식과 확장자가 어긋나는 경우다.
   */
  const text = isHwpx
    ? (await extractHwpxText(content)) ?? extractHwpText(content)
    : extractHwpText(content) ?? (await extractHwpxText(content));

  if (!text) return null;

  return {
    text,
    fileName: `${fileName.replace(/\.hwpx?$/i, '')}.txt`,
  };
}
