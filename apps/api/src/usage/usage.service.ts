import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Usage } from './entities/usage.entity';

@Injectable()
export class UsageService extends BaseCrudService<Usage> {
  constructor(
    @InjectRepository(Usage)
    repo: Repository<Usage>,
  ) {
    super(repo, '사용량');
  }
}
