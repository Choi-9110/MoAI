import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import type { AuthContext } from '../auth/auth.service';
import { User } from '../users/entities/user.entity';

/**
 * 서비스 관리자만 지나간다.
 *
 * 화면에서 메뉴를 숨기는 것으로는 막을 수 없다 — 주소를 알면 그냥 부를 수
 * 있기 때문이다. **막는 곳은 여기 한 곳이어야 한다.**
 *
 * 로그인 여부는 이미 `AuthGuard` 가 본다. 여기서는 그 사람이 관리자인지만
 * DB 로 다시 확인한다. 토큰 안의 값을 믿지 않는 것은, 관리자 권한을 뺏은
 * 뒤에도 남아 있는 토큰으로 계속 들어올 수 있기 때문이다.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    const userId = req.auth?.userId;
    if (!userId) throw new ForbiddenException('관리자만 볼 수 있습니다.');

    const me = await this.users.findOne({ where: { id: userId } });
    if (!me?.isAdmin) throw new ForbiddenException('관리자만 볼 수 있습니다.');

    return true;
  }
}
