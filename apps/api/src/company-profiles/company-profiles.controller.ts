import {
  BadRequestException,
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import type { DeepPartial } from 'typeorm';
import { PaginationDto } from '../common/pagination.dto';
import { EligibilityCacheService } from '../grants/eligibility-cache.service';
import { CompanyProfilesService } from './company-profiles.service';
import {
  AnswerConditionsDto, isConditionAnswer,
} from './dto/answer-conditions.dto';
import { CreateCompanyProfileDto } from './dto/create-company-profile.dto';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { CompanyProfile } from './entities/company-profile.entity';

@Controller('company-profiles')
export class CompanyProfilesController {
  constructor(
    private readonly service: CompanyProfilesService,
    private readonly cache: EligibilityCacheService,
  ) {}

  @Post()
  create(@Body() dto: CreateCompanyProfileDto) {
    return this.service.create(dto as DeepPartial<CompanyProfile>);
  }

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query.page, query.limit);
  }

  /** 테넌트의 기본 프로필 — 캘린더가 판정 기준으로 사용 */
  @Get('default/:tenantId')
  findDefault(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.service.findDefault(tenantId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  /**
   * 기업 정보가 바뀌면 기존 판정을 신뢰할 수 없다.
   * 저장 직후 해당 기업의 판정 캐시를 전부 비우고, 다음 스윕에서 다시 계산한다.
   */
  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyProfileDto,
  ) {
    const updated = await this.service.update(
      id,
      dto as DeepPartial<CompanyProfile>,
    );
    await this.cache.invalidateProfile(id);
    return updated;
  }

  /**
   * 공고 조건 체크리스트 답변 저장.
   *
   * 조건 문장 자체가 키라서, 한 번 답하면 같은 문구가 들어간 다른 공고에도
   * 그대로 적용된다. 답을 지우려면 값으로 null 을 보낸다.
   */
  @Patch(':id/conditions')
  async answerConditions(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AnswerConditionsDto,
  ) {
    const profile = await this.service.findOne(id);
    const next = { ...(profile.conditionAnswers ?? {}) };

    for (const [key, value] of Object.entries(dto.answers ?? {})) {
      if (value === null) delete next[key];
      else if (isConditionAnswer(value)) next[key] = value;
      else {
        throw new BadRequestException(
          `조건 답변은 예/아니오만 가능합니다: ${key} = ${String(value)}`,
        );
      }
    }

    const updated = await this.service.update(id, {
      conditionAnswers: next,
    } as DeepPartial<CompanyProfile>);

    // 답이 바뀌면 이전 판정은 더 이상 맞지 않는다.
    await this.cache.invalidateProfile(id);
    return updated;
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    await this.cache.invalidateProfile(id);
    return this.service.remove(id);
  }
}
