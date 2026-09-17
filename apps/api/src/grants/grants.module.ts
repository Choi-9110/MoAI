import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedGrant } from '../saved-grants/entities/saved-grant.entity';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { CalendarService } from './calendar.service';
import { EligibilityCacheService } from './eligibility-cache.service';
import { EligibilityService } from './eligibility.service';
import { EligibilityCheck } from './entities/eligibility-check.entity';
import { Grant } from './entities/grant.entity';
import { GrantsController } from './grants.controller';
import { GrantsService } from './grants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Grant, CompanyProfile, EligibilityCheck, SavedGrant]),
  ],
  controllers: [GrantsController],
  providers: [
    GrantsService,
    CalendarService,
    EligibilityService,
    EligibilityCacheService,
  ],
  exports: [
    GrantsService,
    CalendarService,
    EligibilityService,
    EligibilityCacheService,
  ],
})
export class GrantsModule {}
