import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { businessYearsOf, sortBriefItems } from '@moai/shared';
import type { BriefItem, BriefProfileInput } from '@moai/shared';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { PolicyBrief } from './entities/policy-brief.entity';

/** 8-4-4-4-12 — 형태만 본다. 있는 값인지는 조회가 알려 준다 */
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class PolicyBriefsService {
  constructor(
    @InjectRepository(PolicyBrief)
    private readonly repo: Repository<PolicyBrief>,
    @InjectRepository(CompanyProfile)
    private readonly profiles: Repository<CompanyProfile>,
  ) {}

  /**
   * 목록.
   *
   * 글마다 **나에게 해당하는 항목이 몇 개인지**를 함께 준다. 목록에서
   * "이 글이 나와 상관있나"를 알 수 있어야 열어 볼지 정할 수 있다.
   */
  async list(tenantId?: string) {
    const [rows, profile] = await Promise.all([
      this.repo.find({
        where: { isPublished: true },
        order: { publishedAt: 'DESC' },
      }),
      this.loadProfile(tenantId),
    ]);

    return rows.map((row) => {
      const { mine } = sortBriefItems(this.withIds(row.items), profile);
      return {
        ...this.toDto(row),
        /* 목록에서는 개수만 — 본문을 다 실어 보내면 목록이 무거워진다 */
        items: [] as BriefItem[],
        totalCount: (row.items ?? []).length,
        matchedCount: mine.length,
      };
    });
  }

  /** 글 하나 — 나에게 해당하는 것을 앞으로 갈라서 준다 */
  async findOne(id: string, tenantId?: string) {
    const [row, profile] = await Promise.all([
      this.repo.findOne({ where: { id, isPublished: true } }),
      this.loadProfile(tenantId),
    ]);
    if (!row) throw new NotFoundException('브리핑을 찾을 수 없습니다.');

    const { mine, others } = sortBriefItems(this.withIds(row.items), profile);
    return {
      ...this.toDto(row),
      items: [...mine, ...others],
      matchedIds: mine.map((i) => i.id),
      /*
       * 무엇을 근거로 골랐는지 함께 보낸다. 프로필이 비어 있으면 화면에서
       * "채우면 더 정확해진다"고 안내할 수 있어야 한다.
       */
      basis: {
        stage: profile.stage ?? null,
        years: profile.years ?? null,
        region: profile.region ?? null,
      },
    };
  }

  /** 대시보드용 — 가장 최근 글 하나 */
  async latest(tenantId?: string) {
    const list = await this.list(tenantId);
    return list[0] ?? null;
  }

  private async loadProfile(tenantId?: string): Promise<BriefProfileInput> {
    /*
     * 형태가 아닌 값이 들어오면 조회에서 터진다(500). 그런데 이 값은
     * **개인화를 위한 곁가지**라, 못 읽으면 개인화를 안 하면 그만이다.
     * 글 자체를 못 보게 만들 이유가 없다.
     */
    if (!tenantId || !UUID.test(tenantId)) return {};
    const p = await this.profiles.findOne({
      where: { tenantId, isDefault: true },
    });
    if (!p) return {};
    return {
      stage: p.stage ?? null,
      years: businessYearsOf(p.foundedAt, p.stage),
      region: p.region ?? null,
    };
  }

  /**
   * 항목 id 를 손본다.
   *
   * id 는 손으로 적는 값이라 빠지거나 겹칠 수 있다. 겹치면 `matchedIds` 로
   * 고를 때 엉뚱한 항목이 함께 걸리고, 화면에서도 같은 key 가 되어 순서가
   * 뒤틀린다. 조회할 때마다 훑어 자리 번호로 채운다.
   */
  private withIds(items: BriefItem[]): BriefItem[] {
    const seen = new Set<string>();
    return (items ?? []).map((it, i) => {
      const raw = (it.id ?? '').trim();
      const id = raw && !seen.has(raw) ? raw : `i${i + 1}`;
      seen.add(id);
      return { ...it, id };
    });
  }

  private toDto(row: PolicyBrief) {
    return {
      id: row.id,
      title: row.title,
      source: row.source,
      publishedAt: row.publishedAt,
      summary: row.summary,
      sourceUrl: row.sourceUrl,
      items: this.withIds(row.items),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
