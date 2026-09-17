import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GrantsModule } from '../grants/grants.module';
import { CompanyProfilesController } from './company-profiles.controller';
import { CompanyProfilesService } from './company-profiles.service';
import { CompanyProfile } from './entities/company-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyProfile]), GrantsModule],
  controllers: [CompanyProfilesController],
  providers: [CompanyProfilesService],
  exports: [CompanyProfilesService],
})
export class CompanyProfilesModule {}
