import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Grant } from '../grants/entities/grant.entity';
import { Project } from '../projects/entities/project.entity';
import { PlanController } from './plan.controller';
import { PlanDocxService } from './plan-docx.service';
import { PlanPdfService } from './plan-pdf.service';
import { PlanService } from './plan.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project, Grant])],
  controllers: [PlanController],
  providers: [PlanService, PlanDocxService, PlanPdfService],
})
export class PlanModule {}
