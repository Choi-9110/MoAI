import { Column, Entity, Index, Unique } from 'typeorm';
import type { QuestionType, SectionKey } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * 질의 항목. 템플릿 하나당 최소 10개 이상을 구성하며,
 * 이 응답들이 사업계획서 생성의 유일한 사실 근거가 된다.
 */
@Entity('questions')
@Unique('uq_question_template_key', ['templateId', 'key'])
export class Question extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'template_id' })
  templateId!: string;

  @Column({ type: 'int', name: 'display_order' })
  order!: number;

  /** 프롬프트에서 참조할 식별자 (예: target_customer) */
  @Column({ type: 'varchar', length: 60 })
  key!: string;

  @Column({ type: 'text' })
  label!: string;

  @Column({ type: 'text', nullable: true })
  hint!: string | null;

  @Column({ type: 'varchar', length: 20, default: 'long_text' })
  type!: QuestionType;

  @Column({ type: 'boolean', default: true })
  required!: boolean;

  /** single_select / multi_select 에서만 사용 */
  @Column({ type: 'jsonb', nullable: true })
  options!: string[] | null;

  @Column({ type: 'int', name: 'max_length', nullable: true })
  maxLength!: number | null;

  /** 이 답변이 주로 기여하는 섹션 (프롬프트 라우팅용) */
  @Column({ type: 'varchar', length: 30, name: 'target_section', nullable: true })
  targetSection!: SectionKey | null;
}
