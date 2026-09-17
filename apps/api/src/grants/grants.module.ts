import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SavedGrant } from '../saved-grants/entities/saved-grant.entity';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { CalendarService } from './calendar.service';
import { EligibilityCacheService } from './eligibility-cache.service';
import { EligibilityService } from './eligibility.service';
import { EligibilityCheck } from './entities/eligibility-check.entity';
import { GrantDocument } from './entities/grant-document.entity';
import { GrantDocumentsService } from './grant-documents.service';
import { Grant } from './entities/grant.entity';
import { GrantsController } from './grants.controller';
import { GrantsService } from './grants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Grant, CompanyProfile, EligibilityCheck, SavedGrant, GrantDocument,
    ]),
  ],
  controllers: [GrantsController],
  providers: [
    GrantsService,
    CalendarService,
    EligibilityService,
    EligibilityCacheService,
    GrantDocumentsService,
  ],
  exports: [
    GrantsService,
    CalendarService,
    EligibilityService,
    EligibilityCacheService,
  ],
})
export class GrantsModule {}
