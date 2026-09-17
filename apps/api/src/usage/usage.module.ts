import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageService } from './usage.service';
import { UsageController } from './usage.controller';
import { Usage } from './entities/usage.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Usage])],
  controllers: [UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
