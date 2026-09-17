import { Column, Entity, Index } from 'typeorm';
import type { KnowledgeCategory } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * AI 참조(학습) 데이터.
 *
 * 실제 데이터 수급 전까지는 스키마를 느슨하게 유지한다.
 * 정형화되지 않은 필드는 전부 metadata(jsonb) 로 받아두고,
 * 데이터 형태가 확정되면 자주 쓰이는 키만 정식 컬럼으로 승격한다.
 */
@Entity('knowledge')
export class Knowledge extends BaseEntity {
  /** null 이면 전역 공용 자료 */
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id', nullable: true })
  tenantId!: string | null;

  @Column({ type: 'varchar', length: 300 })
  title!: string;

  @Index()
  @Column({ type: 'varchar', length: 30, default: 'etc' })
  category!: KnowledgeCategory;

  /** 본문 원문 (청크 분할 전) */
  @Column({ type: 'text' })
  content!: string;

  /** 출처 URL 또는 파일명 */
  @Column({ type: 'text', nullable: true })
  source!: string | null;

  /** 검색·필터용 태그 (업종, 지역, 연도 등) */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  tags!: string[];

  /**
   * 미확정 속성 보관소.
   * 예: { grantAmount: 50000000, agency: "중기부", selectedYear: 2025 }
   */
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  /**
   * 임베딩 벡터.
   * pgvector 확장 활성화 후 vector(1536) 으로 마이그레이션한다.
   * 그 전까지는 float 배열을 jsonb 로 보관한다.
   */
  @Column({ type: 'jsonb', nullable: true })
  embedding!: number[] | null;

  /** RAG 후보에서 제외할지 여부 */
  @Column({ type: 'boolean', name: 'is_indexed', default: false })
  isIndexed!: boolean;
}
