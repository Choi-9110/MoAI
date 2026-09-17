import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  POSTER_CREATE_SYSTEM_PROMPT, POSTER_SYSTEM_PROMPT, buildPosterCreatePrompt,
  buildPosterRevisionPrompt, diffPoster, normalizePosterDoc,
} from '@moai/shared';
import type {
  PosterCreateInput, PosterDoc, SlotChange, SlotNote,
} from '@moai/shared';
import { ClaudeCliService } from '../claude/claude-cli.service';
import { extractHangulText } from '../common/hangul';
import { referenceDir, referenceFile } from '../common/references';

/** 모두의창업 공고 요약 — 원문 34쪽에서 필요한 것만 미리 추려 둔 것 */
const MODOO_NOTICE = 'modoo/모두의창업-공고요약.md';

export interface ReviseResult {
  doc: PosterDoc;
  changes: SlotChange[];
  costUsd?: number;
}

/**
 * 요약 한 장 재작성.
 *
 * 칸 하나를 고치면 연결된 칸도 함께 움직여야 하므로 문서 전체를 다시 만든다.
 * 대신 전후를 비교해 **무엇이 왜 바뀌었는지** 함께 돌려준다 —
 * 사용자가 건드리지 않은 칸이 말없이 바뀌면 다음에 그 칸을 못 믿게 된다.
 */
@Injectable()
export class PosterService {
  private readonly logger = new Logger(PosterService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cli: ClaudeCliService,
  ) {}

  get model(): string {
    // 요약은 문서 전체를 쓰는 일이라 판정보다 무거운 모델을 쓴다.
    return this.config.get<string>('POSTER_MODEL', 'claude-opus-5');
  }

  private get timeoutMs(): number {
    return parseInt(this.config.get<string>('POSTER_TIMEOUT_MS', '600000'), 10);
  }

  private get workspaceDir(): string {
    return this.config.get<string>('WORKSPACE_DIR', join(process.cwd(), 'workspace'));
  }

  /**
   * 아이디어(+공고문)로 요약 한 장을 처음 만든다.
   *
   * 공고문이 있으면 파일을 작업 폴더에 두고 CLI 에게 **읽기만** 허용한다.
   * PDF·DOCX 를 CLI 가 직접 읽으므로 서버에 파서를 두지 않아도 되고,
   * 지정한 폴더 밖은 볼 수 없다.
   */
  async create(
    input: PosterCreateInput,
    notice?: { fileName: string; content: Buffer },
  ): Promise<{ doc: PosterDoc; costUsd?: number }> {
    /*
     * 모두의창업은 공고가 하나로 고정이다. 사용자가 올린 파일이 아니라
     * 미리 정리해 둔 요약을 읽으므로, 작업 폴더를 만들 것도 지울 것도 없다.
     */
    if (input.track === 'modoo') return this.createForModoo(input);

    // 파일명이 경로를 타고 나가지 못하게 막는다.
    let safeName = notice ? this.safeFileName(notice.fileName) : null;
    const dir = notice ? join(this.workspaceDir, `poster-${Date.now()}`) : null;

    /*
     * 한글 파일(.hwp · .hwpx)은 CLI 가 못 읽는다. 그대로 주면 못 읽겠다고
     * 답하는 게 아니라 여러 방법으로 시도하다가 턴 한도를 소진하고 죽는다.
     * 우리가 먼저 글자를 뽑아 .txt 로 넘긴다.
     */
    let extracted: string | null = null;
    if (notice && safeName) {
      const hangul = await extractHangulText(safeName, notice.content);
      if (hangul) {
        extracted = hangul.text;
        safeName = hangul.fileName;
        this.logger.log(`한글 공고문에서 ${extracted.length}자 추출 — ${safeName}`);
      } else if (/\.hwpx?$/i.test(safeName)) {
        this.logger.warn(
          `한글 공고문에서 글자를 뽑지 못했습니다 (${notice.fileName}) — 원본을 그대로 넘깁니다.`,
        );
      }
    }

    try {
      if (dir && notice && safeName) {
        await mkdir(dir, { recursive: true });
        await writeFile(
          join(dir, safeName),
          extracted ?? notice.content,
        );
      }

      const envelope = await this.cli.run({
        systemPrompt: POSTER_CREATE_SYSTEM_PROMPT,
        // 파일명만 주면 모델이 못 찾는다. 절대 경로를 준다.
        prompt: buildPosterCreatePrompt({
          ...input,
          noticePath: dir && safeName ? join(dir, safeName) : null,
        }),
        model: this.model,
        timeoutMs: this.timeoutMs,
        ...(dir ? { readDir: dir, maxTurns: 8 } : {}),
      });

      if (envelope.is_error) {
        throw new Error(`Claude CLI 오류: ${envelope.subtype ?? '알 수 없음'}`);
      }

      const doc = this.parse(envelope.result ?? '');
      this.logger.log(
        `요약 생성 — ${doc.blocks.length}블록` +
          (safeName ? ` (공고문 ${safeName})` : ' (공고문 없음)') +
          (envelope.total_cost_usd ? ` $${envelope.total_cost_usd.toFixed(4)}` : ''),
      );
      return { doc, costUsd: envelope.total_cost_usd };
    } finally {
      // 공고문 원본은 남길 이유가 없다.
      if (dir && this.config.get<string>('KEEP_WORKSPACE', 'false') !== 'true') {
        await rm(dir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  }

  /**
   * 모두의창업 — 고정 공고 요약을 읽고 만든다.
   *
   * 요약 파일이 없으면 공고 없이 만든다. 없는 파일을 읽으라고 시키면
   * CLI 가 몇 분을 헤매다 결국 빈손으로 돌아온다.
   */
  private async createForModoo(
    input: PosterCreateInput,
  ): Promise<{ doc: PosterDoc; costUsd?: number }> {
    const refDir = referenceDir(this.config.get<string>('REFERENCE_DIR'));
    const noticePath = referenceFile(
      MODOO_NOTICE,
      this.config.get<string>('REFERENCE_DIR'),
    );

    if (!noticePath) {
      this.logger.warn(
        `모두의창업 공고 요약을 찾지 못했습니다 (${join(refDir, MODOO_NOTICE)}) — 공고 없이 씁니다.`,
      );
    }

    const envelope = await this.cli.run({
      systemPrompt: POSTER_CREATE_SYSTEM_PROMPT,
      prompt: buildPosterCreatePrompt({ ...input, noticePath }),
      model: this.model,
      timeoutMs: this.timeoutMs,
      ...(noticePath ? { readDir: refDir, maxTurns: 8 } : {}),
    });

    if (envelope.is_error) {
      throw new Error(`Claude CLI 오류: ${envelope.subtype ?? '알 수 없음'}`);
    }

    const doc = this.parse(envelope.result ?? '');
    this.logger.log(
      `요약 생성 (모두의창업) — ${doc.blocks.length}블록` +
        (envelope.total_cost_usd ? ` $${envelope.total_cost_usd.toFixed(4)}` : ''),
    );
    return { doc, costUsd: envelope.total_cost_usd };
  }

  /** 업로드 파일명에서 경로 요소를 없앤다 */
  private safeFileName(name: string): string {
    const base = name.replace(/[/\\]/g, '_').replace(/^\.+/, '').trim();
    const cleaned = base.replace(/[^\w가-힣.\-() ]/g, '_').slice(0, 120);
    return cleaned || 'notice.txt';
  }

  async revise(doc: PosterDoc, notes: SlotNote[]): Promise<ReviseResult> {
    const envelope = await this.cli.run({
      systemPrompt: POSTER_SYSTEM_PROMPT,
      prompt: buildPosterRevisionPrompt(doc, notes),
      model: this.model,
      timeoutMs: parseInt(
        this.config.get<string>('POSTER_TIMEOUT_MS', '300000'),
        10,
      ),
    });

    if (envelope.is_error) {
      throw new Error(`Claude CLI 오류: ${envelope.subtype ?? '알 수 없음'}`);
    }

    const next = this.parse(envelope.result ?? '', doc);
    const changes = diffPoster(doc, next, notes);

    this.logger.log(
      `요약 재작성 — 요청 ${notes.length}건 → 변경 ${changes.length}칸` +
        (envelope.total_cost_usd ? ` ($${envelope.total_cost_usd.toFixed(4)})` : ''),
    );

    return { doc: next, changes, costUsd: envelope.total_cost_usd };
  }

  /* ────────────── 내부 ────────────── */

  /**
   * 모델 응답을 문서로 읽는다.
   *
   * 읽지 못하면 원본을 그대로 돌려준다. 반쯤 망가진 문서를 화면에 올리느니
   * 아무것도 바꾸지 않는 편이 낫다.
   */
  private parse(raw: string, fallback?: PosterDoc): PosterDoc {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error(
        `모델이 JSON 문서를 돌려주지 않았습니다: ${raw.slice(0, 160)}`,
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.slice(start, end + 1));
    } catch {
      // 길어서 잘리면 여기로 온다. 끝부분을 보여 주면 원인이 바로 보인다.
      throw new Error(
        `모델 응답을 JSON 으로 읽지 못했습니다 (${raw.length}자). ` +
          `끝부분: …${raw.slice(-120)}`,
      );
    }

    const doc = parsed as Partial<PosterDoc>;
    if (typeof doc.title !== 'string' || !Array.isArray(doc.blocks)) {
      // 무엇이 왔는지 남긴다 — 이게 없으면 몇 분짜리 작업을 눈감고 고쳐야 한다.
      const keys = Object.keys(doc ?? {}).join(', ') || '(없음)';
      throw new Error(
        `모델 응답에 title 또는 blocks 가 없습니다. 받은 필드: ${keys}`,
      );
    }

    // 재작성일 때만 본다. 블록 구조는 뼈대라 개수가 달라졌으면 지시를 어긴 것이다.
    if (fallback && doc.blocks.length !== fallback.blocks.length) {
      throw new Error(
        `블록 개수가 달라졌습니다 (${fallback.blocks.length} → ${doc.blocks.length}).`,
      );
    }

    // gap 을 문자열로 주는 경우가 있어 여기서 형태를 맞춘다.
    return normalizePosterDoc(doc as PosterDoc);
  }
}
