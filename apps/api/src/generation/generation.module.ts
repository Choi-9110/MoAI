import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Answer } from '../answers/entities/answer.entity';
import { Job } from '../jobs/entities/job.entity';
import { Knowledge } from '../knowledge/entities/knowledge.entity';
import { Project } from '../projects/entities/project.entity';
import { Section } from '../sections/entities/section.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Usage } from '../usage/entities/usage.entity';
import { ClaudeApiExecutor } from './executors/claude-api.executor';
import { ExecutorRegistry } from './executors/executor.registry';
import { LocalRestExecutor } from './executors/local-rest.executor';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([Project, Answer, Section, Job, Knowledge, Tenant, Usage]),
  ],
  controllers: [GenerationController],
  providers: [GenerationService, ExecutorRegistry, LocalRestExecutor, ClaudeApiExecutor],
  exports: [GenerationService, ExecutorRegistry],
})
export class GenerationModule {}
