import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeModule } from '../claude/claude.module';
import { ClaudeCliJudgeService } from './claude-cli-judge.service';
import { ClaudeJudgeService } from './claude-judge.service';
import { EligibilityWorkerService } from './eligibility-worker.service';
import { GemmaJudgeService } from './gemma-judge.service';
import { JudgeController } from './judge.controller';
import { JudgeRegistry } from './judge.registry';

@Module({
  imports: [ConfigModule, ClaudeModule],
  controllers: [JudgeController],
  providers: [
    ClaudeCliJudgeService,
    ClaudeJudgeService,
    GemmaJudgeService,
    JudgeRegistry,
    EligibilityWorkerService,
  ],
  exports: [JudgeRegistry, EligibilityWorkerService],
})
export class JudgeModule {}
