import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grant } from '../grants/entities/grant.entity';
import { type BizinfoAnnouncement, parseBizinfo } from './bizinfo.parser';
import type { CollectResult } from './kstartup.collector';
import type { ParsedGrant } from './kstartup.parser';

/**
 * 기업마당(Bizinfo) 공고 수집기.
 *
 * **K-Startup 수집기와 다른 점 하나** — 기업마당은 페이지를 나누지 않고
 * 현재 게시 중인 공고를 **한 번에 전부** 준다(`searchCnt=0`). 1,500건 남짓에
 * 2.3MB 라 한 번에 받아도 무겁지 않다. 그래서 페이징 루프가 없다.
 *
 * 대신 "지금 게시 중"만 오므로 지난 공고는 들어오지 않는다.
 * K-Startup(2012년부터 누적)과 성격이 다르다.
 */
@Injectable()
export class BizinfoCollector {
  private readonly logger = new Logger(BizinfoCollector.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Grant) private readonly grants: Repository<Grant>,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>(
      'BIZINFO_BASE_URL',
      'https://www.bizinfo.go.kr/uss/rss/bizinfoApi.do',
    );
  }

  private get crtfcKey(): string {
    return this.config.get<string>('BIZINFO_CRTFC_KEY', '');
  }

  get isConfigured(): boolean {
    return this.crtfcKey.length > 0;
  }

  /**
   * 공고를 수집해 저장한다.
   *
   * @param searchCnt 받을 건수. 0 이면 전체(기본).
   * @param realm     분야 코드(01 금융 … 09 기타). 비우면 전 분야.
   */
  async collect(
    { searchCnt = 0, realm }: { searchCnt?: number; realm?: string } = {},
  ): Promise<CollectResult> {
    const result: CollectResult = {
      fetched: 0, created: 0, updated: 0, skipped: 0, invalid: 0,
    };

    if (!this.isConfigured) {
      this.logger.warn('BIZINFO_CRTFC_KEY 가 없어 수집을 건너뜁니다.');
      return result;
    }

    const rows = await this.fetchAll(searchCnt, realm);
    result.fetched = rows.length;

    for (const row of rows) {
      const parsed = parseBizinfo(row);
      if (!parsed) {
        result.invalid += 1;
        continue;
      }
      const outcome = await this.upsert(parsed);
      result[outcome] += 1;
    }

    this.logger.log(
      `기업마당 수집 완료 — 조회 ${result.fetched} / 신규 ${result.created} / ` +
        `갱신 ${result.updated} / 유지 ${result.skipped} / 불량 ${result.invalid}`,
    );
    return result;
  }

  /** 원본에 몇 건이 올라와 있는지 — 수집 전 규모 확인용 */
  async totalCount(): Promise<number> {
    const rows = await this.fetchAll(1);
    const total = rows[0]?.totCnt;
    return typeof total === 'string' ? parseInt(total, 10) : (total ?? 0);
  }

  /* ────────────── 내부 ────────────── */

  private buildUrl(searchCnt: number, realm?: string): string {
    const qs = new URLSearchParams({
      crtfcKey: this.crtfcKey,
      dataType: 'json',
      searchCnt: String(searchCnt),
      ...(realm ? { searchLclasId: realm } : {}),
    });
    return `${this.baseUrl}?${qs.toString()}`;
  }

  private async fetchAll(
    searchCnt: number,
    realm?: string,
  ): Promise<BizinfoAnnouncement[]> {
    const res = await fetch(this.buildUrl(searchCnt, realm), {
      // 전체를 한 번에 받으므로 K-Startup 한 페이지보다 넉넉히 준다.
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) {
      throw new Error(`기업마당 응답 오류: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { jsonArray?: BizinfoAnnouncement[] };
    return Array.isArray(body.jsonArray) ? body.jsonArray : [];
  }

  /**
   * 공고 저장 — 규칙은 K-Startup 수집기와 같다.
   * 내용이 실제로 달라진 경우에만 save 한다. 무의미하게 updatedAt 을 건드리면
   * 판정 캐시가 전부 무효화되어 다음 스윕에서 전 조합을 다시 계산한다.
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
      sameArray(existing.targetRegions, next.targetRegions) &&
      sameArray(existing.applicantTypes, next.applicantTypes) &&
      existing.isActive === next.isActive
    );
  }
}
