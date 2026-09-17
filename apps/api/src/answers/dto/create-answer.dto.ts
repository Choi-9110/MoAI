import {
  IsBoolean, IsDefined, IsOptional, IsString, IsUUID, Length,
} from 'class-validator';

export class CreateAnswerDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  questionId?: string;

  @IsString()
  @Length(1, 60)
  questionKey!: string;

  /** 문자열 / 숫자 / 배열 모두 허용 */
  @IsDefined()
  value!: string | number | string[];

  @IsOptional()
  @IsBoolean()
  skipped?: boolean;
}
