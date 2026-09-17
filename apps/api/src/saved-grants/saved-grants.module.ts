import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CompanyProfile } from '../company-profiles/entities/company-profile.entity';
import { Grant } from '../grants/entities/grant.entity';
import { GrantsModule } from '../grants/grants.module';
import { SavedGrant } from './entities/saved-grant.entity';
import { SavedGrantsController } from './saved-grants.controller';
import { SavedGrantsService } from './saved-grants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SavedGrant, Grant, CompanyProfile]),
    GrantsModule,
  ],
  controllers: [SavedGrantsController],
  providers: [SavedGrantsService],
  exports: [SavedGrantsService],
})
export class SavedGrantsModule {}
