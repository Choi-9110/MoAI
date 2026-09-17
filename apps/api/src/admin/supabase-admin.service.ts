import { Injectable, Logger } from '@nestjs/common';

/**
 * Supabase 쪽 로그인 계정을 지운다.
 *
 * 우리 DB 에서 회원을 지워도 **로그인 계정은 Supabase 에 남는다.** 그대로
 * 두면 같은 이메일로 다시 들어왔을 때 새 회원으로 잡히고, 지운 사람이
 * 되살아난 것처럼 보인다.
 *
 * 이 일에는 `service_role` 열쇠가 필요하다. **모든 것을 할 수 있는 열쇠**라
 * 서버에만 두고, 화면으로는 절대 내보내지 않는다 (`NEXT_PUBLIC_` 을 붙이면
 * 브라우저까지 딸려 나간다 — 절대 그렇게 두면 안 된다).
 *
 * 열쇠가 없으면 **조용히 건너뛴다.** 이것 때문에 회원 삭제 자체가 실패하면
 * 더 나쁘다 — 앱 데이터는 지워야 하고, 남은 로그인 계정은 사람이 지우면 된다.
 * 대신 건너뛴 사실을 돌려주어 화면이 그렇게 말할 수 있게 한다.
 */
@Injectable()
export class SupabaseAdminService {
  private readonly logger = new Logger(SupabaseAdminService.name);

  get enabled(): boolean {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  }

  /**
   * 로그인 계정 삭제.
   *
   * @returns 지웠으면 true, 열쇠가 없거나 실패했으면 false
   */
  async deleteAuthUser(authUserId: string | null): Promise<boolean> {
    if (!authUserId) return false;
    if (!this.enabled) {
      this.logger.warn(
        'SUPABASE_SERVICE_ROLE_KEY 가 없어 로그인 계정은 남겨 둡니다.',
      );
      return false;
    }

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    try {
      const res = await fetch(
        `${process.env.SUPABASE_URL}/auth/v1/admin/users/${authUserId}`,
        {
          method: 'DELETE',
          headers: { apikey: key, authorization: `Bearer ${key}` },
        },
      );

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        this.logger.warn(
          `로그인 계정 삭제 실패 (${res.status}) — ${body.slice(0, 120)}`,
        );
        return false;
      }

      this.logger.log(`로그인 계정 삭제 — ${authUserId}`);
      return true;
    } catch (err) {
      this.logger.warn(`로그인 계정 삭제 중 오류 — ${(err as Error).message}`);
      return false;
    }
  }
}
