import { NotFoundException } from '@nestjs/common';
import {
  DeepPartial, FindManyOptions, FindOptionsWhere, Repository,
} from 'typeorm';
import { BaseEntity } from './base.entity';

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

/**
 * 11개 리소스가 공유하는 CRUD 기본 구현.
 * 리소스별 서비스는 이 클래스를 상속하고 고유 로직만 덧붙인다.
 */
export abstract class BaseCrudService<T extends BaseEntity> {
  protected constructor(
    protected readonly repo: Repository<T>,
    protected readonly label: string,
  ) {}

  async create(dto: DeepPartial<T>): Promise<T> {
    const entity = this.repo.create(dto);
    return this.repo.save(entity);
  }

  async findAll(
    page = 1,
    limit = 20,
    where?: FindOptionsWhere<T>,
    options?: FindManyOptions<T>,
  ): Promise<PageResult<T>> {
    const take = Math.min(Math.max(limit, 1), 100);
    const skip = (Math.max(page, 1) - 1) * take;
    const [items, total] = await this.repo.findAndCount({
      where,
      take,
      skip,
      order: { createdAt: 'DESC' } as FindManyOptions<T>['order'],
      ...options,
    });
    return { items, total, page, limit: take };
  }

  async findOne(id: string): Promise<T> {
    const found = await this.repo.findOne({
      where: { id } as FindOptionsWhere<T>,
    });
    if (!found) {
      throw new NotFoundException(`${this.label}을(를) 찾을 수 없습니다: ${id}`);
    }
    return found;
  }

  async update(id: string, dto: DeepPartial<T>): Promise<T> {
    const entity = await this.findOne(id);
    Object.assign(entity, dto);
    return this.repo.save(entity);
  }

  async remove(id: string): Promise<{ id: string; deleted: true }> {
    const entity = await this.findOne(id);
    await this.repo.remove(entity);
    return { id, deleted: true };
  }
}
