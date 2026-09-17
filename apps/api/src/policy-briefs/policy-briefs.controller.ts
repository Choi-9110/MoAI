import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { PolicyBriefsService } from './policy-briefs.service';

@Controller('policy-briefs')
export class PolicyBriefsController {
  constructor(private readonly service: PolicyBriefsService) {}

  /** 목록 — `tenantId` 를 주면 나에게 해당하는 개수를 함께 센다 */
  @Get()
  list(@Query('tenantId') tenantId?: string) {
    return this.service.list(tenantId);
  }

  /** 대시보드에 띄울 최신 글 */
  @Get('latest')
  latest(@Query('tenantId') tenantId?: string) {
    return this.service.latest(tenantId);
  }

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tenantId') tenantId?: string,
  ) {
    return this.service.findOne(id, tenantId);
  }
}
