import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from './common/common.module';
import { LocalQueueModule } from './common/local-queue.module';
import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { DatabaseModule } from './database/database.module';

import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { TemplatesModule } from './templates/templates.module';
import { QuestionsModule } from './questions/questions.module';
import { ProjectsModule } from './projects/projects.module';
import { AnswersModule } from './answers/answers.module';
import { SectionsModule } from './sections/sections.module';
import { JobsModule } from './jobs/jobs.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { KnowledgeModule } from './knowledge/knowledge.module';
import { UsageModule } from './usage/usage.module';
import { GrantsModule } from './grants/grants.module';
import { CompanyProfilesModule } from './company-profiles/company-profiles.module';
import { CollectorsModule } from './collectors/collectors.module';
import { ProcurementModule } from './procurement/procurement.module';
import { GenerationModule } from './generation/generation.module';
import { IrDecksModule } from './ir-decks/ir-decks.module';
import { PolicyBriefsModule } from './policy-briefs/policy-briefs.module';
import { SavedGrantsModule } from './saved-grants/saved-grants.module';
import { PlanModule } from './plan/plan.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PosterModule } from './poster/poster.module';

@Module({
  imports: [
    AdminModule,
    NotificationsModule,
    CommonModule,
    LocalQueueModule,
    PlanModule,
    PosterModule,
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env'] }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    AuthModule,
    // ── CRUD 리소스 ──
    TenantsModule,
    UsersModule,
    TemplatesModule,
    QuestionsModule,
    ProjectsModule,
    AnswersModule,
    SectionsModule,
    JobsModule,
    ArtifactsModule,
    KnowledgeModule,
    UsageModule,
    // ── 공고 캘린더 ──
    GrantsModule,
    CompanyProfilesModule,
    CollectorsModule,
    ProcurementModule,
    SavedGrantsModule,
    IrDecksModule,
    PolicyBriefsModule,
    // ── 생성 오케스트레이션 ──
    GenerationModule,
  ],
  controllers: [AppController],
  providers: [
    // 모든 요청에 로그인을 요구한다 (@Public() 으로 열 수 있다)
    { provide: APP_GUARD, useClass: AuthGuard },
    AppService,
  ],
})
export class AppModule {}
