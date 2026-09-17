import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/**
 * 참고자료 폴더 (`docs/references`).
 *
 * 여기에는 원문에서 한 번 뽑아 둔 작성 지침·공고 요약이 들어 있다.
 * 원본은 PDF·강의자료라 매번 읽히면 느리고 비싸서, 미리 MD 로 만들어 두고
 * 실행기가 그걸 읽는다.
 *
 * 경로를 박아 두지 않고 **위로 올라가며 찾는다** — 실행기는 개발 중에는
 * `apps/agent` 에서, 빌드 후에는 `apps/agent/dist` 에서 돈다. 어느 쪽이든
 * 같은 폴더를 가리켜야 한다.
 */
let cached: string | null = null;

export function referenceDir(configured?: string): string {
  if (configured) return resolve(configured);
  if (cached) return cached;

  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'docs', 'references');
    if (existsSync(candidate)) {
      cached = candidate;
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  // 못 찾으면 없는 경로를 돌려준다. 부르는 쪽이 파일 존재를 확인한다.
  return join(process.cwd(), 'docs', 'references');
}

/**
 * 참고자료 파일의 절대 경로. **없으면 null.**
 *
 * 파일이 없는데 경로만 넘기면 CLI 가 몇 분을 헤매다 "못 읽었다"고 답한다.
 * 여기서 미리 확인해서, 없으면 지침 없이 쓰게 둔다.
 */
export function referenceFile(
  relative: string,
  configured?: string,
): string | null {
  const path = join(referenceDir(configured), relative);
  return existsSync(path) ? path : null;
}
