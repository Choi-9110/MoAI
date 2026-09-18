import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DOCUMENT_EXTRACT_VERSION, DOCUMENT_JSON_FORMAT, DOCUMENT_SYSTEM_PROMPT,
  buildDocumentPrompt, cleanDocumentText, hasReadableText, parseDocumentOutput,
} from '@moai/shared';
import type { GrantDocumentJob, GrantDocumentResult } from '@moai/shared';
import { ClaudeCliService } from '../claude/claude-cli.service';
import { extractHangulText } from '../common/hangul';
import { extractPdfText } from '../common/pdf';

/** 한 파일 상한 — 공고문은 대개 1MB 안쪽이고, 큰 것은 붙임 서식이 붙은 것이다 */
const MAX_BYTES = 20 * 1024 * 1024;

/** 저장할 글 상한 — 모델에 넘긴 만큼만 남긴다 */
const MAX_STORED_CHARS = 60_000;

export interface DocumentDrainResult {
  fetched: number;
  extracted: number;
  noText: number;
  failed: number;
}

/**
 * 공고문 읽기 워커.
 *
 * 백엔드에서 읽을 공고문 목록을 받아, 하나씩
 *   1. 파일을 내려받고
 *   2. 글자를 뽑고 (HWP·HWPX 는 자체 파서, PDF 는 unpdf)
 *   3. 로컬 Claude 로 신청 자격을 구조화해
 *   4. 백엔드에 돌려준다.
 *
 * 공고당 한 번만 읽는다. 기업×공고 조합마다 모델을 부르는 판정 워커와 달리
 * 공고 수만큼만 돈다 — 기업이 늘어도 비용이 늘지 않는다.
 *
 * CLI 동시 실행은 전체 4개로 묶여 있다. 사용자가 누른 사업계획서 생성이
 * 밀리지 않도록 이 워커는 기본 2개만 쓴다.
 */
@Injectable()
export class DocumentWorkerService implements OnModuleInit {
  private readonly logger = new Logger(DocumentWorkerService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly cli: ClaudeCliService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('DOCUMENT_WORKER', 'false') !== 'true') {
      this.logger.log(
        '공고문 읽기 워커 비활성 (DOCUMENT_WORKER=true 로 켜면 접수 중 공고의 첨부를 읽습니다)',
      );
      return;
    }
    const intervalMs = parseInt(
      this.config.get<string>('DOCUMENT_INTERVAL_MS', '600000'),
      10,
    );
    setInterval(() => void this.drain(), intervalMs);
    // 켜자마자 한 번 돈다 — 첫 주기를 기다리면 10분 동안 아무 일도 안 한다
    setTimeout(() => void this.drain(), 10_000);
    this.logger.log(
      `공고문 읽기 워커 시작 — ${intervalMs / 1000}초 간격, ` +
        `${this.config.get<string>('DOCUMENT_ACTIVE_HOURS', '22-8')}시에만 읽음`,
    );
  }

  get isRunning(): boolean {
    return this.running;
  }

  /**
   * 지금이 읽어도 되는 시간인가.
   *
   * 로컬 Claude 는 **사용자가 쓰는 것과 같은 자원**이다. 낮에 수천 건을 읽고
   * 있으면 정작 사업계획서 생성이 밀린다. 그래서 기본은 밤(22시~08시)이고,
   * `DOCUMENT_ACTIVE_HOURS` 로 바꾼다. `0-24` 면 아무 때나 돈다.
   */
  private get inWindow(): boolean {
    const raw = this.config.get<string>('DOCUMENT_ACTIVE_HOURS', '22-8').trim();
    const m = raw.match(/^(\d{1,2})\s*-\s*(\d{1,2})$/);
    if (!m) return true;

    const [from, to] = [Number(m[1]), Number(m[2])];
    const hour = new Date().getHours();
    // 22-8 처럼 자정을 넘는 구간은 반대로 읽는다
    return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
  }

  private get apiBase(): string {
    return this.config.get<string>('API_BASE_URL', 'http://localhost:4000/api');
  }

  private get headers(): Record<string, string> {
    const token = (this.config.get<string>('INTERNAL_TOKEN') ?? '').trim();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  private get model(): string {
    return this.config.get<string>('DOCUMENT_MODEL', 'claude-sonnet-5');
  }

  async drain(limit?: number): Promise<DocumentDrainResult> {
    const result: DocumentDrainResult = { fetched: 0, extracted: 0, noText: 0, failed: 0 };
    if (this.running) {
      this.logger.warn('이미 공고문을 읽는 중입니다.');
      return result;
    }

    // 손으로 부른 것(limit 지정)은 시간대와 상관없이 돌린다
    if (limit == null && !this.inWindow) {
      this.logger.debug(
        `읽기 시간대가 아닙니다 (${this.config.get<string>('DOCUMENT_ACTIVE_HOURS', '22-8')}시)`,
      );
      return result;
    }

    const health = this.cli.health();
    if (!health.ok) {
      this.logger.warn(health.message ?? 'Claude CLI 를 쓸 수 없습니다.');
      return result;
    }

    this.running = true;
    try {
      const take = limit ?? parseInt(this.config.get<string>('DOCUMENT_BATCH_SIZE', '20'), 10);
      const res = await fetch(`${this.apiBase}/grants/documents/pending?limit=${take}`, {
        headers: this.headers,
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? '대기열 조회 실패: 401 — INTERNAL_TOKEN 이 apps/api/.env 와 apps/agent/.env 에서 다릅니다.'
            : `대기열 조회 실패: ${res.status}`,
        );
      }

      const jobs = (await res.json()) as GrantDocumentJob[];
      result.fetched = jobs.length;
      if (jobs.length === 0) return result;

      const concurrency = Math.max(
        1,
        parseInt(this.config.get<string>('DOCUMENT_CONCURRENCY', '2'), 10),
      );
      const queue = [...jobs];
      await Promise.all(
        Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
          for (let job = queue.shift(); job; job = queue.shift()) {
            const out = await this.read(job);
            try {
              await this.report(job.grantId, out);
              if (out.status === 'extracted') result.extracted += 1;
              else if (out.status === 'no_text' || out.status === 'unsupported') result.noText += 1;
              else result.failed += 1;
            } catch (err) {
              result.failed += 1;
              this.logger.warn(`결과 전송 실패 ${job.title}: ${(err as Error).message}`);
            }
          }
        }),
      );

      this.logger.log(
        `공고문 읽기 — 받음 ${result.fetched} / 추출 ${result.extracted} / 글 없음 ${result.noText} / 실패 ${result.failed}`,
      );
      return result;
    } catch (err) {
      this.logger.error(`공고문 대기열 처리 오류: ${(err as Error).message}`);
      return result;
    } finally {
      this.running = false;
    }
  }

  /**
   * 공고문 하나를 읽는다. 예외를 던지지 않고 항상 결과를 돌려준다 —
   * 실패도 기록돼야 같은 파일을 끝없이 다시 받지 않는다.
   */
  async read(job: GrantDocumentJob): Promise<GrantDocumentResult> {
    const base = {
      sourceUrl: job.url,
      fileName: job.fileName,
      version: DOCUMENT_EXTRACT_VERSION,
    };

    let bytes: Buffer;
    try {
      const res = await fetch(job.url, { signal: AbortSignal.timeout(60_000), redirect: 'follow' });
      if (!res.ok) throw new Error(`첨부 응답 오류 ${res.status}`);
      bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length === 0) throw new Error('첨부가 비어 있습니다');
      if (bytes.length > MAX_BYTES) {
        return { ...base, status: 'unsupported', error: `파일이 너무 큽니다 (${Math.round(bytes.length / 1024 / 1024)}MB)` };
      }
    } catch (err) {
      return { ...base, status: 'failed', error: `내려받기 실패: ${(err as Error).message}` };
    }

    const raw = /\.pdf$/i.test(job.fileName)
      ? await extractPdfText(bytes)
      : (await extractHangulText(job.fileName, bytes))?.text ?? null;

    if (raw == null) {
      return { ...base, status: 'unsupported', error: '문서를 열 수 없습니다 (암호·배포용 문서이거나 손상됨)' };
    }

    const text = cleanDocumentText(raw);
    if (!hasReadableText(text)) {
      // 스캔본·이미지 PDF — 글자층이 없다
      return { ...base, status: 'no_text', text: text.slice(0, MAX_STORED_CHARS) };
    }

    try {
      const envelope = await this.cli.run({
        systemPrompt: `${DOCUMENT_SYSTEM_PROMPT}\n\n${DOCUMENT_JSON_FORMAT}`,
        prompt: buildDocumentPrompt({ title: job.title, text }),
        model: this.model,
        timeoutMs: parseInt(this.config.get<string>('DOCUMENT_TIMEOUT_MS', '240000'), 10),
      });
      if (envelope.is_error) {
        throw new Error(`Claude CLI 오류: ${envelope.subtype ?? '알 수 없음'}`);
      }

      const conditions = parseDocumentOutput(envelope.result ?? '');
      if (!conditions) {
        return {
          ...base, status: 'failed', model: this.model,
          text: text.slice(0, MAX_STORED_CHARS),
          error: `응답을 해석하지 못했습니다: ${(envelope.result ?? '').slice(0, 300)}`,
        };
      }

      this.logger.debug(
        `${job.title.slice(0, 30)} — 요건 ${conditions.requirements.length} / 제외 ${conditions.exclusions.length}` +
          (conditions.multiTrack ? ' (트랙형)' : ''),
      );
      return {
        ...base, status: 'extracted', model: this.model,
        text: text.slice(0, MAX_STORED_CHARS), conditions,
      };
    } catch (err) {
      return {
        ...base, status: 'failed', model: this.model,
        text: text.slice(0, MAX_STORED_CHARS),
        error: (err as Error).message,
      };
    }
  }

  private async report(grantId: string, payload: GrantDocumentResult): Promise<void> {
    const res = await fetch(`${this.apiBase}/grants/documents/${grantId}/result`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.headers },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${(await res.text()).slice(0, 200)}`);
    }
  }
}
