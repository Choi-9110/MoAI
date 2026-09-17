import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeModule } from '../claude/claude.module';
import { BidDocumentService } from './bid-document.service';
import { BriefController } from './brief.controller';
import { BriefService } from './brief.service';

@Module({
  imports: [ConfigModule, ClaudeModule],
  controllers: [BriefController],
  providers: [BriefService, BidDocumentService],
  exports: [BriefService],
})
export class BriefModule {}
