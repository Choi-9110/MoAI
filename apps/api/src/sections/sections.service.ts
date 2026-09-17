import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Section } from './entities/section.entity';

@Injectable()
export class SectionsService extends BaseCrudService<Section> {
  constructor(
    @InjectRepository(Section)
    repo: Repository<Section>,
  ) {
    super(repo, '섹션');
  }
}
