import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildSectionPrompt, buildSystemPrompt, parseSectionOutput } from '@moai/shared';
import type { ConfidenceLevel, PlanJob, SectionKey } from '@moai/shared';

export interface SectionResult {
  section: SectionKey;
  content: string;
  confidence: ConfidenceLevel;
  openQuestions: string[];
  inputTokens: number;
  outputTokens: number;
}

/**
 * 로컬에서 Claude 를 호출해 섹션 본문을 생성한다.
 *
 * api 서버와 동일한 프롬프트 빌더(@moai/shared)를 사용하므로
 * 실행 위치가 바뀌어도 결과 형식이 달라지지 않는다.
 */
@Injectable()
export class ClaudeService {
  private readonly logger = new Logger(ClaudeService.name);
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Anthropic {
    if (!this.client) {
      // API 키가 없으면 SDK 가 로컬 인증 프로필을 사용한다.
      const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
      this.client = new Anthropic(apiKey ? { apiKey } : {});
    }
    return this.client;
  }

  get model(): string {
    return this.config.get<string>('ANTHROPIC_MODEL', 'claude-opus-5');
  }

  /** 섹션 1개를 스트리밍 생성한다. */
  async generateSection(
    job: PlanJob,
    section: SectionKey,
    onToken: (text: string) => void,
    signal?: AbortSignal,
  ): Promise<SectionResult> {
    const client = this.getClient();

    const stream = client.messages.stream(
      {
        model: this.model,
        max_tokens: 8000,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'high' },
        system: buildSystemPrompt(job),
        messages: [{ role: 'user', content: buildSectionPrompt(job, section) }],
      },
      { signal },
    );

    stream.on('text', onToken);

    const message = await stream.finalMessage();
    const raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const { body, confidence, openQuestions } = parseSectionOutput(raw);

    this.logger.log(
      `${section} 생성 완료 — ${body.length}자, 확인필요 ${openQuestions.length}건`,
    );

    return {
      section,
      content: body,
      confidence,
      openQuestions,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
    };
  }
}
