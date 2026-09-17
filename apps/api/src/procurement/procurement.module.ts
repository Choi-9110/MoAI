import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfilesModule } from '../company-profiles/company-profiles.module';
import { BidBriefService } from './bid-brief.service';
import { BidDraftService } from './bid-draft.service';
import { BidDraft } from './entities/bid-draft.entity';
import { G2bClient } from './g2b.client';
import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

@Module({
  imports: [ConfigModule, TypeOrmModule.forFeature([BidDraft]), CompanyProfilesModule],
  controllers: [ProcurementController],
  providers: [G2bClient, ProcurementService, BidBriefService, BidDraftService],
  exports: [ProcurementService, BidBriefService, BidDraftService],
})
export class ProcurementModule {}
