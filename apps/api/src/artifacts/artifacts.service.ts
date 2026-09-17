import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Artifact } from './entities/artifact.entity';

@Injectable()
export class ArtifactsService extends BaseCrudService<Artifact> {
  constructor(
    @InjectRepository(Artifact)
    repo: Repository<Artifact>,
  ) {
    super(repo, '산출물');
  }
}
