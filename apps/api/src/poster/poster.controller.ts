import {
  Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { decodeMultipart } from '../common/multipart';
import type { SlotNote } from '@moai/shared';
import { Auth } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.service';
import { PosterService } from './poster.service';

/** multer 가 넘겨주는 파일 */
interface UploadedNotice {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Controller('projects/:id/poster')
export class PosterController {
  constructor(private readonly poster: PosterService) {}

  /**
   * 요약 생성 시작.
   *
   * 공고문은 선택이다. 없으면 특정 공고에 맞추지 않은 일반 초안을 만든다.
   * 곧바로 응답하고 실제 생성은 뒤에서 돈다 — 상태는 아래 GET 으로 본다.
   */
  @Post('start')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('notice', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  start(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() notice?: UploadedNotice,
  ) {
    return this.poster.start(
      id,
      notice
        ? { fileName: decodeMultipart(notice.originalname), content: notice.buffer }
        : undefined,
      auth.tenantId,
    );
  }

  /** 생성 상태 + 결과 — 화면이 주기적으로 물어본다 */
  @Get()
  state(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.poster.state(id, auth.tenantId);
  }

  /** 공고 검색 — 자동으로 못 찾았을 때 사용자가 직접 고른다 */
  @Get('grants/search')
  searchGrants(@Query('q') q = '') {
    return this.poster.searchGrants(q);
  }

  /** 공고를 직접 묶는다. grantId 를 null 로 보내면 연결을 끊는다. */
  @Post('grant')
  @HttpCode(200)
  linkGrant(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { grantId: string | null },
  ) {
    return this.poster.linkGrant(id, body.grantId ?? null, auth.tenantId);
  }

  /** 보완 요청 반영 */
  @Post('revise')
  @HttpCode(200)
  revise(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { notes?: SlotNote[] },
  ) {
    return this.poster.revise(id, body.notes ?? [], auth.tenantId);
  }
}
