'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/field';
import { useAuth } from '@/lib/auth';

export default function LoginPage() {
  const { signIn, mode } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-grey-50 px-5 py-12">
      <div className="w-full max-w-[400px]">
        <Link href="/" className="mb-8 block text-center">
          <span className="text-2xl font-extrabold tracking-tight text-grey-900">
            MoAI
          </span>
        </Link>

        <div className="rounded-2xl bg-white p-7">
          <h1 className="mb-1 text-xl font-bold text-grey-900">로그인</h1>
          <p className="mb-6 text-sm text-grey-500">
            이어서 지원사업을 확인해 보세요.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label required>이메일</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="hong@company.com"
                required
                autoComplete="email"
              />
            </div>

            <div>
              <Label required>비밀번호</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="6자 이상"
                required
                minLength={6}
                autoComplete="current-password"
              />
            </div>

            <FieldError>{error}</FieldError>

            <Button type="submit" size="lg" full disabled={busy}>
              {busy ? '로그인 중…' : '로그인'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-grey-500">
            아직 계정이 없으신가요?{' '}
            <Link href="/signup" className="font-semibold text-brand">
              회원가입
            </Link>
          </p>
        </div>

        {mode === "temporary" && (
          <p className="mt-4 text-center text-xs text-grey-400">
            임시 인증 상태입니다. 비밀번호는 아직 검증되지 않습니다.
          </p>
        )}
      </div>
    </main>
  );
}
