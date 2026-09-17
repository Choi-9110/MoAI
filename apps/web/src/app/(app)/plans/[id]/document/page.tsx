'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import type { PlanSection } from '@moai/shared';
import { PlanDownload } from '@/components/plans/plan-download';
import { PlanSteps } from '@/components/plans/plan-steps';
import { Icon } from '@/components/brand/icon';
import { PosterView } from '@/components/poster/poster-view';
import { Button } from '@/components/ui/button';
import { PLAN_MESSAGES, WorkingMessage } from '@/components/working-message';
import {
  api, planApi, posterApi,
  type PlanState, type PosterState, type Project,
} from '@/lib/api';
import { humanError } from '@/lib/human-error';

/**
 * 사업계획서 본문.
 *
 * 절을 하나씩 써 나가므로 다 끝나기 전에도 완성된 절부터 읽을 수 있다.
 * 문서 순서는 표지 → 목차 → **요약 한 장** → 본문이다.
 * 요약 한 장을 본문 앞에 두는 것은 심사자가 사업 전체를 먼저 잡고
 * 본문을 읽게 하려는 것이라, 빼는 선택지를 두지 않았다.
 */
/** 점검에서 걸린 종류를 화면 말로 */
const FINDING_LABELS: Record<string, string> = {
  fabricated: '근거 확인',
  contradiction: '앞뒤 불일치',
  duplicate: '내용 중복',
  missing: '누락',
  style: '문장',
};

export default function PlanDocumentPage() {
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [poster, setPoster] = useState<PosterState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rewriting, setRewriting] = useState(false);

  const load = useCallback(async () => {
    try {
      const [p, pl, po] = await Promise.all([
        api.getProject(id),
        planApi.state(id),
        posterApi.state(id),
      ]);
      setProject(p);
      setPlan(pl);
      setPoster(po);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 쓰는 중이면 계속 물어본다 — 절이 하나씩 늘어난다.
   *
   * 이때는 **진행 상황만** 묻는다. 사업 정보와 요약은 쓰는 동안 바뀌지 않는데
   * 같이 부르면 요청이 세 배가 된다. 5분짜리 작업이면 180번 부를 일을
   * 60번으로 줄인다.
   */
  useEffect(() => {
    if (plan?.status !== 'running') return;
    const timer = setInterval(() => {
      void planApi
        .state(id)
        .then(setPlan)
        .catch(() => undefined);
    }, 5000);
    return () => clearInterval(timer);
  }, [plan?.status, id]);

  if (error && !project) return <Center>{error}</Center>;
  if (!project || !plan) return <Center>불러오는 중…</Center>;

  const doc = plan.doc;
  const done = plan.progress?.done ?? 0;
  const total = plan.progress?.total ?? doc?.sections.length ?? 0;
  const openQuestions = (doc?.sections ?? []).flatMap((s) => s.openQuestions);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <PlanSteps projectId={id} current="plan" hasPoster={plan.hasPoster} hasPlan />

      <header className="mb-6">
        <Link
          href={`/plans/${id}`}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--moai-muted)] hover:text-[var(--moai-accent)]"
        >
          <Icon name="arrow" size={13} className="rotate-180" />
          요약 한 장으로
        </Link>
        <h1 className="mt-1.5 text-[26px] font-bold tracking-tight text-[var(--moai-ink)]">
          사업계획서
        </h1>
        <p className="mt-1 text-[15px] text-[var(--moai-muted)]">
          {project.title}
        </p>
      </header>

      {/* 진행 상황 — 절 단위라 어디까지 됐는지 보인다 */}
      {plan.status === 'running' && (
        <div className="mb-6 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-5 py-4">
          <div className="flex items-center gap-2">
            <Icon
              name="spinner"
              size={15}
              className="animate-spin text-[var(--moai-accent)]"
            />
            <p className="flex-1 text-sm font-bold text-[var(--moai-accent)]">
              {/*
                서버가 넘기는 값은 두 종류다 — 절 제목("3. 아이템 개발·실현 방안")
                과, 아직 절에 들어가기 전의 상태 문구("자료 분석 중").
                뒤쪽에 " 쓰는 중"을 또 붙이면 말이 겹치므로 갈라 붙인다.
              */}
              {plan.progress?.current ? (
                plan.progress.current.endsWith('중') ? (
                  `${plan.progress.current}…`
                ) : (
                  `${plan.progress.current} 쓰는 중…`
                )
              ) : (
                /*
                 * 아직 절에 들어가기 전 — 대기열에 있거나 막 시작한 상태다.
                 * 한 문구로 고정해 두면 멈춘 것처럼 보여서 돌려 가며 보여 준다.
                 */
                <WorkingMessage messages={PLAN_MESSAGES} />
              )}
            </p>
            <span className="tabular text-sm font-bold text-[var(--moai-ink)]">
              {done}/{total || '?'}
            </span>
          </div>
          {total > 0 && (
            <div className="mt-2.5 h-1.5 w-full bg-white">
              <div
                className="h-full bg-[var(--moai-accent)] transition-all"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
          )}
          <p className="mt-2 text-xs text-[var(--moai-muted)]">
            보통 <b>10~15분</b> 걸려요. 자료를 찾고, 절을 하나씩 쓰고, 마지막에
            전체를 점검합니다. 다 쓴 절부터 아래에서 읽을 수 있고, 이 화면을
            켜 둘 필요는 없어요 — 끝나면 알림으로 알려드립니다.
          </p>
        </div>
      )}

      {plan.status === 'failed' && (
        <div className="mb-6 border border-danger-soft bg-[var(--moai-risk-bg)] px-5 py-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--moai-risk-fg)]">
            <Icon name="warning" size={15} />
            작성이 중단됐습니다
          </p>
          <p className="mt-1 break-words text-xs text-[var(--moai-risk-fg)]">
            {humanError(plan.error)}
          </p>
          <p className="mt-2 text-xs text-[var(--moai-muted)]">
            {/*
              **"처음부터 씁니다"라고 적혀 있었는데 사실이 아니다.**
              서버는 절마다 저장해 두고, 다시 시작하면 비어 있는 절부터
              이어 쓴다. 잘못 적힌 이 한 줄 때문에 사용자는 다섯 절을
              버리게 될까 봐 버튼을 못 누르고 있었다.
            */}
            {done > 0
              ? `${done}절까지 써 둔 것은 그대로 있습니다. 다시 시작하면 ${done + 1}절부터 이어 씁니다.`
              : '다시 시작하면 처음부터 씁니다.'}
          </p>
          <Button
            variant="secondary"
            className="mt-3"
            disabled={rewriting}
            onClick={async () => {
              setRewriting(true);
              setError(null);
              try {
                await planApi.start(id, plan.format ?? 'gov');
                await load();
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setRewriting(false);
              }
            }}
          >
            {rewriting ? '다시 시작하는 중…' : '다시 시도'}
          </Button>
        </div>
      )}

      {/*
        마지막 점검 결과.

        다 쓴 뒤 문서 전체를 다시 읽어 지어낸 근거·절 간 모순·빠진 항목을
        찾은 것이다. 심한 것은 이미 그 절을 다시 써서 고쳤고, 여기 남는 것은
        **사람이 봐야 하는 것**이다. 접어 두지 않고 문서 위에 둔다 —
        제출 전에 이걸 보라고 만든 절이다.
      */}
      {plan.status === 'done' && doc?.review && (
        doc.review.findings.length === 0 ? (
          <div className="mb-6 border border-[var(--moai-border)] bg-[var(--moai-surface)] px-5 py-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--moai-ink)]">
              <Icon name="done" size={15} />
              마지막 점검에서 걸린 것이 없습니다
            </p>
            <p className="mt-1 text-xs text-[var(--moai-muted)]">
              다 쓴 뒤 문서 전체를 다시 읽어 근거 없는 수치·절 간 모순·빠진
              항목을 확인했습니다. 그래도 제출 전 사실 확인은 직접 해 주세요.
            </p>
          </div>
        ) : (
          <div className="mb-6 border border-[var(--moai-border)] bg-white px-5 py-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--moai-ink)]">
              <Icon name="warning" size={15} />
              마지막 점검 — {doc.review.findings.length}건
              {doc.review.rewritten.length > 0 &&
                ` · ${doc.review.rewritten.length}개 절을 고쳐 다시 썼습니다`}
            </p>
            <ul className="mt-2.5 space-y-2">
              {doc.review.findings.map((f, i) => {
                const section = doc.sections.find((s) => s.id === f.sectionId);
                const fixed = doc.review!.rewritten.includes(f.sectionId);
                return (
                  <li key={i} className="text-xs leading-relaxed">
                    <span
                      className={`mr-1.5 inline-block px-1.5 py-0.5 text-[11px] font-bold ${
                        fixed
                          ? 'bg-[var(--moai-surface)] text-[var(--moai-muted)]'
                          : 'bg-[var(--moai-risk-bg)] text-[var(--moai-risk-fg)]'
                      }`}
                    >
                      {fixed ? '고침' : FINDING_LABELS[f.kind]}
                    </span>
                    {section && (
                      <span className="font-semibold text-[var(--moai-ink)]">
                        {section.title} —{' '}
                      </span>
                    )}
                    <span className="text-[var(--moai-muted)]">{f.issue}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-2.5 text-xs text-[var(--moai-muted)]">
              &lsquo;고침&rsquo;은 그 절을 다시 써서 반영한 것이고, 나머지는
              직접 확인해 주세요.
            </p>
          </div>
        )
      )}

      {error && (
        <div className="mb-6 border border-danger-soft bg-[var(--moai-risk-bg)] px-4 py-3 text-sm text-[var(--moai-risk-fg)]">
          {error}
        </div>
      )}

      {!doc ? (
        <Center>아직 작성을 시작하지 않았습니다.</Center>
      ) : (
        <article className="border border-[var(--moai-border)] bg-white">
          {/* 표지 */}
          <header className="border-b border-[var(--moai-border)] bg-[var(--moai-ink)] px-8 py-10 text-center">
            <p className="text-[11px] font-semibold tracking-wide text-white/60">
              사업계획서
            </p>
            <h2 className="mt-2 text-[24px] font-bold leading-snug text-white">
              {project.title}
            </h2>
            <p className="mt-3 text-xs text-white/50">{doc.templateName}</p>
          </header>

          {/* 목차 */}
          <nav className="border-b border-[var(--moai-border)] px-8 py-6">
            <p className="mb-3 text-xs font-bold text-[var(--moai-subtle)]">목차</p>
            <ol className="space-y-1.5">
              <li className="flex items-baseline gap-2 text-sm text-[var(--moai-muted)]">
                <span className="tabular w-5 shrink-0 text-right font-semibold">–</span>
                <span>사업 요약</span>
              </li>
              {doc.sections.map((s, i) => (
                <li key={s.id} className="flex items-baseline gap-2 text-sm">
                  <span className="tabular w-5 shrink-0 text-right font-semibold text-[var(--moai-subtle)]">
                    {i + 1}
                  </span>
                  <a
                    href={`#${s.id}`}
                    className={
                      s.body
                        ? 'text-[var(--moai-ink)] hover:text-[var(--moai-accent)]'
                        : 'text-[var(--moai-subtle)]'
                    }
                  >
                    {s.title}
                  </a>
                  {!s.body && (
                    <span className="text-[11px] text-[var(--moai-subtle)]">
                      작성 전
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          {/* 본문 첫 장 — 요약 한 장 */}
          {poster?.doc && (
            <section className="border-b border-[var(--moai-border)] bg-[var(--moai-surface)] px-4 py-8 sm:px-8">
              <p className="mb-4 text-center text-xs font-bold text-[var(--moai-subtle)]">
                사업 요약
              </p>
              <PosterView doc={poster.doc} />
            </section>
          )}

          {/* 본문 */}
          <div className="divide-y divide-[var(--moai-border)]">
            {doc.sections.map((s, i) => (
              <SectionBlock key={s.id} index={i + 1} section={s} />
            ))}
          </div>
        </article>
      )}

      {/* 다 썼으면 여기서 다시 쓸 수 있게 한다 */}
      {plan.status === 'done' && (
        <div className="mt-6 flex flex-col items-center gap-2 border-t border-[var(--moai-border)] pt-6">
          <div className="flex flex-wrap justify-center gap-2">
            <Link href={`/plans/${id}`}>
              <Button variant="secondary">요약 한 장 다듬기</Button>
            </Link>
            <Button
              variant="secondary"
              disabled={rewriting}
              onClick={async () => {
                setRewriting(true);
                setError(null);
                try {
                  await planApi.start(id, plan.format ?? 'gov');
                  await load();
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setRewriting(false);
                }
              }}
            >
              {rewriting ? '다시 시작하는 중…' : '처음부터 다시 쓰기'}
            </Button>
          </div>
          <p className="text-xs text-[var(--moai-subtle)]">
            요약 한 장을 고친 뒤 다시 쓰면 바뀐 내용이 반영됩니다. 지금 문서는
            사라집니다.
          </p>
        </div>
      )}

      {/* 확인 필요 — 문서 전체에서 모은 것 */}
      {openQuestions.length > 0 && (
        <div className="mt-6 border border-needs-user-soft bg-[var(--moai-needs-user-bg)] px-5 py-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--moai-needs-user-fg)]">
            <Icon name="needs-user" size={15} />
            확인이 필요한 항목 {openQuestions.length}건
          </p>
          <p className="mt-1 text-xs text-[var(--moai-muted)]">
            근거가 없어 본문에 넣지 않은 것들입니다. 채워 넣으면 문서가 단단해져요.
          </p>
          <ul className="mt-2.5 space-y-1">
            {openQuestions.map((q, i) => (
              <li
                key={i}
                className="flex items-start gap-1.5 text-xs leading-relaxed text-[var(--moai-ink)]"
              >
                <span className="text-[var(--moai-needs-user-fg)]">·</span>
                {q}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        다 쓴 뒤에만 보여 준다. 쓰는 중에 내려받으면 절반짜리 문서가 나가고,
        사용자는 그것이 완성본인 줄 안다.
      */}
      {plan.status === 'done' && doc && <PlanDownload projectId={id} />}
    </main>
  );
}

function SectionBlock({
  index, section,
}: {
  index: number;
  section: PlanSection;
}) {
  return (
    <section id={section.id} className="scroll-mt-6 px-8 py-7">
      <h3 className="mb-1 flex items-baseline gap-2 text-[17px] font-bold text-[var(--moai-ink)]">
        <span className="tabular text-[var(--moai-subtle)]">{index}.</span>
        {section.title}
      </h3>
      {section.brief && (
        <p className="mb-4 text-xs leading-relaxed text-[var(--moai-subtle)]">
          {section.brief}
        </p>
      )}

      {section.body ? (
        <div className="space-y-1.5">
          {section.body.split('\n').map((line, i) =>
            line.trim() === '' ? (
              <div key={i} className="h-2" />
            ) : (
              <p
                key={i}
                /*
                  break-words 가 없으면 긴 URL·수식 한 덩어리가 줄바꿈을 못 해
                  좁은 화면에서 문서 전체를 옆으로 밀어낸다.
                */
                className={
                  line.trim().startsWith('▶')
                    ? 'mt-3 break-words text-sm font-bold text-[var(--moai-ink)]'
                    : 'break-words text-sm leading-relaxed text-[var(--moai-ink)]'
                }
              >
                {line}
              </p>
            ),
          )}
        </div>
      ) : (
        <p className="text-sm text-[var(--moai-subtle)]">아직 쓰지 않았습니다.</p>
      )}

      {section.openQuestions.length > 0 && (
        <div className="mt-4 border-l-2 border-[var(--moai-needs-user-fg)] bg-[var(--moai-needs-user-bg)] px-4 py-3">
          <p className="mb-1 text-[11px] font-bold text-[var(--moai-needs-user-fg)]">
            확인 필요
          </p>
          <ul className="space-y-0.5">
            {section.openQuestions.map((q, i) => (
              <li key={i} className="text-xs leading-relaxed text-[var(--moai-ink)]">
                · {q}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

/**
 * `**핵심**` 을 굵게 그린다.
 *
 * 레퍼런스 사업계획서들이 수치와 기술명을 문장 안에서 굵게 쓴다.
 * 통문장을 다 읽지 않아도 숫자가 먼저 눈에 들어오게 하려는 것이라,
 * 표시를 그대로 두면(별표 두 개가 보이면) 오히려 읽기가 나빠진다.
 */
function Emphasized({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
          <b key={i} className="font-bold">
            {part.slice(2, -2)}
          </b>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-[var(--moai-border)] bg-[var(--moai-surface)] px-6 py-16 text-center text-sm text-[var(--moai-muted)]">
      {children}
    </div>
  );
}

