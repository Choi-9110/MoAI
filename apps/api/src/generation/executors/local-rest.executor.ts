import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProgressEventSchema } from '@moai/shared';
import type { PlanJob, ProgressEvent } from '@moai/shared';
import type { PlanExecutor } from './plan-executor.interface';

/**
 * 로컬 PC 의 Claude REST 서버(agent)를 호출하는 실행기.
 * Cloudflare Tunnel 을 통해 아웃바운드로 연결된 주소를 사용한다.
 */
@Injectable()
export class LocalRestExecutor implements PlanExecutor {
  readonly kind = 'local' as const;
  private readonly logger = new Logger(LocalRestExecutor.name);

  constructor(private readonly config: ConfigService) {}

  private get baseUrl(): string {
    return this.config.get<string>('AGENT_BASE_URL', 'http://localhost:4100');
  }

  private get headers(): Record<string, string> {
    const token = this.config.get<string>('AGENT_TOKEN', '');
    return {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    };
  }

  async health(): Promise<boolean> {
    const timeoutMs = parseInt(
      this.config.get<string>('AGENT_HEALTH_TIMEOUT_MS', '3000'),
      10,
    );
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        headers: this.headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { ok?: boolean; busySlots?: number; maxSlots?: number };
      if (!body.ok) return false;
      // 슬롯이 가득 찬 경우도 사용 불가로 판정해 API 폴백을 태운다.
      if (
        typeof body.busySlots === 'number' &&
        typeof body.maxSlots === 'number' &&
        body.busySlots >= body.maxSlots
      ) {
        this.logger.warn('로컬 실행기 슬롯 포화 — API 폴백으로 전환');
        return false;
      }
      return true;
    } catch (err) {
      this.logger.warn(`로컬 실행기 헬스체크 실패: ${(err as Error).message}`);
      return false;
    }
  }

  async run(
    job: PlanJob,
    onEvent: (event: ProgressEvent) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const timeoutMs = parseInt(
      this.config.get<string>('AGENT_JOB_TIMEOUT_MS', '600000'),
      10,
    );
    const res = await fetch(`${this.baseUrl}/jobs/stream`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(job),
      signal: signal ?? AbortSignal.timeout(timeoutMs),
    });

    if (!res.ok || !res.body) {
      throw new Error(`로컬 실행기 응답 오류: ${res.status} ${res.statusText}`);
    }

    await this.consumeSse(res.body, onEvent);
  }

  /** SSE 스트림을 파싱해 ProgressEvent 로 변환한다. */
  private async consumeSse(
    body: ReadableStream<Uint8Array>,
    onEvent: (event: ProgressEvent) => void,
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const frames = buffer.split('\n\n');
      buffer = frames.pop() ?? '';

      for (const frame of frames) {
        const line = frame
          .split('\n')
          .find((l) => l.startsWith('data:'));
        if (!line) continue;
        const raw = line.slice(5).trim();
        if (!raw || raw === '[DONE]') continue;

        const parsed = ProgressEventSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          onEvent(parsed.data);
        } else {
          this.logger.warn(`알 수 없는 이벤트 형식: ${raw.slice(0, 120)}`);
        }
      }
    }
  }
}
