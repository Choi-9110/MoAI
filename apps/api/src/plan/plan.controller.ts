import {
  BadRequestException,
  Body, Controller, Get, Header, HttpCode, NotFoundException, Param,
  ParseUUIDPipe, Post, Res, StreamableFile, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { PLAN_FORMATS } from '@moai/shared';
import type { PlanFormat } from '@moai/shared';
import { FileInterceptor } from '@nestjs/platform-express';
import { Auth } from '../auth/auth.guard';
import type { AuthContext } from '../auth/auth.service';
import { PlanDocxService } from './plan-docx.service';
import { PlanPdfService } from './plan-pdf.service';
import { PlanService } from './plan.service';

interface UploadedTemplate {
  originalname: string;
  buffer: Buffer;
}

/** multipart 파일명을 UTF-8 로 되돌린다 (busboy 는 latin1 로 읽는다) */
function decodeFileName(name: string): string {
  try {
    const restored = Buffer.from(name, 'latin1').toString('utf8');
    return restored.includes('�') ? name : restored;
  } catch {
    return name;
  }
}

@Controller('projects/:id/plan')
export class PlanController {
  constructor(
    private readonly plan: PlanService,
    private readonly docx: PlanDocxService,
    private readonly pdf: PlanPdfService,
  ) {}

  /**
   * 사업계획서 작성 시작.
   *
   * 양식은 선택이다. 없으면 일반적인 정부지원사업 목차로 쓴다.
   * 곧바로 응답하고 실제 작성은 뒤에서 절 단위로 돈다.
   */
  @Post('start')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('template', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  start(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('format') format?: string,
    @UploadedFile() template?: UploadedTemplate,
  ) {
    return this.plan.start(
      id,
      template
        ? {
            fileName: decodeFileName(template.originalname),
            content: template.buffer,
          }
        : undefined,
      auth.tenantId,
      this.format(format),
    );
  }

  /**
   * 양식 값을 확인한다.
   *
   * multipart 로 오는 값이라 DTO 검증을 태우기 번거롭다. 아는 값이 아니면
   * 조용히 gov 로 떨어뜨리지 않고 막는다 — 사용자가 PSSD 를 골랐는데
   * 일반 목차로 나오면 몇 분 뒤에야 알아차린다.
   */
  private format(value?: string): PlanFormat {
    if (!value) return 'gov';
    if (!(PLAN_FORMATS as readonly string[]).includes(value)) {
      throw new BadRequestException(`알 수 없는 양식입니다: ${value}`);
    }
    return value as PlanFormat;
  }

  /** 작성 상태 + 지금까지 쓴 본문 */
  @Get()
  state(@Auth() auth: AuthContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.plan.state(id, auth.tenantId);
  }

  /**
   * DOCX 로 내려받기.
   *
   * 파일 이름에 한글이 들어가므로 `filename*` 로 준다 — 옛 방식(`filename=`)만
   * 쓰면 브라우저가 한글을 깨뜨려 `______.docx` 같은 이름으로 저장된다.
   */
  @Get('download.docx')
  @Header(
    'content-type',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  )
  async download(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const state = await this.plan.state(id, auth.tenantId);
    if (!state.doc) {
      throw new NotFoundException('아직 만들어진 사업계획서가 없습니다.');
    }

    const title = await this.plan.titleOf(id, auth.tenantId);
    const buffer = await this.docx.build(title, state.doc);

    const name = `${title.replace(/[\\/:*?"<>|]/g, '_')}_사업계획서.docx`;
    res.setHeader(
      'content-disposition',
      `attachment; filename="plan.docx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    return new StreamableFile(buffer);
  }

  /** PDF 로 내려받기 */
  @Get('download.pdf')
  @Header('content-type', 'application/pdf')
  async downloadPdf(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const state = await this.plan.state(id, auth.tenantId);
    if (!state.doc) {
      throw new NotFoundException('아직 만들어진 사업계획서가 없습니다.');
    }

    const title = await this.plan.titleOf(id, auth.tenantId);
    const buffer = await this.pdf.build(title, state.doc);

    const name = `${title.replace(/[\\/:*?"<>|]/g, '_')}_사업계획서.pdf`;
    res.setHeader(
      'content-disposition',
      `attachment; filename="plan.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`,
    );
    return new StreamableFile(buffer);
  }

  /**
   * 같은 요약으로 사업계획서를 하나 더 쓴다.
   *
   * 이미 쓴 문서를 덮어쓰지 않고 **새 사업으로 갈라 낸다.** 요약 한 장까지는
   * 그대로 옮기고 문서만 비운 채로 시작한다.
   */
  @Post('duplicate')
  @HttpCode(201)
  duplicate(
    @Auth() auth: AuthContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body('title') title?: string,
    @Body('keepPoster') keepPoster?: boolean,
  ) {
    return this.plan.duplicate(id, title, auth.tenantId, keepPoster !== false);
  }
}
