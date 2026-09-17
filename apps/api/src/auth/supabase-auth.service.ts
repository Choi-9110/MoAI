import { Injectable, Logger } from '@nestjs/common';

/** Supabase 가 알려주는 로그인 사용자 */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface CacheEntry {
  user: AuthUser;
  expiresAt: number;
}

/**
 * Supabase 액세스 토큰 검증.
 *
 * 토큰 서명을 직접 검사하지 않고 Supabase 에 물어본다. 프로젝트마다
 * 서명 방식(대칭키·비대칭키)이 다르고 키가 돌아가기도 하는데, 그걸 따라가는
 * 것보다 물어보는 편이 확실하다. 대신 **결과를 잠깐 캐시한다** —
 * 요청마다 왕복하면 화면 한 번에 네트워크 호출이 여러 번 붙는다.
 *
 * `SUPABASE_URL` 이 비어 있으면 검증하지 않는다. 개발용 모드다.
 */
@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private readonly cache = new Map<string, CacheEntry>();

  /** 캐시 수명. 토큰 자체는 한 시간짜리라 이 정도는 안전하다. */
  private readonly ttlMs = 5 * 60 * 1000;

  get enabled(): boolean {
    return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY);
  }

  /** 토큰이 유효하면 사용자, 아니면 null */
  async verify(token: string): Promise<AuthUser | null> {
    if (!this.enabled) return null;

    const hit = this.cache.get(token);
    if (hit && hit.expiresAt > Date.now()) return hit.user;

    // 만료된 항목이 쌓이지 않게 가끔 훑어 낸다.
    if (this.cache.size > 500) this.sweep();

    try {
      const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
        headers: {
          authorization: `Bearer ${token}`,
          apikey: process.env.SUPABASE_ANON_KEY!,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!res.ok) return null;

      const body = (await res.json()) as {
        id?: string;
        email?: string;
        user_metadata?: { name?: string };
      };
      if (!body.id || !body.email) return null;

      const user: AuthUser = {
        id: body.id,
        email: body.email,
        name: body.user_metadata?.name ?? body.email.split('@')[0],
      };

      this.cache.set(token, { user, expiresAt: Date.now() + this.ttlMs });
      return user;
    } catch (err) {
      // 네트워크 문제로 인증이 통과되면 안 된다. 실패는 실패로 둔다.
      this.logger.warn(`토큰 검증 실패: ${(err as Error).message}`);
      return null;
    }
  }

  private sweep(): void {
    const now = Date.now();
    for (const [token, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(token);
    }
  }
}
