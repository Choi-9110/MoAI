import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Answer } from './entities/answer.entity';

@Injectable()
export class AnswersService extends BaseCrudService<Answer> {
  constructor(
    @InjectRepository(Answer)
    repo: Repository<Answer>,
  ) {
    super(repo, '응답');
  }
}
