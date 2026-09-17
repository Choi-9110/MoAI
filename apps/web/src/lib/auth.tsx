'use client';

import {
  createContext, useCallback, useContext, useEffect, useRef, useState,
} from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE, setSessionExpiredHandler, setTokenSource } from './api';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';

/**
 * 세션 관리.
 *
 * Supabase 환경변수가 있으면 Supabase Auth 로 동작하고,
 * 없으면 임시 인증(이메일만 입력)으로 떨어진다.
 *
 * 임시 인증은 개발 편의를 위한 것이며 비밀번호를 검증하지 않는다.
 * 배포 전에 반드시 키를 채워야 한다 — `authMode` 로 현재 상태를 확인할 수 있다.
 */

export interface Session {
  userId: string;
  tenantId: string;
  email: string;
  name: string;
  /**
   * 서비스 관리자인가 — 메뉴를 보여줄지 정할 때만 쓴다.
   *
   * **이 값으로 막지 않는다.** 브라우저 안의 값은 고칠 수 있으므로, 실제
   * 차단은 서버(`AdminGuard`)가 한다. 여기서는 안 쓸 메뉴를 안 보이게 할 뿐이다.
   */
  isAdmin?: boolean;
  /** Supabase Auth 사용자 ID (임시 인증에서는 없음) */
  authUserId?: string;
}

export type AuthMode = 'supabase' | 'temporary';

interface SignUpResult {
  /** 이메일 인증이 필요하면 true — 이 경우 바로 로그인되지 않는다 */
  needsEmailConfirm: boolean;
}

interface AuthValue {
  session: Session | null;
  ready: boolean;
  mode: AuthMode;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<SignUpResult>;
  signOut: () => Promise<void>;
  /**
   * 세션이 끝났는가.
   *
   * 주기적으로 서버를 부르는 화면(알림 종 등)은 이 값이 참이면 **부르기를
   * 멈춰야 한다.** 안 그러면 사용자가 안내를 읽고 있는 동안에도 1분마다
   * 401 이 계속 쌓인다.
   */
  expired: boolean;
}

const STORAGE_KEY = 'moai.session';
const AuthContext = createContext<AuthValue | null>(null);

/*
 * API 호출에 붙일 토큰을 공급한다.
 *
 * Supabase 클라이언트가 갱신까지 알아서 해 주므로 매번 물어보는 편이 안전하다.
 * 만료된 토큰을 캐시해 두고 쓰면 한참 뒤에 갑자기 로그아웃된 것처럼 보인다.
 */
setTokenSource(async () => {
  if (!isSupabaseConfigured) return null;
  try {
    const { data } = await getSupabase().auth.getSession();
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
});

interface UserRow {
  id: string;
  tenantId: string;
  email: string;
  name: string | null;
  authUserId?: string | null;
}

/** 로그인 직후에도 쓰이므로 토큰을 직접 챙긴다 */
async function bearer(): Promise<Record<string, string>> {
  if (!isSupabaseConfigured) return {};
  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { authorization: `Bearer ${token}` } : {};
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: await bearer(),
  });
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
  return res.json() as Promise<T>;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(await bearer()) },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    const msg = Array.isArray(j.message) ? j.message.join(', ') : j.message;
    throw new Error(msg ?? `요청 실패 (${res.status})`);
  }
  return res.json() as Promise<T>;
}

/**
 * 앱 계정 확보.
 *
 * Supabase 는 인증만 맡고, 테넌트·프로필 같은 도메인 데이터는 우리 DB 에 있다.
 * 그 둘을 잇는 일은 **서버가 한다** — 토큰을 검사할 수 있는 쪽이 서버뿐이라,
 * 화면이 사용자 목록을 뒤져 자기를 찾던 예전 방식은 남의 이메일까지
 * 내주는 짓이었다.
 */
async function resolveAppUser(
  email: string,
  name: string,
  authUserId?: string,
): Promise<Session> {
  if (isSupabaseConfigured) {
    const me = await apiGet<{
      userId: string;
      tenantId: string;
      email: string;
      name: string;
      authUserId: string;
      isAdmin?: boolean;
    }>('/auth/me');
    return { ...me };
  }

  // 인증이 꺼진 개발 환경 — 예전 방식 그대로 둔다.
  const page = await apiGet<{ items: UserRow[] }>('/users?limit=100');
  const found = page.items.find(
    (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
  );

  if (found) {
    return {
      userId: found.id,
      tenantId: found.tenantId,
      email: found.email,
      name: found.name ?? name,
      authUserId,
    };
  }

  const tenant = await apiPost<{ id: string }>('/tenants', {
    name: `${name || email.split('@')[0]}의 워크스페이스`,
  });
  const user = await apiPost<UserRow>('/users', {
    tenantId: tenant.id,
    email: email.trim(),
    name: name || email.split('@')[0],
    role: 'owner',
    ...(authUserId ? { authUserId } : {}),
  });

  return {
    userId: user.id,
    tenantId: tenant.id,
    email: user.email,
    name: user.name ?? name,
    authUserId,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const mode: AuthMode = isSupabaseConfigured ? 'supabase' : 'temporary';
  const router = useRouter();

  const persist = useCallback((next: Session | null) => {
    setSession(next);
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  /** 새로고침 시 세션 복구 */
  useEffect(() => {
    let alive = true;

    async function restore() {
      try {
        if (isSupabaseConfigured) {
          const supabase = getSupabase();
          const { data } = await supabase.auth.getSession();
          const user = data.session?.user;

          if (user?.email) {
            const app = await resolveAppUser(
              user.email,
              (user.user_metadata?.name as string) ?? '',
              user.id,
            );
            if (alive) persist(app);
          } else if (alive) {
            persist(null);
          }
          return;
        }

        // 임시 인증 — localStorage 만 확인한다.
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw && alive) setSession(JSON.parse(raw) as Session);
      } catch {
        if (alive) persist(null);
      } finally {
        if (alive) setReady(true);
      }
    }

    void restore();
    return () => {
      alive = false;
    };
  }, [persist]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw new Error(translateAuthError(error.message));

        const user = data.user;
        if (!user?.email) throw new Error('로그인에 실패했습니다.');

        persist(
          await resolveAppUser(
            user.email,
            (user.user_metadata?.name as string) ?? '',
            user.id,
          ),
        );
        return;
      }

      // 임시 인증 — 등록된 이메일인지만 확인한다.
      const page = await apiGet<{ items: UserRow[] }>('/users?limit=100');
      const found = page.items.find(
        (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
      );
      if (!found) {
        throw new Error('등록되지 않은 이메일입니다. 회원가입을 먼저 진행해 주세요.');
      }
      persist({
        userId: found.id,
        tenantId: found.tenantId,
        email: found.email,
        name: found.name ?? '',
      });
    },
    [persist],
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string): Promise<SignUpResult> => {
      if (isSupabaseConfigured) {
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name } },
        });
        if (error) throw new Error(translateAuthError(error.message));

        // 이메일 인증이 켜져 있으면 session 이 비어 온다.
        if (!data.session) return { needsEmailConfirm: true };

        const user = data.user;
        if (user?.email) {
          persist(await resolveAppUser(user.email, name, user.id));
        }
        return { needsEmailConfirm: false };
      }

      // 임시 인증
      const page = await apiGet<{ items: UserRow[] }>('/users?limit=100');
      if (
        page.items.some(
          (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
        )
      ) {
        throw new Error('이미 가입된 이메일입니다.');
      }
      persist(await resolveAppUser(email, name));
      return { needsEmailConfirm: false };
    },
    [persist],
  );

  const signOut = useCallback(async () => {
    if (isSupabaseConfigured) {
      await getSupabase().auth.signOut();
    }
    persist(null);
  }, [persist]);

  /*
   * 지금 세션이 있는지를 **효과 밖에서** 알아야 한다.
   *
   * 아래 handler 는 한 번만 꽂고 끝이라, 그 안에서 `session` 을 그냥 읽으면
   * 꽂을 당시의 값(로그인 전이라 null)에 영원히 묶인다. ref 로 두면 항상
   * 지금 값을 본다.
   */
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  /**
   * 401 이 오면 여기로 온다.
   *
   * **세션이 있었을 때만** 만료로 다룬다. 로그인하지 않은 사람이 로그인
   * 걸린 주소를 눌러도 401 은 떨어지는데, 그때 "세션이 만료되었습니다" 는
   * 틀린 말이다.
   */
  useEffect(() => {
    setSessionExpiredHandler(() => {
      if (sessionRef.current) setExpired(true);
    });
  }, []);

  /**
   * 안내를 읽고 확인을 누르면 — 내보낸다.
   *
   * 로그아웃까지 하고 **메인 화면으로 보낸다.** 있던 자리에 그대로 두면
   * 그 화면은 로그인이 필요한 곳이라 아무것도 못 하고, 새로고침하면 다시
   * 같은 안내가 뜬다.
   */
  const confirmExpired = useCallback(async () => {
    setExpired(false);
    await signOut();
    router.push('/');
  }, [signOut, router]);

  return (
    <AuthContext.Provider
      value={{ session, ready, mode, signIn, signUp, signOut, expired }}
    >
      {children}

      {/*
        * 바깥을 눌러도, Esc 를 눌러도 확인과 같게 둔다. 어차피 토큰이
        * 없어 아무것도 못 하는 상태다 — 닫아 두고 계속 쓰게 하면 누르는
        * 것마다 실패하는, 더 나쁜 자리에 놓인다.
        */}
      <Modal open={expired} onClose={confirmExpired} title="세션이 만료되었습니다">
        <p className="text-[15px] leading-relaxed text-grey-600">
          로그인한 지 오래되어 자동으로 로그아웃되었습니다.
          <br />
          이어서 하시려면 다시 로그인해 주세요.
        </p>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => void confirmExpired()}>확인</Button>
        </div>
      </Modal>
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth 는 AuthProvider 안에서만 사용할 수 있습니다.');
  return ctx;
}

/** Supabase 오류 메시지를 사용자가 읽을 수 있게 바꾼다. */
function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('invalid login credentials')) {
    return '이메일 또는 비밀번호가 올바르지 않습니다.';
  }
  if (m.includes('email not confirmed')) {
    return '이메일 인증이 완료되지 않았습니다. 받은 편지함을 확인해 주세요.';
  }
  if (m.includes('user already registered')) {
    return '이미 가입된 이메일입니다.';
  }
  if (m.includes('password should be at least')) {
    return '비밀번호는 6자 이상이어야 합니다.';
  }
  if (m.includes('rate limit') || m.includes('too many')) {
    return '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.';
  }
  return message;
}
