import { Column, Entity, Index } from 'typeorm';
import type { DocumentStatus } from '@moai/shared';
import { BaseEntity } from '../../common/base.entity';

/**
 * 공고 첨부(공고문)를 읽은 기록.
 *
 * 뽑아낸 **조건**은 판정마다 쓰이므로 `grants.document_conditions` 에 둔다.
 * 여기는 원문 글과 처리 상태 — 공고 목록을 읽을 때마다 수만 자를 끌고
 * 다니지 않도록 따로 뗐다.
 */
@Entity('grant_documents')
export class GrantDocument extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'uuid', name: 'grant_id' })
  grantId!: string;

  /** 읽은 파일 주소 — 수집처가 공고문을 바꾸면 달라져 다시 읽는다 */
  @Column({ type: 'text', name: 'source_url' })
  sourceUrl!: string;

  @Column({ type: 'varchar', length: 400, name: 'file_name' })
  fileName!: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  status!: DocumentStatus;

  /** 추출한 글 (모델에 넘긴 그대로) */
  @Column({ type: 'text', nullable: true })
  text!: string | null;

  @Column({ type: 'int', name: 'text_length', default: 0 })
  textLength!: number;

  @Column({ type: 'varchar', length: 60, nullable: true })
  model!: string | null;

  /** `DOCUMENT_EXTRACT_VERSION` — 프롬프트가 바뀌면 낮은 것부터 다시 읽는다 */
  @Column({ type: 'int', default: 0 })
  version!: number;

  @Column({ type: 'text', nullable: true })
  error!: string | null;

  /** 실패 횟수 — 같은 파일을 끝없이 다시 받지 않게 한다 */
  @Column({ type: 'int', default: 0 })
  attempts!: number;
}
