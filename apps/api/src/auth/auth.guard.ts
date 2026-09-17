import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger,
  SetMetadata, UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService, type AuthContext } from './auth.service';
import { SupabaseAuthService } from './supabase-auth.service';

/** 로그인 없이 열어 둘 경로 */
export const PUBLIC = 'auth:public';
export const Public = () => SetMetadata(PUBLIC, true);

/**
 * 사람이 아니라 **로컬 실행기**가 부르는 경로.
 *
 * 판정 워커는 로그인한 사용자가 아니다. 모든 워크스페이스의 대기열을 가져가
 * 처리해야 하므로 사용자 토큰으로는 될 수가 없다. 대신 서로만 아는 값을
 * 맞춰 본다 (`INTERNAL_TOKEN`).
 *
 * `@Public()` 으로 열면 안 된다 — 이 경로는 남의 기업 정보와 공고 판정을
 * 통째로 내보낸다. URL 만 알면 다 가져갈 수 있게 된다.
 */
export const INTERNAL = 'auth:internal';
export const Internal = () => SetMetadata(INTERNAL, true);

/** 컨트롤러에서 로그인 정보를 꺼낸다 */
export const Auth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext => {
    const req = ctx.switchToHttp().getRequest<Request & { auth?: AuthContext }>();
    if (!req.auth) throw new UnauthorizedException('로그인이 필요합니다.');
    return req.auth;
  },
);

/**
 * 모든 요청에 로그인을 요구한다.
 *
 * `SUPABASE_URL` 이 없으면 검사하지 않는다 — 인증을 붙이기 전 개발 환경을
 * 그대로 두기 위한 것이다. 대신 서버가 뜰 때 경고를 남긴다.
 * **배포에서는 반드시 채워야 한다.** 비어 있으면 URL 만 알면 남의 문서가 보인다.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);
  private warned = false;
  private internalWarned = false;

  constructor(
    private readonly reflector: Reflector,
    private readonly supabase: SupabaseAuthService,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.supabase.enabled) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          '인증이 꺼져 있습니다 (SUPABASE_URL 없음) — 누구나 모든 데이터를 볼 수 있습니다.',
        );
      }
      return true;
    }

    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx
      .switchToHttp()
      .getRequest<Request & { auth?: AuthContext }>();

    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';

    const isInternal = this.reflector.getAllAndOverride<boolean>(INTERNAL, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isInternal) return this.checkInternal(token);

    if (!token) throw new UnauthorizedException('로그인이 필요합니다.');

    const user = await this.supabase.verify(token);
    if (!user) throw new UnauthorizedException('로그인이 만료되었습니다. 다시 로그인해 주세요.');

    req.auth = await this.auth.resolve(user);

    /*
     * **주소에 적힌 워크스페이스가 내 것인지 본다.**
     *
     * 거의 모든 경로가 `/:tenantId` 로 대상을 받는데, 로그인만 통과하면
     * 그 값을 바꿔 남의 것을 부를 수 있었다. 실제로 다른 회사의 관심 공고와
     * 기업 정보가 그대로 나왔다.
     *
     * 컨트롤러마다 검사를 넣는 방법도 있지만, 새 경로를 만들 때마다
     * 빠뜨리기 쉽다. 여기서 한 번에 막는다 — **빠뜨리면 뚫리는 쪽이 아니라,
     * 넣어야 열리는 쪽**이어야 한다.
     */
    this.assertOwnTenant(req);
    return true;
  }

  /**
   * 요청이 가리키는 워크스페이스가 로그인한 사람의 것인지 확인한다.
   *
   * 경로 변수와 질의 문자열 둘 다 본다 — `/saved-grants/:tenantId` 처럼
   * 경로로 받는 곳도 있고 `?tenantId=` 로 받는 곳도 있다.
   *
   * 관리자는 지나간다. 관리자 화면은 모든 워크스페이스를 들여다보는 것이
   * 하는 일이다.
   */
  private assertOwnTenant(req: Request & { auth?: AuthContext }): void {
    const mine = req.auth?.tenantId;
    if (!mine || req.auth?.isAdmin) return;

    /* 배열로 올 수도 있다(`?tenantId=a&tenantId=b`) — 문자열만 본다 */
    const params = req.params as Record<string, string> | undefined;
    const query = req.query as Record<string, unknown> | undefined;
    const asked = [params?.tenantId, query?.tenantId].filter(
      (v): v is string => typeof v === 'string' && v.length > 0,
    );

    for (const id of asked) {
      if (id !== mine) {
        this.logger.warn(
          `다른 워크스페이스 접근 시도 — 로그인 ${mine}, 요청 ${id}, 경로 ${req.originalUrl ?? ''}`,
        );
        throw new ForbiddenException('접근할 수 없는 워크스페이스입니다.');
      }
    }
  }

  /**
   * 실행기 호출인지 확인한다.
   *
   * 값이 설정돼 있지 않으면 **막는다.** 열어 두면 인증을 켠 의미가 없다 —
   * 이 경로 하나로 모든 워크스페이스의 기업 정보가 나간다.
   */
  private checkInternal(token: string): boolean {
    const expected = (process.env.INTERNAL_TOKEN ?? '').trim();

    if (!expected) {
      if (!this.internalWarned) {
        this.internalWarned = true;
        this.logger.error(
          'INTERNAL_TOKEN 이 없어 실행기 호출을 막았습니다. ' +
            'apps/api/.env 와 apps/agent/.env 에 같은 값을 넣어 주세요.',
        );
      }
      throw new UnauthorizedException('내부 호출 토큰이 설정되지 않았습니다.');
    }

    if (token !== expected) {
      throw new UnauthorizedException('내부 호출 토큰이 올바르지 않습니다.');
    }
    return true;
  }
}
