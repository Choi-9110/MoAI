import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SECTION_KEYS, buildSectionPrompt, buildSystemPrompt, parseSectionOutput,
} from '@moai/shared';
import type { PlanJob, ProgressEvent, SectionKey } from '@moai/shared';
import type { PlanExecutor } from './plan-executor.interface';

/**
 * Anthropic API 직결 실행기.
 *
 * 평소에는 호출되지 않는 폴백 경로다.
 * 로컬 서버가 살아 있는 동안에는 동작하지 않으므로 유지 비용이 0 이다.
 * 매출이 발생하면 이 실행기를 기본 경로로 승격한다.
 */
@Injectable()
export class ClaudeApiExecutor implements PlanExecutor {
  readonly kind = 'api' as const;
  private readonly logger = new Logger(ClaudeApiExecutor.name);
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Anthropic {
    if (!this.client) {
      this.client = new Anthropic({
        apiKey: this.config.get<string>('ANTHROPIC_API_KEY'),
      });
    }
    return this.client;
  }

  async health(): Promise<boolean> {
    return Boolean(this.config.get<string>('ANTHROPIC_API_KEY'));
  }

  async run(
    job: PlanJob,
    onEvent: (event: ProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const client = this.getClient();
    const model = this.config.get<string>('ANTHROPIC_MODEL', 'claude-opus-5');
    const targets: SectionKey[] =
      job.sections.length > 0 ? job.sections : [...SECTION_KEYS];

    onEvent({ type: 'job_start', jobId: job.jobId, totalSections: targets.length });

    let totalIn = 0;
    let totalOut = 0;

    for (const section of targets) {
      onEvent({ type: 'section_start', section });

      const stream = client.messages.stream(
        {
          model,
          max_tokens: 8000,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'high' },
          system: buildSystemPrompt(job),
          messages: [{ role: 'user', content: buildSectionPrompt(job, section) }],
        },
        { signal },
      );

      stream.on('text', (text) => onEvent({ type: 'token', section, text }));

      const message = await stream.finalMessage();
      const raw = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');

      const { body, confidence, openQuestions } = parseSectionOutput(raw);
      onEvent({ type: 'section_done', section, content: body, confidence, openQuestions });

      totalIn += message.usage.input_tokens;
      totalOut += message.usage.output_tokens;
    }

    onEvent({ type: 'usage', inputTokens: totalIn, outputTokens: totalOut });
    onEvent({ type: 'job_done', jobId: job.jobId, status: 'succeeded' });
    this.logger.log(`API 실행기 완료 — in=${totalIn} out=${totalOut}`);
  }
}
