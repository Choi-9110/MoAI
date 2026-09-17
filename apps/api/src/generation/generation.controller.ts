import {
  Body, Controller, Get, Param, ParseUUIDPipe, Post, Res, Sse,
} from '@nestjs/common';
import type { Response } from 'express';
import { Observable, Subject } from 'rxjs';
import type { ProgressEvent } from '@moai/shared';
import { GenerateDto } from './dto/generate.dto';
import { ExecutorRegistry } from './executors/executor.registry';
import { GenerationService } from './generation.service';

@Controller('generation')
export class GenerationController {
  constructor(
    private readonly service: GenerationService,
    private readonly registry: ExecutorRegistry,
  ) {}

  /** 실행기 상태 — 로컬 서버가 살아 있는지 프론트에서 확인할 때 사용 */
  @Get('status')
  async status() {
    return {
      executors: await this.registry.status(),
      sections: this.service.allSections(),
    };
  }

  /**
   * 생성 시작 (SSE).
   * 진행 상황과 토큰이 실시간으로 흘러나온다.
   */
  @Sse('projects/:projectId/stream')
  stream(
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ): Observable<{ data: ProgressEvent }> {
    const subject = new Subject<{ data: ProgressEvent }>();

    void (async () => {
      try {
        const { job, payload } = await this.service.prepare(projectId, []);
        await this.service.execute(job, payload, (event) => {
          subject.next({ data: event });
        });
      } catch (err) {
        subject.next({
          data: {
            type: 'error',
            message: (err as Error).message,
            retryable: false,
          },
        });
      } finally {
        subject.complete();
      }
    })();

    return subject.asObservable();
  }

  /**
   * 생성 시작 (동기).
   * 스트리밍이 필요 없는 배치 호출이나 재생성에 사용한다.
   */
  @Post('projects/:projectId')
  async generate(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: GenerateDto,
  ) {
    const { job, payload } = await this.service.prepare(
      projectId,
      dto.sections ?? [],
    );

    const events: ProgressEvent[] = [];
    await this.service.execute(job, payload, (e) => {
      // 토큰 단위 이벤트는 응답에서 제외한다 (용량 과다).
      if (e.type !== 'token') events.push(e);
    });

    return { jobId: job.id, events };
  }

  /** 산출물 다운로드 준비 상태 확인용 헬스 엔드포인트 */
  @Get('ping')
  ping(@Res({ passthrough: true }) res: Response) {
    res.setHeader('cache-control', 'no-store');
    return { ok: true };
  }
}
