import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SoftCheckStatus } from '@moai/shared';
import { JudgeRegistry } from './judge.registry';

interface PendingItem {
  checkId: string;
  grant: {
    id: string;
    title: string;
    agency: string;
    summary: string | null;
    sourceUrl: string | null;
    applyTargetDetail?: string | null;
    excludeTarget?: string | null;
  };
  profile: {
    id: string;
    name: string;
    stage: string | null;
    industry: string | null;
    region: string | null;
    foundedAt: string | null;
    employees: number | null;
    certifications: string[];
  };
  hardReasons: { field: string; verdict: string; message: string }[];
}

export interface DrainResult {
  fetched: number;
  judged: number;
  failed: number;
  skipped: number;
}

/**
 * 판정 워커.
 *
 * 백엔드에서 대기열을 가져와 하나씩 판정하고 결과를 돌려보낸다.
 * 어느 모델로 판정할지는 `JudgeRegistry` 가 고른다 (기본 로컬 Claude).
 * 두 가지 방식으로 돈다.
 *
 *   - 자동: 일정 간격으로 대기열을 비운다 (사용자가 기다리지 않도록 미리 분석)
 *   - 수동: 사용자가 "사업 분석하기"를 누르면 즉시 1회 실행
 */
@Injectable()
export class EligibilityWorkerService implements OnModuleInit {
  private readonly logger = new Logger(EligibilityWorkerService.name);
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly registry: JudgeRegistry,
  ) {}

  onModuleInit(): void {
    const enabled =
      this.config.get<string>('ELIGIBILITY_WORKER', 'false') === 'true';
    if (!enabled) {
      this.logger.log(
        '판정 워커 비활성 (ELIGIBILITY_WORKER=true 로 켜면 주기적으로 미리 분석합니다)',
      );
      return;
    }

    const intervalMs = parseInt(
      this.config.get<string>('WORKER_INTERVAL_MS', '300000'),
      10,
    );
    this.timer = setInterval(() => void this.drain(), intervalMs);
    this.logger.log(`판정 워커 시작 — ${intervalMs / 1000}초 간격`);
  }

  get isRunning(): boolean {
    return this.running;
  }

  private get apiBase(): string {
    return this.config.get<string>('API_BASE_URL', 'http://localhost:4000/api');
  }

  /**
   * 백엔드가 대기열을 내줄 때 확인하는 값.
   *
   * 워커는 로그인한 사용자가 아니다 — 모든 워크스페이스의 대기열을 가져가야
   * 하므로 사용자 토큰으로는 될 수 없다. 그래서 서로만 아는 값을 맞춘다.
   * `apps/api/.env` 의 같은 이름 값과 같아야 한다.
   */
  private get headers(): Record<string, string> {
    const token = (this.config.get<string>('INTERNAL_TOKEN') ?? '').trim();
    return token ? { authorization: `Bearer ${token}` } : {};
  }

  /**
   * 대기열을 비운다.
   * 동시에 두 번 돌지 않도록 잠근다 — 같은 조합을 중복 판정할 이유가 없다.
   */
  async drain(limit?: number): Promise<DrainResult> {
    const result: DrainResult = { fetched: 0, judged: 0, failed: 0, skipped: 0 };

    if (this.running) {
      this.logger.warn('이미 판정이 진행 중입니다.');
      return result;
    }

    const picked = await this.registry.resolve();
    if (!picked.judge) {
      this.logger.warn(picked.message);
      return result;
    }
    const judge = picked.judge;

    this.running = true;
    try {
      const take = limit ?? parseInt(
        this.config.get<string>('WORKER_BATCH_SIZE', '20'),
        10,
      );

      const res = await fetch(
        `${this.apiBase}/grants/eligibility/pending?limit=${take}`,
        { headers: this.headers, signal: AbortSignal.timeout(15000) },
      );
      if (!res.ok) {
        // 401 은 원인이 하나뿐이라 그대로 알려 준다. 안 그러면 숫자만 보고 헤맨다.
        throw new Error(
          res.status === 401
            ? '대기열 조회 실패: 401 — INTERNAL_TOKEN 이 apps/api/.env 와 apps/agent/.env 에서 다릅니다.'
            : `대기열 조회 실패: ${res.status}`,
        );
      }

      const items = (await res.json()) as PendingItem[];
      result.fetched = items.length;
      if (items.length === 0) return result;

      this.logger.log(`판정 시작 — ${items.length}건`);

      for (const item of items) {
        try {
          const verdict = await judge.judge({
            grant: item.grant,
            profile: item.profile,
            hardReasons: item.hardReasons,
          });

          // 모델이 확신하지 못하면 사용자에게 넘긴다.
          let status: SoftCheckStatus;
          if (verdict.reasons.some((r) => r.verdict === 'fail')) {
            status = 'failed';
          } else if (verdict.reasons.some((r) => r.verdict === 'unknown')) {
            status = 'needs_user';
          } else {
            status = 'passed';
          }

          await this.report(item.checkId, {
            status,
            reasons: verdict.reasons,
            quotes: verdict.quotes,
            model: judge.model,
          });
          result.judged += 1;
        } catch (err) {
          this.logger.warn(
            `판정 실패 ${item.grant.title}: ${(err as Error).message}`,
          );
          result.failed += 1;
        }
      }

      this.logger.log(
        `판정 완료 (${judge.name}) — 성공 ${result.judged} / 실패 ${result.failed}`,
      );
      return result;
    } catch (err) {
      this.logger.error(`대기열 처리 오류: ${(err as Error).message}`);
      return result;
    } finally {
      this.running = false;
    }
  }

  private async report(
    checkId: string,
    payload: {
      status: SoftCheckStatus;
      reasons: { field: string; verdict: string; message: string }[];
      quotes: string[];
      model: string;
    },
  ): Promise<void> {
    const res = await fetch(
      `${this.apiBase}/grants/eligibility/${checkId}/result`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...this.headers },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!res.ok) {
      throw new Error(`결과 전송 실패: ${res.status}`);
    }
  }
}
