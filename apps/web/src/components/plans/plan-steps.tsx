'use client';

import Link from 'next/link';

/**
 * 어디까지 왔는지, 어디로 갈 수 있는지.
 *
 * 아이디어 → 요약 한 장 → 사업계획서 순서로 간다. 앞 단계가 끝나야 다음이
 * 열리는 구조라, 화면만 봐서는 지금 어디에 있는지와 무엇이 남았는지가
 * 잘 안 보였다.
 *
 * **끝난 단계는 언제든 돌아갈 수 있다.** 요약을 고치러 갔다가 다시
 * 사업계획서로 오는 일이 잦은데, 그때마다 뒤로가기를 여러 번 누르게 하면
 * 안 된다. 아직 안 된 단계는 눌러도 갈 곳이 없으므로 막아 두고,
 * 왜 못 가는지 한 줄로 알려 준다.
 */

export type PlanStep = 'idea' | 'poster' | 'plan';

interface StepSpec {
  key: PlanStep;
  label: string;
  hint: string;
}

const STEPS: StepSpec[] = [
  { key: 'idea', label: '아이디어', hint: '처음 입력한 내용' },
  { key: 'poster', label: '요약 한 장', hint: '공고에 맞춰 압축한 것' },
  { key: 'plan', label: '사업계획서', hint: '제출할 문서' },
];

export function PlanSteps({
  projectId, current, hasPoster, hasPlan,
}: {
  projectId: string;
  current: PlanStep;
  /** 요약 한 장이 만들어졌는가 — 없으면 사업계획서로 갈 수 없다 */
  hasPoster: boolean;
  /** 사업계획서를 시작했는가 */
  hasPlan: boolean;
}) {
  const hrefOf = (step: PlanStep) =>
    step === 'plan' ? `/plans/${projectId}/document` : `/plans/${projectId}#${step}`;

  const blockedReason = (step: PlanStep): string | null => {
    if (step === 'plan' && !hasPlan) {
      return hasPoster
        ? '아직 시작하지 않았어요'
        : '요약 한 장을 먼저 만들어야 해요';
    }
    return null;
  };

  return (
    <>
      {/* 넓은 화면 — 본문 옆 빈 자리에 세워 둔다 */}
      <nav
        aria-label="작성 단계"
        className="fixed right-6 top-1/2 z-30 hidden w-[168px] -translate-y-1/2 xl:block"
      >
        <ol className="space-y-1.5">
          {STEPS.map((s, i) => {
            const blocked = blockedReason(s.key);
            const active = s.key === current;

            const inner = (
              <>
                <span
                  className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                    active
                      ? 'bg-[var(--moai-accent)] text-white'
                      : blocked
                        ? 'bg-[var(--moai-surface)] text-[var(--moai-subtle)]'
                        : 'bg-[var(--moai-accent-100)] text-[var(--moai-accent)]'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span
                    className={`block text-[13px] font-bold ${
                      active
                        ? 'text-[var(--moai-ink)]'
                        : blocked
                          ? 'text-[var(--moai-subtle)]'
                          : 'text-[var(--moai-muted)]'
                    }`}
                  >
                    {s.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-tight text-[var(--moai-subtle)]">
                    {blocked ?? s.hint}
                  </span>
                </span>
              </>
            );

            const base =
              'flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors';

            return (
              <li key={s.key}>
                {blocked ? (
                  <span className={`${base} cursor-default opacity-70`}>{inner}</span>
                ) : (
                  <Link
                    href={hrefOf(s.key)}
                    /*
                      이동 뒤 Next 가 화면을 맨 위로 되돌린다. 그러면 도착한
                      쪽에서 해 둔 스크롤이 곧바로 지워져서, 눌러도 아무 일이
                      없는 것처럼 보인다. 스크롤은 도착한 화면이 알아서 한다.
                    */
                    scroll={false}
                    className={`${base} ${
                      active ? 'bg-[var(--moai-accent-50)]' : 'hover:bg-[var(--moai-surface)]'
                    }`}
                  >
                    {inner}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      {/* 좁은 화면 — 본문 위에 가로로 눕힌다 */}
      <nav aria-label="작성 단계" className="mb-5 flex gap-1.5 xl:hidden">
        {STEPS.map((s, i) => {
          const blocked = blockedReason(s.key);
          const active = s.key === current;

          const cls = `flex flex-1 items-center justify-center gap-1.5 border px-2 py-2 text-xs font-semibold ${
            active
              ? 'border-[var(--moai-accent)] bg-[var(--moai-accent-50)] text-[var(--moai-accent)]'
              : blocked
                ? 'border-[var(--moai-border)] bg-[var(--moai-surface)] text-[var(--moai-subtle)]'
                : 'border-[var(--moai-border)] bg-white text-[var(--moai-muted)]'
          }`;

          const inner = (
            <>
              <span className="tabular">{i + 1}</span>
              <span>{s.label}</span>
            </>
          );

          return blocked ? (
            <span key={s.key} className={cls} title={blocked}>
              {inner}
            </span>
          ) : (
            <Link key={s.key} href={hrefOf(s.key)} scroll={false} className={cls}>
              {inner}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
