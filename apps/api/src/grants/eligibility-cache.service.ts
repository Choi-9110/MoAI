import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { EligibilityReason, SoftCheckStatus } from '@moai/shared';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { EligibilityService } from './eligibility.service';
import { EligibilityCheck } from './entities/eligibility-check.entity';
import { Grant } from './entities/grant.entity';

export interface SweepResult {
  scanned: number;   // 검사한 조합 수
  hardPassed: number;// 하드 필터 통과 → 소프트 대기
  hardFailed: number;// 하드 필터 탈락 → 소프트 생략
  skippedFresh: number; // 이미 최신이라 건너뛴 수
}

/**
 * 기업 × 공고 판정 캐시 관리자.
 *
 * 매일 도는 배치가 이 서비스를 호출한다.
 *
 *   1. 접수 중인 공고 × 기업 프로필 조합을 훑는다
 *   2. 이미 판정했고 양쪽 다 안 바뀌었으면 건너뛴다
 *   3. 하드 필터를 돌려 결과를 저장한다
 *   4. 하드 필터를 통과한 것만 소프트 판정(로컬 LLM) 대기열에 올린다
 *
 * 마감된 공고는 아예 대상에서 빠지고,
 * 하드 필터에서 탈락한 조합은 소프트 판정을 돌리지 않는다.
 */
@Injectable()
export class EligibilityCacheService {
  private readonly logger = new Logger(EligibilityCacheService.name);

  constructor(
    @InjectRepository(EligibilityCheck)
    private readonly checks: Repository<EligibilityCheck>,
    @InjectRepository(Grant) private readonly grants: Repository<Grant>,
    @InjectRepository(CompanyProfile)
    private readonly profiles: Repository<CompanyProfile>,
    private readonly eligibility: EligibilityService,
  ) {}

  /**
   * 전체 스윕 — 하드 필터를 채운다.
   * tenantId 를 주면 해당 테넌트만 처리한다.
   */
  async sweep(options: { tenantId?: string } = {}): Promise<SweepResult> {
    const now = new Date();
    const result: SweepResult = {
      scanned: 0, hardPassed: 0, hardFailed: 0, skippedFresh: 0,
    };

    // 접수가 끝난 공고는 검사하지 않는다.
    const openGrants = await this.grants
      .createQueryBuilder('g')
      .where('g.is_active = true')
      .andWhere('(g.apply_end_at IS NULL OR g.apply_end_at >= :now)', { now })
      .getMany();

    const profiles = await this.profiles.find({
      where: options.tenantId ? { tenantId: options.tenantId } : {},
    });

    if (openGrants.length === 0 || profiles.length === 0) {
      this.logger.log('검사 대상이 없습니다.');
      return result;
    }

    // 기존 판정을 한 번에 읽어 조합별로 인덱싱한다.
    const existing = await this.checks.find({
      where: {
        grantId: In(openGrants.map((g) => g.id)),
        companyProfileId: In(profiles.map((p) => p.id)),
      },
    });
    const cache = new Map<string, EligibilityCheck>();
    for (const e of existing) {
      cache.set(this.key(e.companyProfileId, e.grantId), e);
    }

    const rows: EligibilityCheck[] = [];

    for (const profile of profiles) {
      for (const grant of openGrants) {
        const prev = cache.get(this.key(profile.id, grant.id));

        if (prev && this.isFresh(prev, grant, profile)) {
          result.skippedFresh += 1;
          continue;
        }

        const verdict = this.eligibility.evaluate(grant, profile);
        const failed = verdict.level === 'ineligible';

        const row = prev ?? this.checks.create({
          companyProfileId: profile.id,
          grantId: grant.id,
          tenantId: profile.tenantId,
        });

        row.hardLevel = verdict.level;
        row.hardPassed = verdict.passed;
        row.hardChecked = verdict.checked;
        row.hardReasons = verdict.reasons;
        row.grantVersion = grant.updatedAt;
        row.profileVersion = profile.updatedAt;

        // 하드 필터에서 탈락하면 소프트 판정을 돌릴 이유가 없다.
        if (failed) {
          row.softStatus = 'skipped';
          row.softReasons = [];
          result.hardFailed += 1;
        } else if (row.softStatus !== 'passed' && row.softStatus !== 'failed') {
          row.softStatus = 'pending';
          result.hardPassed += 1;
        } else {
          // 공고·프로필이 바뀌었으므로 소프트 판정도 다시 받아야 한다.
          row.softStatus = 'pending';
          row.softCheckedAt = null;
          result.hardPassed += 1;
        }

        rows.push(row);
        result.scanned += 1;
      }
    }

    if (rows.length > 0) {
      await this.checks.save(rows, { chunk: 200 });
    }

    this.logger.log(
      `스윕 완료 — 검사 ${result.scanned} / 통과 ${result.hardPassed} / 탈락 ${result.hardFailed} / 최신 ${result.skippedFresh}`,
    );
    return result;
  }

  /**
   * 소프트 판정 대기열.
   * 로컬 LLM 워커가 이 목록을 가져가 하나씩 처리한다.
   */
  async pendingSoftChecks(limit = 50): Promise<
    { check: EligibilityCheck; grant: Grant; profile: CompanyProfile }[]
  > {
    const now = new Date();

    /*
     * **마감이 가까운 것부터** 판정한다.
     *
     * 판정은 공짜가 아니다. 먼저 들어온 순서로 처리하면 이번 주에 마감하는
     * 공고가 대기열 뒤에 깔려 있다가 마감된 뒤에 판정되는 일이 생긴다 —
     * 돈은 썼는데 지원은 못 하는 최악의 조합이다.
     * 마감일이 없는 상시 공고는 뒤로 미룬다.
     */
    const pending = await this.checks
      .createQueryBuilder('c')
      .innerJoin(Grant, 'g', 'g.id = c.grant_id')
      .where('c.soft_status = :status', { status: 'pending' })
      .orderBy('g.apply_end_at', 'ASC', 'NULLS LAST')
      .addOrderBy('c.updated_at', 'ASC')
      // take() 가 아니라 limit() 이다. take() 는 DISTINCT 서브쿼리로 감싸는데,
      // 조인한 grants 의 컬럼이 그 바깥으로 안 나가서 정렬이 깨진다.
      .limit(limit)
      .getMany();
    if (pending.length === 0) return [];

    const [grants, profiles] = await Promise.all([
      this.grants.find({ where: { id: In(pending.map((p) => p.grantId)) } }),
      this.profiles.find({
        where: { id: In(pending.map((p) => p.companyProfileId)) },
      }),
    ]);

    const grantMap = new Map(grants.map((g) => [g.id, g]));
    const profileMap = new Map(profiles.map((p) => [p.id, p]));

    const out: { check: EligibilityCheck; grant: Grant; profile: CompanyProfile }[] = [];
    for (const check of pending) {
      const grant = grantMap.get(check.grantId);
      const profile = profileMap.get(check.companyProfileId);
      if (!grant || !profile) continue;

      // 대기 중에 마감된 공고는 처리하지 않는다.
      if (grant.applyEndAt && grant.applyEndAt < now) {
        check.softStatus = 'skipped';
        await this.checks.save(check);
        continue;
      }
      out.push({ check, grant, profile });
    }
    return out;
  }

  /** 로컬 LLM 판정 결과 저장 */
  async saveSoftResult(
    checkId: string,
    payload: {
      status: SoftCheckStatus;
      reasons: EligibilityReason[];
      quotes?: string[];
      model?: string;
    },
  ): Promise<void> {
    await this.checks.update(checkId, {
      softStatus: payload.status,
      softReasons: payload.reasons,
      softQuotes: payload.quotes ?? [],
      softModel: payload.model ?? null,
      softCheckedAt: new Date(),
    });
  }

  /**
   * 기업 정보가 바뀌면 해당 기업의 판정을 전부 무효화한다.
   * (프로필 저장 시 호출)
   */
  async invalidateProfile(companyProfileId: string): Promise<number> {
    const res = await this.checks.delete({ companyProfileId });
    this.logger.log(
      `프로필 변경 — 판정 캐시 ${res.affected ?? 0}건 무효화 (${companyProfileId})`,
    );
    return res.affected ?? 0;
  }

  /** 공고가 수정되면 해당 공고의 판정을 무효화한다. */
  async invalidateGrant(grantId: string): Promise<number> {
    const res = await this.checks.delete({ grantId });
    return res.affected ?? 0;
  }

  /** 특정 조합의 판정 결과 조회 */
  findOne(companyProfileId: string, grantId: string): Promise<EligibilityCheck | null> {
    return this.checks.findOne({ where: { companyProfileId, grantId } });
  }

  /** 테넌트의 판정 요약 — 대시보드용 */
  async summary(tenantId: string): Promise<{
    eligible: number;
    conditional: number;
    ineligible: number;
    unknown: number;
    pendingSoft: number;
  }> {
    const rows = await this.checks.find({ where: { tenantId } });
    return {
      eligible: rows.filter((r) => r.hardLevel === 'eligible').length,
      conditional: rows.filter((r) => r.hardLevel === 'conditional').length,
      ineligible: rows.filter((r) => r.hardLevel === 'ineligible').length,
      unknown: rows.filter((r) => r.hardLevel === 'unknown').length,
      pendingSoft: rows.filter((r) => r.softStatus === 'pending').length,
    };
  }

  /**
   * 로컬 판정 워커 호출.
   *
   * agent 서버가 꺼져 있어도 실패로 처리하지 않는다.
   * 하드 필터 결과는 이미 저장돼 있으므로 화면은 정상 동작하고,
   * 소프트 판정만 다음 기회로 미뤄질 뿐이다.
   */
  async triggerLocalWorker(): Promise<{
    ok: boolean;
    message?: string;
    result?: unknown;
  }> {
    const base = this.configAgentUrl();
    const token = this.configAgentToken();

    try {
      const res = await fetch(base + "/eligibility/analyze", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(token ? { authorization: "Bearer " + token } : {}),
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { ok: false, message: "판정 워커 응답 오류 " + res.status };
      }

      const body = (await res.json()) as {
        ready?: boolean;
        message?: string;
        result?: unknown;
      };

      // 워커는 살아 있어도 모델이 준비되지 않았을 수 있다.
      if (body.ready === false) {
        return { ok: false, message: body.message, result: body.result };
      }
      return { ok: true, result: body.result ?? body };
    } catch (err) {
      this.logger.warn("판정 워커 호출 실패: " + (err as Error).message);
      return {
        ok: false,
        message: "로컬 판정 서버가 꺼져 있습니다. 하드 필터 결과만 표시됩니다.",
      };
    }
  }

  private configAgentUrl(): string {
    return process.env.AGENT_BASE_URL ?? "http://localhost:4100";
  }

  private configAgentToken(): string {
    return process.env.AGENT_TOKEN ?? "";
  }

  /* ────────────── 내부 ────────────── */

  private key(profileId: string, grantId: string): string {
    return `${profileId}:${grantId}`;
  }

  /**
   * 이미 판정한 결과를 그대로 써도 되는지.
   * 공고와 프로필 양쪽이 판정 당시와 같아야 한다.
   */
  private isFresh(
    check: EligibilityCheck,
    grant: Grant,
    profile: CompanyProfile,
  ): boolean {
    return (
      check.grantVersion?.getTime() === grant.updatedAt.getTime() &&
      check.profileVersion?.getTime() === profile.updatedAt.getTime()
    );
  }
}
