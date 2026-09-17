import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Grant } from './entities/grant.entity';

@Injectable()
export class GrantsService extends BaseCrudService<Grant> {
  constructor(
    @InjectRepository(Grant)
    repo: Repository<Grant>,
  ) {
    super(repo, '공고');
  }
}
