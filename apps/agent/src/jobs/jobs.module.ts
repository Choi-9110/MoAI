import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeCliService } from '../claude/claude-cli.service';
import { ClaudeService } from '../claude/claude.service';
import { DocxService } from '../docx/docx.service';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

@Module({
  imports: [ConfigModule],
  controllers: [JobsController],
  providers: [JobsService, ClaudeService, ClaudeCliService, DocxService],
})
export class JobsModule {}
