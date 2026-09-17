import { Controller, Get, HttpCode, Module, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TokenGuard } from '../auth/token.guard';
import { ClaudeModule } from '../claude/claude.module';
import { DocumentWorkerService } from './document-worker.service';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly worker: DocumentWorkerService) {}

  @Get('health')
  health() {
    return { working: this.worker.isRunning };
  }

  /**
   * 지금 바로 한 묶음 읽기 — 워커를 꺼 둔 채 손으로 돌리거나 시험할 때.
   *
   *   POST /documents/drain?limit=5
   */
  @Post('drain')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  drain(@Query('limit') limit?: string) {
    return this.worker.drain(limit ? parseInt(limit, 10) : undefined);
  }
}

@Module({
  imports: [ConfigModule, ClaudeModule],
  controllers: [DocumentsController],
  providers: [DocumentWorkerService],
  exports: [DocumentWorkerService],
})
export class DocumentsModule {}
