'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FieldError, Input, Label } from '@/components/ui/field';
import { useAuth } from '@/lib/auth';

export default function SignupPage() {
  const { signUp } = useAuth();
  const [sentEmail, setSentEmail] = useState(false);
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { needsEmailConfirm } = await signUp(email, password, name);
      if (needsEmailConfirm) {
        setSentEmail(true);
        return;
      }
      router.replace('/profile?welcome=1');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (sentEmail) {
    return (
      <main className="grid min-h-dvh place-items-center bg-grey-50 px-5 py-12">
        <div className="w-full max-w-[400px] rounded-2xl bg-white p-7 text-center">
          <span className="mx-auto grid size-14 place-items-center rounded-full bg-brand-light text-2xl text-brand">
            ✉
          </span>
          <h1 className="mt-5 text-xl font-bold text-grey-900">
            인증 메일을 보냈어요
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-grey-600">
            <strong className="text-grey-800">{email}</strong> 으로 보낸
            메일의 링크를 눌러주세요. 인증이 끝나면 로그인할 수 있습니다.
          </p>
          <p className="mt-4 text-xs text-grey-400">
            메일이 안 보이면 스팸함을 확인해 주세요.
          </p>
          <Link href="/login" className="mt-6 block">
            <Button variant="secondary" size="lg" full>
              로그인으로 이동
            </Button>
          </Link>
        </div>
      </main>
    );
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
          <h1 className="mb-1 text-xl font-bold text-grey-900">회원가입</h1>
          <p className="mb-6 text-sm text-grey-500">
            30초면 끝납니다. 회사 정보는 가입 후에 입력해요.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label required>이름</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="홍길동"
                required
                maxLength={40}
              />
            </div>

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
              <Label required hint="6자 이상 입력해 주세요">
                비밀번호
              </Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>

            <FieldError>{error}</FieldError>

            <Button type="submit" size="lg" full disabled={busy}>
              {busy ? '가입 중…' : '가입하고 시작하기'}
            </Button>
          </form>

          <p className="mt-5 text-center text-sm text-grey-500">
            이미 계정이 있으신가요?{' '}
            <Link href="/login" className="font-semibold text-brand">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
