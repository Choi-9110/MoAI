import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { PolicyBrief } from './entities/policy-brief.entity';
import { PolicyBriefsController } from './policy-briefs.controller';
import { PolicyBriefsService } from './policy-briefs.service';

@Module({
  imports: [TypeOrmModule.forFeature([PolicyBrief, CompanyProfile])],
  controllers: [PolicyBriefsController],
  providers: [PolicyBriefsService],
})
export class PolicyBriefsModule {}
