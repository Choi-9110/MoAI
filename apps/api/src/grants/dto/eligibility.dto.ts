import { SOFT_CHECK_STATUSES } from '@moai/shared';
import type { SoftCheckStatus } from '@moai/shared';
import { Type } from 'class-transformer';
import {
  IsArray, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min,
  ValidateNested,
} from 'class-validator';

export class SweepDto {
  /** 비우면 전체 테넌트를 스윕한다 */
  @IsOptional()
  @IsUUID()
  tenantId?: string;
}

export class PendingQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

/**
 * 판정 근거 한 줄.
 *
 * 클래스로 선언해야 하는 이유가 있다. 인터페이스 배열로 두면
 * ValidationPipe 의 implicit conversion 이 원소를 배열로 바꿔 버려
 * 내용이 통째로 사라진다. 실제로 그렇게 저장된 적이 있다.
 */
export class SoftReasonDto {
  @IsString()
  field!: string;

  @IsIn(['pass', 'fail', 'unknown'])
  verdict!: 'pass' | 'fail' | 'unknown';

  @IsString()
  message!: string;
}

export class SoftResultDto {
  @IsIn(SOFT_CHECK_STATUSES as unknown as string[])
  status!: SoftCheckStatus;

  /** 항목별 판정 근거 */
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SoftReasonDto)
  reasons!: SoftReasonDto[];

  /** 모델이 근거로 삼은 공고 원문 인용 */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  quotes?: string[];

  @IsOptional()
  @IsString()
  model?: string;
}
