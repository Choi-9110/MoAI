import { Column, Entity, Index } from 'typeorm';
import type { SectionKey, TemplateKind } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/** 사업계획서 양식. 양식별 질의 세트와 섹션 구성이 제품의 핵심 자산이다. */
@Entity('templates')
export class Template extends BaseEntity {
  @Index()
  @Column({ type: 'varchar', length: 40 })
  kind!: TemplateKind;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** 이 양식이 생성할 섹션 순서 */
  @Column({ type: 'jsonb', name: 'section_keys', default: () => "'[]'::jsonb" })
  sectionKeys!: SectionKey[];

  /** 양식 전용 작성 지침 — 프롬프트 시스템 메시지로 주입된다. */
  @Column({ type: 'text', name: 'writing_guide', nullable: true })
  writingGuide!: string | null;

  /** 문체 규칙. 기본값은 정부지원사업 표준인 개조식. */
  @Column({ type: 'varchar', length: 40, name: 'tone_style', default: 'gaejosik' })
  toneStyle!: string;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
