import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { BizinfoCollector } from './bizinfo.collector';
import { YouthCollector } from './youth.collector';
import { CollectSchedulerService } from './collect-scheduler.service';
import { KStartupCollector } from './kstartup.collector';

class CollectDto {
  /** 최대 페이지 수. 0 이면 끝까지 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(500)
  maxPages?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  perPage?: number;
}

class BizinfoCollectDto {
  /** 받을 건수. 0 이면 전체 */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10000)
  searchCnt?: number;

  /** 분야 코드 — 01 금융 / 02 기술 / 03 인력 / 04 수출 / 05 내수 / 06 창업 / 07 경영 / 09 기타 */
  @IsOptional()
  @IsString()
  @Matches(/^0[1-9]$/, { message: '분야 코드는 01~09 입니다.' })
  realm?: string;
}

@Controller('collectors')
export class CollectorsController {
  constructor(
    private readonly kstartup: KStartupCollector,
    private readonly bizinfo: BizinfoCollector,
    private readonly youth: YouthCollector,
    private readonly scheduler: CollectSchedulerService,
  ) {}

  /** 수집기 상태 — 키가 꽂혀 있는지, 원본에 몇 건이 있는지 */
  @Get('status')
  async status() {
    const kstartupOk = this.kstartup.isConfigured;
    const bizinfoOk = this.bizinfo.isConfigured;
    return {
      running: this.scheduler.isRunning,
      kstartup: {
        configured: kstartupOk,
        totalCount: kstartupOk
          ? await this.kstartup.totalCount().catch(() => null)
          : null,
      },
      bizinfo: {
        configured: bizinfoOk,
        totalCount: bizinfoOk
          ? await this.bizinfo.totalCount().catch(() => null)
          : null,
      },
    };
  }

  /**
   * 수집 + 판정 스윕을 한 번에 — 스케줄러가 도는 것과 같은 경로.
   * maxPages 를 0 으로 주면 전체를 훑는다.
   */
  @Post('run')
  @HttpCode(200)
  run(@Body() dto: CollectDto) {
    return this.scheduler.run({
      label: '수동 실행',
      maxPages: dto.maxPages ?? 30,
    });
  }

  /**
   * 기업마당 공고 수집.
   *
   * 스케줄러에 붙이지 않고 이 경로로만 돈다 — 기업마당은 "지금 게시 중"만
   * 주므로 K-Startup 처럼 증분/전체를 나눌 이유가 없고, 언제 늘릴지는
   * 사람이 정하는 편이 낫다.
   */
  /**
   * 청년정책만 따로 수집.
   *
   * 중분류가 `창업` 인 것만 담는다 — 나머지는 월세·면접비처럼 사업과
   * 무관한 개인 지원이다.
   */
  @Post('youth')
  @HttpCode(200)
  collectYouth() {
    return this.youth.collect(0);
  }

  @Post('bizinfo')
  @HttpCode(200)
  collectBizinfo(@Body() dto: BizinfoCollectDto) {
    return this.bizinfo.collect({
      searchCnt: dto.searchCnt ?? 0,
      ...(dto.realm ? { realm: dto.realm } : {}),
    });
  }

  /** K-Startup 공고 수집 */
  @Post('kstartup')
  @HttpCode(200)
  collectKstartup(@Body() dto: CollectDto) {
    return this.kstartup.collect({
      maxPages: dto.maxPages ?? 5,
      perPage: dto.perPage ?? 100,
    });
  }
}
