import {
  Body, Controller, Delete, Get, HttpCode, NotFoundException,
  Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import type { DeepPartial } from 'typeorm';
import { PaginationDto } from '../common/pagination.dto';
import { CalendarService } from './calendar.service';
import { EligibilityCacheService } from './eligibility-cache.service';
import {
  CalendarQueryDto, ExplainQueryDto, RelatedQueryDto, UpcomingQueryDto,
} from './dto/calendar-query.dto';
import {
  DocumentResultDto, PendingQueryDto, SoftResultDto, SweepDto,
} from './dto/eligibility.dto';
import { GrantDocumentsService } from './grant-documents.service';
import { CreateGrantDto } from './dto/create-grant.dto';
import { UpdateGrantDto } from './dto/update-grant.dto';
import { Grant } from './entities/grant.entity';
import { GrantsService } from './grants.service';
import { Internal, Public } from '../auth/auth.guard';

@Controller('grants')
export class GrantsController {
  constructor(
    private readonly service: GrantsService,
    private readonly calendar: CalendarService,
    private readonly cache: EligibilityCacheService,
    private readonly documents: GrantDocumentsService,
  ) {}

  /* ────────────── 캘린더 ────────────── */

  /**
   * 월간 캘린더.
   * 마감일 기준으로 공고를 날짜에 배치하고 지원 가능 여부를 함께 반환한다.
   *
   *   GET /api/grants/calendar?year=2026&month=8&tenantId=...
   */
  @Get('calendar')
  month(@Query() query: CalendarQueryDto) {
    return this.calendar.month(query);
  }

  /**
   * 로드맵 한 칸에 딸린, 지금 낼 수 있는 공고.
   *
   *   GET /api/grants/related?keyword=초기창업패키지&categories=startup,funding
   */
  @Get('related')
  related(@Query() query: RelatedQueryDto) {
    return this.calendar.relatedToStep({
      keyword: query.keyword,
      categories: query.categories,
      tenantId: query.tenantId,
      limit: query.limit,
    });
  }

  /**
   * 첫 화면에 쓰는 숫자.
   *
   * **로그인 없이 연다.** 첫 화면은 로그인 전에 보는 곳이라 인증을 걸면
   * 쓸 수가 없다. 대신 **누구의 것도 아닌 값만** 준다 — 공고가 몇 건인지,
   * 기관이 몇 곳인지. 특정 기업의 정보는 하나도 섞이지 않는다.
   *
   * 숫자를 박아 두지 않고 세어서 주는 이유는, 박아 두면 그 순간부터 거짓말이
   * 되기 때문이다. 공고는 매일 들어오고 매일 마감된다.
   */
  @Public()
  @Get('stats')
  stats() {
    return this.calendar.publicStats();
  }

  /**
   * 어제 새로 올라온 공고.
   *
   *   GET /api/grants/fresh?tenantId=...
   *
   * 기간(`from`~`to`)을 함께 준다 — 화면에서 "어제"가 아니라
   * "09/01 04:12 ~ 09/02 04:08" 로 적기 위해서다.
   */
  @Get('fresh')
  fresh(@Query() query: UpcomingQueryDto) {
    return this.calendar.fresh({
      tenantId: query.tenantId,
      profileId: query.profileId,
      hours: query.days ? query.days * 24 : 24,
    });
  }

  /**
   * 내 정보에서 먼저 채우면 좋은 칸 — 막고 있는 공고 수 순.
   *
   *   GET /api/grants/eligibility/unlock?tenantId=...
   *
   * `:id/eligibility` 보다 **위에** 둔다. 아래에 두면 `eligibility` 가
   * 공고 id 자리로 읽혀 UUID 검사에서 400 이 난다.
   */
  @Get('eligibility/unlock')
  unlock(@Query() query: ExplainQueryDto) {
    return this.calendar.unlockHints(query);
  }

  /** 마감 임박 공고 (기본 14일) */
  @Get('calendar/upcoming')
  upcoming(@Query() query: UpcomingQueryDto) {
    return this.calendar.upcoming(query);
  }

  /** 공고 1건의 지원 가능 여부 판정 상세 */
  @Get(':id/eligibility')
  async eligibility(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ExplainQueryDto,
  ) {
    const result = await this.calendar.explain(id, query);
    if (!result) throw new NotFoundException(`공고를 찾을 수 없습니다: ${id}`);
    return result;
  }

  /* ────────────── 판정 캐시 ────────────── */

  /**
   * 하드 필터 스윕.
   * 매일 도는 배치가 호출한다. 접수 중인 공고 × 기업 프로필 조합 중
   * 아직 판정하지 않았거나 내용이 바뀐 것만 처리한다.
   */
  @Post('eligibility/sweep')
  @HttpCode(200)
  sweep(@Body() dto: SweepDto) {
    return this.cache.sweep({ tenantId: dto.tenantId });
  }

  /**
   * 소프트 판정 대기열.
   * 로컬 LLM 워커가 이 목록을 가져가 하나씩 처리한다.
   */
  @Internal()
  @Get('eligibility/pending')
  async pending(@Query() query: PendingQueryDto) {
    const rows = await this.cache.pendingSoftChecks(query.limit ?? 50);
    return rows.map(({ check, grant, profile }) => ({
      checkId: check.id,
      grant: {
        id: grant.id,
        title: grant.title,
        agency: grant.agency,
        summary: grant.summary,
        sourceUrl: grant.sourceUrl,
        // 판정의 핵심 재료다 — 코드가 구조화하지 못한 조건이 여기 들어 있다.
        applyTargetDetail: grant.applyTargetDetail,
        excludeTarget: grant.excludeTarget,
      },
      profile: {
        id: profile.id,
        name: profile.name,
        stage: profile.stage,
        industry: profile.industry,
        region: profile.region,
        foundedAt: profile.foundedAt,
        employees: profile.employees,
        certifications: profile.certifications,
        regionDetail: profile.regionDetail,
        founderBirthYear: profile.founderBirthYear,
        annualRevenue: profile.annualRevenue,
        founderTraits: profile.founderTraits,
        isSmallBusiness: profile.isSmallBusiness,
        exportStatus: profile.exportStatus,
        hasIp: profile.hasIp,
        pastPrograms: profile.pastPrograms,
      },
      hardReasons: check.hardReasons,
    }));
  }

  /** 로컬 LLM 판정 결과 수신 */
  @Internal()
  @Post('eligibility/:checkId/result')
  @HttpCode(200)
  async saveResult(
    @Param('checkId', ParseUUIDPipe) checkId: string,
    @Body() dto: SoftResultDto,
  ) {
    await this.cache.saveSoftResult(checkId, {
      status: dto.status,
      reasons: dto.reasons,
      quotes: dto.quotes,
      model: dto.model,
    });
    return { ok: true };
  }

  /* ────────────── 공고문 읽기 ────────────── */

  /** 읽을 공고문 대기열 — 로컬 에이전트가 가져간다 */
  @Internal()
  @Get('documents/pending')
  documentsPending(@Query() query: PendingQueryDto) {
    return this.documents.pending(query.limit ?? 10);
  }

  /** 공고문 읽기 결과 수신 */
  @Internal()
  @Post('documents/:grantId/result')
  @HttpCode(200)
  documentResult(
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @Body() dto: DocumentResultDto,
  ) {
    return this.documents.saveResult(grantId, {
      ...dto,
      conditions: dto.conditions as never,
    });
  }

  /** 진행 현황 */
  @Internal()
  @Get('documents/stats')
  documentStats() {
    return this.documents.stats();
  }

  /** 테넌트 판정 요약 */
  @Get('eligibility/summary/:tenantId')
  summary(@Param('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.cache.summary(tenantId);
  }

  /**
   * 즉시 분석 — 사용자가 "사업 분석하기"를 눌렀을 때.
   * 하드 필터를 먼저 채운 뒤, 로컬 판정 워커를 깨워 대기열을 비운다.
   */
  @Post('eligibility/analyze')
  @HttpCode(200)
  async analyze(@Body() dto: SweepDto) {
    const sweep = await this.cache.sweep({ tenantId: dto.tenantId });
    const worker = await this.cache.triggerLocalWorker();
    return { sweep, worker };
  }

  /* ────────────── CRUD ────────────── */

  @Post()
  create(@Body() dto: CreateGrantDto) {
    return this.service.create(dto as unknown as DeepPartial<Grant>);
  }

  @Get()
  findAll(@Query() query: PaginationDto) {
    return this.service.findAll(query.page, query.limit);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGrantDto,
  ) {
    return this.service.update(id, dto as unknown as DeepPartial<Grant>);
  }

  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.remove(id);
  }
}
