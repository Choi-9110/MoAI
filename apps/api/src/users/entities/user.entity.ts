import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';

/** 사용자. 인증 주체는 Supabase Auth 이며 여기서는 프로필만 보관한다. */
@Entity('users')
export class User extends BaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'tenant_id' })
  tenantId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 80, nullable: true })
  name!: string | null;

  /** owner / member */
  @Column({ type: 'varchar', length: 20, default: 'member' })
  role!: string;

  /** Supabase Auth 의 사용자 UUID */
  @Column({ type: 'uuid', name: 'auth_user_id', nullable: true })
  authUserId!: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  /**
   * 서비스 관리자인가.
   *
   * 위의 `role`(owner/member)과 다른 것이다 — 그쪽은 **한 워크스페이스 안의**
   * 역할이고, 이것은 **서비스 전체**를 들여다볼 수 있는가다. 둘을 한 칸에
   * 섞으면 워크스페이스 주인이 남의 회사 정보까지 보게 된다.
   */
  @Column({ type: 'boolean', name: 'is_admin', default: false })
  isAdmin!: boolean;

  /**
   * 요금 등급.
   *
   * 아직 결제가 없어서 전부 `free` 다. 관리자 화면에서 회원을 볼 때 등급이
   * 없으면 무엇을 기준으로 나눌지가 안 보여서 칸만 먼저 마련해 둔다 —
   * 결제를 붙이면 여기에 값이 들어온다.
   */
  @Column({ type: 'varchar', length: 20, default: 'free' })
  grade!: string;
}
