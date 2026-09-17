import { IsBoolean, IsEmail, IsIn, IsOptional, IsString, IsUUID, Length } from 'class-validator';

export class CreateUserDto {
  @IsUUID()
  tenantId!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @Length(1, 80)
  name?: string;

  @IsOptional()
  @IsIn(['owner', 'member'])
  role?: string;

  @IsOptional()
  @IsUUID()
  authUserId?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
