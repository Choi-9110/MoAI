import {
  Body, Controller, Get, HttpCode, Post, Req, Res,
  ServiceUnavailableException, UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PlanJobSchema } from '@moai/shared';
import type { PlanJob } from '@moai/shared';
import { TokenGuard } from '../auth/token.guard';
import { JobsService } from './jobs.service';

@Controller()
export class JobsController {
  constructor(private readonly service: JobsService) {}

  /**
   * 헬스체크.
   * 백엔드가 이 응답을 보고 로컬 실행기를 쓸지 API 로 폴백할지 결정한다.
   * 인증 없이 열어두어야 폴백 판정이 토큰 문제로 오작동하지 않는다.
   */
  @Get('health')
  health() {
    return this.service.health();
  }

  /**
   * 잡 실행 (SSE 스트리밍).
   * 백엔드의 LocalRestExecutor 가 호출하는 유일한 엔드포인트다.
   */
  @Post('jobs/stream')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  async stream(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.service.hasCapacity()) {
      throw new ServiceUnavailableException(
        '로컬 실행기의 동시 처리 슬롯이 가득 찼습니다.',
      );
    }

    const parsed = PlanJobSchema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({
        message: '잡 형식이 올바르지 않습니다.',
        issues: parsed.error.issues,
      });
      return;
    }
    const job: PlanJob = parsed.data;

    res.setHeader('content-type', 'text/event-stream; charset=utf-8');
    res.setHeader('cache-control', 'no-cache, no-transform');
    res.setHeader('connection', 'keep-alive');
    res.setHeader('x-accel-buffering', 'no');
    res.flushHeaders();

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    try {
      for await (const event of this.service.run(job, controller.signal)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
      res.write('data: [DONE]\n\n');
    } catch (err) {
      res.write(
        `data: ${JSON.stringify({
          type: 'error',
          message: (err as Error).message,
          retryable: false,
        })}\n\n`,
      );
    } finally {
      res.end();
    }
  }
}
