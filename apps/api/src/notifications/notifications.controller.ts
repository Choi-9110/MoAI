import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import type { NotificationKind } from './notifications.service';

/**
 * 완료 알림.
 *
 * 화면이 주기적으로 `GET` 으로 물어보고, 띄운 뒤 `POST /ack` 으로 표시한다.
 */
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  pending(@Query('tenantId') tenantId?: string) {
    return this.service.pending(tenantId);
  }

  @Post('ack')
  @HttpCode(200)
  ack(
    @Body() body: { items?: { projectId: string; kind: NotificationKind }[]; tenantId?: string },
  ) {
    return this.service.ack(body.items ?? [], body.tenantId);
  }
}
