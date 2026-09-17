import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { IrDeck } from './entities/ir-deck.entity';

/** 발표 자료로 쓸 만한 것만 받는다 */
const ALLOWED = new Set([
  '.pdf', '.ppt', '.pptx', '.key', '.pages', '.doc', '.docx', '.hwp', '.hwpx',
]);
const THUMB_ALLOWED = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

/**
 * 글자 상한.
 *
 * 표의 칸 크기를 그대로 부딪히면 `value too long for type character
 * varying(200)` 이 사용자에게 그대로 나간다. 무엇을 고쳐야 하는지도 모르고,
 * 우리 표 구조만 알려 주는 셈이다. 여기서 잘라 둔다 — 이름은 알아보려고
 * 붙이는 것이라 잘려도 쓸 수 있지만, 올리기가 실패하면 처음부터 다시다.
 */
const MAX_NAME = 200;
const MAX_MEMO = 2000;

/** 한 파일 상한 — IR 덱은 이미지가 많아 100MB 를 넘기는 일이 드물게 있다 */
export const MAX_DECK_BYTES = 100 * 1024 * 1024;
export const MAX_THUMB_BYTES = 5 * 1024 * 1024;

@Injectable()
export class IrDecksService {
  private readonly logger = new Logger(IrDecksService.name);

  constructor(
    @InjectRepository(IrDeck) private readonly repo: Repository<IrDeck>,
    private readonly config: ConfigService,
  ) {}

  /** 파일을 두는 곳. 기본은 API 앱 아래 `storage/` */
  private get root(): string {
    return resolve(
      this.config.get<string>('STORAGE_DIR', join(process.cwd(), 'storage')),
    );
  }

  async list(tenantId: string): Promise<IrDeck[]> {
    return this.repo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async create(input: {
    tenantId: string;
    userId?: string;
    name: string;
    memo?: string;
    file: { originalname: string; buffer: Buffer; mimetype?: string };
    thumb?: { originalname: string; buffer: Buffer };
  }): Promise<IrDeck> {
    const ext = extname(input.file.originalname).toLowerCase();
    if (!ALLOWED.has(ext)) {
      throw new Error(
        `${ext || '이 형식'} 은 올릴 수 없습니다. PDF·PPT·키노트 등 발표 자료만 됩니다.`,
      );
    }

    const dir = join(this.root, 'ir-decks', input.tenantId);
    await mkdir(dir, { recursive: true });

    /*
     * 저장 이름은 우리가 새로 짓는다. 올라온 이름을 그대로 쓰면 같은 이름이
     * 서로를 덮어쓰고, `../` 같은 것이 섞여 들어올 여지도 남는다. 보여 줄
     * 이름은 `fileName` 에 따로 담아 둔다.
     */
    const id = randomUUID();
    const path = join(dir, `${id}${ext}`);
    await writeFile(path, input.file.buffer);

    let thumbPath: string | null = null;
    if (input.thumb) {
      const tExt = extname(input.thumb.originalname).toLowerCase();
      if (THUMB_ALLOWED.has(tExt)) {
        thumbPath = join(dir, `${id}-thumb${tExt}`);
        await writeFile(thumbPath, input.thumb.buffer);
      } else {
        // 표지는 곁가지라, 형식이 안 맞으면 덱만 저장하고 넘어간다
        this.logger.warn(`표지 형식이 맞지 않아 건너뜁니다: ${tExt}`);
      }
    }

    return this.repo.save(
      this.repo.create({
        tenantId: input.tenantId,
        userId: input.userId ?? null,
        name: clip(input.name.trim() || input.file.originalname, MAX_NAME),
        memo: clip(input.memo?.trim() ?? '', MAX_MEMO) || null,
        fileName: input.file.originalname,
        storagePath: path,
        fileSize: String(input.file.buffer.length),
        mimeType: input.file.mimetype ?? null,
        thumbPath,
      }),
    );
  }

  async update(
    tenantId: string,
    id: string,
    patch: { name?: string; memo?: string | null },
  ): Promise<IrDeck> {
    const deck = await this.findOwned(tenantId, id);
    if (patch.name !== undefined) {
      deck.name = clip(patch.name.trim(), MAX_NAME) || deck.name;
    }
    if (patch.memo !== undefined) {
      deck.memo = clip(patch.memo?.trim() ?? '', MAX_MEMO) || null;
    }
    return this.repo.save(deck);
  }

  /** 내려받기 — 파일이 사라졌으면 그대로 알린다 */
  async read(
    tenantId: string,
    id: string,
    kind: 'file' | 'thumb' = 'file',
  ): Promise<{ bytes: Buffer; name: string; mime: string }> {
    const deck = await this.findOwned(tenantId, id);
    const path = kind === 'thumb' ? deck.thumbPath : deck.storagePath;
    if (!path) throw new NotFoundException('표지가 없습니다.');

    this.assertInside(path);

    try {
      const bytes = await readFile(path);
      return {
        bytes,
        name: kind === 'thumb' ? `thumb${extname(path)}` : deck.fileName,
        mime:
          kind === 'thumb'
            ? mimeOf(extname(path))
            : deck.mimeType || 'application/octet-stream',
      };
    } catch {
      throw new NotFoundException(
        '파일을 찾지 못했습니다. 다시 올려 주세요.',
      );
    }
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const deck = await this.findOwned(tenantId, id);

    /*
     * 파일부터 지우고 기록을 지운다. 순서가 반대면, 파일 삭제가 실패했을 때
     * 아무도 모르는 파일이 디스크에 남는다.
     */
    for (const path of [deck.storagePath, deck.thumbPath]) {
      if (!path) continue;
      try {
        this.assertInside(path);
        await unlink(path);
      } catch {
        this.logger.warn(`파일을 지우지 못했습니다: ${path}`);
      }
    }
    await this.repo.remove(deck);
  }

  private async findOwned(tenantId: string, id: string): Promise<IrDeck> {
    const deck = await this.repo.findOne({ where: { id, tenantId } });
    if (!deck) throw new NotFoundException('덱을 찾을 수 없습니다.');
    return deck;
  }

  /**
   * 경로가 우리 보관함 안인지 확인한다.
   *
   * 저장할 때 이름을 새로 짓고 있어 지금은 벗어날 길이 없지만, 경로가
   * 데이터베이스에서 오는 값이라 읽고 지우는 쪽에서 한 번 더 본다.
   */
  private assertInside(path: string): void {
    const root = this.root;
    const full = resolve(path);
    if (full !== root && !full.startsWith(root + sep)) {
      throw new NotFoundException('잘못된 경로입니다.');
    }
  }
}

/** 넘치면 자른다 — 거부하는 것보다 낫다 */
function clip(v: string, max: number): string {
  return v.length > max ? v.slice(0, max) : v;
}

function mimeOf(ext: string): string {
  switch (ext.toLowerCase()) {
    case '.png': return 'image/png';
    case '.webp': return 'image/webp';
    case '.gif': return 'image/gif';
    default: return 'image/jpeg';
  }
}

/** 응답에 실어 보낼 모양 — 디스크 경로는 빼고 준다 */
export function toDeckDto(d: IrDeck) {
  return {
    id: d.id,
    name: d.name,
    memo: d.memo,
    fileName: d.fileName,
    fileSize: Number(d.fileSize),
    mimeType: d.mimeType,
    hasThumb: Boolean(d.thumbPath),
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}
