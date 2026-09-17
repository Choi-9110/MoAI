'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Supabase 설정 여부.
 *
 * 키가 없으면 임시 인증(이메일만 입력)으로 동작한다.
 * 개발 초기에 Supabase 없이도 화면을 볼 수 있게 하기 위한 것이며,
 * 배포 시에는 반드시 키를 채워야 한다.
 */
export const isSupabaseConfigured = Boolean(URL && ANON_KEY);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      'Supabase 환경변수가 없습니다. NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정해 주세요.',
    );
  }
  if (!client) {
    client = createBrowserClient(URL, ANON_KEY);
  }
  return client;
}
