import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Question } from './entities/question.entity';

@Injectable()
export class QuestionsService extends BaseCrudService<Question> {
  constructor(
    @InjectRepository(Question)
    repo: Repository<Question>,
  ) {
    super(repo, '질의');
  }
}
