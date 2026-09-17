import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BriefModule } from './brief/brief.module';
import { JudgeModule } from './judge/judge.module';
import { PlanModule } from './plan/plan.module';
import { PosterModule } from './poster/poster.module';
import { JobsModule } from './jobs/jobs.module';

@Module({
  imports: [
    BriefModule,
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    JobsModule,
    JudgeModule,
    PlanModule,
    PosterModule,
  ],
})
export class AppModule {}
