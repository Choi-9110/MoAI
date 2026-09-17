import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { CompanyProfile } from './entities/company-profile.entity';

@Injectable()
export class CompanyProfilesService extends BaseCrudService<CompanyProfile> {
  constructor(
    @InjectRepository(CompanyProfile)
    repo: Repository<CompanyProfile>,
  ) {
    super(repo, '기업 프로필');
  }

  /** 테넌트의 기본 프로필 */
  findDefault(tenantId: string): Promise<CompanyProfile | null> {
    return this.repo.findOne({ where: { tenantId, isDefault: true } });
  }
}
