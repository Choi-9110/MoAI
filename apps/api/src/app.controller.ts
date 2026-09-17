import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/auth.guard';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** 살아 있는지 확인 — 로그인 없이 볼 수 있어야 한다 */
  @Public()
  @Get('health')
  health() {
    return this.appService.health();
  }
}
