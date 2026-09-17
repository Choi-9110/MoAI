import {
  BadRequestException, Body, Controller, Delete, Get, HttpCode,
  NotFoundException, Param, ParseUUIDPipe, Post, Put, Query,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBooleanString, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { BidAnswer, BidBrief, BidNotice } from '@moai/shared';
import { CompanyProfilesService } from '../company-profiles/company-profiles.service';
import { BidBriefService } from './bid-brief.service';
import { BidDraftService } from './bid-draft.service';
import { ProcurementService } from './procurement.service';

class BidListDto {
  /** 최근 며칠 — 나라장터가 31일까지만 받는다 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  days?: number;

  /** 캐시를 건너뛰고 새로 받아온다 (새로고침 버튼) */
  @IsOptional()
  @IsBooleanString()
  refresh?: string;
}

@Controller('procurement')
export class ProcurementController {
  constructor(
    private readonly procurement: ProcurementService,
    private readonly profiles: CompanyProfilesService,
    private readonly brief: BidBriefService,
    private readonly drafts: BidDraftService,
  ) {}

  /** 조회 상태 — 키가 꽂혀 있는지, 캐시가 몇 칸인지 */
  @Get('status')
  status() {
    return this.procurement.status();
  }

  /**
   * 테넌트의 기본 프로필 기준 입찰공고.
   *
   * 프로필의 지역·업종을 그대로 조건으로 쓴다. 사용자가 목록에서 필터를
   * 다시 고를 필요가 없다 — 내 정보에 한 번 넣으면 그 조건으로 뜬다.
   */
  @Get('bids/:tenantId')
  async bids(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Query() query: BidListDto,
  ) {
    const profile = await this.profiles.findDefault(tenantId);
    if (!profile) {
      throw new NotFoundException('기업 프로필을 먼저 등록해 주세요.');
    }

    /*
     * 입찰을 켜지 않은 사람에게는 조회 자체를 하지 않는다.
     * 켜지 않았는데 결과가 나오면 화면과 설정이 어긋난다.
     */
    if (!(profile.interests ?? []).includes('bid')) {
      throw new BadRequestException(
        '내 정보에서 “나라장터 공공 입찰”을 먼저 켜 주세요.',
      );
    }

    /*
     * **기다리게 하지 않는다.**
     *
     * 업종 하나마다 조달청에 한 번씩 물어야 해서 30초를 넘기기도 한다.
     * 그동안 화면을 붙잡아 두면 멈춘 줄 알고 새로고침을 누르는데, 그러면
     * 처음부터 다시 돈다. 시작만 시키고 상태를 돌려준다.
     */
    const started = this.procurement.startForProfile(tenantId, profile, {
      days: query.days,
      refresh: query.refresh === 'true',
    });

    if (started.status === 'done' && started.result) {
      return { status: 'done', ...started.result };
    }
    return {
      status: 'running',
      items: [],
      openCount: 0,
      calls: 0,
      cached: 0,
      usedRegion: null,
      usedIndustries: [],
    };
  }

  /**
   * 조회가 끝났는지 물어본다.
   *
   * 화면이 몇 초마다 이걸 부른다. 다른 화면으로 가도 알림이 대신 알려 주므로
   * 여기 붙어 있을 필요는 없다.
   */
  @Get('bids/:tenantId/status')
  bidsStatus(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.procurement.statusOf(tenantId);
  }

  /**
   * 공고 읽어주기 — 첨부(제안요청서)를 풀어 준비할 것을 뽑는다.
   *
   * 목록에서 고른 공고를 그대로 넘긴다. 다시 조회하지 않는 이유는, 목록이
   * DB 가 아니라 캐시에 있어 공고 번호만으로는 되찾을 수 없기 때문이다.
   */
  @Post('brief/:tenantId')
  @HttpCode(200)
  startBrief(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Body() notice: BidNotice,
  ) {
    return this.brief.start(tenantId, notice);
  }

  /* ────────────── 준비 메모 ────────────── */

  /** 준비 중인 공고들 — 목록 화면에서 "이어보기" 로 쓴다 */
  @Get('drafts/:tenantId')
  listDrafts(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.drafts.list(tenantId);
  }

  /** 공고 하나의 준비 메모. 없으면 null 이다(아직 안 연 공고). */
  @Get('drafts/:tenantId/:bidNo')
  getDraft(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('bidNo') bidNo: string,
  ) {
    return this.drafts.find(tenantId, bidNo);
  }

  /**
   * 준비 메모 저장.
   *
   * 넘어온 항목만 덮어쓴다 — 답변만 보냈는데 읽은 결과가 지워지면 1~2분을
   * 들여 다시 읽어야 한다.
   */
  @Put('drafts/:tenantId/:bidNo')
  saveDraft(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('bidNo') bidNo: string,
    @Body()
    body: {
      notice?: BidNotice;
      brief?: BidBrief | null;
      answers?: BidAnswer[];
      plannedPrice?: number | null;
      starred?: boolean;
    },
  ) {
    return this.drafts.save(tenantId, bidNo, body);
  }

  @Delete('drafts/:tenantId/:bidNo')
  @HttpCode(204)
  async removeDraft(
    @Param('tenantId', ParseUUIDPipe) tenantId: string,
    @Param('bidNo') bidNo: string,
  ) {
    await this.drafts.remove(tenantId, bidNo);
  }
}
