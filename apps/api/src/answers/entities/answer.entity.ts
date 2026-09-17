import { Column, Entity, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';

/** 질의 응답. 프로젝트 + 질문키 조합으로 유일하다. */
@Entity('answers')
@Unique('uq_answer_project_question', ['projectId', 'questionKey'])
export class Answer extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @Column({ type: 'uuid', name: 'question_id', nullable: true })
  questionId!: string | null;

  @Column({ type: 'varchar', length: 60, name: 'question_key' })
  questionKey!: string;

  /** 문자열 / 숫자 / 배열을 모두 담기 위해 jsonb 사용 */
  @Column({ type: 'jsonb' })
  value!: string | number | string[];

  /** 사용자가 건너뛴 항목 표시 */
  @Column({ type: 'boolean', default: false })
  skipped!: boolean;
}
