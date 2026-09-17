import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrantsModule } from '../grants/grants.module';
import { Grant } from '../grants/entities/grant.entity';
import { BizinfoCollector } from './bizinfo.collector';
import { YouthCollector } from './youth.collector';
import { CollectSchedulerService } from './collect-scheduler.service';
import { CollectorsController } from './collectors.controller';
import { KStartupCollector } from './kstartup.collector';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([Grant]), GrantsModule],
  controllers: [CollectorsController],
  providers: [KStartupCollector, BizinfoCollector,
    YouthCollector, CollectSchedulerService],
  exports: [KStartupCollector, BizinfoCollector, YouthCollector, CollectSchedulerService],
})
export class CollectorsModule {}
