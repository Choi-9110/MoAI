import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SupabaseAuthService } from './supabase-auth.service';

/**
 * 인증. 가드가 어디서나 쓰이므로 전역으로 둔다.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([User, Tenant])],
  controllers: [AuthController],
  providers: [AuthService, SupabaseAuthService],
  exports: [AuthService, SupabaseAuthService],
})
export class AuthModule {}
