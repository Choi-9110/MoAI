import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Grant } from '../grants/entities/grant.entity';
import type { CollectResult } from './kstartup.collector';
import type { ParsedGrant } from './kstartup.parser';
import {
  type YouthPolicy, isStartupPolicy, parseAge, parseAgency,
  parseApplicantTypes, parseCategory, parsePeriod, parseSummary, parseUrl,
} from './youth.parser';

/**
 * 온통청년(한국고용정보원) 청년정책 수집기.
 *
 * **왜 붙이는가.** 이 서비스가 보는 두 곳(K-Startup·기업마당)에 지자체
 * 청년센터 공고가 거의 안 올라온다. 실제로 세어 보니 온통청년의 창업 정책
 * 327건 가운데 **320건이 우리에 없었다.** 삼척 청년몰, 순천 스타트업 쇼룸,
 * 부산 남구 창업 경진대회 같은 것들이다.
 *
 * **다만 대부분은 우리 것이 아니다.** 전체 2,745건 중 월세·면접비·문화패스
 * 같은 개인 생활 지원이 대다수라, 중분류가 `창업` 인 것만 담는다.
 */
@Injectable()
export class YouthCollector {
  private readonly logger = new Logger(YouthCollector.name);

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Grant) private readonly grants: Repository<Grant>,
  ) {}

  private get baseUrl(): string {
    return this.config.get<string>(
      'YOUTH_BASE_URL',
      'https://www.youthcenter.go.kr/go/ythip/getPlcy',
    );
  }

  private get apiKey(): string {
    return this.config.get<string>('YOUTH_API_KEY', '');
  }

  get isConfigured(): boolean {
    return this.apiKey.length > 0;
  }

  /** 한 번에 받는 건수 — 100 까지 받아 준다 */
  private static readonly PAGE_SIZE = 100;

  /**
   * 정책을 수집해 저장한다.
   *
   * @param maxPages 최대 페이지. 0 이면 끝까지(전체 2,745건 ≒ 28쪽).
   */
  async collect(maxPages = 0): Promise<CollectResult> {
    const result: CollectResult = {
      fetched: 0, created: 0, updated: 0, skipped: 0, invalid: 0,
    };

    if (!this.isConfigured) {
      this.logger.warn('YOUTH_API_KEY 가 없어 청년정책 수집을 건너뜁니다.');
      return result;
    }

    let total = Number.POSITIVE_INFINITY;
    let seen = 0;

    for (let page = 1; seen < total; page += 1) {
      if (maxPages > 0 && page > maxPages) break;

      const batch = await this.fetchPage(page);
      if (!batch) {
        /*
         * 한 쪽이 실패해도 멈추지 않는다. 이 API 는 가끔 HTML 오류 쪽을
         * 돌려주는데, 그때 통째로 그만두면 뒤쪽 정책을 통째로 잃는다.
         */
        this.logger.warn(`${page}쪽을 받지 못해 건너뜁니다.`);
        continue;
      }

      total = batch.total;
      seen += batch.list.length;
      if (batch.list.length === 0) break;

      for (const row of batch.list) {
        result.fetched += 1;

        /* 창업이 아닌 것은 세지 않고 지나간다 — 불량이 아니라 대상이 아니다 */
        if (!isStartupPolicy(row)) continue;

        const parsed = this.toGrant(row);
        if (!parsed) {
          result.invalid += 1;
          continue;
        }
        result[await this.upsert(parsed)] += 1;
      }
    }

    this.logger.log(
      `청년정책 수집 완료 — 조회 ${result.fetched} / 신규 ${result.created} / ` +
        `갱신 ${result.updated} / 유지 ${result.skipped} / 불량 ${result.invalid}`,
    );
    return result;
  }

  /* ────────────── 내부 ────────────── */

  private async fetchPage(
    page: number,
  ): Promise<{ total: number; list: YouthPolicy[] } | null> {
    const qs = new URLSearchParams({
      apiKeyNm: this.apiKey,
      pageNum: String(page),
      pageSize: String(YouthCollector.PAGE_SIZE),
      rtnType: 'json',
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetch(`${this.baseUrl}?${qs.toString()}`, {
          signal: AbortSignal.timeout(40_000),
        });
        const text = await res.text();

        /*
         * **성공해도 HTML 이 올 때가 있다.** 그대로 JSON 으로 읽으면
         * `Unexpected token '<'` 로 터지므로 먼저 모양을 본다.
         */
        if (!text.startsWith('{')) {
          await sleep(700);
          continue;
        }

        const body = JSON.parse(text) as {
          result?: {
            pagging?: { totCount?: number };
            youthPolicyList?: YouthPolicy[];
          };
        };

        return {
          total: Number(body.result?.pagging?.totCount ?? 0),
          list: body.result?.youthPolicyList ?? [],
        };
      } catch {
        await sleep(700);
      }
    }
    return null;
  }

  private toGrant(row: YouthPolicy): ParsedGrant | null {
    const title = row.plcyNm?.trim();
    if (!title || !row.plcyNo) return null;

    const { start, end } = parsePeriod(row.aplyYmd);

    return {
      externalId: String(row.plcyNo),
      sourceApi: 'youth',
      title,
      agency: parseAgency(row),
      agencyType: 'local',
      category: parseCategory(row),
      summary: parseSummary(row),
      applyStartAt: start,
      applyEndAt: end,
      applicantTypes: parseApplicantTypes(row),
      targetRegions: [],
      targetIndustries: [],
      minBusinessYears: null,
      maxBusinessYears: null,
      applyTargetDetail: row.plcyAplyMthdCn?.trim() || null,
      excludeTarget: null,
      minAge: parseAge(row.sprtTrgtMinAge),
      maxAge: parseAge(row.sprtTrgtMaxAge),
      sourceUrl: parseUrl(row),
      isActive: true,

      /*
       * 구조화하지 못한 것을 그대로 남긴다. 제출 서류나 사업 기간처럼
       * 우리 칸에 없는 내용이 여기 들어가고, 2단계 판정이 이것을 읽는다.
       */
      rawMetadata: {
        지원내용: row.plcySprtCn ?? null,
        신청방법: row.plcyAplyMthdCn ?? null,
        제출서류: row.sbmsnDcmntCn ?? null,
        사업기간: row.bizPrdEtcCn ?? null,
        지원규모: row.sprtSclCnt ?? null,
        분류: `${row.lclsfNm ?? ''} / ${row.mclsfNm ?? ''}`,
      },
    };
  }

  /** 내용이 실제로 달라졌을 때만 저장한다 */
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

    const changed =
      existing.title !== parsed.title ||
      existing.category !== parsed.category ||
      existing.summary !== parsed.summary ||
      existing.applyEndAt?.getTime() !== parsed.applyEndAt?.getTime() ||
      existing.sourceUrl !== parsed.sourceUrl;

    if (!changed) return 'skipped';

    Object.assign(existing, parsed);
    await this.grants.save(existing);
    return 'updated';
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
