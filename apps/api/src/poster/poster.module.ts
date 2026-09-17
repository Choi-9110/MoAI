import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { Grant } from '../grants/entities/grant.entity';
import { Project } from '../projects/entities/project.entity';
import { GrantLinkerService } from './grant-linker.service';
import { PosterController } from './poster.controller';
import { PosterService } from './poster.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project, CompanyProfile, Grant])],
  controllers: [PosterController],
  providers: [PosterService, GrantLinkerService],
})
export class PosterModule {}
