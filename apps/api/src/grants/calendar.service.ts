import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ArrayContains, Between, In, IsNull, MoreThan, Not, Repository,
} from 'typeorm';
import {
  GRANT_STAGE_YEARS, PROFILE_FIELD_LABELS, resolveGrantStatus,
} from '@moai/shared';
import type {
  CalendarDay, CalendarItem, CalendarMonth, Eligibility, EligibilityLevel,
  Grant as GrantDto, GrantCategory, GrantOutcome, GrantStage, UnlockHint,
} from '@moai/shared';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { EligibilityService } from './eligibility.service';
import { EligibilityCheck } from './entities/eligibility-check.entity';
import { SavedGrant } from '../saved-grants/entities/saved-grant.entity';
import { Grant } from './entities/grant.entity';

export interface CalendarQuery {
  year: number;
  month: number;
  tenantId?: string;
  profileId?: string;
  categories?: GrantCategory[];
  /** 공고가 겨냥하는 창업 단계 */
  stages?: GrantStage[];
  /** 지원 가능한 공고만 보기 */
  eligibleOnly?: boolean;
}

/**
 * 공고 캘린더.
 *
 * 마감일을 기준으로 공고를 날짜에 배치하고,
 * 기업 프로필과 대조한 지원 가능 여부를 함께 붙여 반환한다.
 */
/**
 * 돈이 오가는 유형.
 *
 * 원본에 금액 칸이 없어 액수로는 못 가른다. 대신 **무슨 종류의 사업인지**로
 * 가른다 — 사업화 자금이나 R&D 는 돈을 주는 쪽이고, 공모전·교육은 아니다.
 */
const MONEY_CATEGORIES = new Set<GrantCategory>([
  'funding', 'rnd', 'loan', 'startup', 'voucher',
]);

@Injectable()
export class CalendarService {
  constructor(
    @InjectRepository(Grant) private readonly grants: Repository<Grant>,
    @InjectRepository(CompanyProfile)
    private readonly profiles: Repository<CompanyProfile>,
    @InjectRepository(EligibilityCheck)
    private readonly checks: Repository<EligibilityCheck>,
    @InjectRepository(SavedGrant)
    private readonly saved: Repository<SavedGrant>,
    private readonly eligibility: EligibilityService,
  ) {}

  /**
   * 이 워크스페이스가 별표해 둔 공고 id.
   *
   * 화면에서 따로 한 번 더 불러오지 않도록 캘린더 응답에 같이 실어 준다.
   * 대시보드는 이 값으로 거른다.
   */
  /**
   * 담아 둔 공고와 **거기 적힌 지원 결과**.
   *
   * 둘을 따로 부르면 한쪽만 부르는 화면이 생긴다. 같은 표에서 오는 값이라
   * 한 번에 읽어 함께 돌려준다.
   */
  private async savedState(tenantId?: string): Promise<{
    ids: Set<string>;
    outcomes: Map<string, GrantOutcome | null>;
  }> {
    if (!tenantId) return { ids: new Set(), outcomes: new Map() };
    const rows = await this.saved.find({
      where: { tenantId },
      select: { grantId: true, outcome: true },
    });
    return {
      ids: new Set(rows.map((r) => r.grantId)),
      outcomes: new Map(rows.map((r) => [r.grantId, r.outcome])),
    };
  }

  /**
   * 로드맵 한 칸에 딸린, **지금 낼 수 있는 공고**.
   *
   * "초기창업패키지" 같은 단계 이름만 보여 주면 그래서 지금 뭘 하라는 건지
   * 알 수 없다. 그 단계에 해당하는 공고가 **지금 열려 있는지**를 함께
   * 보여야 다음 걸음이 정해진다.
   *
   * **돈이 되는 것부터 몇 개만.** 조건에 걸리는 것을 다 늘어놓으면 목록이
   * 되어 버리고, 그건 이미 지원사업 화면이 하는 일이다.
   *
   * 금액으로 줄 세우고 싶었지만 **원본에 금액 칸이 없다.** K-Startup API 는
   * 공고명·기관·대상만 주고 지원금은 안 준다. 본문에서 뽑아 보면 접수 중
   * 765건 가운데 113건에만 숫자가 있고, 그마저 `500억원, 800만원` 처럼
   * 매출 기준과 지원금이 섞여 나온다. 잘못 뽑은 금액은 없느니만 못하다.
   *
   * 그래서 **유형으로 가른다.** 사업화 자금·R&D·융자·창업지원은 돈이
   * 오가는 쪽이고, 행사나 교육은 그렇지 않다.
   */
  async relatedToStep(query: {
    keyword?: string;
    categories?: GrantCategory[];
    tenantId?: string;
    limit?: number;
  }): Promise<CalendarItem[]> {
    const take = Math.min(Math.max(query.limit ?? 4, 1), 10);
    const now = new Date();

    const qb = this.grants
      .createQueryBuilder('g')
      .where('g.is_active = true')
      .andWhere('g.apply_end_at > :now', { now });

    /*
     * 이름과 유형 중 **하나라도** 맞으면 가져온다. 둘 다 요구하면 이름이
     * 조금만 달라도 아무것도 안 나오는데, 공고 제목은 해마다 바뀐다.
     */
    if (query.keyword && query.categories?.length) {
      qb.andWhere('(g.title ILIKE :kw OR g.category IN (:...cats))', {
        kw: `%${query.keyword}%`,
        cats: query.categories,
      });
    } else if (query.keyword) {
      qb.andWhere('g.title ILIKE :kw', { kw: `%${query.keyword}%` });
    } else if (query.categories?.length) {
      qb.andWhere('g.category IN (:...cats)', { cats: query.categories });
    }

    /*
     * 이름이 맞는 것을 금액보다 먼저 놓는다 — "초기창업패키지" 를 보다가
     * 이름이 다른 큰 사업이 위에 오면 엉뚱한 곳을 보게 된다.
     */
    if (query.keyword) {
      qb.addSelect(
        'CASE WHEN g.title ILIKE :kw THEN 0 ELSE 1 END',
        'name_hit',
      ).orderBy('name_hit', 'ASC');
      qb.addOrderBy('g.apply_end_at', 'ASC');
    } else {
      qb.orderBy('g.apply_end_at', 'ASC');
    }

    const rows = await qb.take(take * 3).getMany();
    if (rows.length === 0) return [];

    const profile = await this.resolveProfile({ tenantId: query.tenantId });
    const softs = await this.loadSoftChecks(profile, rows.map((r) => r.id));
    const saved = await this.savedState(query.tenantId);

    const items = rows.map((row) => {
      const { status, dDay } = resolveGrantStatus(
        row.applyStartAt?.toISOString() ?? null,
        row.applyEndAt?.toISOString() ?? null,
        now,
      );
      return {
        grant: this.toPublicDto(row),
        status,
        dDay,
        eligibility: this.mergeSoft(
          this.eligibility.evaluate(row, profile),
          softs.get(row.id),
        ),
        saved: saved.ids.has(row.id),
        outcome: saved.outcomes.get(row.id) ?? null,
      };
    });

    /*
     * 넣을 수 있는 것을 앞으로, 그다음 돈이 되는 유형을 앞으로.
     * 못 넣는 공고는 김만 빠지게 하고, 행사·교육은 지금 볼 것이 아니다.
     */
    const byLevel = (i: CalendarItem) =>
      i.eligibility.level === 'eligible' ? 0
        : i.eligibility.level === 'ineligible' ? 2 : 1;
    const byMoney = (i: CalendarItem) =>
      MONEY_CATEGORIES.has(i.grant.category) ? 0 : 1;

    return items
      .sort((a, b) => byLevel(a) - byLevel(b) || byMoney(a) - byMoney(b))
      .slice(0, take);
  }

  /**
   * 첫 화면에 쓰는 숫자.
   *
   * 세 개만 준다. 더 늘어놓으면 그중 무엇이 중요한지 알 수 없게 된다.
   */
  async publicStats(): Promise<{
    open: number;
    closingThisWeek: number;
    agencies: number;
  }> {
    const now = new Date();
    const week = new Date(now.getTime() + 7 * 86_400_000);

    const [open, closingThisWeek, agencies] = await Promise.all([
      this.grants.count({
        where: { isActive: true, applyEndAt: MoreThan(now) },
      }),
      this.grants.count({
        where: { isActive: true, applyEndAt: Between(now, week) },
      }),
      this.grants
        .createQueryBuilder('g')
        .select('COUNT(DISTINCT g.agency)', 'c')
        .where('g.is_active = true')
        .getRawOne<{ c: string }>()
        .then((r) => Number(r?.c ?? 0)),
    ]);

    return { open, closingThisWeek, agencies };
  }

  /**
   * 어제 새로 올라온 공고.
   *
   * **몰아서 주지 않는다.** 쌓아 두었다가 한 번에 스무 건을 내밀면 사람은
   * 그날 하루도 안 본다. 하루치만, 대신 매일 준다.
   *
   * **기간을 정확히 적어 준다.** "어제"라고만 하면 정확히 언제부터인지 알 수
   * 없다 — 수집은 새벽에 도는데 사람은 낮에 보기 때문이다. 그래서 마지막으로
   * 들어온 시각을 끝으로 잡고, 그로부터 24시간 전을 시작으로 준다.
   *
   * 전체 건수와 **내 조건에 맞는 건수**를 함께 센다. 사람이 알고 싶은 것은
   * "몇 건 올라왔나"가 아니라 "그중 내가 넣을 수 있는 게 있나"다.
   */
  async fresh(query: {
    tenantId?: string;
    profileId?: string;
    /** 몇 시간치로 볼 것인가 */
    hours?: number;
  }): Promise<{
    from: string | null;
    to: string | null;
    total: number;
    matched: number;
    items: CalendarItem[];
  }> {
    /* 마지막으로 들어온 시각 — 수집이 언제 돌았는지가 곧 기준이다 */
    const latest = await this.grants.findOne({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
      select: { createdAt: true },
    });

    if (!latest?.createdAt) {
      return { from: null, to: null, total: 0, matched: 0, items: [] };
    }

    const to = latest.createdAt;
    const from = new Date(to.getTime() - (query.hours ?? 24) * 3_600_000);

    const rows = await this.grants.find({
      where: {
        isActive: true,
        createdAt: Between(from, to),
        /* 이미 끝난 공고를 새 소식이라고 내밀면 안 된다 */
        applyEndAt: MoreThan(new Date()),
      },
      order: { applyEndAt: 'ASC' },
      take: 200,
    });

    const profile = await this.resolveProfile(query);
    const softs = await this.loadSoftChecks(profile, rows.map((r) => r.id));
    const saved = await this.savedState(query.tenantId);

    const now = new Date();
    const items: CalendarItem[] = rows.map((row) => {
      const { status, dDay } = resolveGrantStatus(
        row.applyStartAt?.toISOString() ?? null,
        row.applyEndAt?.toISOString() ?? null,
        now,
      );
      return {
        grant: this.toPublicDto(row),
        status,
        dDay,
        eligibility: this.mergeSoft(
          this.eligibility.evaluate(row, profile),
          softs.get(row.id),
        ),
        saved: saved.ids.has(row.id),
        outcome: saved.outcomes.get(row.id) ?? null,
      };
    });

    const mine = items.filter((i) => i.eligibility.level === 'eligible');

    return {
      from: from.toISOString(),
      to: to.toISOString(),
      total: items.length,
      matched: mine.length,
      /* 맞는 것을 앞에 둔다 — 화면은 몇 개만 보여 준다 */
      items: [...mine, ...items.filter((i) => i.eligibility.level !== 'eligible')],
    };
  }

  async month(query: CalendarQuery): Promise<CalendarMonth> {
    const { year, month } = query;

    // 해당 월의 1일 00:00 ~ 말일 23:59:59
    const from = new Date(year, month - 1, 1, 0, 0, 0);
    const to = new Date(year, month, 0, 23, 59, 59);

    const profile = await this.resolveProfile(query);

    /*
     * 단계는 `where` 하나로 못 짠다. 조건이 서로 다른 열에 걸리기 때문이다 —
     * `any` 는 상한이 비어 있는 것이고, `preliminary` 는 연수가 아니라
     * 지원 대상에 예비창업자가 들어 있는지로 갈린다. 그래서 조건마다
     * `where` 를 하나씩 만들어 OR 로 묶는다(TypeORM 은 배열이 OR 이다).
     */
    const base = {
      isActive: true,
      applyEndAt: Between(from, to),
      ...(query.categories?.length ? { category: In(query.categories) } : {}),
    };

    const where = buildStageWhere(base, query.stages);

    const rows = await this.grants.find({
      where,
      order: { applyEndAt: 'ASC' },
    });

    const softs = await this.loadSoftChecks(profile, rows.map((r) => r.id));
    const saved = await this.savedState(query.tenantId);

    const now = new Date();
    const buckets = new Map<string, CalendarItem[]>();
    const summary = {
      total: 0, eligible: 0, conditional: 0, ineligible: 0, unknown: 0, saved: 0,
    };

    for (const row of rows) {
      const verdict = this.mergeSoft(
        this.eligibility.evaluate(row, profile),
        softs.get(row.id),
      );

      if (query.eligibleOnly && verdict.level === 'ineligible') continue;

      const { status, dDay } = resolveGrantStatus(
        row.applyStartAt?.toISOString() ?? null,
        row.applyEndAt?.toISOString() ?? null,
        now,
      );

      const item: CalendarItem = {
        grant: this.toDto(row),
        status,
        dDay,
        eligibility: verdict,
        saved: saved.ids.has(row.id),
      outcome: saved.outcomes.get(row.id) ?? null,
      };

      const key = this.dateKey(row.applyEndAt!);
      const bucket = buckets.get(key);
      if (bucket) bucket.push(item);
      else buckets.set(key, [item]);

      summary.total += 1;
      summary[verdict.level as EligibilityLevel] += 1;
      if (item.saved) summary.saved += 1;
    }

    const days: CalendarDay[] = [...buckets.entries()]
      .map(([date, items]) => ({ date, items }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return { year, month, days, summary };
  }

  /**
   * 마감 임박 공고 (기본 14일 이내).
   * 캘린더 상단 요약이나 알림에 쓴다.
   */
  async upcoming(query: {
    days?: number;
    tenantId?: string;
    profileId?: string;
  }): Promise<CalendarItem[]> {
    const span = query.days ?? 14;
    const now = new Date();
    const until = new Date(now.getTime() + span * 86_400_000);

    const profile = await this.resolveProfile(query);

    const rows = await this.grants.find({
      where: {
        isActive: true,
        applyEndAt: Between(now, until),
      },
      order: { applyEndAt: 'ASC' },
      take: 50,
    });

    const softs = await this.loadSoftChecks(profile, rows.map((r) => r.id));
    const saved = await this.savedState(query.tenantId);

    return rows.map((row) => {
      const { status, dDay } = resolveGrantStatus(
        row.applyStartAt?.toISOString() ?? null,
        row.applyEndAt?.toISOString() ?? null,
        now,
      );
      return {
        grant: this.toDto(row),
        status,
        dDay,
        eligibility: this.mergeSoft(
          this.eligibility.evaluate(row, profile),
          softs.get(row.id),
        ),
        saved: saved.ids.has(row.id),
      outcome: saved.outcomes.get(row.id) ?? null,
      };
    });
  }

  /** 공고 1건의 판정 상세 */
  async explain(
    grantId: string,
    query: { tenantId?: string; profileId?: string },
  ): Promise<CalendarItem | null> {
    const row = await this.grants.findOne({ where: { id: grantId } });
    if (!row) return null;

    const profile = await this.resolveProfile(query);
    const now = new Date();
    const { status, dDay } = resolveGrantStatus(
      row.applyStartAt?.toISOString() ?? null,
      row.applyEndAt?.toISOString() ?? null,
      now,
    );

    const softs = await this.loadSoftChecks(profile, [row.id]);
    const saved = await this.savedState(query.tenantId);

    return {
      grant: this.toDto(row),
      status,
      dDay,
      eligibility: this.mergeSoft(
        this.eligibility.evaluate(row, profile),
        softs.get(row.id),
      ),
      saved: saved.ids.has(row.id),
      outcome: saved.outcomes.get(row.id) ?? null,
    };
  }

  /* ────────────── 내부 ────────────── */

  /**
   * 저장된 소프트 판정(로컬 Claude)을 불러온다.
   *
   * 하드 필터는 요청마다 다시 계산해도 싸지만, 모델 판정은 그렇지 않다.
   * 그래서 워커가 미리 돌려 둔 결과를 여기서 꺼내 붙인다.
   */
  private async loadSoftChecks(
    profile: CompanyProfile | null,
    grantIds: string[],
  ): Promise<Map<string, EligibilityCheck>> {
    if (!profile || grantIds.length === 0) return new Map();

    const rows = await this.checks.find({
      where: { companyProfileId: profile.id, grantId: In(grantIds) },
    });
    return new Map(rows.map((r) => [r.grantId, r]));
  }

  /**
   * 하드 판정에 모델 판정을 얹는다.
   *
   * 방향은 한쪽이다 — 모델은 조건을 **추가**할 수만 있고,
   * 코드가 내린 판정을 뒤집어 통과시키지는 못한다.
   * 모델이 틀렸을 때 "지원 가능"으로 잘못 올라가는 쪽이 더 위험하기 때문이다.
   */
  private mergeSoft(
    hard: Eligibility,
    check: EligibilityCheck | undefined,
  ): Eligibility {
    // 아직 판정 전이거나 볼 것이 없으면 그대로 둔다.
    if (!check || check.softStatus === 'pending' || check.softStatus === 'skipped') {
      return hard;
    }
    if (!check.softReasons?.length) return hard;

    const reasons = [...hard.reasons, ...check.softReasons];
    const checked = reasons.length;
    const passed = reasons.filter((r) => r.verdict === 'pass').length;
    const failed = reasons.filter((r) => r.verdict === 'fail').length;
    const unknown = reasons.filter((r) => r.verdict === 'unknown').length;

    let level: EligibilityLevel;
    if (failed > 0) level = 'ineligible';
    else if (unknown === checked) level = 'unknown';
    else if (unknown > 0) level = 'conditional';
    else level = 'eligible';

    return { ...hard, level, passed, checked, reasons };
  }

  /**
   * "이것만 답하면 N건 확정돼요."
   *
   * 접수 중인 공고를 전부 판정해 보고, 확인 필요로 남은 이유 중 **내 정보의
   * 빈 칸** 때문인 것을 칸별로 센다. 사용자는 효과 큰 칸부터 하나씩 채우면
   * 된다 — 무엇을 왜 입력해야 하는지 모르는 채로 긴 폼을 채우지 않게 한다.
   *
   * 공고 쪽이 모호해 모르는 것(원문 확인 필요, 연령 경계)은 세지 않는다.
   * 채워도 안 풀리는 것을 권하면 신뢰만 잃는다.
   */
  async unlockHints(query: {
    tenantId?: string;
    profileId?: string;
  }): Promise<UnlockHint[]> {
    const profile = await this.resolveProfile(query);
    if (!profile) return [];

    const now = new Date();
    const rows = await this.grants
      .createQueryBuilder('g')
      .where('g.is_active = true')
      .andWhere('(g.apply_end_at IS NULL OR g.apply_end_at >= :now)', { now })
      .getMany();

    const blocked = new Map<string, number>();
    const resolves = new Map<string, number>();

    for (const row of rows) {
      const verdict = this.eligibility.evaluate(row, profile);
      if (verdict.level !== 'conditional' && verdict.level !== 'unknown') continue;

      const unknowns = verdict.reasons.filter((r) => r.verdict === 'unknown');
      const fields = new Set(
        unknowns.map((r) => r.profileField).filter((f): f is string => !!f),
      );
      for (const f of fields) blocked.set(f, (blocked.get(f) ?? 0) + 1);

      // 남은 확인이 모두 이 한 칸 때문일 때만 "이것만 채우면 끝"이다
      if (fields.size === 1 && unknowns.every((r) => r.profileField)) {
        const [only] = fields;
        resolves.set(only, (resolves.get(only) ?? 0) + 1);
      }
    }

    return [...blocked.entries()]
      .map(([field, count]) => ({
        field,
        label: PROFILE_FIELD_LABELS[field] ?? field,
        blocked: count,
        resolves: resolves.get(field) ?? 0,
      }))
      .sort((a, b) => b.resolves - a.resolves || b.blocked - a.blocked);
  }

  /** profileId 가 있으면 그것을, 없으면 테넌트의 기본 프로필을 쓴다. */
  private async resolveProfile(query: {
    tenantId?: string;
    profileId?: string;
  }): Promise<CompanyProfile | null> {
    if (query.profileId) {
      return this.profiles.findOne({ where: { id: query.profileId } });
    }
    if (query.tenantId) {
      return this.profiles.findOne({
        where: { tenantId: query.tenantId, isDefault: true },
      });
    }
    return null;
  }

  private dateKey(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** 수집 시 보관해 둔 원문 부가 정보를 화면용으로 꺼낸다 */
  private toDetail(row: Grant): GrantDto["detail"] {
    const m = (row.rawMetadata ?? {}) as Record<string, unknown>;
    const str = (v: unknown): string | null =>
      typeof v === "string" && v.trim() ? v.trim() : null;

    const methods = (m.applyMethods ?? {}) as Record<string, unknown>;

    const detail = {
      // 정식 컬럼을 우선 쓴다 — 백필로 HTML 엔티티가 풀린 값이다
      applyTargetDetail: row.applyTargetDetail ?? str(m.applyTargetDetail),
      excludeTarget: row.excludeTarget ?? str(m.excludeTarget),
      targetAge: str(m.targetAge),
      preferential: str(m.preferential),
      contact: str(m.contact),
      department: str(m.department),
      rawCategory: str(m.rawCategory),
      rawRegion: str(m.rawRegion),
      rawBusinessYears: str(m.rawBusinessYears),
      applyOnlineUrl: str(methods.online),
      guideUrl: str(m.guideUrl),
    };

    // 전부 비어 있으면 아예 내려보내지 않는다
    return Object.values(detail).some(Boolean) ? detail : undefined;
  }

  /** 다른 모듈에서도 같은 형태로 내려보내기 위해 공개한다 */
  toPublicDto(row: Grant): GrantDto {
    return this.toDto(row);
  }

  private toDto(row: Grant): GrantDto {
    return {
      id: row.id,
      title: row.title,
      agency: row.agency,
      agencyType: row.agencyType,
      category: row.category,
      summary: row.summary,
      applyStartAt: row.applyStartAt?.toISOString() ?? null,
      applyEndAt: row.applyEndAt?.toISOString() ?? null,
      amountMin: row.amountMin != null ? Number(row.amountMin) : null,
      amountMax: row.amountMax != null ? Number(row.amountMax) : null,
      targetRegions: row.targetRegions,
      targetIndustries: row.targetIndustries,
      minBusinessYears: row.minBusinessYears,
      maxBusinessYears: row.maxBusinessYears,
      maxEmployees: row.maxEmployees,
      maxRevenue: row.maxRevenue != null ? Number(row.maxRevenue) : null,
      requiredCertifications: row.requiredCertifications,
      minAge: row.minAge,
      maxAge: row.maxAge,
      corporationOnly: row.corporationOnly,
      sourceUrl: row.sourceUrl,
      sourceApi: row.sourceApi,
      detail: this.toDetail(row),
    };
  }
}

/**
 * 단계 조건을 `where` 배열(OR)로 바꾼다.
 *
 * 고른 것이 없으면 조건을 걸지 않는다 — 전부 보여 주는 것이 기본이다.
 */
function buildStageWhere(
  base: Record<string, unknown>,
  stages: GrantStage[] | undefined,
): Record<string, unknown> | Record<string, unknown>[] {
  if (!stages?.length) return base;

  const parts: Record<string, unknown>[] = [];

  for (const stage of stages) {
    if (stage === 'any') {
      // 업력 제한이 아예 없는 공고 — 열린 공고의 78% 가 여기다
      parts.push({ ...base, maxBusinessYears: IsNull() });
      continue;
    }
    if (stage === 'preliminary') {
      /*
       * 예비창업은 연수로 세지 않는다. 0년으로 걸면 "3년 이내" 공고에도
       * 예비창업자가 들어갈 수 있다는 사실이 지워진다.
       */
      parts.push({ ...base, applicantTypes: ArrayContains(['preliminary']) });
      continue;
    }
    const span = GRANT_STAGE_YEARS[stage];
    if (span) parts.push({ ...base, maxBusinessYears: Between(span[0], span[1]) });
  }

  return parts.length ? parts : base;
}
