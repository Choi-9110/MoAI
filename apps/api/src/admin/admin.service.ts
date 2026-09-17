import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MEMBER_GRADES } from '@moai/shared';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { SupabaseAdminService } from './supabase-admin.service';

/**
 * 회원 관리.
 *
 * 관리자에게도 **필요한 만큼만** 보여 준다. 회원이 쓴 사업계획서 본문이나
 * 아이디어 원문은 목록에도 상세에도 넣지 않았다 — 회원 관리에 필요한 것은
 * "누가 언제 들어와 무엇을 얼마나 하고 있는가"이지 그 사람이 쓴 글이 아니다.
 * 볼 수 있게 만들어 두면 언젠가 보게 된다.
 */

export interface MemberRow {
  id: string;
  /**
   * 가린 이메일 (admin@drevv.co.kr → adm**@drevv.co.kr).
   *
   * **목록에는 이것만 내려보낸다.** 원본을 내려보내고 화면에서 가리면,
   * 화면을 열어 본 사람은 개발자 도구로 원본을 그대로 볼 수 있다.
   * 애초에 서버가 안 보내면 볼 방법이 없다.
   *
   * 도메인은 남긴다 — 같은 앞글자라도 어디 소속인지는 구별되어야 하고,
   * 그것까지 가리면 관리자가 아무것도 못 한다.
   */
  maskedEmail: string;
  /** 가운데 글자를 가린 이름 (최현근 → 최*근) */
  maskedName: string;
  joinedAt: string;
  grade: string;
  isAdmin: boolean;
  isActive: boolean;
}

export interface MemberDetail extends MemberRow {
  /** 가리지 않은 이메일·이름 — **상세를 연 사람만** 본다 */
  email: string;
  name: string | null;
  tenantId: string;
  company: {
    name: string | null;
    stage: string | null;
    industry: string | null;
    region: string | null;
    foundedAt: string | null;
    employees: number | null;
    revenue: string | null;
  } | null;
  stats: {
    projects: number;
    plansDone: number;
    lastActiveAt: string | null;
  };
}

/**
 * 이메일 가리기.
 *
 * 앞 세 글자만 남기고 골뱅이 앞쪽을 가린다. 도메인은 그대로 둔다 —
 * 어디 소속인지까지 지우면 관리자가 회원을 구별할 수가 없다.
 *
 * 세 글자 이하는 앞 한 글자만 남긴다. 세 글자를 다 남기면 가린 것이 없다.
 */
function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;

  const local = email.slice(0, at);
  const domain = email.slice(at);
  const keep = local.length > 3 ? 3 : 1;

  return `${local.slice(0, keep)}${'*'.repeat(Math.max(local.length - keep, 1))}${domain}`;
}

/**
 * 이름 가리기.
 *
 * 두 글자면 가운데가 없으므로 뒷글자를 가린다(김구 → 김*).
 * 네 글자 이상이면 가운데를 전부 가린다(남궁민수 → 남**수).
 * 한 글자는 가릴 데가 없어 그대로 둔다.
 */
function maskName(name: string | null): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '(이름 없음)';
  if (trimmed.length === 1) return trimmed;
  if (trimmed.length === 2) return `${trimmed[0]}*`;
  return `${trimmed[0]}${'*'.repeat(trimmed.length - 2)}${trimmed[trimmed.length - 1]}`;
}

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(CompanyProfile)
    private readonly companies: Repository<CompanyProfile>,
    private readonly db: DataSource,
    private readonly supabase: SupabaseAdminService,
  ) {}

  private toRow(u: User): MemberRow {
    return {
      id: u.id,
      maskedEmail: maskEmail(u.email),
      maskedName: maskName(u.name),
      joinedAt: u.createdAt.toISOString(),
      grade: u.grade ?? 'free',
      isAdmin: u.isAdmin,
      isActive: u.isActive,
    };
  }

  /** 회원 목록 — 최근 가입 순 */
  async list(
    page = 1,
    limit = 50,
    keyword?: string,
  ): Promise<{ items: MemberRow[]; total: number; page: number; limit: number }> {
    const take = Math.min(Math.max(limit, 1), 200);
    const skip = (Math.max(page, 1) - 1) * take;

    /*
     * 검색은 이메일과 이름 양쪽을 본다. 이름은 화면에서 가려져 있지만
     * 관리자가 아는 실제 이름으로 찾을 수 있어야 한다.
     */
    const where = keyword?.trim()
      ? [
          { email: ILike(`%${keyword.trim()}%`) },
          { name: ILike(`%${keyword.trim()}%`) },
        ]
      : {};

    const [rows, total] = await this.users.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take,
    });

    return { items: rows.map((u) => this.toRow(u)), total, page, limit: take };
  }

  /**
   * 회원 지우기.
   *
   * **되돌릴 수 없다.** 그래서 지우는 범위를 분명히 해 둔다.
   *
   * 사람만 지우면 그 사람이 만든 사업·공고 판정·기업 정보가 주인 없이 남는다.
   * 그래서 **그 워크스페이스에 다른 사람이 없을 때는 워크스페이스째** 지운다.
   * 남은 사람이 있으면 사람만 지운다 — 남의 자료까지 날리면 안 되기 때문이다.
   *
   * **로그인 계정(Supabase)도 함께 지운다.** 그러려면 서버에 `service_role`
   * 열쇠가 있어야 하는데, 없으면 그 부분만 건너뛰고 나머지는 그대로 지운다 —
   * 열쇠가 없다고 회원 삭제 자체를 실패시키면 더 나쁘다. 건너뛰었는지는
   * `authRemoved` 로 돌려주어 화면이 그대로 말해 줄 수 있게 한다.
   */
  async removeMember(
    id: string,
    actorUserId: string,
  ): Promise<{
    deleted: true;
    alsoRemovedWorkspace: boolean;
    authRemoved: boolean;
    email: string;
  }> {
    if (id === actorUserId) {
      // 자기를 지우면 그 뒤로 아무도 관리자 화면에 못 들어온다
      throw new ForbiddenException('자기 계정은 지울 수 없습니다.');
    }

    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('회원을 찾을 수 없습니다.');

    const siblings = await this.users.count({
      where: { tenantId: user.tenantId },
    });
    const lastOne = siblings <= 1;

    /*
     * 한 묶음으로 지운다. 중간에 실패하면 되돌린다 —
     * 사업만 지워지고 사람은 남는 어중간한 상태를 만들지 않기 위해서다.
     */
    await this.db.transaction(async (tx) => {
      if (lastOne) {
        // 이 워크스페이스에 딸린 것 전부
        for (const table of [
          'projects',
          'company_profiles',
          'eligibility_checks',
          'saved_grants',
          'usage_events',
          'knowledge',
          'jobs',
        ]) {
          await tx.query(`delete from ${table} where tenant_id = $1`, [
            user.tenantId,
          ]);
        }
      } else {
        // 남은 사람이 있으므로 이 사람이 만든 것만
        await tx.query('delete from projects where user_id = $1', [id]);
        await tx.query('delete from saved_grants where user_id = $1', [id]);
      }

      await tx.query('delete from users where id = $1', [id]);

      if (lastOne) {
        await tx.query('delete from tenants where id = $1', [user.tenantId]);
      }
    });

    /*
     * 로그인 계정은 **우리 DB 를 지운 뒤에** 지운다.
     *
     * 순서를 뒤집으면, 로그인 계정만 사라지고 DB 삭제가 실패했을 때
     * 들어올 수 없는 회원이 남는다. 이 순서면 최악이라도 "앱에서는 지워졌고
     * 로그인 계정만 남은" 상태여서, 사람이 손으로 마무리할 수 있다.
     */
    const authRemoved = await this.supabase.deleteAuthUser(user.authUserId);

    return {
      deleted: true,
      alsoRemovedWorkspace: lastOne,
      authRemoved,
      email: user.email,
    };
  }

  /**
   * 등급 바꾸기.
   *
   * 결제가 붙기 전까지는 **관리자가 손으로 정한다.** 나중에 결제가 들어오면
   * 이 자리를 결제 결과가 대신하게 되는데, 그때도 관리자 손조작은 남겨 둔다 —
   * 환불·보상·시연처럼 결제 밖에서 등급을 줘야 하는 일이 늘 생긴다.
   */
  async setGrade(id: string, grade: string): Promise<MemberDetail> {
    if (!(MEMBER_GRADES as readonly string[]).includes(grade)) {
      throw new BadRequestException(`알 수 없는 등급입니다: ${grade}`);
    }

    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('회원을 찾을 수 없습니다.');

    await this.users.update(id, { grade });
    return this.detail(id);
  }

  /** 회원 한 명 — 기업 정보와 활동량까지 */
  async detail(id: string): Promise<MemberDetail> {
    const user = await this.users.findOne({ where: { id } });
    if (!user) throw new NotFoundException('회원을 찾을 수 없습니다.');

    const company = await this.companies.findOne({
      where: { tenantId: user.tenantId },
    });

    const projects = await this.projects.find({
      where: { tenantId: user.tenantId },
      order: { updatedAt: 'DESC' },
    });

    return {
      ...this.toRow(user),
      email: user.email,
      name: user.name,
      tenantId: user.tenantId,
      company: company
        ? {
            name: company.name ?? null,
            stage: company.stage ?? null,
            industry: company.industry ?? null,
            region: company.region ?? null,
            foundedAt: company.foundedAt ?? null,
            employees: company.employees ?? null,
            revenue: company.annualRevenue ?? null,
          }
        : null,
      stats: {
        projects: projects.length,
        plansDone: projects.filter((p) => p.planStatus === 'done').length,
        lastActiveAt: projects[0]?.updatedAt?.toISOString() ?? null,
      },
    };
  }
}
