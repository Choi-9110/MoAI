import {
  BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe,
  Patch, Post, Res, UploadedFiles, UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { decodeMultipart } from '../common/multipart';
import {
  IrDecksService, MAX_DECK_BYTES, toDeckDto,
} from './ir-decks.service';

/** multer 가 넘겨 주는 것 중 우리가 쓰는 부분만 */
interface UploadedFile {
  originalname: string;
  buffer: Buffer;
  mimetype?: string;
  size: number;
}

type Uploaded = {
  file?: UploadedFile[];
  thumb?: UploadedFile[];
};

@Controller('ir-decks')
export class IrDecksController {
  constructor(private readonly service: IrDecksService) {}

  @Get(':tenantId')
  async list(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return (await this.service.list(tenantId)).map(toDeckDto);
  }

  /**
   * 올리기 — 덱 하나와 표지(선택).
   *
   * 표지를 같은 요청으로 받는 이유는, 두 번 나눠 받으면 표지만 올라가고
   * 덱은 안 올라간 상태가 생겨서다.
   */
  @Post(':tenantId')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'file', maxCount: 1 }, { name: 'thumb', maxCount: 1 }],
      { limits: { fileSize: MAX_DECK_BYTES } },
    ),
  )
  async create(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @UploadedFiles() files: Uploaded,
    @Body() body: { name?: string; memo?: string; userId?: string },
  ) {
    const file = files?.file?.[0];
    if (!file) throw new BadRequestException('올릴 파일을 골라 주세요.');


    try {
      const thumb = files?.thumb?.[0];
      const deck = await this.service.create({
        tenantId,
        userId: body.userId,
        name: decodeMultipart(body.name ?? ''),
        memo: body.memo ? decodeMultipart(body.memo) : undefined,
        file: { ...file, originalname: decodeMultipart(file.originalname) },
        thumb: thumb
          ? { ...thumb, originalname: decodeMultipart(thumb.originalname) }
          : undefined,
      });
      return toDeckDto(deck);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Patch(':tenantId/:id')
  async update(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { name?: string; memo?: string | null },
  ) {
    return toDeckDto(await this.service.update(tenantId, id, body));
  }

  /** 내려받기 */
  @Get(':tenantId/:id/file')
  async download(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const got = await this.service.read(tenantId, id, 'file');
    /*
     * 한글 파일명은 `filename*` 로 보내야 깨지지 않는다. 옛 브라우저를 위해
     * 아스키만 남긴 이름도 함께 준다.
     */
    const ascii = got.name.replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', got.mime);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(got.name)}`,
    );
    res.send(got.bytes);
  }

  /** 표지 이미지 */
  @Get(':tenantId/:id/thumb')
  async thumb(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const got = await this.service.read(tenantId, id, 'thumb');
    res.setHeader('Content-Type', got.mime);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(got.bytes);
  }

  @Delete(':tenantId/:id')
  async remove(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.service.remove(tenantId, id);
    return { ok: true };
  }
}
