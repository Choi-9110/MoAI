import { Controller, Get } from '@nestjs/common';
import { Auth } from './auth.guard';
import type { AuthContext } from './auth.service';

@Controller('auth')
export class AuthController {
  /**
   * 지금 로그인한 사람.
   *
   * 화면은 이것만 부르면 된다. 예전에는 사용자 목록을 통째로 받아
   * 이메일로 자기를 찾았는데, 그건 남의 이메일까지 다 내주는 짓이었다.
   */
  @Get('me')
  me(@Auth() auth: AuthContext) {
    return auth;
  }
}
