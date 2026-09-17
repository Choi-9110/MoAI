import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JUDGE_JSON_FORMAT, JUDGE_SYSTEM_PROMPT, buildJudgePrompt, parseJudgeOutput,
} from '@moai/shared';
import { ClaudeCliService } from '../claude/claude-cli.service';
import type { Judge, JudgeHealth, JudgeInput, JudgeVerdict } from './judge.types';

/**
 * 로컬 Claude CLI 로 판정한다.
 *
 * 하드 필터가 업력·지역·업종·연령·사업자 형태까지 이미 걸러 주므로
 * 여기 오는 건 "공고 원문을 읽어야만 알 수 있는" 조건들이다.
 * 그런 문장은 Gemma 3 4B 가 놓치는 경우가 많아 Claude 를 기본으로 쓴다.
 */
@Injectable()
export class ClaudeCliJudgeService implements Judge {
  readonly name = 'claude-cli';
  private readonly logger = new Logger(ClaudeCliJudgeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly cli: ClaudeCliService,
  ) {}

  get model(): string {
    // 판정은 짧은 문서를 다수 처리하므로 생성보다 가벼운 모델을 쓴다.
    return this.config.get<string>('JUDGE_MODEL', 'claude-sonnet-5');
  }

  health(): Promise<JudgeHealth> {
    return Promise.resolve(this.cli.health());
  }

  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    const envelope = await this.cli.run({
      systemPrompt: `${JUDGE_SYSTEM_PROMPT}\n\n${JUDGE_JSON_FORMAT}`,
      prompt: buildJudgePrompt(input),
      model: this.model,
      timeoutMs: parseInt(
        this.config.get<string>('JUDGE_TIMEOUT_MS', '120000'),
        10,
      ),
    });

    if (envelope.is_error) {
      throw new Error(`Claude CLI 오류: ${envelope.subtype ?? '알 수 없음'}`);
    }

    const verdict = parseJudgeOutput(envelope.result ?? '');
    this.logger.debug(
      `${input.grant.title.slice(0, 24)} — 추가 조건 ${verdict.reasons.length}건` +
        (envelope.total_cost_usd
          ? ` ($${envelope.total_cost_usd.toFixed(4)})`
          : ''),
    );
    return verdict;
  }
}
