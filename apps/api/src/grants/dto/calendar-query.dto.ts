import { GRANT_CATEGORIES, GRANT_STAGES } from '@moai/shared';
import type { GrantCategory, GrantStage } from '@moai/shared';
import { Transform, Type } from 'class-transformer';
import {
  IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max,
  MaxLength, Min,
} from 'class-validator';

export class CalendarQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  profileId?: string;

  /** 쉼표 구분 문자열도 배열로 받는다 (?categories=startup,rnd) */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((s) => s.trim()) : value,
  )
  @IsArray()
  @IsIn(GRANT_CATEGORIES as unknown as string[], { each: true })
  categories?: GrantCategory[];

  /** 창업 단계 (?stages=early,growth) */
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((s) => s.trim()) : value,
  )
  @IsArray()
  @IsIn(GRANT_STAGES as unknown as string[], { each: true })
  stages?: GrantStage[];

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  eligibleOnly?: boolean;
}

export class UpcomingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  days?: number;

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  profileId?: string;
}

export class ExplainQueryDto {
  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @IsUUID()
  profileId?: string;
}

/**
 * 로드맵 한 칸에 딸린 공고를 찾을 때.
 *
 * 이름과 유형 중 하나만 있어도 된다 — 공고 제목은 해마다 바뀌므로 이름만
 * 요구하면 아무것도 안 나오는 해가 생긴다.
 */
export class RelatedQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(60)
  keyword?: string;

  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.split(',').map((s) => s.trim()) : value,
  )
  @IsArray()
  @IsIn(GRANT_CATEGORIES as unknown as string[], { each: true })
  categories?: GrantCategory[];

  @IsOptional()
  @IsUUID()
  tenantId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10)
  limit?: number;
}
