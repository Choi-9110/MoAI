import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { resolveGrantStatus } from '@moai/shared';
import type { CalendarItem, GrantOutcome } from '@moai/shared';
import { CalendarService } from '../grants/calendar.service';
import { EligibilityService } from '../grants/eligibility.service';
import { Grant } from '../grants/entities/grant.entity';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { SavedGrant } from './entities/saved-grant.entity';

/**
 * 관심 공고 관리.
 *
 * 토글 방식이다 — 같은 공고를 다시 저장하면 해제된다.
 * 화면의 별 버튼이 그대로 이 동작에 대응한다.
 */
@Injectable()
export class SavedGrantsService {
  constructor(
    @InjectRepository(SavedGrant)
    private readonly saved: Repository<SavedGrant>,
    @InjectRepository(Grant) private readonly grants: Repository<Grant>,
    @InjectRepository(CompanyProfile)
    private readonly profiles: Repository<CompanyProfile>,
    private readonly eligibility: EligibilityService,
    private readonly calendar: CalendarService,
  ) {}

  /** 별 토글 — 없으면 저장, 있으면 해제 */
  async toggle(input: {
    tenantId: string;
    grantId: string;
    userId?: string;
  }): Promise<{ saved: boolean; keptForOutcome?: boolean }> {
    const existing = await this.saved.findOne({
      where: { tenantId: input.tenantId, grantId: input.grantId },
    });

    if (existing) {
      /*
       * **지원 이력이 붙은 것은 별을 눌러도 지우지 않는다.**
       *
       * 별 해제는 삭제인데, 여기에는 "이 사업에 선정됐다" 는 기록이 같이
       * 들어 있다. 그것이 사라지면 중복 수혜 제한을 걸러 줄 근거가 없어지고,
       * 사용자는 무엇을 지웠는지도 모른 채 지운 것이 된다. 결과를 먼저
       * 지우면 그때는 뺄 수 있다.
       */
      if (existing.outcome) {
        return { saved: true, keptForOutcome: true };
      }
      await this.saved.remove(existing);
      return { saved: false };
    }

    await this.saved.save(
      this.saved.create({
        tenantId: input.tenantId,
        grantId: input.grantId,
        userId: input.userId ?? null,
      }),
    );
    return { saved: true };
  }

  /**
   * 지원 결과를 적는다.
   *
   * 별을 안 눌러 둔 공고여도 받는다 — 그때는 **함께 담는다.** 결과까지 적은
   * 공고가 목록에서 빠져 있으면 나중에 다시 찾을 방법이 없기 때문이다.
   *
   * `null` 을 주면 기록을 지운다.
   */
  async setOutcome(input: {
    tenantId: string;
    grantId: string;
    outcome: GrantOutcome | null;
    userId?: string;
  }): Promise<SavedGrant> {
    /*
     * 없는 공고에는 기록을 남기지 않는다.
     *
     * 남겨도 목록에는 안 나온다(공고를 못 찾아 걸러진다). 그래서 사용자는
     * "적었는데 안 보인다"가 되고, 표에는 아무도 못 보는 줄이 쌓인다.
     * 중복 수혜를 볼 때도 제목이 없어 쓸모가 없다.
     */
    const exists = await this.grants.findOne({
      where: { id: input.grantId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('공고를 찾을 수 없습니다.');

    const existing = await this.saved.findOne({
      where: { tenantId: input.tenantId, grantId: input.grantId },
    });

    const row =
      existing ??
      this.saved.create({
        tenantId: input.tenantId,
        grantId: input.grantId,
        userId: input.userId ?? null,
      });

    row.outcome = input.outcome;
    // 지울 때는 시점도 같이 지운다 — 남겨 두면 "언제 무엇" 이 어긋난다
    row.outcomeAt = input.outcome ? new Date() : null;

    return this.saved.save(row);
  }

  /**
   * 지원받은 사업들 — 중복 수혜 제한을 볼 때 쓴다.
   */
  async wonGrants(tenantId: string): Promise<{ title: string; at: Date | null }[]> {
    const rows = await this.saved.find({
      where: { tenantId, outcome: 'won' },
      order: { outcomeAt: 'DESC' },
    });
    if (rows.length === 0) return [];

    const grants = await this.grants.find({
      where: { id: In(rows.map((r) => r.grantId)) },
      select: { id: true, title: true },
    });
    const titleOf = new Map(grants.map((g) => [g.id, g.title]));

    return rows.map((r) => ({
      title: titleOf.get(r.grantId) ?? '(삭제된 공고)',
      at: r.outcomeAt,
    }));
  }

  /**
   * 저장한 공고 ID 목록.
   * 화면에서 별을 채울지 판단할 때 쓰므로 가볍게 ID 만 준다.
   */
  async idsOf(tenantId: string): Promise<string[]> {
    const rows = await this.saved.find({
      where: { tenantId },
      select: { grantId: true },
    });
    return rows.map((r) => r.grantId);
  }

  /**
   * 관심 공고 목록 — 판정 결과까지 붙여서.
   * 마감이 지난 것은 뒤로 밀되 목록에서 지우지는 않는다
   * (놓친 공고를 확인하는 것도 정보다).
   */
  async list(tenantId: string): Promise<CalendarItem[]> {
    const rows = await this.saved.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    if (rows.length === 0) return [];

    const [grants, profile] = await Promise.all([
      this.grants.find({ where: { id: In(rows.map((r) => r.grantId)) } }),
      this.profiles.findOne({ where: { tenantId, isDefault: true } }),
    ]);

    /** 공고별 지원 결과 — 위에서 이미 읽어 온 것을 다시 부르지 않는다 */
    const outcomeOf = new Map(rows.map((r) => [r.grantId, r.outcome]));

    const now = new Date();
    const items = grants.map((row) => {
      const { status, dDay } = resolveGrantStatus(
        row.applyStartAt?.toISOString() ?? null,
        row.applyEndAt?.toISOString() ?? null,
        now,
      );
      return {
        grant: this.calendar.toPublicDto(row),
        status,
        dDay,
        eligibility: this.eligibility.evaluate(row, profile),
        // 관심 목록이므로 전부 관심 공고다.
        saved: true,
        outcome: outcomeOf.get(row.id) ?? null,
      };
    });

    // 접수 중인 것을 마감 임박순으로 먼저, 마감된 것은 뒤로
    return items.sort((a, b) => {
      const aClosed = (a.dDay ?? 0) < 0;
      const bClosed = (b.dDay ?? 0) < 0;
      if (aClosed !== bClosed) return aClosed ? 1 : -1;
      return (a.dDay ?? 9999) - (b.dDay ?? 9999);
    });
  }

  /**
   * 관심 공고에서 뺀다.
   *
   * **지원 이력이 붙은 것은 빼지 않는다.** `toggle` 에만 이 보호를 두고
   * 여기를 놔두면, 같은 일이 다른 문으로 들어와 기록을 지운다. 화면이
   * 지금은 이 길을 안 쓰더라도 API 는 열려 있다.
   */
  async remove(tenantId: string, grantId: string): Promise<{ removed: boolean }> {
    const row = await this.saved.findOne({ where: { tenantId, grantId } });
    if (!row) return { removed: false };
    if (row.outcome) return { removed: false };

    await this.saved.remove(row);
    return { removed: true };
  }
}
