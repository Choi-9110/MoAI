import JSZip from 'jszip';

/**
 * HWPX 에서 글자만 뽑는다.
 *
 * **왜 필요한가.** 정부 공고문은 대부분 한글 파일이다. `.hwpx` 는 확장자만
 * 문서지 실제로는 XML 을 담은 ZIP 이라, Claude CLI 에게 그대로 주면 읽지
 * 못한다. 그런데 못 읽겠다고 답하는 게 아니라 **여러 방법으로 계속 시도하다가
 * 턴 한도를 소진하고 죽는다.** 실제로 그렇게 실패했다 (`num_turns` 9 / 한도 8).
 *
 * 그래서 우리가 먼저 풀어서 글자만 뽑아 `.txt` 로 넘긴다.
 *
 * 구형 `.hwp`(바이너리 포맷)는 여기서 처리하지 못한다. ZIP 이 아니라
 * 복합 문서 구조라 별도 파서가 필요하다 — 그건 못 뽑았다고 정직하게 답한다.
 */
export async function extractHwpxText(buffer: Buffer): Promise<string | null> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    // ZIP 이 아니다 — 구형 .hwp 이거나 깨진 파일이다.
    return null;
  }

  /*
   * 본문은 Contents/section0.xml, section1.xml … 에 나뉘어 있다.
   * 이름순으로 이어 붙여야 문서 순서가 유지된다 (section10 이 section2 앞에
   * 오지 않도록 숫자로 비교한다).
   */
  const sections = Object.keys(zip.files)
    .filter((name) => /^Contents\/section\d+\.xml$/i.test(name))
    .sort((a, b) => sectionNo(a) - sectionNo(b));

  if (sections.length === 0) return null;

  const parts: string[] = [];
  for (const name of sections) {
    const xml = await zip.files[name].async('string');
    parts.push(textOf(xml));
  }

  const text = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text || null;
}

function sectionNo(name: string): number {
  return Number(/section(\d+)\.xml$/i.exec(name)?.[1] ?? 0);
}

/**
 * HWPML 에서 글자를 꺼낸다.
 *
 * 정식 파서를 두지 않는 이유는, 우리가 필요한 것이 **읽을 수 있는 글**이지
 * 서식이 아니기 때문이다. 표는 셀 순서대로 줄이 되고, 그 정도면 모델이
 * "지원 대상 / 제외 대상"을 읽어내는 데 충분하다.
 */
function textOf(xml: string): string {
  return (
    xml
      // 줄 단위 요소는 줄바꿈으로 끊는다 — 안 그러면 문서 전체가 한 줄이 된다.
      .replace(/<hp:p[\s>]/g, '\n<hp:p ')
      .replace(/<\/hp:tr>/g, '\n')
      .replace(/<\/hp:tc>/g, '\t')
      // 글자가 담긴 곳은 <hp:t> 뿐이다.
      .replace(/<hp:t>([\s\S]*?)<\/hp:t>/g, (_, t: string) => t)
      // 남은 태그를 걷어낸다.
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)))
      .replace(/&amp;/g, '&')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
  );
}
