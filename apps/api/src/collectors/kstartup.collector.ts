import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grant } from '../grants/entities/grant.entity';
import {
  type KStartupAnnouncement, type ParsedGrant, parseAnnouncement,
} from './kstartup.parser';

export interface CollectResult {
  fetched: number;   // API 에서 받은 건수
  created: number;   // 새로 넣은 건수
  updated: number;   // 내용이 바뀌어 갱신한 건수
  skipped: number;   // 변경 없어 건너뛴 건수
  invalid: number;   // 파싱 불가로 버린 건수
}

/**
 * K-Startup 공고 수집기.
 *
 * 데이터 갱신 주기가 일 1회이므로 수집도 하루 한 번이면 충분하다.
 *
 * 같은 공고를 다시 받았을 때는 내용이 실제로 바뀐 경우에만 저장한다.
 * 무의미하게 updatedAt 을 건드리면 판정 캐시가 전부 무효화되어
 * 다음 스윕에서 전 조합을 다시 계산하게 된다.
 */
@Injectable()
export class KStartupCollector {
  private readonly logger = new Logger(KStartupCollector.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Grant) private readonly grants: Repository<Grant>,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>(
      'KSTARTUP_BASE_URL',
      'https://apis.data.go.kr/B552735/kisedKstartupService01',
    );
  }

  private get serviceKey(): string {
    return this.config.get<string>('KSTARTUP_SERVICE_KEY', '');
  }

  get isConfigured(): boolean {
    return this.serviceKey.length > 0;
  }

  /**
   * 공고를 수집해 저장한다.
   *
   * @param maxPages 최대 페이지 수 (0 이면 끝까지)
   * @param perPage  페이지당 건수
   */
  async collect(
    { maxPages = 5, perPage = 100 }: { maxPages?: number; perPage?: number } = {},
  ): Promise<CollectResult> {
    const result: CollectResult = {
      fetched: 0, created: 0, updated: 0, skipped: 0, invalid: 0,
    };

    if (!this.isConfigured) {
      this.logger.warn('KSTARTUP_SERVICE_KEY 가 없어 수집을 건너뜁니다.');
      return result;
    }

    let page = 1;
    for (;;) {
      const rows = await this.fetchPage(page, perPage);
      if (rows.length === 0) break;

      result.fetched += rows.length;

      for (const row of rows) {
        const parsed = parseAnnouncement(row);
        if (!parsed) {
          result.invalid += 1;
          continue;
        }
        const outcome = await this.upsert(parsed);
        result[outcome] += 1;
      }

      this.logger.log(
        `page ${page} — 누적 ${result.fetched}건 (신규 ${result.created} / 갱신 ${result.updated})`,
      );

      if (rows.length < perPage) break;
      page += 1;
      if (maxPages > 0 && page > maxPages) break;
    }

    this.logger.log(
      `수집 완료 — 조회 ${result.fetched} / 신규 ${result.created} / 갱신 ${result.updated} / 유지 ${result.skipped} / 불량 ${result.invalid}`,
    );
    return result;
  }

  /** 총 공고 수 — 수집 전 규모 확인용 */
  async totalCount(): Promise<number> {
    const url = this.buildUrl(1, 1);
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`K-Startup 응답 오류: ${res.status}`);
    const body = (await res.json()) as { totalCount?: number };
    return body.totalCount ?? 0;
  }

  /* ────────────── 내부 ────────────── */

  private buildUrl(page: number, perPage: number): string {
    const qs = new URLSearchParams({
      serviceKey: this.serviceKey,
      page: String(page),
      perPage: String(perPage),
      returnType: 'json',
    });
    return `${this.baseUrl}/getAnnouncementInformation01?${qs.toString()}`;
  }

  private async fetchPage(
    page: number,
    perPage: number,
  ): Promise<KStartupAnnouncement[]> {
    const res = await fetch(this.buildUrl(page, perPage), {
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      throw new Error(`K-Startup 응답 오류: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { data?: KStartupAnnouncement[] };
    return Array.isArray(body.data) ? body.data : [];
  }

  /**
   * 공고 저장.
   * 내용이 실제로 달라진 경우에만 save 한다 — 판정 캐시를 불필요하게 깨지 않기 위해서다.
   */
  private async upsert(
    parsed: ParsedGrant,
  ): Promise<'created' | 'updated' | 'skipped'> {
    const existing = await this.grants.findOne({
      where: { sourceApi: parsed.sourceApi, externalId: parsed.externalId },
    });

    if (!existing) {
      await this.grants.save(this.grants.create(parsed));
      return 'created';
    }

    if (!this.hasChanged(existing, parsed)) return 'skipped';

    Object.assign(existing, parsed);
    await this.grants.save(existing);
    return 'updated';
  }

  /** 판정에 영향을 주는 항목만 비교한다. */
  private hasChanged(existing: Grant, next: ParsedGrant): boolean {
    const sameDate = (a: Date | null, b: Date | null) =>
      (a?.getTime() ?? null) === (b?.getTime() ?? null);
    const sameArray = (a: string[], b: string[]) =>
      a.length === b.length && a.every((v, i) => v === b[i]);

    return !(
      existing.title === next.title &&
      existing.agency === next.agency &&
      existing.category === next.category &&
      existing.summary === next.summary &&
      sameDate(existing.applyStartAt, next.applyStartAt) &&
      sameDate(existing.applyEndAt, next.applyEndAt) &&
      existing.minBusinessYears === next.minBusinessYears &&
      existing.maxBusinessYears === next.maxBusinessYears &&
      sameArray(existing.targetRegions, next.targetRegions) &&
      sameArray(existing.applicantTypes, next.applicantTypes) &&
      existing.isActive === next.isActive
    );
  }
}
