import { Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { TokenGuard } from '../auth/token.guard';
import { EligibilityWorkerService } from './eligibility-worker.service';
import { JudgeRegistry } from './judge.registry';

@Controller('eligibility')
export class JudgeController {
  constructor(
    private readonly registry: JudgeRegistry,
    private readonly worker: EligibilityWorkerService,
  ) {}

  /** 판정기 준비 상태 — 어느 모델이 쓰이는지, 왜 못 쓰는지 */
  @Get('health')
  async health() {
    const picked = await this.registry.resolve();
    return {
      ok: picked.judge !== null,
      judge: picked.judge?.name ?? null,
      model: picked.judge?.model ?? null,
      message: picked.judge ? undefined : picked.message,
      candidates: await this.registry.statuses(),
      working: this.worker.isRunning,
    };
  }

  /**
   * 즉시 분석 — 사용자가 "사업 분석하기"를 눌렀을 때.
   *
   * 판정기가 없으면 "성공했지만 0건 처리"로 보여 오해를 준다.
   * 준비 상태를 응답에 담아 호출한 쪽이 구분할 수 있게 한다.
   */
  @Post('analyze')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  async analyze(@Query('limit') limit?: string) {
    const picked = await this.registry.resolve();
    if (!picked.judge) {
      return {
        ready: false,
        message: picked.message,
        result: { fetched: 0, judged: 0, failed: 0, skipped: 0 },
      };
    }

    const result = await this.worker.drain(
      limit ? parseInt(limit, 10) : undefined,
    );
    return { ready: true, judge: picked.judge.name, result };
  }
}
