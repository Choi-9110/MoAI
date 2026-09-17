import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/base.entity';

/** 조직(테넌트). 모든 데이터 격리와 사용량 상한의 기준 단위. */
@Entity('tenants')
export class Tenant extends BaseEntity {
  /**
   * 워크스페이스 이름.
   *
   * **유니크가 아니다.** 예전에는 `@Index({ unique: true })` 였는데, 가입할 때
   * 이름을 `홍길동의 워크스페이스` 로 짓기 때문에 **같은 이름을 가진 두 번째
   * 사람이 가입하다 500 으로 튕겼다.** 한국에서 흔한 이름이면 반드시 겪는다.
   *
   * 회사 이름은 원래 겹칠 수 있는 값이라, 막아야 할 것은 이름 중복이 아니라
   * 같은 사람이 두 번 만들어지는 것이다. 그건 `users.authUserId` 로 가린다.
   */
  @Index()
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  /** 요금제 — free / pro / enterprise */
  @Column({ type: 'varchar', length: 20, default: 'free' })
  plan!: string;

  /** 월 토큰 상한. 초과 시 잡 생성을 거부한다(비용 방어). */
  @Column({ type: 'bigint', name: 'monthly_token_limit', default: 1_000_000 })
  monthlyTokenLimit!: string;

  /** 동시에 처리할 수 있는 생성 잡 수 */
  @Column({ type: 'int', name: 'concurrent_job_limit', default: 2 })
  concurrentJobLimit!: number;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;
}
