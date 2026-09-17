import { constants, inflateRawSync } from 'node:zlib';
import { readOle } from './ole';
import type { OleDocument } from './ole';

/**
 * 구형 `.hwp`(HWP 5.0 바이너리)에서 글자만 뽑는다.
 *
 * **왜 직접 파싱하는가.** `.hwpx` 와 달리 `.hwp` 는 ZIP 이 아니라 OLE 복합
 * 문서(CFB)다. LibreOffice 나 한컴오피스를 부르면 더 정확하지만, api 는
 * 리눅스이고 agent 는 윈도우라 **양쪽에 같은 설치물을 얹어야 한다.**
 * 반면 본문 스트림을 직접 푸는 건 의존성이 `cfb` 하나뿐이고 두 환경에서
 * 똑같이 돈다.
 *
 * **구조.** 본문은 `BodyText/Section0`, `Section1` … 스트림에 나뉘어 있고
 * 대개 raw deflate 로 눌려 있다. 풀면 레코드가 죽 나열되는데, 글자는
 * `HWPTAG_PARA_TEXT` 한 종류에만 들어 있다. 그것만 이어 붙이면 된다.
 *
 * **뽑지 못하는 것** — 서식과 표의 격자 구조. 우리에게 필요한 건
 * 읽을 수 있는 글이지 서식이 아니다(`hwpx.ts` 와 같은 기준).
 * 암호가 걸렸거나 배포용으로 잠긴 문서, HWP 3.0 이하 구형 포맷은
 * 뽑지 못한다 — 그건 못 뽑았다고 정직하게 답한다.
 */
export function extractHwpText(buffer: Buffer): string | null {
  // OLE 복합문서가 아니면 .hwpx 이거나 HWP 3.0 이하이거나 깨진 파일이다.
  const doc = readOle(buffer);
  if (!doc) return null;

  const header = readFileHeader(doc);
  if (!header) return null;

  /*
   * 암호 문서와 배포용 문서는 본문이 별도 키로 암호화돼 있어 여기서 풀 수
   * 없다. 억지로 진행하면 깨진 글자가 나오는데, 그건 못 읽은 것보다 나쁘다.
   * 모델이 그 쓰레기를 공고 내용으로 믿어 버리기 때문이다.
   */
  if (header.encrypted || header.distributable) return null;

  const sections = doc.paths
    .filter((path) => /^\/BodyText\/Section\d+$/i.test(path))
    .sort((a, b) => sectionNo(a) - sectionNo(b));

  if (sections.length === 0) return null;

  const parts: string[] = [];
  for (const path of sections) {
    const raw = doc.read(path);
    if (!raw || raw.length === 0) continue;
    const body = header.compressed ? inflate(raw) : raw;
    if (!body) continue;
    parts.push(paragraphsOf(body));
  }

  const text = parts.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return text || null;
}

interface HwpHeader {
  compressed: boolean;
  encrypted: boolean;
  distributable: boolean;
}

/**
 * `FileHeader` 스트림 256 바이트에서 서명과 속성 플래그를 읽는다.
 *
 * 서명을 확인하는 이유는, CFB 로 열리는 파일이 전부 한글 문서는 아니기
 * 때문이다 (구형 `.doc`, `.xls` 도 같은 컨테이너다). 서명이 다르면
 * 본문 스트림을 찾는 단계에서 헤매지 말고 바로 포기한다.
 */
function readFileHeader(doc: OleDocument): HwpHeader | null {
  const head = doc.read('/FileHeader');
  if (!head || head.length < 40) return null;
  if (head.subarray(0, 17).toString('latin1') !== 'HWP Document File') return null;

  const flags = head.readUInt32LE(36);
  return {
    compressed: (flags & 0x01) !== 0,
    encrypted: (flags & 0x02) !== 0,
    distributable: (flags & 0x04) !== 0,
  };
}

/**
 * 본문 스트림 압축 해제.
 *
 * 한글은 zlib 헤더 없이 raw deflate 로 넣는다. 다만 버전에 따라 헤더가
 * 붙은 파일도 있어, raw 로 실패하면 앞 2바이트를 건너뛰고 한 번 더 본다.
 *
 * `Z_SYNC_FLUSH` 로 끝내는 이유는 **잘린 스트림 때문**이다. 기본값은 끝
 * 표시를 못 만나면 전부 실패로 돌리는데, 그러면 앞쪽 멀쩡한 내용까지 함께
 * 버린다. 이 옵션은 지금까지 푼 만큼을 돌려준다.
 */
function inflate(raw: Buffer): Buffer | null {
  const options = { finishFlush: constants.Z_SYNC_FLUSH };
  try {
    return inflateRawSync(raw, options);
  } catch {
    try {
      return inflateRawSync(raw.subarray(2), options);
    } catch {
      return null;
    }
  }
}

function sectionNo(path: string): number {
  return Number(/Section(\d+)$/i.exec(path)?.[1] ?? 0);
}

const HWPTAG_BEGIN = 0x010;
const HWPTAG_PARA_TEXT = HWPTAG_BEGIN + 51;

/**
 * 레코드 나열을 훑어 문단 글자만 모은다.
 *
 * 레코드 헤더는 4바이트에 세 값이 눌려 있다 —
 * 태그 10비트 · 계층 10비트 · 크기 12비트. 크기가 12비트로 모자라면
 * (0xFFF) 뒤따르는 4바이트가 진짜 크기다.
 *
 * 문단 하나가 레코드 하나이므로 레코드마다 줄을 바꾼다. 표는 셀 안의
 * 문단들이 순서대로 이어져 셀마다 한 줄이 된다 — 격자는 사라지지만
 * "지원 대상 / 제외 대상" 을 읽어내는 데는 충분하다.
 */
function paragraphsOf(body: Buffer): string {
  const lines: string[] = [];
  let pos = 0;

  while (pos + 4 <= body.length) {
    const header = body.readUInt32LE(pos);
    pos += 4;

    const tagId = header & 0x3ff;
    let size = (header >> 20) & 0xfff;

    if (size === 0xfff) {
      if (pos + 4 > body.length) break;
      size = body.readUInt32LE(pos);
      pos += 4;
    }

    if (size > body.length - pos) break; // 잘린 파일 — 여기까지가 읽을 수 있는 전부다.

    if (tagId === HWPTAG_PARA_TEXT) {
      lines.push(paraTextOf(body.subarray(pos, pos + size)));
    }
    pos += size;
  }

  return lines.join('\n');
}

/*
 * 문단 안의 제어 문자는 차지하는 길이가 셋으로 갈린다. 이걸 틀리면
 * 제어 문자에 딸린 12바이트가 글자로 읽혀 문서 전체가 한자 잡음이 된다.
 *
 *   char     (2바이트)  : 글자 하나 자리만 차지한다
 *   inline   (16바이트) : 탭·각주처럼 줄 안에 놓이는 것
 *   extended (16바이트) : 표·그림처럼 별도 개체로 붙는 것
 */
const INLINE_CONTROLS = new Set([4, 5, 6, 7, 8, 9, 19, 20]);
const EXTENDED_CONTROLS = new Set([1, 2, 3, 11, 12, 14, 15, 16, 17, 18, 21, 22, 23]);

function paraTextOf(data: Buffer): string {
  const out: string[] = [];

  for (let i = 0; i + 1 < data.length; i += 2) {
    const code = data.readUInt16LE(i);

    if (code >= 32) {
      out.push(String.fromCharCode(code));
      continue;
    }

    if (INLINE_CONTROLS.has(code) || EXTENDED_CONTROLS.has(code)) {
      if (code === 9) out.push('\t'); // 탭만 글자로 살린다
      i += 14; // 뒤따르는 7 WCHAR 는 제어 정보다
      continue;
    }

    // 남은 것은 2바이트짜리 제어 문자다.
    if (code === 10 || code === 13) out.push('\n');
    else if (code === 24) out.push('-'); // 하이픈
    else if (code === 30 || code === 31) out.push(' '); // 묶음 빈칸·고정폭 빈칸
    // 그 밖(0, 25~29)은 표시할 것이 없어 버린다.
  }

  return out.join('').replace(/[ \t]+$/g, '');
}
