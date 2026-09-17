import { AGENCY_TYPES, GRANT_CATEGORIES, INDUSTRIES } from '@moai/shared';
import type { AgencyType, GrantCategory, Industry } from '@moai/shared';
import {
  IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNumber,
  IsObject, IsOptional, IsString, Length, Min,
} from 'class-validator';

export class CreateGrantDto {
  @IsString()
  @Length(1, 400)
  title!: string;

  @IsString()
  @Length(1, 160)
  agency!: string;

  @IsOptional()
  @IsIn(AGENCY_TYPES as unknown as string[])
  agencyType?: AgencyType;

  @IsOptional()
  @IsIn(GRANT_CATEGORIES as unknown as string[])
  category?: GrantCategory;

  @IsOptional()
  @IsString()
  summary?: string;

  @IsOptional()
  @IsDateString()
  applyStartAt?: string;

  @IsOptional()
  @IsDateString()
  applyEndAt?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountMin?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amountMax?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetRegions?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(INDUSTRIES as unknown as string[], { each: true })
  targetIndustries?: Industry[];

  @IsOptional()
  @IsInt()
  @Min(0)
  minBusinessYears?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxBusinessYears?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  maxEmployees?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  maxRevenue?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  requiredCertifications?: string[];

  @IsOptional()
  @IsBoolean()
  corporationOnly?: boolean;

  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @IsOptional()
  @IsString()
  sourceApi?: string;

  @IsOptional()
  @IsObject()
  rawMetadata?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
