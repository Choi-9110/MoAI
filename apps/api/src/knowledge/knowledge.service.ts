import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Knowledge } from './entities/knowledge.entity';

@Injectable()
export class KnowledgeService extends BaseCrudService<Knowledge> {
  constructor(
    @InjectRepository(Knowledge)
    repo: Repository<Knowledge>,
  ) {
    super(repo, '참조자료');
  }
}
