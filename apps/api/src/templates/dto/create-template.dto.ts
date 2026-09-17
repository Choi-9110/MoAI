import { SECTION_KEYS, TEMPLATE_KINDS } from '@moai/shared';
import type { SectionKey, TemplateKind } from '@moai/shared';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Min,
} from 'class-validator';

export class CreateTemplateDto {
  @IsIn(TEMPLATE_KINDS as unknown as string[])
  kind!: TemplateKind;

  @IsString()
  @Length(1, 160)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsIn(SECTION_KEYS as unknown as string[], { each: true })
  sectionKeys?: SectionKey[];

  @IsOptional()
  @IsString()
  writingGuide?: string;

  @IsOptional()
  @IsString()
  toneStyle?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  version?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
