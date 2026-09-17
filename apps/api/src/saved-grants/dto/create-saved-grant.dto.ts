import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSavedGrantDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  grantId!: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  memo?: string;
}
