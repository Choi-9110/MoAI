import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { BidNotice } from '@moai/shared';
import { TokenGuard } from '../auth/token.guard';
import { BriefService } from './brief.service';

@Controller('brief')
export class BriefController {
  constructor(private readonly brief: BriefService) {}

  /**
   * 입찰공고 하나를 읽어 준비할 것을 뽑는다.
   *
   * 공고 정보와 첨부 주소를 통째로 받는다 — 이 서버가 직접 내려받아
   * 한글 문서를 풀어 읽는다. api 가 파일을 옮겨 오지 않아도 된다.
   */
  @Post()
  @HttpCode(200)
  @UseGuards(TokenGuard)
  read(@Body() notice: BidNotice) {
    return this.brief.read(notice);
  }
}
