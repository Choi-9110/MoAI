import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  JUDGE_JSON_FORMAT, JUDGE_SYSTEM_PROMPT, buildJudgePrompt, parseJudgeOutput,
} from '@moai/shared';
import type { Judge, JudgeHealth, JudgeInput, JudgeVerdict } from './judge.types';

/**
 * 로컬 Gemma(Ollama) 판정기 — Claude 를 못 쓸 때의 대체 경로.
 *
 * 인터넷이나 API 키 없이도 돌아가는 것이 장점이지만,
 * 긴 공고 문장에서 조건을 놓치는 경우가 있어 기본값은 Claude 다.
 *
 * 실행 전 준비:
 *   1. https://ollama.com 에서 Ollama 설치
 *   2. ollama pull gemma3:4b
 *   3. ollama serve  (보통 설치 시 자동 실행)
 */
@Injectable()
export class GemmaJudgeService implements Judge {
  readonly name = 'gemma';
  private readonly logger = new Logger(GemmaJudgeService.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('OLLAMA_BASE_URL', 'http://127.0.0.1:11434');
  }

  get model(): string {
    return this.config.get<string>('GEMMA_MODEL', 'gemma3:4b');
  }

  /** Ollama 가 떠 있고 모델이 받아져 있는지 */
  async health(): Promise<JudgeHealth & { models: string[] }> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) {
        return { ok: false, models: [], message: `Ollama 응답 오류 ${res.status}` };
      }
      const body = (await res.json()) as { models?: { name: string }[] };
      const models = (body.models ?? []).map((m) => m.name);
      const hasModel = models.some((m) => m.startsWith(this.model.split(':')[0]));

      return {
        ok: hasModel,
        models,
        message: hasModel
          ? undefined
          : `${this.model} 모델이 없습니다. "ollama pull ${this.model}" 을 실행해 주세요.`,
      };
    } catch (err) {
      return {
        ok: false,
        models: [],
        message: `Ollama 에 연결할 수 없습니다 (${this.baseUrl}). 설치 후 실행해 주세요. — ${(err as Error).message}`,
      };
    }
  }

  /**
   * 공고 1건에 대한 신청 가능 여부 판정.
   *
   * 모델에게 "모르면 unknown 으로 두라"고 명시한다.
   * 잘못된 "가능" 판정은 마감을 놓치는 것보다 나쁘기 때문이다.
   */
  async judge(input: JudgeInput): Promise<JudgeVerdict> {
    // 구조화 출력이 없으므로 형식 안내를 프롬프트에 덧붙인다.
    const prompt = [
      JUDGE_SYSTEM_PROMPT,
      '',
      buildJudgePrompt(input),
      '',
      JUDGE_JSON_FORMAT,
    ].join('\n');

    const res = await fetch(`${this.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        prompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.1, num_ctx: 8192 },
      }),
      signal: AbortSignal.timeout(
        parseInt(this.config.get<string>('GEMMA_TIMEOUT_MS', '120000'), 10),
      ),
    });

    if (!res.ok) {
      throw new Error(`Gemma 호출 실패: ${res.status} ${res.statusText}`);
    }

    const body = (await res.json()) as { response?: string };
    const verdict = parseJudgeOutput(body.response ?? '');
    this.logger.debug(
      `${input.grant.title.slice(0, 24)} — 추가 조건 ${verdict.reasons.length}건`,
    );
    return verdict;
  }
}
