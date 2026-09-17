import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { FindManyOptions, FindOptionsWhere } from 'typeorm';
import { BaseCrudService } from '../common/base-crud.service';
import { Project } from './entities/project.entity';

@Injectable()
export class ProjectsService extends BaseCrudService<Project> {
  constructor(
    @InjectRepository(Project)
    repo: Repository<Project>,
  ) {
    super(repo, '프로젝트');
  }

  /**
   * 한 워크스페이스의 사업만.
   *
   * 목록을 거르는 것은 화면이 아니라 서버가 해야 한다.
   * 화면에서 걸러도 응답에는 남의 사업이 실려 나간다.
   */
  findAllForTenant(tenantId: string, page = 1, limit = 20) {
    return this.findAll(
      page,
      limit,
      { tenantId } as FindOptionsWhere<Project>,
      {
        /*
         * 손으로 정한 순서가 먼저, 그다음이 최근 순.
         *
         * 순서를 정하지 않은 사업(sortOrder 가 비어 있는 것)은 위로 올린다.
         * 방금 만든 사업이 그렇다 — 목록을 한 번 정리해 둔 뒤에 새 사업을
         * 시작했는데 그것이 맨 아래에 숨어 버리면 못 찾는다.
         *
         * Postgres 는 오름차순에서 NULL 을 뒤로 보내므로 NULLS FIRST 를
         * 명시해야 한다.
         */
        order: {
          sortOrder: { direction: 'ASC', nulls: 'FIRST' },
          createdAt: 'DESC',
        },
      } as FindManyOptions<Project>,
    );
  }

  /**
   * 목록 순서를 통째로 다시 매긴다.
   *
   * 옮긴 것 하나만 고치지 않고 **받은 순서대로 0,1,2… 를 다시 쓴다.**
   * 중간에 끼워 넣는 방식은 값이 촘촘해지면 결국 다시 매겨야 하고,
   * 사업이 많아야 수십 건이라 전부 쓰는 편이 단순하고 틀릴 일이 없다.
   *
   * 남의 사업 id 가 섞여 와도 안전하다 — 자기 워크스페이스 것만 골라
   * 매기고, 나머지는 조용히 버린다.
   *
   * 한 번에 다 쓰거나 하나도 안 쓴다. 중간에 끊기면 두 사업이 같은
   * 자리를 갖게 되고, 그러면 목록이 새로고침할 때마다 뒤바뀐다.
   */
  async reorder(tenantId: string, ids: string[]): Promise<{ ok: true }> {
    const mine = await this.repo.find({
      where: { tenantId } as FindOptionsWhere<Project>,
      select: { id: true },
    });
    const allowed = new Set(mine.map((p) => p.id));
    const ordered = ids.filter((id) => allowed.has(id));

    await this.repo.manager.transaction(async (tx) => {
      await Promise.all(
        ordered.map((id, index) =>
          tx.update(Project, { id }, { sortOrder: index }),
        ),
      );
    });

    return { ok: true };
  }
}
