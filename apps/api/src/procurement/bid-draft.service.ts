import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { BidAnswer, BidBrief, BidNotice } from '@moai/shared';
import { BidDraft } from './entities/bid-draft.entity';

/**
 * 입찰 준비 메모 보관.
 *
 * 화면에서 답을 적을 때마다 저장된다. 입찰 준비는 한자리에서 끝나지 않고
 * 서류를 찾아보다 돌아오는 일이라, 적어 둔 것이 남아 있지 않으면 다시
 * 열지 않게 된다.
 */
@Injectable()
export class BidDraftService {
  private readonly logger = new Logger(BidDraftService.name);

  constructor(
    @InjectRepository(BidDraft) private readonly drafts: Repository<BidDraft>,
  ) {}

  /** 준비 중인 공고 목록 — 최근에 손댄 것부터 */
  list(tenantId: string): Promise<BidDraft[]> {
    return this.drafts.find({
      where: { tenantId },
      order: { updatedAt: 'DESC' },
      take: 50,
    });
  }

  find(tenantId: string, bidNo: string): Promise<BidDraft | null> {
    return this.drafts.findOne({ where: { tenantId, bidNo } });
  }

  /**
   * 저장 — 있으면 갱신, 없으면 만든다.
   *
   * 넘어온 것만 덮어쓴다. 화면이 답변만 보낼 때 읽은 결과까지 지워지면
   * 다시 1~2분을 들여 읽어야 한다.
   */
  async save(
    tenantId: string,
    bidNo: string,
    patch: {
      notice?: BidNotice;
      brief?: BidBrief | null;
      answers?: BidAnswer[];
      plannedPrice?: number | null;
      briefStatus?: 'idle' | 'running' | 'done' | 'failed';
      briefError?: string | null;
      starred?: boolean;
    },
  ): Promise<BidDraft> {
    const existing = await this.find(tenantId, bidNo);

    const next = existing ?? this.drafts.create({ tenantId, bidNo, answers: [] });
    if (patch.notice) next.notice = patch.notice;
    if (patch.brief !== undefined) next.brief = patch.brief;
    if (patch.answers) next.answers = patch.answers;
    if (patch.starred !== undefined) next.starred = patch.starred;
    if (patch.briefStatus) next.briefStatus = patch.briefStatus;
    if (patch.briefError !== undefined) next.briefError = patch.briefError;
    if (patch.plannedPrice !== undefined) {
      next.plannedPrice = patch.plannedPrice == null ? null : String(patch.plannedPrice);
    }

    const saved = await this.drafts.save(next);
    this.logger.log(
      `준비 메모 저장 — ${bidNo} (답변 ${saved.answers.length}개${saved.brief ? ', 읽음' : ''})`,
    );
    return saved;
  }

  async remove(tenantId: string, bidNo: string): Promise<void> {
    await this.drafts.delete({ tenantId, bidNo });
  }
}
