import { Column, Entity, Index } from 'typeorm';
import type { BriefItem } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * 정책 브리핑 글 하나.
 *
 * 공고와 달리 **모든 사용자가 같은 글을 본다.** 다른 것은 그 안에서 무엇이
 * 먼저 보이느냐다 — 항목마다 대상을 적어 두고 프로필에 맞는 것을 위로 올린다.
 */
@Entity('policy_briefs')
export class PolicyBrief extends BaseEntity {
  @Column({ type: 'varchar', length: 300 })
  title!: string;

  /** 출처 기관 — 예: 중소벤처기업부 */
  @Column({ type: 'varchar', length: 100 })
  source!: string;

  @Index()
  @Column({ type: 'date', name: 'published_at' })
  publishedAt!: string;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'text', name: 'source_url', nullable: true })
  sourceUrl!: string | null;

  /**
   * 변화 항목들.
   *
   * 따로 표를 만들지 않고 여기 담는다. 항목만 따로 조회할 일이 없고,
   * 글과 함께 읽고 함께 고치는 것이라 나누면 손이 두 배가 된다.
   */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  items!: BriefItem[];

  /** 감춰 두기 — 준비 중인 글을 미리 넣어 둘 수 있게 */
  @Index()
  @Column({ type: 'boolean', name: 'is_published', default: true })
  isPublished!: boolean;
}
