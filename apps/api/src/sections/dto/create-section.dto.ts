import { CONFIDENCE_LEVELS, SECTION_KEYS } from '@moai/shared';
import type { ConfidenceLevel, SectionKey } from '@moai/shared';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';

export class CreateSectionDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsIn(SECTION_KEYS as unknown as string[])
  sectionKey!: SectionKey;

  @IsString()
  content!: string;

  @IsOptional()
  @IsIn(CONFIDENCE_LEVELS as unknown as string[])
  confidence?: ConfidenceLevel;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  openQuestions?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsBoolean()
  isEdited?: boolean;
}
