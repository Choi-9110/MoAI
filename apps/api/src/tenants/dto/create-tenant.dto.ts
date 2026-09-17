import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Length, Min } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsIn(['free', 'pro', 'enterprise'])
  plan?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  monthlyTokenLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  concurrentJobLimit?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
