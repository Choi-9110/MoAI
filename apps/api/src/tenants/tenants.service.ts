import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Tenant } from './entities/tenant.entity';

@Injectable()
export class TenantsService extends BaseCrudService<Tenant> {
  constructor(
    @InjectRepository(Tenant)
    repo: Repository<Tenant>,
  ) {
    super(repo, '테넌트');
  }
}
