import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BidBrief, BidNotice } from '@moai/shared';
import { BidDraftService } from './bid-draft.service';

/**
 * 공고 읽기 중계.
 *
 * 실제로 첨부를 내려받아 한글 문서를 풀고 모델을 돌리는 것은 **로컬 서버
 * (agent)** 다. 한글 파서가 그쪽에 있고, 큰 파일을 이쪽으로 옮겨 올 이유도
 * 없다 — 공고 정보와 첨부 주소만 넘기면 그 서버가 직접 받아 읽는다.
 */
@Injectable()
export class BidBriefService {
  private readonly logger = new Logger(BidBriefService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly drafts: BidDraftService,
  ) {}

  /**
   * 읽기 시작만 시키고 곧바로 돌려준다.
   *
   * 붙잡고 기다리면 프록시가 먼저 끊어 500 이 난다(요약 한 장에서 겪은 것과
   * 같은 문제다). 결과는 준비 메모에 담기므로 화면은 그것을 물어보면 된다.
   */
  async start(tenantId: string, notice: BidNotice): Promise<{ status: string }> {
    const existing = await this.drafts.find(tenantId, notice.bidNo);
    if (existing?.briefStatus === 'running') {
      return { status: 'running' };
    }

    await this.drafts.save(tenantId, notice.bidNo, {
      notice,
      briefStatus: 'running',
      briefError: null,
    });

    // 기다리지 않는다. 끝나면 스스로 저장한다.
    void this.read(notice)
      .then((brief) =>
        this.drafts.save(tenantId, notice.bidNo, {
          brief,
          briefStatus: 'done',
          briefError: null,
        }),
      )
      .catch((err: Error) =>
        this.drafts.save(tenantId, notice.bidNo, {
          briefStatus: 'failed',
          briefError: err.message,
        }),
      );

    return { status: 'running' };
  }

  private get agentUrl(): string {
    return this.config.get<string>('AGENT_BASE_URL', 'http://localhost:4100');
  }

  private get agentToken(): string {
    return this.config.get<string>('AGENT_TOKEN', '');
  }

  /** 공고 하나를 읽어 준비할 것을 뽑는다 */
  async read(notice: BidNotice): Promise<BidBrief> {
    const timeoutMs = parseInt(
      this.config.get<string>('BRIEF_TIMEOUT_MS', '600000'),
      10,
    );

    let res: Response;
    try {
      res = await fetch(`${this.agentUrl}/brief`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.agentToken ? { authorization: `Bearer ${this.agentToken}` } : {}),
        },
        body: JSON.stringify(notice),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      /*
       * 읽기는 로컬 서버가 살아 있어야만 된다 — API 폴백 경로가 없다.
       * 사용자에게는 내부 주소 대신 무엇을 하면 되는지만 알린다.
       */
      this.logger.error(`공고 읽기 실패 — agent 연결 불가: ${(err as Error).message}`);
      throw new ServiceUnavailableException(
        '지금은 공고를 읽을 수 없습니다. 잠시 후 다시 시도해 주세요.',
      );
    }

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new ServiceUnavailableException(
        body.message ?? `공고를 읽지 못했습니다 (${res.status})`,
      );
    }

    return (await res.json()) as BidBrief;
  }
}
