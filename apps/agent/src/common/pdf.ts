import { extractText, getDocumentProxy } from 'unpdf';

/**
 * PDF 에서 글자를 뽑는다.
 *
 * 기업마당 공고문의 절반 이상(857/1,603건)이 PDF 다. 지금까지는 CLI 의 Read
 * 도구에 맡겼는데, 공고 수천 건을 그렇게 읽으면 턴과 시간이 배로 든다.
 * 글자층이 있는 PDF 는 여기서 바로 뽑고, 스캔본처럼 글자층이 없으면 빈
 * 문자열을 돌려준다 — 판단은 부르는 쪽이 `hasReadableText` 로 한다.
 *
 * 깨진 파일이면 `null` 이다.
 */
export async function extractPdfText(content: Buffer): Promise<string | null> {
  try {
    const doc = await getDocumentProxy(new Uint8Array(content));
    const { text } = await extractText(doc, { mergePages: true });
    return text;
  } catch {
    return null;
  }
}
