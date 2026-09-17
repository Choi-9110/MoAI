import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

/**
 * 베어러 토큰 인증.
 *
 * 이 서버는 Cloudflare Tunnel 을 통해 외부에 노출되므로
 * 토큰이 없으면 터널 주소를 아는 누구나 Claude 를 호출할 수 있게 된다.
 * AGENT_TOKEN 이 설정된 경우 반드시 검사한다.
 */
@Injectable()
export class TokenGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const expected = this.config.get<string>('AGENT_TOKEN', '');

    // 토큰 미설정 시에는 로컬 개발로 간주하고 통과시킨다.
    if (!expected) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    if (token !== expected) {
      throw new UnauthorizedException('유효하지 않은 에이전트 토큰입니다.');
    }
    return true;
  }
}
