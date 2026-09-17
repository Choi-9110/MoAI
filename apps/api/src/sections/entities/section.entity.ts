import { Column, Entity, Index } from 'typeorm';
import type { ConfidenceLevel, SectionKey } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * 생성된 사업계획서 섹션 본문.
 * 재생성 시 새 버전을 쌓아 되돌리기를 지원한다.
 */
@Entity('sections')
export class Section extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @Column({ type: 'uuid', name: 'job_id', nullable: true })
  jobId!: string | null;

  @Column({ type: 'varchar', length: 30, name: 'section_key' })
  sectionKey!: SectionKey;

  @Column({ type: 'text' })
  content!: string;

  /**
   * confirmed / needs_user / risk
   * needs_user 면 프론트에서 사용자에게 되묻는 UI 를 띄운다.
   */
  @Column({ type: 'varchar', length: 20, default: 'confirmed' })
  confidence!: ConfidenceLevel;

  /** AI 가 확신하지 못해 사용자 확인이 필요한 항목 목록 */
  @Column({ type: 'jsonb', name: 'open_questions', default: () => "'[]'::jsonb" })
  openQuestions!: string[];

  @Column({ type: 'int', default: 1 })
  version!: number;

  /** 사용자가 직접 수정했는지 여부 — 재생성 시 덮어쓰기 방지 */
  @Column({ type: 'boolean', name: 'is_edited', default: false })
  isEdited!: boolean;
}
