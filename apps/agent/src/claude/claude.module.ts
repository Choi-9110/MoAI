import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClaudeCliService } from './claude-cli.service';

@Module({
  imports: [ConfigModule],
  providers: [ClaudeCliService],
  exports: [ClaudeCliService],
})
export class ClaudeModule {}
