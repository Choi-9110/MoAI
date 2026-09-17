import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { PlanJobSchema, SECTION_KEYS } from '@moai/shared';
import type { PlanJob, ProgressEvent, SectionKey } from '@moai/shared';
import { Answer } from '../answers/entities/answer.entity';
import { Job } from '../jobs/entities/job.entity';
import { Knowledge } from '../knowledge/entities/knowledge.entity';
import { Project } from '../projects/entities/project.entity';
import { Section } from '../sections/entities/section.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { Usage } from '../usage/entities/usage.entity';
import { ExecutorRegistry } from './executors/executor.registry';

/** 생성에 필요한 최소 응답 개수 */
export const MIN_ANSWERS = 10;

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);

  constructor(
    private readonly registry: ExecutorRegistry,
    @InjectRepository(Project) private readonly projects: Repository<Project>,
    @InjectRepository(Answer) private readonly answers: Repository<Answer>,
    @InjectRepository(Section) private readonly sections: Repository<Section>,
    @InjectRepository(Job) private readonly jobs: Repository<Job>,
    @InjectRepository(Knowledge) private readonly knowledge: Repository<Knowledge>,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(Usage) private readonly usage: Repository<Usage>,
  ) {}

  /**
   * 생성 잡을 준비한다.
   * 응답 10개 미만이거나 월 사용량을 초과하면 여기서 막는다.
   */
  async prepare(
    projectId: string,
    targetSections: SectionKey[] = [],
  ): Promise<{ job: Job; payload: PlanJob }> {
    const project = await this.projects.findOne({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException(`프로젝트를 찾을 수 없습니다: ${projectId}`);
    }

    const answers = await this.answers.find({ where: { projectId } });
    const usable = answers.filter((a) => !a.skipped);

    if (usable.length < MIN_ANSWERS) {
      throw new BadRequestException(
        `사업계획서 생성에는 최소 ${MIN_ANSWERS}개의 응답이 필요합니다. (현재 ${usable.length}개)`,
      );
    }

    await this.assertWithinQuota(project.tenantId);

    const knowledge = await this.selectKnowledge(project);

    const jobRow = await this.jobs.save(
      this.jobs.create({
        id: randomUUID(),
        projectId: project.id,
        tenantId: project.tenantId,
        status: 'queued',
        targetSections,
        startedAt: new Date(),
      }),
    );

    const payload = PlanJobSchema.parse({
      jobId: jobRow.id,
      projectId: project.id,
      tenantId: project.tenantId,
      templateKind: project.templateKind,
      idea: project.idea,
      answers: usable.map((a) => ({
        questionKey: a.questionKey,
        value: a.value,
      })),
      knowledge: knowledge.map((k) => ({
        id: k.id,
        title: k.title,
        category: k.category,
        content: k.content,
      })),
      sections: targetSections,
      regenerate: targetSections.length > 0,
    });

    return { job: jobRow, payload };
  }

  /**
   * 잡을 실행하고 진행 이벤트를 그대로 흘려보낸다.
   * 섹션이 완성될 때마다 DB 에 저장하므로 중간에 끊겨도 결과가 남는다.
   */
  async execute(
    job: Job,
    payload: PlanJob,
    onEvent: (event: ProgressEvent) => void,
  ): Promise<void> {
    const { executor, fellBack } = await this.registry.resolve();

    await this.jobs.update(job.id, {
      status: 'running',
      executor: executor.kind,
      fellBack,
    });

    let inputTokens = 0;
    let outputTokens = 0;
    const pending: Promise<void>[] = [];

    try {
      await executor.run(payload, (event) => {
        onEvent(event);

        if (event.type === 'section_done') {
          pending.push(this.persistSection(job, event));
        }
        if (event.type === 'usage') {
          inputTokens = event.inputTokens;
          outputTokens = event.outputTokens;
        }
      });

      await Promise.all(pending);

      await this.jobs.update(job.id, {
        status: 'succeeded',
        finishedAt: new Date(),
        inputTokens,
        outputTokens,
      });
      await this.projects.update(job.projectId, {
        status: 'completed',
        lastGeneratedAt: new Date(),
      });
      await this.recordUsage(job, executor.kind, inputTokens, outputTokens);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`잡 실패 ${job.id}: ${message}`);
      await this.jobs.update(job.id, {
        status: 'failed',
        errorMessage: message,
        finishedAt: new Date(),
      });
      onEvent({ type: 'error', message, retryable: true });
      throw err;
    }
  }

  /** 완성된 섹션을 저장한다. 사용자가 직접 수정한 섹션은 덮어쓰지 않는다. */
  private async persistSection(
    job: Job,
    event: Extract<ProgressEvent, { type: 'section_done' }>,
  ): Promise<void> {
    const existing = await this.sections.findOne({
      where: { projectId: job.projectId, sectionKey: event.section },
      order: { version: 'DESC' },
    });

    if (existing?.isEdited) {
      this.logger.log(`사용자 편집본 유지 — ${event.section} 덮어쓰기 생략`);
      return;
    }

    await this.sections.save(
      this.sections.create({
        projectId: job.projectId,
        jobId: job.id,
        sectionKey: event.section,
        content: event.content,
        confidence: event.confidence,
        openQuestions: event.openQuestions,
        version: (existing?.version ?? 0) + 1,
        isEdited: false,
      }),
    );
  }

  /** 월 토큰 상한 검사 — 비용 폭주 방어의 마지막 관문 */
  private async assertWithinQuota(tenantId: string): Promise<void> {
    const tenant = await this.tenants.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('테넌트를 찾을 수 없습니다.');
    if (!tenant.isActive) {
      throw new BadRequestException('비활성 상태의 테넌트입니다.');
    }

    const month = new Date().toISOString().slice(0, 7);
    const row = await this.usage
      .createQueryBuilder('u')
      .select('COALESCE(SUM(u.input_tokens + u.output_tokens), 0)', 'sum')
      .where('u.tenant_id = :tenantId', { tenantId })
      .andWhere('u.billing_month = :month', { month })
      .getRawOne<{ sum: string }>();

    const used = Number(row?.sum ?? 0);
    const limit = Number(tenant.monthlyTokenLimit);

    if (used >= limit) {
      throw new BadRequestException(
        `이번 달 사용량 한도를 초과했습니다. (${used.toLocaleString()} / ${limit.toLocaleString()} 토큰)`,
      );
    }
  }

  /**
   * RAG 후보 선별.
   *
   * 현재는 테넌트 자료 + 전역 공용 자료를 최신순으로 가져오는 단순 조회다.
   * 임베딩 파이프라인이 준비되면 pgvector 유사도 검색으로 교체한다.
   */
  private async selectKnowledge(project: Project): Promise<Knowledge[]> {
    return this.knowledge.find({
      where: [
        { tenantId: project.tenantId, isIndexed: true },
        { tenantId: IsNull(), isIndexed: true },
      ],
      order: { createdAt: 'DESC' },
      take: 5,
    });
  }

  /** 사용량 적재. local 실행기는 비용 0 으로 기록한다. */
  private async recordUsage(
    job: Job,
    executor: 'local' | 'api',
    inputTokens: number,
    outputTokens: number,
  ): Promise<void> {
    const costKrw =
      executor === 'api'
        ? ((inputTokens / 1_000_000) * 5 + (outputTokens / 1_000_000) * 25) * 1400
        : 0;

    await this.usage.save(
      this.usage.create({
        tenantId: job.tenantId,
        projectId: job.projectId,
        jobId: job.id,
        executor,
        inputTokens,
        outputTokens,
        costKrw: costKrw.toFixed(2),
        billingMonth: new Date().toISOString().slice(0, 7),
      }),
    );
  }

  /** 전체 섹션 키 (프론트 진행률 표시용) */
  allSections(): readonly SectionKey[] {
    return SECTION_KEYS;
  }
}
