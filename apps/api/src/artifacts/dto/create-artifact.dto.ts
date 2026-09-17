import { ARTIFACT_KINDS } from '@moai/shared';
import type { ArtifactKind } from '@moai/shared';
import {
  IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min,
} from 'class-validator';

export class CreateArtifactDto {
  @IsUUID()
  projectId!: string;

  @IsOptional()
  @IsUUID()
  jobId?: string;

  @IsOptional()
  @IsIn(ARTIFACT_KINDS as unknown as string[])
  kind?: ArtifactKind;

  @IsString()
  storagePath!: string;

  @IsString()
  @Length(1, 255)
  fileName!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  bytes?: number;
}
