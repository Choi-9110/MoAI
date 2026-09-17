import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService extends BaseCrudService<User> {
  constructor(
    @InjectRepository(User)
    repo: Repository<User>,
  ) {
    super(repo, '사용자');
  }
}
