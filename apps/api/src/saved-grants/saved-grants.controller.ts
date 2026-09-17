import {
  Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Put,
} from '@nestjs/common';
import { CreateSavedGrantDto } from './dto/create-saved-grant.dto';
import { SetOutcomeDto } from './dto/set-outcome.dto';
import { SavedGrantsService } from './saved-grants.service';

@Controller('saved-grants')
export class SavedGrantsController {
  constructor(private readonly service: SavedGrantsService) {}

  /** 별 토글 — 같은 공고를 다시 누르면 해제된다 */
  @Post('toggle')
  @HttpCode(200)
  toggle(@Body() dto: CreateSavedGrantDto) {
    return this.service.toggle({
      tenantId: dto.tenantId,
      grantId: dto.grantId,
      userId: dto.userId,
    });
  }

  /** 저장한 공고 ID 목록 — 화면에서 별을 채울지 판단할 때 */
  @Get('ids/:tenantId')
  ids(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.service.idsOf(tenantId);
  }

  /** 관심 공고 목록 (판정 결과 포함) */
  @Get(':tenantId')
  list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.service.list(tenantId);
  }

  /** 지원받은 사업들 — 중복 수혜 제한을 볼 때 쓴다 */
  @Get(':tenantId/won')
  won(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.service.wonGrants(tenantId);
  }

  /**
   * 지원 결과 적기.
   *
   *   PUT /api/saved-grants/:tenantId/:grantId/outcome  { outcome: 'won' }
   *
   * `outcome: null` 이면 기록을 지운다.
   */
  @Put(':tenantId/:grantId/outcome')
  outcome(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @Body() dto: SetOutcomeDto,
  ) {
    return this.service.setOutcome({
      tenantId, grantId, outcome: dto.outcome ?? null, userId: dto.userId,
    });
  }

  @Delete(':tenantId/:grantId')
  async remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
  ) {
    const { removed } = await this.service.remove(tenantId, grantId);
    return {
      ok: removed,
      ...(removed
        ? {}
        : { reason: '지원 이력이 있어 뺄 수 없습니다. 결과를 먼저 지워 주세요.' }),
    };
  }
}
