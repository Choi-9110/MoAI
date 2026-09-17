import { PROJECT_TRACKS, TEMPLATE_KINDS } from '@moai/shared';
import type { ModooAnswers, ProjectTrack, TemplateKind } from '@moai/shared';
import {
  IsIn, IsObject, IsOptional, IsString, IsUUID, Length, MinLength, ValidateIf,
} from 'class-validator';

export class CreateProjectDto {
  /** 안 주면 gov — 기존 화면들이 트랙을 모르던 시절에 맞춘다 */
  @IsOptional()
  @IsIn(PROJECT_TRACKS as unknown as string[])
  track?: ProjectTrack;

  /**
   * 모두의창업 지원서 답변.
   *
   * 이 트랙에서는 제목과 아이디어를 사용자가 따로 쓰지 않는다 —
   * Q1 이 제목이고 문항 전체가 아이디어다. 서버에서 만들어 넣는다.
   */
  @ValidateIf((o: CreateProjectDto) => o.track === 'modoo')
  @IsObject()
  modooAnswers?: ModooAnswers;

  @IsUUID()
  tenantId!: string;

  @IsUUID()
  userId!: string;

  /**
   * 사업계획서 양식 — 사업을 시작하는 시점에는 고르지 않는다.
   * 공고마다 양식이 다르므로 사업계획서를 만들 때 그 공고의 양식을 올린다.
   */
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsIn(TEMPLATE_KINDS as unknown as string[])
  templateKind?: TemplateKind;

  @ValidateIf((o: CreateProjectDto) => o.track !== 'modoo')
  @IsString()
  @Length(1, 200)
  title!: string;

  /** 아이디어 원문 — 너무 짧으면 생성 품질이 급격히 떨어진다. */
  @ValidateIf((o: CreateProjectDto) => o.track !== 'modoo')
  @IsString()
  @MinLength(10, { message: '아이디어는 최소 10자 이상 입력해 주세요.' })
  idea!: string;

  /** 캘린더에서 공고를 골라 시작한 경우 */
  @IsOptional()
  @IsUUID()
  grantId?: string;

  @IsOptional()
  @IsString()
  status?: string;
}
