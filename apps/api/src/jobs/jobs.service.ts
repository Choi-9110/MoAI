import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Job } from './entities/job.entity';

@Injectable()
export class JobsService extends BaseCrudService<Job> {
  constructor(
    @InjectRepository(Job)
    repo: Repository<Job>,
  ) {
    super(repo, '잡');
  }
}
