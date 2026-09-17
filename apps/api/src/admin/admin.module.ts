import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { Project } from '../projects/entities/project.entity';
import { User } from '../users/entities/user.entity';
import { AdminController } from './admin.controller';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { SupabaseAdminService } from './supabase-admin.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Project, CompanyProfile])],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard, SupabaseAdminService],
  // 다른 모듈에서도 관리자 확인을 걸 수 있게 내보낸다 (users 목록 보호에 쓴다)
  exports: [AdminGuard],
})
export class AdminModule {}
