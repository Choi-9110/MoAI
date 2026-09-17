import { Column, Entity, Index } from 'typeorm';
import type { ArtifactKind } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/** 산출물 파일. 실제 바이너리는 스토리지에 있고 여기엔 메타만 둔다. */
@Entity('artifacts')
export class Artifact extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'project_id' })
  projectId!: string;

  @Column({ type: 'uuid', name: 'job_id', nullable: true })
  jobId!: string | null;

  @Column({ type: 'varchar', length: 10, default: 'docx' })
  kind!: ArtifactKind;

  /** 스토리지 경로 (Supabase Storage 또는 R2) */
  @Column({ type: 'text', name: 'storage_path' })
  storagePath!: string;

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName!: string;

  @Column({ type: 'bigint', default: 0 })
  bytes!: string;

  /** 만료 시각 — 지난 파일은 정리 배치가 삭제한다. */
  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt!: Date | null;
}
