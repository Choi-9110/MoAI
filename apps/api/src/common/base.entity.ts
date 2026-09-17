import {
  CreateDateColumn, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';

/** 모든 엔티티가 공유하는 기본 컬럼 (UUID PK + 생성/수정 시각) */
export abstract class BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz', name: 'updated_at' })
  updatedAt!: Date;
}
