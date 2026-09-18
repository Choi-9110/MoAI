import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DOCUMENT_EXTRACT_VERSION, DocumentConditionsSchema,
} from '@moai/shared';
import type {
  DocumentConditions, DocumentStatus, GrantDocumentJob, GrantDocumentResult,
} from '@moai/shared';
import { GrantDocument } from './entities/grant-document.entity';
import { Grant } from './entities/grant.entity';

/** 실패한 파일을 다시 받는 최대 횟수 */
const MAX_ATTEMPTS = 3;

/** 읽을 수 있는 확장자 — 이미지(png·jpg)는 글이 없어 받지 않는다 */
const READABLE = /\.(hwpx?|pdf)$/i;

type Attachment = { url?: string; name?: string } | null;

/**
 * 공고문 읽기 대기열.
 *
 * 로컬 에이전트가 대기열을 가져가 파일을 받고, 글을 뽑고, Claude 로 자격을
 * 구조화해 돌려준다. 여기서는 **무엇을 읽을지**와 **돌려받은 것을 어디에
 * 둘지**만 정한다.
 *
 * 읽을 대상
 *   - 접수 중이고 첨부가 있는 공고 중
 *   - 아직 안 읽었거나, 첨부 주소가 바뀌었거나, 낮은 버전으로 읽었거나,
 *     실패했는데 아직 다시 시도할 여유가 있는 것
 *   - 마감이 가까운 것부터 (판정 워커와 같은 이유 — 마감 뒤에 읽으면 헛일이다)
 */
@Injectable()
export class GrantDocumentsService {
  private readonly logger = new Logger(GrantDocumentsService.name);

  constructor(
    @InjectRepository(Grant) private readonly grants: Repository<Grant>,
    @InjectRepository(GrantDocument)
    private readonly docs: Repository<GrantDocument>,
  ) {}

  async pending(limit = 10): Promise<GrantDocumentJob[]> {
    const rows = await this.candidates(limit * 3);

    const jobs: GrantDocumentJob[] = [];
    for (const r of rows) {
      const url = r.attachment?.url ?? '';
      const name = r.attachment?.name ?? '';
      if (!READABLE.test(name)) {
        // 다시 대기열에 안 올라오도록 읽을 수 없다고 적어 둔다
        await this.record(r.id, {
          sourceUrl: url, fileName: name, status: 'unsupported',
          version: DOCUMENT_EXTRACT_VERSION,
        });
        continue;
      }
      jobs.push({ grantId: r.id, title: r.title, url, fileName: name });
      if (jobs.length >= limit) break;
    }
    return jobs;
  }

  /**
   * 에이전트가 돌려준 결과를 저장한다.
   *
   * 조건은 **서버에서 한 번 더 검사한다.** 에이전트 버전이 어긋나 모르는
   * 값이 섞여 오면, 판정에 들어가기 전에 여기서 막는다.
   */
  async saveResult(
    grantId: string,
    result: GrantDocumentResult,
  ): Promise<{ status: DocumentStatus }> {
    const grant = await this.grants.findOne({ where: { id: grantId } });
    if (!grant) throw new NotFoundException(`공고를 찾을 수 없습니다: ${grantId}`);

    let status = result.status;
    let error = result.error ?? null;
    let conditions: DocumentConditions | null = null;

    if (status === 'extracted') {
      const parsed = DocumentConditionsSchema.safeParse(result.conditions);
      if (parsed.success) {
        conditions = parsed.data;
      } else {
        status = 'failed';
        error = `조건 형식 오류: ${parsed.error.issues[0]?.message ?? ''}`;
      }
    }

    await this.record(grantId, { ...result, status, error });

    if (conditions) {
      // save() 라야 updated_at 이 움직여 판정 캐시가 이 공고를 다시 계산한다
      grant.documentConditions = {
        ...conditions,
        version: result.version,
        model: result.model ?? '',
        sourceUrl: result.sourceUrl,
        extractedAt: new Date().toISOString(),
      };
      await this.grants.save(grant);
    }
    return { status };
  }

  /** 진행 현황 — 몇 건 읽었고 몇 건 남았는지 */
  async stats(): Promise<Record<string, number>> {
    const rows = await this.docs
      .createQueryBuilder('d')
      .select('d.status', 'status')
      .addSelect('COUNT(*)::int', 'count')
      .groupBy('d.status')
      .getRawMany<{ status: string; count: number }>();

    const out: Record<string, number> = Object.fromEntries(
      rows.map((r) => [r.status, r.count]),
    );
    out.pending = (await this.candidates(100_000)).length;
    return out;
  }

  private candidates(limit: number) {
    return this.grants
      .createQueryBuilder('g')
      .leftJoin(GrantDocument, 'd', 'd.grant_id = g.id')
      .select('g.id', 'id')
      .addSelect('g.title', 'title')
      .addSelect(`g.raw_metadata -> 'attachment'`, 'attachment')
      .where('g.is_active = true')
      .andWhere('(g.apply_end_at IS NULL OR g.apply_end_at >= now())')
      .andWhere(`g.raw_metadata -> 'attachment' ->> 'url' IS NOT NULL`)
      .andWhere(
        `(d.id IS NULL
          OR d.source_url <> (g.raw_metadata -> 'attachment' ->> 'url')
          OR (d.status = 'extracted' AND d.version < :version)
          OR (d.status = 'failed' AND d.attempts < :maxAttempts))`,
        { version: DOCUMENT_EXTRACT_VERSION, maxAttempts: MAX_ATTEMPTS },
      )
      .orderBy('g.apply_end_at', 'ASC', 'NULLS LAST')
      .limit(limit)
      .getRawMany<{ id: string; title: string; attachment: Attachment }>();
  }

  private async record(
    grantId: string,
    r: Omit<GrantDocumentResult, 'status'> & { status: DocumentStatus },
  ): Promise<void> {
    const existing = await this.docs.findOne({ where: { grantId } });
    const row = existing ?? this.docs.create({ grantId, attempts: 0 });

    // 다른 파일로 바뀌었으면 실패 횟수를 새로 센다
    if (existing && existing.sourceUrl !== r.sourceUrl) row.attempts = 0;

    row.sourceUrl = r.sourceUrl;
    row.fileName = (r.fileName ?? '').slice(0, 400);
    row.status = r.status;
    row.text = r.text ?? null;
    row.textLength = r.text?.length ?? 0;
    row.model = r.model ?? null;
    row.version = r.version;
    row.error = r.error ? r.error.slice(0, 2000) : null;
    if (r.status === 'failed') row.attempts += 1;

    await this.docs.save(row);
    if (r.status === 'failed') {
      this.logger.warn(
        `공고문 읽기 실패 (${row.attempts}/${MAX_ATTEMPTS}) ${grantId}: ${row.error}`,
      );
    }
  }
}
