/**
 * OLE 복합 문서(CFB) 읽기 — 스트림을 꺼내는 데 필요한 만큼만.
 *
 * **왜 라이브러리를 안 쓰는가.** `cfb` 패키지로 먼저 만들었는데, 실제로
 * 올라오는 파일 23개 중 1개에서 예외를 던지고 죽었다. 원인은 파일이
 * 잘린 것이었다 — 할당표(FAT)가 파일 끝 너머의 섹터를 가리키는데,
 * 라이브러리는 그걸 통째로 실패로 처리한다. 한글은 같은 파일을 그냥 연다.
 *
 * 우리 기준은 다르다. **읽히는 데까지 읽는 것**이 낫다. 공고문 앞 두 쪽만
 * 건져도 지원 자격은 대부분 거기 있고, 못 읽으면 0이다. 그래서 없는 섹터를
 * 만나면 그 지점에서 체인을 끊고 지금까지 모은 것을 돌려준다.
 *
 * 읽기 전용이고 우리가 찾는 스트림은 몇 개뿐이라 구현도 이만큼이면 된다.
 * 서식·CLSID·타임스탬프는 쓰지 않으므로 읽지 않는다.
 */

const OLE_SIGNATURE = 'd0cf11e0a1b11ae1';

/** 0xFFFFFFFA 이상은 자유 섹터·체인 끝 같은 특수값이다 */
const MAX_SECTOR = 0xfffffffa;
const NO_ENTRY = 0xffffffff;

export interface OleDocument {
  /** `/BodyText/Section0` 형태의 스트림 경로 목록 */
  paths: string[];
  /** 스트림 내용. 없으면 null, 잘렸으면 읽힌 데까지. */
  read(path: string): Buffer | null;
}

interface DirEntry {
  name: string;
  /** 1=저장소, 2=스트림, 5=루트 */
  type: number;
  left: number;
  right: number;
  child: number;
  start: number;
  size: number;
}

export function readOle(buffer: Buffer): OleDocument | null {
  if (buffer.length < 512) return null;
  if (buffer.subarray(0, 8).toString('hex') !== OLE_SIGNATURE) return null;

  const sectorSize = 1 << buffer.readUInt16LE(30);
  const miniSectorSize = 1 << buffer.readUInt16LE(32);
  const miniCutoff = buffer.readUInt32LE(56);
  if (sectorSize < 128 || sectorSize > 1 << 20) return null;

  /** 섹터 번호 → 실제 바이트. 파일 밖이면 null 이다(잘린 파일). */
  const sectorAt = (no: number): Buffer | null => {
    const start = (no + 1) * sectorSize;
    if (no >= MAX_SECTOR || start + sectorSize > buffer.length) return null;
    return buffer.subarray(start, start + sectorSize);
  };

  const fat = readFat(buffer, sectorSize, sectorAt);
  if (fat.length === 0) return null;

  /**
   * 섹터를 체인으로 이어 붙인다.
   *
   * `size` 가 0 이면 체인 끝까지 읽는다(디렉터리처럼 크기가 안 적힌 것).
   * 없는 섹터를 만나면 거기서 멈춘다 — 그게 이 파서의 존재 이유다.
   */
  const readChain = (first: number, size: number): Buffer => {
    const chunks: Buffer[] = [];
    let got = 0;
    let sector = first;

    // 순환 참조가 있는 파일이 실제로 있다. 섹터 수를 넘어서면 멈춘다.
    for (let step = 0; step <= fat.length && sector < MAX_SECTOR; step++) {
      const data = sectorAt(sector);
      if (!data) break;
      chunks.push(data);
      got += data.length;
      if (size > 0 && got >= size) break;
      sector = fat[sector] ?? NO_ENTRY;
    }

    const joined = Buffer.concat(chunks);
    return size > 0 && size < joined.length ? joined.subarray(0, size) : joined;
  };

  const entries = readDirectory(readChain(buffer.readUInt32LE(48), 0));
  if (entries.length === 0) return null;

  const byPath = new Map<string, DirEntry>();
  collectPaths(entries, byPath);

  /*
   * 작은 스트림(기본 4096 바이트 미만)은 일반 섹터에 흩어 두지 않고
   * "미니 스트림" 이라는 한 덩어리 안에 64바이트 단위로 넣는다.
   * HWP 의 FileHeader(256바이트)가 바로 여기 들어간다.
   */
  const root = entries[0];
  let miniStream: Buffer | null = null;
  const readMini = (first: number, size: number): Buffer => {
    if (!miniStream) miniStream = readChain(root.start, root.size);
    const miniFat = readMiniFat(buffer, sectorSize, readChain);

    const chunks: Buffer[] = [];
    let got = 0;
    let sector = first;

    for (let step = 0; step <= miniFat.length && sector < MAX_SECTOR; step++) {
      const from = sector * miniSectorSize;
      if (from + miniSectorSize > miniStream.length) break;
      chunks.push(miniStream.subarray(from, from + miniSectorSize));
      got += miniSectorSize;
      if (size > 0 && got >= size) break;
      sector = miniFat[sector] ?? NO_ENTRY;
    }

    const joined = Buffer.concat(chunks);
    return size > 0 && size < joined.length ? joined.subarray(0, size) : joined;
  };

  return {
    paths: [...byPath.keys()],
    read(path: string): Buffer | null {
      const entry = byPath.get(path);
      if (!entry || entry.type !== 2) return null;
      if (entry.size === 0) return Buffer.alloc(0);
      return entry.size < miniCutoff
        ? readMini(entry.start, entry.size)
        : readChain(entry.start, entry.size);
    },
  };
}

/**
 * 할당표(FAT)를 모은다.
 *
 * FAT 자체도 섹터에 흩어져 있고, 그 섹터 목록(DIFAT)은 헤더에 109개까지
 * 들어간 뒤 모자라면 별도 섹터로 이어진다. 큰 파일에서만 이어진다.
 */
function readFat(
  buffer: Buffer,
  sectorSize: number,
  sectorAt: (no: number) => Buffer | null,
): number[] {
  const fatSectors: number[] = [];

  for (let i = 0; i < 109; i++) {
    const sector = buffer.readUInt32LE(76 + i * 4);
    if (sector >= MAX_SECTOR) break;
    fatSectors.push(sector);
  }

  let next = buffer.readUInt32LE(68);
  let remaining = buffer.readUInt32LE(72);
  const perSector = sectorSize / 4 - 1; // 마지막 칸은 다음 DIFAT 섹터 번호다

  while (next < MAX_SECTOR && remaining-- > 0) {
    const data = sectorAt(next);
    if (!data) break;
    for (let i = 0; i < perSector; i++) {
      const sector = data.readUInt32LE(i * 4);
      if (sector < MAX_SECTOR) fatSectors.push(sector);
    }
    next = data.readUInt32LE(sectorSize - 4);
  }

  const fat: number[] = [];
  for (const sector of fatSectors) {
    const data = sectorAt(sector);
    if (!data) break; // 할당표가 잘렸다 — 여기까지만 따라갈 수 있다.
    for (let i = 0; i < sectorSize / 4; i++) fat.push(data.readUInt32LE(i * 4));
  }
  return fat;
}

function readMiniFat(
  buffer: Buffer,
  sectorSize: number,
  readChain: (first: number, size: number) => Buffer,
): number[] {
  const data = readChain(buffer.readUInt32LE(60), 0);
  const out: number[] = [];
  for (let i = 0; i + 4 <= data.length; i += 4) out.push(data.readUInt32LE(i));
  return out;
}

/** 디렉터리 항목은 128바이트 고정이다 */
function readDirectory(data: Buffer): DirEntry[] {
  const entries: DirEntry[] = [];

  for (let at = 0; at + 128 <= data.length; at += 128) {
    const nameLen = data.readUInt16LE(at + 64);
    const name =
      nameLen > 2 && nameLen <= 64
        ? data.toString('utf16le', at, at + nameLen - 2)
        : '';

    /*
     * 크기는 8바이트지만 상위 4바이트는 32비트 판에서 항상 0이다.
     * 깨진 파일에서 터무니없는 값이 나올 수 있어 파일 크기로 자른다 —
     * 어차피 읽을 때 없는 섹터에서 멈춘다.
     */
    entries.push({
      name,
      type: data.readUInt8(at + 66),
      left: data.readUInt32LE(at + 68),
      right: data.readUInt32LE(at + 72),
      child: data.readUInt32LE(at + 76),
      start: data.readUInt32LE(at + 116),
      size: data.readUInt32LE(at + 120),
    });
  }

  return entries;
}

/**
 * 경로를 만든다.
 *
 * 항목들은 이름순 이진 트리로 엮여 있다(형제는 left·right, 하위는 child).
 * `Section0` 이라는 이름은 `BodyText` 밑에도 `ViewText`(배포용 사본) 밑에도
 * 있어서, 이름만으로는 어느 쪽인지 알 수 없다. 그래서 경로가 필요하다.
 */
function collectPaths(entries: DirEntry[], out: Map<string, DirEntry>): void {
  const seen = new Set<number>();

  const walk = (id: number, prefix: string): void => {
    if (id >= entries.length || seen.has(id)) return;
    seen.add(id);

    const entry = entries[id];
    walk(entry.left, prefix);

    const path = `${prefix}/${entry.name}`;
    if (entry.type === 2) out.set(path, entry);
    if (entry.type === 1) walk(entry.child, path);

    walk(entry.right, prefix);
  };

  // 루트(0번)의 이름은 경로에 넣지 않는다.
  walk(entries[0]?.child ?? NO_ENTRY, '');
}
