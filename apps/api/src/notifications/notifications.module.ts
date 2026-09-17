import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProcurementModule } from '../procurement/procurement.module';
import { Project } from '../projects/entities/project.entity';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [TypeOrmModule.forFeature([Project]), ProcurementModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
