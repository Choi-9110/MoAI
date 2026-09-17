import {
  Body, Controller, HttpCode, Post, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type {
  PlanFormat, PlanKindInput, PlanReviewInput, PlanSectionInput, ResearchInput,
} from '@moai/shared';
import { TokenGuard } from '../auth/token.guard';
import { PlanService } from './plan.service';

interface UploadedTemplate {
  originalname: string;
  buffer: Buffer;
}

/**
 * 목차 판정 재료 — multipart 라 JSON 문자열로 실려 온다.
 *
 * 없거나 깨져 있어도 목차는 나와야 한다. 판정만 못 할 뿐이다.
 */
function parseContext(raw?: string): PlanKindInput | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlanKindInput;
  } catch {
    return null;
  }
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

@Controller('plan')
export class PlanController {
  constructor(private readonly plan: PlanService) {}

  /** 양식에서 목차 뽑기. 양식이 없으면 표준 목차를 돌려준다. */
  @Post('outline')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  @UseInterceptors(
    FileInterceptor('template', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  outline(
    @Body('format') format?: PlanFormat,
    @Body('context') context?: string,
    @UploadedFile() template?: UploadedTemplate,
  ) {
    return this.plan.outline(
      template
        ? {
            fileName: decodeFileName(template.originalname),
            content: template.buffer,
          }
        : undefined,
      format ?? 'gov',
      parseContext(context),
    );
  }

  /** 절 하나 쓰기 */
  @Post('section')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  writeSection(@Body() body: PlanSectionInput) {
    return this.plan.writeSection(body);
  }

  /** 집필 전 리서치 한 편 */
  @Post('research')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  research(@Body() body: ResearchInput) {
    return this.plan.research(body);
  }

  /** 다 쓴 문서 점검 */
  @Post('review')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  review(@Body() body: PlanReviewInput) {
    return this.plan.review(body);
  }
}
