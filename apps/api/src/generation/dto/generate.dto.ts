import { SECTION_KEYS } from '@moai/shared';
import type { SectionKey } from '@moai/shared';
import { IsArray, IsIn, IsOptional } from 'class-validator';

export class GenerateDto {
  /** 비우면 전체 섹션 생성, 채우면 해당 섹션만 재생성 */
  @IsOptional()
  @IsArray()
  @IsIn(SECTION_KEYS as unknown as string[], { each: true })
  sections?: SectionKey[];
}
