import Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JUDGE_JSON_SCHEMA, JUDGE_SYSTEM_PROMPT, buildJudgePrompt, parseJudgeOutput,
} from '@moai/shared';
import type { Judge, JudgeHealth, JudgeInput, JudgeVerdict } from './judge.types';

/**
 * 로컬 Claude 로 소프트 판정을 수행한다.
 *
 * 하드 필터가 업력·지역·업종·연령·사업자 형태까지 이미 걸러 주므로
 * 여기 오는 건 "공고 원문을 읽어야만 알 수 있는" 조건들이다.
 * 그런 문장은 Gemma 3 4B 가 놓치는 경우가 많아 Claude 를 기본으로 쓴다.
 *
 * 구조화 출력을 쓰므로 JSON 형식을 지시문으로 설명할 필요가 없다.
 */
@Injectable()
export class ClaudeJudgeService implements Judge {
  readonly name = 'claude';
  private readonly logger = new Logger(ClaudeJudgeService.name);
  private client: Anthropic | null = null;

  constructor(private readonly config: ConfigService) {}

  private getClient(): Anthropic {
    if (!this.client) {
      // 키가 없으면 SDK 가 로컬 인증 프로필을 쓴다.
      const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
      this.client = new Anthropic(apiKey ? { apiKey } : {});
    }
    return this.client;
  }

  get model(): string {
    // 판정은 짧은 문서를 다수 처리하므로 생성보다 가벼운 모델을 쓴다.
    return this.config.get<string>('JUDGE_MODEL', 'claude-sonnet-5');
  }

  /**
   * 준비 상태.
   *
   * 실제 호출 없이 자격 증명 유무만 본다 — 판정 1건마다 돈이 드는데
   * 헬스체크로 매번 호출을 낭비할 이유가 없다.
   */
  async health(): Promise<JudgeHealth> {
    const hasKey =
      !!this.config.get<string>('ANTHROPIC_API_KEY') ||
      !!process.env.ANTHROPIC_AUTH_TOKEN ||
      !!process.env.CLAUDE_CODE_OAUTH_TOKEN;

    if (!hasKey) {
      return {
        ok: false,
        message:
          'Claude 자격 증명이 없습니다. apps/agent/.env 에 ANTHROPIC_API_KEY 를 넣어 주세요.',
      };
    }
    return { ok: true };
  }

  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    const client = this.getClient();

    const message = await client.messages.create(
      {
        model: this.model,
        max_tokens: 2000,
        system: JUDGE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildJudgePrompt(input) }],
        output_config: {
          format: {
            type: 'json_schema',
            schema: JUDGE_JSON_SCHEMA as unknown as Record<string, unknown>,
          },
        },
      },
      {
        timeout: parseInt(
          this.config.get<string>('JUDGE_TIMEOUT_MS', '60000'),
          10,
        ),
      },
    );

    const raw = message.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const verdict = parseJudgeOutput(raw);
    this.logger.debug(
      `${input.grant.title.slice(0, 24)} — 추가 조건 ${verdict.reasons.length}건`,
    );
    return verdict;
  }
}
