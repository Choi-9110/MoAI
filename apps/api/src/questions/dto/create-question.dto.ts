import { QUESTION_TYPES, SECTION_KEYS } from '@moai/shared';
import type { QuestionType, SectionKey } from '@moai/shared';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min,
} from 'class-validator';

export class CreateQuestionDto {
  @IsUUID()
  templateId!: string;

  @IsInt()
  @Min(1)
  order!: number;

  @IsString()
  @Length(1, 60)
  key!: string;

  @IsString()
  label!: string;

  @IsOptional()
  @IsString()
  hint?: string;

  @IsOptional()
  @IsIn(QUESTION_TYPES as unknown as string[])
  type?: QuestionType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @IsInt()
  @Min(1)
  maxLength?: number;

  @IsOptional()
  @IsIn(SECTION_KEYS as unknown as string[])
  targetSection?: SectionKey;
}
