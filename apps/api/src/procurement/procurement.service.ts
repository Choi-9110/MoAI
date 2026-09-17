import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { bidKindsOf, procurementRegionCandidates } from '@moai/shared';
import type {
  BidLicense, BidKind, BidNotice } from '@moai/shared';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { G2bClient } from './g2b.client';
import { parseBidNotice } from './g2b.parser';

export interface BidQuery {
  /** 조회 기간 — 최근 며칠 (최대 31일) */
  days?: number;
  /** 업무 구분을 직접 지정. 비우면 프로필의 업종에서 정한다. */
  kinds?: BidKind[];
  /**
   * 캐시를 무시하고 다시 받아온다.
   *
   * 사용자가 "새로고침"을 눌렀는데 캐시된 것이 그대로 나오면 버튼이
   * 아무 일도 안 하는 것처럼 보인다. 그때만 쓴다.
   */
  refresh?: boolean;
}

export interface BidListResult {
  items: BidNotice[];
  /** 그중 아직 마감되지 않은 건수 */
  openCount: number;
  /** 실제로 부른 조합 수 — 호출량을 화면에서 확인할 수 있게 */
  calls: number;
  /** 캐시에서 가져온 조합 수 */
  cached: number;
  /** 조회에 쓴 조건 — 왜 이 결과인지 화면에 설명할 때 쓴다 */
  usedRegion: string | null;
  usedIndustries: string[];
}

/**
 * 같은 공고는 **최신 차수만** 남긴다.
 *
 * 공고가 정정되면 차수(`ord`)가 올라가는데, 이때 **마감일이 함께 바뀐다.**
 * 실제로 이런 경우가 있었다:
 *
 *     R26BK01691412-000  마감 08-28
 *     R26BK01691412-001  마감 09-02   ← 연장됨
 *
 * 차수를 구분해서 담으면 목록에 같은 공고가 여러 번 뜨고, 더 나쁘게는
 * **옛 차수의 지난 마감일**을 보여 준다. 아직 열려 있는 공고를 "마감됨"으로
 * 읽게 되니 기회를 놓친다.
 */
function keepLatest(map: Map<string, BidNotice>, item: BidNotice): void {
  const prev = map.get(item.bidNo);
  if (!prev || item.ord >= prev.ord) map.set(item.bidNo, item);
}

/** 캐시 한 칸 */
interface CacheEntry {
  at: number;
  items: BidNotice[];
}

/**
 * 입찰공고 조회 — 적재하지 않고 그때그때 부른다.
 *
 * **왜 캐시가 꼭 필요한가.** 나라장터 API 는 업종을 **하나씩만** 받는다.
 * 업종 3개를 가진 업체면 3번, 공사·용역에 걸쳐 있으면 그만큼 더 부른다.
 * 개발계정은 하루 1,000회라 사람이 목록을 몇 번 새로고침하면 금방 닳는다.
 *
 * 그래서 **조건별로 캐시를 하나 두고 여러 사람이 나눠 쓴다.** 입찰공고는
 * 누구에게 숨길 정보가 아니라서 사람마다 따로 둘 이유가 없다 —
 * "경기 + 전기공사업" 결과 한 벌을 그 조건인 모두가 함께 본다.
 */
@Injectable()
export class ProcurementService {
  private readonly logger = new Logger(ProcurementService.name);
  private readonly cache = new Map<string, CacheEntry>();

  /**
   * 지금 돌고 있는 조회.
   *
   * **입찰 조회는 오래 걸린다.** 업종 하나마다 조달청에 한 번씩 물어야 하고,
   * 업종을 셋 고르면 세 번이다. 한 번이 2~10초라 다 합치면 30초를 넘기도
   * 한다. 그동안 화면을 붙잡아 두면 사람은 멈춘 줄 안다.
   *
   * 그래서 **시작만 시켜 놓고 돌려보낸다.** 끝나면 여기 결과가 담기고,
   * 화면이 30초마다 물어보는 알림에 실려 나간다 — 다른 화면에 가 있어도
   * "다 찾았습니다"가 뜬다.
   *
   * 서버가 한 대라 메모리에 둔다. 다시 뜨면 사라지지만, 그때는 어차피
   * 다시 조회해야 하므로 잃을 것이 없다.
   */
  private readonly running = new Map<
    string,
    {
      startedAt: number;
      finishedAt: number | null;
      error: string | null;
      result: BidListResult | null;
      /** 사용자에게 알렸는가 — 같은 것을 30초마다 다시 알리지 않는다 */
      notified: boolean;
    }
  >();

  /**
   * 면허·지역 제한 표.
   *
   * 공고마다 따로 묻지 않는다 — **기간으로 한 번 받아 두고** 공고번호로 찾는다.
   * 목록 스무 건에 스무 번을 부르면 하루 호출 한도가 그것만으로 닳는다.
   */
  private limits: {
    at: number;
    license: Map<string, BidLicense[]>;
    region: Map<string, string[]>;
  } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly client: G2bClient,
  ) {}

  get isConfigured(): boolean {
    return this.client.isConfigured;
  }

  /**
   * 캐시 유효 시간 — 기본 1시간.
   *
   * 길게 잡아도 **마감 표시가 틀리지는 않는다.** 남은 날짜는 화면에서 그때그때
   * 계산하므로, 캐시된 목록이라도 "마감됨"은 정확하다. 길어서 잃는 것은
   * 그 사이 새로 올라온 공고뿐이고, 그건 새로고침으로 바로 받을 수 있다.
   */
  /**
   * 면허·지역 제한 표를 만든다(캐시).
   *
   * 두 조회 모두 기간에 걸린 것을 전부 돌려주므로 **999건씩 여러 장**이 온다.
   * 14일이면 면허 1,750건쯤이라 두 장이면 끝나지만, 늘 그렇다는 보장이 없어
   * 남은 장수를 보고 돈다. 다만 다섯 장에서 멈춘다 — 여기서 더 부으면
   * 목록 한 번 여는 데 호출을 열 번 넘게 쓰게 된다.
   */
  private async limitTable(days: number, refresh: boolean) {
    if (!refresh && this.limits && Date.now() - this.limits.at < this.ttlMs) {
      return this.limits;
    }

    const license = new Map<string, BidLicense[]>();
    const region = new Map<string, string[]>();

    for (const kind of ['license', 'region'] as const) {
      for (let page = 1; page <= 5; page += 1) {
        const got = await this.client.limits(kind, days, page);
        for (const row of got.rows) {
          const key = `${row.bidNo}-${row.ord}`;
          if (kind === 'license' && row.licenseName) {
            const list = license.get(key) ?? [];
            list.push({
              name: stripCode(row.licenseName),
              alternatives: parseIndustryList(row.allowedIndustries),
            });
            license.set(key, list);
          } else if (kind === 'region' && row.region) {
            const list = region.get(key) ?? [];
            if (!list.includes(row.region)) list.push(row.region);
            region.set(key, list);
          }
        }
        if (page * G2bClient.MAX_ROWS >= got.total) break;
      }
    }

    this.limits = { at: Date.now(), license, region };
    return this.limits;
  }

  private get ttlMs(): number {
    return parseInt(this.config.get<string>('G2B_CACHE_TTL_MS', '3600000'), 10);
  }

  /**
   * 프로필 기준 입찰공고 목록.
   *
   * 업종이 없으면 **부르지 않는다.** 조건 없이 부르면 전국 모든 공고가
   * 쏟아지는데(주 8,700건) 그건 목록이 아니라 소음이고, 하루 호출 한도만
   * 태운다. 화면에서 "업종을 고르면 보입니다" 로 안내하는 편이 낫다.
   */
  /**
   * 조회를 시작만 시킨다.
   *
   * 이미 돌고 있으면 두 번 돌리지 않는다 — 새로고침을 눌렀다고 조달청에
   * 두 배로 물을 이유가 없다.
   */
  startForProfile(
    tenantId: string,
    profile: Pick<CompanyProfile, 'region' | 'procurementIndustries'>,
    query: BidQuery = {},
  ): { status: 'running' | 'done'; result: BidListResult | null } {
    const job = this.running.get(tenantId);

    /* 아직 도는 중이면 그대로 둔다 */
    if (job && job.finishedAt === null) return { status: 'running', result: null };

    /* 방금 끝났고 새로 고치라는 말이 없으면 그 결과를 준다 */
    if (job?.result && !query.refresh) {
      return { status: 'done', result: job.result };
    }

    this.running.set(tenantId, {
      startedAt: Date.now(),
      finishedAt: null,
      error: null,
      result: null,
      notified: false,
    });

    void this.listForProfile(profile, query)
      .then((result) => {
        this.running.set(tenantId, {
          startedAt: job?.startedAt ?? Date.now(),
          finishedAt: Date.now(),
          error: null,
          result,
          notified: false,
        });
      })
      .catch((err: Error) => {
        this.running.set(tenantId, {
          startedAt: job?.startedAt ?? Date.now(),
          finishedAt: Date.now(),
          error: err.message,
          result: null,
          notified: false,
        });
      });

    return { status: 'running', result: null };
  }

  /** 다 됐는지 물어본다 */
  statusOf(tenantId: string): {
    status: 'idle' | 'running' | 'done' | 'failed';
    elapsedSec: number;
    result: BidListResult | null;
    error: string | null;
  } {
    const job = this.running.get(tenantId);
    if (!job) {
      return { status: 'idle', elapsedSec: 0, result: null, error: null };
    }

    const elapsedSec = Math.round(
      ((job.finishedAt ?? Date.now()) - job.startedAt) / 1000,
    );

    if (job.finishedAt === null) {
      return { status: 'running', elapsedSec, result: null, error: null };
    }
    return {
      status: job.error ? 'failed' : 'done',
      elapsedSec,
      result: job.result,
      error: job.error,
    };
  }

  /**
   * 아직 안 알린 완료 건 — 알림이 이걸 가져간다.
   *
   * 한 번 가져가면 표시해 두어 다시 알리지 않는다. 안 그러면 30초마다
   * 같은 알림이 뜬다.
   */
  takeFinished(tenantId: string): {
    ok: boolean;
    count: number;
    elapsedSec: number;
  } | null {
    const job = this.running.get(tenantId);
    if (!job || job.finishedAt === null || job.notified) return null;

    job.notified = true;
    return {
      ok: job.error === null,
      count: job.result?.items.length ?? 0,
      elapsedSec: Math.round((job.finishedAt - job.startedAt) / 1000),
    };
  }

  async listForProfile(
    profile: Pick<CompanyProfile, 'region' | 'procurementIndustries'>,
    query: BidQuery = {},
  ): Promise<BidListResult> {
    const industries = profile.procurementIndustries ?? [];
    const regions = procurementRegionCandidates(profile.region);
    const region = regions[0] ?? null;

    if (industries.length === 0) {
      return {
        items: [], openCount: 0, calls: 0, cached: 0,
        usedRegion: region, usedIndustries: [],
      };
    }

    const days = Math.min(query.days ?? 14, 31);
    const kinds = query.kinds?.length ? query.kinds : bidKindsOf(industries);

    /*
     * 업종 × 업무구분을 모두 부르지 않는다. 업종은 자기 구분에만 존재하므로
     * (전기공사업은 공사, 소프트웨어사업은 용역) 짝이 맞는 것만 부른다.
     * 전부 조합하면 호출이 배로 늘고 결과는 0건이다.
     */
    const pairs: { kind: BidKind; industry: string }[] = [];
    for (const industry of industries) {
      for (const kind of bidKindsOf([industry])) {
        if (kinds.includes(kind)) pairs.push({ kind, industry });
      }
    }

    let calls = 0;
    let cached = 0;
    const merged = new Map<string, BidNotice>();

    for (const { kind, industry } of pairs) {
      const key = `${kind}|${industry}|${region ?? '-'}|${days}`;
      const hit = this.cache.get(key);

      if (!query.refresh && hit && Date.now() - hit.at < this.ttlMs) {
        cached += 1;
        for (const item of hit.items) {
          keepLatest(merged, { ...item, matchedIndustry: industry });
        }
        continue;
      }

      try {
        /*
         * 지역 표기를 순서대로 시도한다 — 첫 표기가 0건이면 다음 것으로.
         * 행정구역 개편 때문에 맞는 표기가 지역마다 다르고 앞으로도 바뀐다
         * (`procurementRegionCandidates` 참고). 대개 첫 번째에 걸린다.
         */
        let total = 0;
        let items: Record<string, unknown>[] = [];

        for (const candidate of regions.length ? regions : [null]) {
          const got = await this.client.list({
            kind, days, region: candidate, industry,
            // 한 번에 받을 수 있는 최대치. 업종을 걸면 대개 수백 건이라 한 번에 끝난다.
            rows: G2bClient.MAX_ROWS,
          });
          calls += 1;
          if (got.items.length > 0) {
            ({ total, items } = got);
            break;
          }
        }

        // 넘치면 잘린 것을 알린다 — 조용히 일부만 보여 주면 안 된다.
        if (total > items.length) {
          this.logger.warn(
            `입찰 조회 잘림 (${kind}/${industry}): 전체 ${total}건 중 ${items.length}건만 받음`,
          );
        }

        const parsed = items
          .map((row) => parseBidNotice(row, kind))
          .filter((n): n is BidNotice => n !== null)
          /*
           * 취소된 공고는 빼고 준다. 전체의 5%쯤 섞여 오는데, 목록에 두면
           * 넣을 수 있는 것처럼 보이고 마감일까지 멀쩡해 보인다.
           */
          .filter((n) => !n.canceled);

        this.cache.set(key, { at: Date.now(), items: parsed });
        // 어떤 업종으로 찾아온 것인지 남긴다 — 공사는 이것이 곧 참가 자격이다.
        for (const item of parsed) {
          keepLatest(merged, { ...item, matchedIndustry: industry });
        }
      } catch (err) {
        /*
         * 한 조합이 실패해도 나머지는 보여 준다. 업종 셋 중 하나가 실패했다고
         * 화면 전체를 비우면, 사용자는 원인도 모른 채 아무것도 못 본다.
         */
        this.logger.warn(
          `입찰 조회 실패 (${kind}/${industry}): ${(err as Error).message}`,
        );
      }
    }

    /*
     * 여기서 "업종 제한 있음" 에 이름을 붙인다. 제한이 걸린 공고가 하나라도
     * 있을 때만 부른다 — 아무 데도 안 걸렸는데 표를 받아 올 이유가 없다.
     */
    const anyLimited = [...merged.values()].some(
      (n) => n.industryLimited || n.participationLimited,
    );
    if (anyLimited) {
      try {
        const table = await this.limitTable(days, query.refresh === true);
        for (const [id, notice] of merged) {
          const key = `${notice.bidNo}-${notice.ord}`;
          const licenses = table.license.get(key);
          const allowedRegions = table.region.get(key);
          if (licenses || allowedRegions) {
            merged.set(id, { ...notice, licenses, allowedRegions });
          }
        }
      } catch (err) {
        /*
         * 제한 이름은 있으면 좋은 것이지 없으면 화면이 못 뜨는 것이 아니다.
         * 실패해도 목록은 그대로 준다 — 예전처럼 "있음" 까지는 보인다.
         */
        this.logger.warn(`제한 정보 조회 실패: ${(err as Error).message}`);
      }
    }

    /*
     * 같은 공고가 여러 업종에 걸릴 수 있어 id 로 합쳤다.
     *
     * 정렬에 함정이 하나 있다. 마감 시각만으로 오름차순 정렬하면 **이미
     * 마감된 공고가 맨 앞에 온다** — 지난 시각이 가장 작기 때문이다. 실제로
     * 14일치를 받으면 절반 넘게(79건 중 43건) 이미 마감이라, 목록 첫 화면이
     * 통째로 마감된 공고로 채워졌다.
     *
     * 그래서 **아직 넣을 수 있는 것 → 마감 없는 것 → 이미 마감된 것** 순으로
     * 묶고, 그 안에서 마감이 가까운 순으로 놓는다.
     */
    const nowMs = Date.now();
    const rank = (n: BidNotice): number => {
      if (!n.bidCloseAt) return 1;
      const close = Date.parse(n.bidCloseAt);
      if (!Number.isFinite(close)) return 1;
      return close < nowMs ? 2 : 0;
    };

    const items = [...merged.values()].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;

      const x = a.bidCloseAt ? Date.parse(a.bidCloseAt) : Infinity;
      const y = b.bidCloseAt ? Date.parse(b.bidCloseAt) : Infinity;
      return x - y;
    });

    /** 아직 넣을 수 있는 건수 — 화면 요약이 이 값을 먼저 보여 준다 */
    const openCount = items.filter((n) => rank(n) !== 2).length;

    this.logger.log(
      `입찰 조회 — ${items.length}건 중 마감 전 ${openCount}건 ` +
        `(호출 ${calls} / 캐시 ${cached} / 조합 ${pairs.length})`,
    );

    return {
      items, openCount, calls, cached,
      usedRegion: region, usedIndustries: industries,
    };
  }

  /** 캐시 상태 — 운영 확인용 */
  status(): { entries: number; ttlMs: number; configured: boolean } {
    return {
      entries: this.cache.size,
      ttlMs: this.ttlMs,
      configured: this.isConfigured,
    };
  }
}

/**
 * `식품판매업(집단급식소식품판매업)/5246` → `식품판매업(집단급식소식품판매업)`
 *
 * 뒤의 숫자는 조달청 내부 코드다. 사람에게는 뜻이 없어 떼고 보여 준다.
 */
function stripCode(name: string): string {
  return name.replace(/\/\d+\s*$/, '').trim();
}

/**
 * `[식품제조·가공업/1399],[축산물가공업(식육가공업)/4004]` → 이름만 배열로.
 */
function parseIndustryList(raw: string | undefined): string[] {
  if (!raw) return [];
  return [...raw.matchAll(/\[([^\]]+)\]/g)]
    .map((m) => stripCode(m[1]))
    .filter(Boolean);
}
