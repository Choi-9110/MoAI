import {
  BadRequestException,
  Body, Controller, Delete, ForbiddenException, Get, Param, ParseUUIDPipe,
  Patch, Post, Query,
} from '@nestjs/common';
import { missingModooAnswers, modooIdea, modooTitle } from '@moai/shared';
import type { DeepPartial } from 'typeorm';
import { Auth } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.service';
import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { ReorderProjectsDto } from './dto/reorder-projects.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { PaginationDto } from '../common/pagination.dto';
import { Project } from './entities/project.entity';

/**
 * 사업.
 *
 * **모든 경로가 자기 워크스페이스 것만 다룬다.** 로그인만 확인하고
 * 소유자를 안 보면, URL 에 남의 사업 id 를 넣는 것만으로 문서가 열린다.
 */
@Controller('projects')
export class ProjectsController {
  constructor(private readonly service: ProjectsService) {}

  @Post()
  create(@Auth() auth: AuthContext, @Body() dto: CreateProjectDto) {
    const derived =
      dto.track === 'modoo' ? this.fromModoo(dto.modooAnswers ?? {}) : {};

    // 본문에 실려 온 소유자 값은 믿지 않는다. 토큰이 말하는 사람이 주인이다.
    return this.service.create({
      ...dto,
      ...derived,
      tenantId: auth.tenantId,
      userId: auth.userId,
    } as DeepPartial<Project>);
  }

  /**
   * 모두의창업 답변에서 제목과 아이디어를 만든다.
   *
   * 화면에서 만들어 보내게 하지 않는다 — 같은 규칙이 두 군데에 있으면
   * 한쪽만 고쳐지고, 그러면 목록에 뜨는 제목과 요약 한 장이 어긋난다.
   */
  private fromModoo(answers: Record<string, string | undefined>) {
    const missing = missingModooAnswers(answers);
    if (missing.length > 0) {
      throw new BadRequestException(
        `필수 문항이 비어 있습니다: ${missing.map((q) => q.no).join(', ')}`,
      );
    }
    return { title: modooTitle(answers), idea: modooIdea(answers) };
  }

  @Get()
  findAll(@Auth() auth: AuthContext, @Query() query: PaginationDto) {
    return this.service.findAllForTenant(auth.tenantId, query.page, query.limit);
  }

  @Get(':id')
  async findOne(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.own(await this.service.findOne(id), auth);
  }

  /**
   * 목록 순서 저장.
   *
   * `:id` 보다 **위에** 있어야 한다. 아래에 두면 'reorder' 라는 글자가
   * id 자리로 먼저 잡혀서, UUID 가 아니라며 400 이 떨어진다.
   */
  @Patch('reorder')
  reorder(@Auth() auth: AuthContext, @Body() dto: ReorderProjectsDto) {
    return this.service.reorder(auth.tenantId, dto.ids);
  }

  @Patch(':id')
  async update(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
  ) {
    this.own(await this.service.findOne(id), auth);
    return this.service.update(id, dto as DeepPartial<Project>);
  }

  @Delete(':id')
  async remove(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.own(await this.service.findOne(id), auth);
    return this.service.remove(id);
  }

  /**
   * 남의 것이면 막는다.
   *
   * "없음"이 아니라 "권한 없음"으로 답한다 — 어차피 id 를 아는 상태이므로
   * 존재 여부를 숨겨서 얻는 것이 없고, 왜 안 되는지 알려 주는 편이 낫다.
   */
  private own(project: Project, auth: AuthContext): Project {
    if (project.tenantId !== auth.tenantId) {
      throw new ForbiddenException('이 사업에 접근할 권한이 없습니다.');
    }
    return project;
  }
}
