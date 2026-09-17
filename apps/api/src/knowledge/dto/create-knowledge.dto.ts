import { KNOWLEDGE_CATEGORIES } from '@moai/shared';
import type { KnowledgeCategory } from '@moai/shared';
import {
  IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, IsUUID, Length,
} from 'class-validator';

/**
 * 참조자료 등록 DTO.
 * 실제 학습 데이터 형태가 확정되기 전이므로 metadata 로 자유 필드를 받는다.
 */
export class CreateKnowledgeDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsString()
  @Length(1, 300)
  title!: string;

  @IsOptional()
  @IsIn(KNOWLEDGE_CATEGORIES as unknown as string[])
  category?: KnowledgeCategory;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  source?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  /** 정형화되지 않은 부가 속성 — 스키마 확정 전까지 여기로 받는다. */
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isIndexed?: boolean;
}
