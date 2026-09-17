import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeModule } from '../claude/claude.module';
import { PosterController } from './poster.controller';
import { PosterService } from './poster.service';

@Module({
  imports: [ConfigModule, ClaudeModule],
  controllers: [PosterController],
  providers: [PosterService],
  exports: [PosterService],
})
export class PosterModule {}
