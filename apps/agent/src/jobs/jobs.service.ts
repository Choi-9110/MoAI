import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SECTION_KEYS } from '@moai/shared';
import type { Health, PlanJob, ProgressEvent, SectionKey } from '@moai/shared';
import { ClaudeCliService } from '../claude/claude-cli.service';
import { ClaudeService } from '../claude/claude.service';
import { DocxService } from '../docx/docx.service';

/**
 * 로컬 실행기의 잡 처리기.
 *
 * 동시 실행 슬롯을 제한해 PC 자원을 보호하고,
 * 남은 슬롯을 헬스체크로 노출해 백엔드가 API 폴백을 결정할 수 있게 한다.
 */
@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  private readonly startedAt = Date.now();
  private busy = 0;

  constructor(
    private readonly config: ConfigService,
    private readonly claude: ClaudeService,
    private readonly cli: ClaudeCliService,
    private readonly docx: DocxService,
  ) {}

  get maxSlots(): number {
    return parseInt(this.config.get<string>('MAX_CONCURRENT_JOBS', '2'), 10);
  }

  /**
   * 지금 일을 할 수 있는 상태인가.
   *
   * **예전에는 무조건 `ok: true` 였다.** 그래서 실행기가 며칠 켜져 있다가
   * 조용히 맛이 갔을 때도 200 을 돌려줬고, 지켜보는 쪽도 지켜보는 사람도
   * 멀쩡한 줄 알았다. 사용자가 요약 만들기를 눌러 500 을 받은 뒤에야
   * 드러났다.
   *
   * 그래서 **Claude 명령이 실제로 있는지**까지 본다. 이게 없으면 어떤 일도
   * 못 하므로, 그 사실을 여기서 알려야 다시 띄우든 사람을 부르든 한다.
   */
  health(): Health {
    const cli = this.cli.resolveCli();

    return {
      ok: cli !== null,
      executor: 'local',
      version: '0.1.0',
      busySlots: this.busy,
      maxSlots: this.maxSlots,
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      ...(cli === null
        ? { reason: 'Claude 명령을 찾지 못했습니다 (claude CLI 미설치 또는 PATH 밖)' }
        : {}),
    };
  }

  hasCapacity(): boolean {
    return this.busy < this.maxSlots;
  }

  /**
   * 잡을 실행하며 진행 이벤트를 순차적으로 방출한다.
   * 비동기 제너레이터라 컨트롤러에서 그대로 SSE 로 흘려보낼 수 있다.
   */
  async *run(
    job: PlanJob,
    signal?: AbortSignal,
  ): AsyncGenerator<ProgressEvent, void, undefined> {
    const targets: SectionKey[] =
      job.sections.length > 0 ? job.sections : [...SECTION_KEYS];

    this.busy += 1;
    this.logger.log(
      `잡 시작 ${job.jobId} — 섹션 ${targets.length}개, 슬롯 ${this.busy}/${this.maxSlots}`,
    );

    let totalIn = 0;
    let totalOut = 0;
    const completed: { section: SectionKey; content: string }[] = [];

    try {
      yield { type: 'job_start', jobId: job.jobId, totalSections: targets.length };

      for (const section of targets) {
        if (signal?.aborted) throw new Error('클라이언트가 연결을 종료했습니다.');

        yield { type: 'section_start', section };

        // 스트리밍 토큰은 버퍼에 모았다가 섹션 단위로 흘려보낸다.
        const buffer: string[] = [];
        const result = await this.claude.generateSection(
          job,
          section,
          (text) => buffer.push(text),
          signal,
        );

        // 모아둔 토큰을 순서대로 방출
        for (const chunk of buffer) {
          yield { type: 'token', section, text: chunk };
        }

        yield {
          type: 'section_done',
          section,
          content: result.content,
          confidence: result.confidence,
          openQuestions: result.openQuestions,
        };

        completed.push({ section, content: result.content });
        totalIn += result.inputTokens;
        totalOut += result.outputTokens;
      }

      // 전체 생성일 때만 문서를 만든다.
      if (job.sections.length === 0 && completed.length > 0) {
        const artifact = await this.docx.build(job, completed);
        yield {
          type: 'artifact',
          kind: 'docx',
          url: artifact.path,
          bytes: artifact.bytes,
        };
      }

      yield { type: 'usage', inputTokens: totalIn, outputTokens: totalOut };
      yield { type: 'job_done', jobId: job.jobId, status: 'succeeded' };
      this.logger.log(`잡 완료 ${job.jobId} — in=${totalIn} out=${totalOut}`);
    } catch (err) {
      const message = (err as Error).message;
      this.logger.error(`잡 실패 ${job.jobId}: ${message}`);
      yield { type: 'error', message, retryable: true };
      yield { type: 'job_done', jobId: job.jobId, status: 'failed' };
    } finally {
      this.busy = Math.max(0, this.busy - 1);
      // 고객 아이디어가 로컬에 남지 않도록 작업 산출물을 정리한다.
      await this.docx.cleanup(job.jobId);
    }
  }
}
