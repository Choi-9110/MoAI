import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import type { AuthUser } from './supabase-auth.service';

/** 요청에 실려 다니는 로그인 정보 */
export interface AuthContext {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  authUserId: string;
  /**
   * 서비스 관리자인가.
   *
   * 화면이 관리 메뉴를 보여줄지 정하는 데만 쓴다. **막는 것은 서버가 한다**
   * (`AdminGuard`) — 브라우저가 들고 있는 값은 고칠 수 있기 때문이다.
   */
  isAdmin: boolean;
}

/**
 * 로그인한 사람을 우리 도메인 사용자와 잇는다.
 *
 * Supabase 는 인증만 맡는다. 테넌트·프로필·사업 같은 것은 우리 DB 에 있고,
 * 그 둘을 잇는 것이 이 서비스다. 처음 들어온 사람이면 워크스페이스를
 * 함께 만들어 준다 — 가입 절차를 따로 두지 않기 위함이다.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
  ) {}

  async resolve(auth: AuthUser): Promise<AuthContext> {
    const email = auth.email.trim().toLowerCase();

    // 같은 사람이 다른 기기에서 들어와도 authUserId 로 먼저 찾는다.
    let user =
      (await this.users.findOne({ where: { authUserId: auth.id } })) ??
      (await this.users.findOne({ where: { email } }));

    if (user) {
      // 이메일로 찾았는데 아직 인증 계정이 안 묶여 있으면 지금 묶는다.
      if (!user.authUserId) {
        user.authUserId = auth.id;
        await this.users.save(user);
      }
      return this.toContext(user, auth);
    }

    const tenant = await this.tenants.save(
      this.tenants.create({
        name: `${auth.name}의 워크스페이스`,
      }),
    );

    user = await this.users.save(
      this.users.create({
        tenantId: tenant.id,
        email,
        name: auth.name,
        role: 'owner',
        authUserId: auth.id,
      }),
    );

    this.logger.log(`새 사용자 — ${email} (테넌트 ${tenant.id})`);
    return this.toContext(user, auth);
  }

  private toContext(user: User, auth: AuthUser): AuthContext {
    return {
      userId: user.id,
      tenantId: user.tenantId,
      email: user.email,
      name: user.name ?? auth.name,
      authUserId: auth.id,
      isAdmin: user.isAdmin ?? false,
    };
  }
}
