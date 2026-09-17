import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';

/**
 * IR 덱 보관함.
 *
 * **파일을 맡아 두는 곳이다.** 만들어 주는 것이 아니라, 이미 있는 발표
 * 자료를 올려 두고 필요할 때 어디서든 내려받게 한다 — 노트북을 안 들고
 * 나간 날 다른 자리에서 발표해야 하는 상황이 그것이다.
 *
 * 파일 자체는 디스크에 두고 여기에는 어디에 있는지만 적는다. 데이터베이스에
 * 바이트를 넣으면 30MB 짜리 덱 몇 개로 백업이 무거워진다.
 */
@Entity('ir_decks')
export class IrDeck extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  /** 사용자가 붙인 이름 — 파일명과 별개다 ("투자용 v3" 처럼 적는다) */
  @Column({ type: 'varchar', length: 200 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  memo!: string | null;

  /* ── 파일 ── */

  @Column({ type: 'varchar', length: 255, name: 'file_name' })
  fileName!: string;

  /** 디스크 경로 — 서버 안에서만 쓴다. 응답에 실어 보내지 않는다 */
  @Column({ type: 'text', name: 'storage_path' })
  storagePath!: string;

  @Column({ type: 'bigint', name: 'file_size', default: 0 })
  fileSize!: string;

  @Column({ type: 'varchar', length: 120, name: 'mime_type', nullable: true })
  mimeType!: string | null;

  /** 표지 이미지 (선택) — 목록에서 어느 덱인지 알아보기 쉽게 */
  @Column({ type: 'text', name: 'thumb_path', nullable: true })
  thumbPath!: string | null;
}
