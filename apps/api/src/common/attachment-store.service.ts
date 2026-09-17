import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { mkdir, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

/** 어떤 일에 딸린 파일인가 */
export type AttachmentKind = 'notice' | 'template';

export interface Attachment {
  fileName: string;
  content: Buffer;
}

/**
 * 작업에 딸려 온 파일을 잠시 맡아 둔다.
 *
 * **왜 필요한가.** 요약 한 장과 사업계획서는 만드는 데 몇 분씩 걸린다.
 * 그동안 서버가 다시 뜨면 — 배포를 했거나, 죽어서 되살아났거나 — 메모리에
 * 있던 공고 PDF·양식 파일이 통째로 사라진다. 그러면 하던 일을 이어서 할
 * 방법이 없다. 상태만 `running` 으로 남아 화면은 영원히 로딩이고, 사용자는
 * 무슨 일이 있었는지도 모른 채 기다린다.
 *
 * 그래서 파일을 디스크에 적어 둔다. 서버가 다시 뜨면 여기서 도로 꺼내
 * 하던 자리에서 이어 간다.
 *
 * 오래 두는 것이 아니다. 일이 끝나면 지우고, 혹시 남더라도 하루가 지나면
 * 알아서 치운다.
 */
@Injectable()
export class AttachmentStoreService {
  private readonly logger = new Logger(AttachmentStoreService.name);

  constructor(private readonly config: ConfigService) {}

  /** IR 덱과 같은 곳을 쓴다 — 아래 `jobs/` 로만 나눈다 */
  private get root(): string {
    return join(
      resolve(this.config.get<string>('STORAGE_DIR', join(process.cwd(), 'storage'))),
      'jobs',
    );
  }

  /**
   * 지난 지 이만큼 되면 치운다.
   *
   * 하루면 넉넉하다. 제일 오래 걸리는 사업계획서도 20분 안에 끝나고,
   * 되살아나서 이어 하는 것도 그 안에 일어난다.
   */
  private static readonly KEEP_MS = 24 * 60 * 60 * 1000;

  /**
   * 맡아 둔다. 실패해도 던지지 않는다 — 파일을 못 적었다고 해서 지금
   * 하려던 일까지 막을 이유는 없다. 이어 하기를 못 할 뿐이다.
   */
  async put(
    projectId: string,
    kind: AttachmentKind,
    file: Attachment,
  ): Promise<void> {
    try {
      const dir = join(this.root, projectId);
      await mkdir(dir, { recursive: true });

      /*
       * 보여 줄 이름은 따로 적는다. 파일명에 `../` 나 한글이 섞여 들어와도
       * 저장 이름은 우리가 정한 `notice.pdf` 하나뿐이라 안전하다.
       */
      const ext = safeExt(file.fileName);
      await writeFile(join(dir, `${kind}${ext}`), file.content);
      await writeFile(join(dir, `${kind}.name`), file.fileName, 'utf8');
    } catch (err) {
      this.logger.warn(
        `${kind} 파일을 맡아 두지 못했습니다 (이어 하기 불가): ${(err as Error).message}`,
      );
    }
  }

  /** 도로 꺼낸다. 없으면 `null` */
  async get(
    projectId: string,
    kind: AttachmentKind,
  ): Promise<Attachment | null> {
    try {
      const dir = join(this.root, projectId);
      const names = await readdir(dir);
      const found = names.find(
        (n) => n.startsWith(`${kind}.`) && !n.endsWith('.name'),
      );
      if (!found) return null;

      const content = await readFile(join(dir, found));
      const fileName = await readFile(join(dir, `${kind}.name`), 'utf8').catch(
        () => found,
      );
      return { fileName, content };
    } catch {
      return null;
    }
  }

  /** 일이 끝났으니 치운다 */
  async drop(projectId: string, kind?: AttachmentKind): Promise<void> {
    try {
      const dir = join(this.root, projectId);
      const names = await readdir(dir);
      for (const n of names) {
        if (kind && !n.startsWith(`${kind}.`)) continue;
        await unlink(join(dir, n)).catch(() => undefined);
      }
    } catch {
      /* 없으면 치울 것도 없다 */
    }
  }

  /**
   * 하루 지난 것을 쓸어 낸다.
   *
   * 일이 실패로 끝나면 `drop` 이 안 불릴 수 있어서, 그렇게 남은 것을
   * 여기서 걷는다. 서버가 뜰 때 한 번 돌린다.
   */
  async sweep(): Promise<number> {
    const { stat } = await import('node:fs/promises');
    let removed = 0;

    try {
      const dirs = await readdir(this.root);
      const cutoff = Date.now() - AttachmentStoreService.KEEP_MS;

      for (const d of dirs) {
        const full = join(this.root, d);
        const info = await stat(full).catch(() => null);
        if (!info || info.mtimeMs > cutoff) continue;

        for (const n of await readdir(full).catch(() => [])) {
          await unlink(join(full, n)).catch(() => undefined);
        }
        removed += 1;
      }
    } catch {
      /* 폴더가 아직 없다 — 아무것도 안 했다는 뜻이니 정상 */
    }

    if (removed > 0) this.logger.log(`오래된 작업 파일 ${removed}건을 치웠습니다.`);
    return removed;
  }
}

/** 확장자만 남긴다. 이상하면 `.bin` */
function safeExt(fileName: string): string {
  const ext = extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '.bin';
}
