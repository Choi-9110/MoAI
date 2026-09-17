import { Column, Entity, Index, Unique } from 'typeorm';
import type { BidAnswer, BidBrief, BidNotice } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * 입찰 준비 메모.
 *
 * **왜 공고까지 통째로 저장하는가.** 입찰 목록은 DB 에 적재하지 않고 그때그때
 * 나라장터에서 받아 온다. 그래서 공고번호만 남겨 두면 나중에 그 공고를
 * 되찾을 수 없다 — 조회 기간(31일)이 지나면 API 에서도 사라진다.
 * 준비하던 것이 통째로 없어지는 셈이라 공고 자체를 함께 담는다.
 *
 * **읽은 결과(brief)도 저장한다.** 제안요청서를 읽는 데 1~2분과 모델 비용이
 * 든다. 화면을 다시 열 때마다 그걸 되풀이할 이유가 없다.
 */
@Entity('bid_drafts')
@Unique('uq_bid_draft_tenant_bidno', ['tenantId', 'bidNo'])
export class BidDraft extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  /** 공고번호 — 차수는 빼고 번호만. 정정되어도 같은 준비물이다. */
  @Column({ type: 'varchar', length: 40, name: 'bid_no' })
  bidNo!: string;

  /** 목록에서 고른 공고 그대로 */
  @Column({ type: 'jsonb' })
  notice!: BidNotice;

  /** 읽어 낸 결과. 아직 안 읽었으면 null */
  @Column({ type: 'jsonb', nullable: true })
  brief!: BidBrief | null;

  /** 요건별 답변 */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  answers!: BidAnswer[];

  /**
   * 읽기 진행 상태.
   *
   * 제안요청서를 읽는 데 1~3분이 걸린다. 그 시간 동안 HTTP 요청을 붙잡고
   * 있으면 **중간의 프록시가 먼저 끊어 500 이 난다** — 요약 한 장에서 이미
   * 겪은 문제다. 그래서 시작만 시키고 결과는 여기로 받는다.
   */
  @Column({ type: 'varchar', length: 20, name: 'brief_status', default: 'idle' })
  briefStatus!: 'idle' | 'running' | 'done' | 'failed';

  @Column({ type: 'text', name: 'brief_error', nullable: true })
  briefError!: string | null;

  /**
   * 관심 표시(별).
   *
   * 입찰 목록은 DB 에 없고 그때그때 받아오므로, 지원사업처럼 공고 id 로
   * 따로 관리할 수가 없다. 준비 메모가 이미 공고를 통째로 들고 있으니
   * 여기에 함께 둔다.
   */
  @Column({ type: 'boolean', default: false })
  starred!: boolean;

  /** 사용자가 정한 투찰 예정가(원) — 가격형 공고에서 쓴다 */
  @Column({ type: 'bigint', name: 'planned_price', nullable: true })
  plannedPrice!: string | null;
}
