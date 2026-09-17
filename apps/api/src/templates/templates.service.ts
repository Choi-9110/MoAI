import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Template } from './entities/template.entity';

@Injectable()
export class TemplatesService extends BaseCrudService<Template> {
  constructor(
    @InjectRepository(Template)
    repo: Repository<Template>,
  ) {
    super(repo, '양식');
  }
}
