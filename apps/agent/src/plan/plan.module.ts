import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeModule } from '../claude/claude.module';
import { PlanController } from './plan.controller';
import { PlanService } from './plan.service';

@Module({
  imports: [ConfigModule, ClaudeModule],
  controllers: [PlanController],
  providers: [PlanService],
  exports: [PlanService],
})
export class PlanModule {}
