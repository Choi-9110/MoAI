'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ApplicantType } from '@moai/shared';
import { Button } from '@/components/ui/button';

const OPTIONS: {
  value: ApplicantType;
  label: string;
  desc: string;
  icon: string;
}[] = [
  {
    value: 'preliminary',
    label: '일반',
    desc: '아직 사업자등록을 하지 않았어요',
    icon: '◔',
  },
  {
    value: 'individual',
    label: '개인사업자',
    desc: '개인 명의로 사업자등록을 했어요',
    icon: '◑',
  },
  {
    value: 'corporate',
    label: '법인사업자',
    desc: '법인을 설립했어요',
    icon: '●',
  },
];

/**
 * 사업자 형태 선택.
 *
 * 이걸 먼저 받지 않으면 사업자가 없는 사람에게도
 * 매출액·법인 여부·사업자등록번호를 묻게 된다.
 * 대시보드 진입 시 값이 없으면 바로 띄운다.
 */
export function StageModal({
  open, onSelect, onSkip,
}: {
  open: boolean;
  onSelect: (stage: ApplicantType) => Promise<void>;
  onSkip?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<ApplicantType | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function choose(stage: ApplicantType) {
    setSaving(stage);
    setError(null);
    try {
      await onSelect(stage);
      // 일반(예비창업자)은 더 물을 게 없다. 사업자는 추가 정보로 보낸다.
      if (stage !== 'preliminary') {
        router.push('/profile?from=stage');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-grey-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-7">
        <h2 className="text-xl font-bold text-grey-900">
          어떤 형태로 준비하고 계신가요?
        </h2>
        <p className="mt-1.5 text-sm text-grey-600">
          형태에 따라 신청할 수 있는 지원사업이 달라요. 나중에 바꿀 수 있습니다.
        </p>

        <div className="mt-6 space-y-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              onClick={() => void choose(o.value)}
              disabled={saving !== null}
              className="flex w-full items-center gap-3.5 rounded-xl border border-grey-200 p-4 text-left transition-colors hover:border-brand hover:bg-brand-light disabled:opacity-50"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-grey-100 text-lg text-grey-600">
                {o.icon}
              </span>
              <span className="flex-1">
                <span className="block font-bold text-grey-900">{o.label}</span>
                <span className="block text-sm text-grey-500">{o.desc}</span>
              </span>
              {saving === o.value && (
                <span className="text-sm text-grey-400">저장 중…</span>
              )}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 text-sm text-danger">{error}</p>
        )}

        {onSkip && (
          <Button
            variant="ghost"
            size="sm"
            full
            onClick={onSkip}
            className="mt-4"
          >
            나중에 할게요
          </Button>
        )}
      </div>
    </div>
  );
}
