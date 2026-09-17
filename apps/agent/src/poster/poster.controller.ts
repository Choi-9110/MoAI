import {
  Body, Controller, HttpCode, Post, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { PosterCreateInput, PosterDoc, SlotNote } from '@moai/shared';
import { TokenGuard } from '../auth/token.guard';
import { PosterService } from './poster.service';

/** multer 가 넘겨주는 파일 */
interface UploadedNotice {
  originalname: string;
  buffer: Buffer;
  size: number;
}

/**
 * multipart 파일명을 UTF-8 로 되돌린다.
 *
 * busboy 는 파일명을 latin1 로 읽어 넘긴다. 한글 파일명이
 * "2026ë__ìë¹ì°½ì..." 처럼 깨져 보이는 원인이다.
 */
function decodeFileName(name: string): string {
  try {
    const restored = Buffer.from(name, 'latin1').toString('utf8');
    // 되돌린 쪽에 대체 문자가 없으면 그게 원본이다.
    return restored.includes('�') ? name : restored;
  } catch {
    return name;
  }
}

@Controller('poster')
export class PosterController {
  constructor(private readonly poster: PosterService) {}

  /**
   * 아이디어(+공고문)로 요약 한 장을 처음 만든다.
   *
   * 공고문은 파일 그대로 받는다. 형식이 PDF·DOCX·HWP 로 제각각인데
   * CLI 가 직접 읽으므로 서버가 파싱할 필요가 없다.
   */
  @Post('create')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  @UseInterceptors(FileInterceptor('notice', { limits: { fileSize: 20 * 1024 * 1024 } }))
  create(
    @Body() body: { input: string },
    @UploadedFile() notice?: UploadedNotice,
  ) {
    // 파일과 함께 오므로 본문은 multipart 필드다 — JSON 으로 풀어 쓴다.
    const input = JSON.parse(body.input) as PosterCreateInput;

    return this.poster.create(
      input,
      notice
        ? { fileName: decodeFileName(notice.originalname), content: notice.buffer }
        : undefined,
    );
  }

  /** 보완 요청을 반영해 요약 한 장을 다시 만든다 */
  @Post('revise')
  @HttpCode(200)
  @UseGuards(TokenGuard)
  revise(@Body() body: { doc: PosterDoc; notes: SlotNote[] }) {
    return this.poster.revise(body.doc, body.notes ?? []);
  }
}
