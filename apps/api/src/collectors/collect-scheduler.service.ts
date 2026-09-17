import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EligibilityCacheService } from '../grants/eligibility-cache.service';
import { BizinfoCollector } from './bizinfo.collector';
import { KStartupCollector } from './kstartup.collector';
import { YouthCollector } from './youth.collector';

/**
 * 일일 수집 스케줄러.
 *
 * K-Startup 원본이 하루 1회 갱신되므로 수집도 하루 한 번이면 충분하다.
 *
 * 매일 전체(약 3만 건)를 훑을 필요는 없다.
 * 새 공고는 목록 앞쪽에 쌓이므로 평일에는 앞부분만 확인하고,
 * 주 1회만 전체를 훑어 누락과 수정분을 맞춘다.
 *
 *   매일 04:00  증분 — 앞 30페이지(3,000건)
 *   일요일 03:00 전체 — 끝까지
 *
 * 수집 직후에는 판정 스윕을 돌려 캘린더가 바로 최신 상태가 되게 한다.
 */
@Injectable()
export class CollectSchedulerService {
  private readonly logger = new Logger(CollectSchedulerService.name);
  private running = false;

  constructor(
    private readonly config: ConfigService,
    private readonly kstartup: KStartupCollector,
    private readonly bizinfo: BizinfoCollector,
    private readonly youth: YouthCollector,
    private readonly cache: EligibilityCacheService,
  ) {}

  private get enabled(): boolean {
    return this.config.get<string>('COLLECT_SCHEDULE', 'false') === 'true';
  }

  /** 평일 증분 — 새로 올라온 공고만 잡는다 */
  @Cron('0 4 * * 1-6', { timeZone: 'Asia/Seoul' })
  async daily(): Promise<void> {
    if (!this.enabled) return;
    await this.run({
      label: '일일 증분',
      maxPages: parseInt(this.config.get<string>('COLLECT_DAILY_PAGES', '30'), 10),
    });
  }

  /** 주간 전체 — 수정된 공고와 누락분을 맞춘다 */
  @Cron('0 3 * * 0', { timeZone: 'Asia/Seoul' })
  async weekly(): Promise<void> {
    if (!this.enabled) return;
    await this.run({ label: '주간 전체', maxPages: 0 });
  }

  /**
   * 수집 + 판정 스윕.
   * 수동 실행도 이 경로를 쓴다.
   */
  async run(
    { label, maxPages }: { label: string; maxPages: number },
  ): Promise<{
    collected: Awaited<ReturnType<KStartupCollector['collect']>> | null;
    swept: Awaited<ReturnType<EligibilityCacheService['sweep']>> | null;
  }> {
    if (this.running) {
      this.logger.warn(`${label} 건너뜀 — 이미 수집이 진행 중입니다.`);
      return { collected: null, swept: null };
    }

    this.running = true;
    const startedAt = Date.now();

    try {
      this.logger.log(`${label} 수집 시작 (maxPages=${maxPages || '전체'})`);

      /*
       * **세 곳을 다 돈다.**
       *
       * 예전에는 K-Startup 만 돌렸다. 그래서 자동 수집을 켜 두어도 기업마당과
       * 청년정책은 손으로 돌려야 새 공고가 들어왔고, 아무도 그 사실을 몰랐다.
       *
       * 한 곳이 실패해도 나머지는 담는다 — 청년정책 API 가 가끔 HTML 을
       * 돌려주는데, 그것 때문에 K-Startup 수집분까지 잃을 이유가 없다.
       */
      const collected = await this.kstartup.collect({ maxPages, perPage: 100 });

      const others = await Promise.allSettled([
        this.bizinfo.collect({ searchCnt: 0 }),
        this.youth.collect(0),
      ]);

      for (const [i, r] of others.entries()) {
        const who = i === 0 ? '기업마당' : '청년정책';
        if (r.status === 'rejected') {
          this.logger.warn(`${who} 수집 실패: ${String(r.reason).slice(0, 120)}`);
          continue;
        }
        collected.fetched += r.value.fetched;
        collected.created += r.value.created;
        collected.updated += r.value.updated;
        collected.skipped += r.value.skipped;
        collected.invalid += r.value.invalid;
        this.logger.log(
          `${who} — 신규 ${r.value.created} / 갱신 ${r.value.updated}`,
        );
      }

      // 새 공고가 없으면 판정을 다시 돌릴 이유가 없다.
      if (collected.created === 0 && collected.updated === 0) {
        this.logger.log(`${label} 완료 — 변경 없음. 판정 스윕 생략`);
        return { collected, swept: null };
      }

      const swept = await this.cache.sweep({});
      this.logger.log(
        `${label} 완료 — 신규 ${collected.created} / 갱신 ${collected.updated} / 판정 ${swept.scanned} (${Math.round((Date.now() - startedAt) / 1000)}초)`,
      );
      return { collected, swept };
    } catch (err) {
      this.logger.error(`${label} 실패: ${(err as Error).message}`);
      throw err;
    } finally {
      this.running = false;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }
}
