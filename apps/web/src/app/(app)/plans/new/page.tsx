'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { TRACK_SPECS } from '@moai/shared';
import type { ModooAnswers, ProjectTrack } from '@moai/shared';
import { Icon } from '@/components/brand/icon';
import { ModooForm } from '@/components/plans/modoo-form';
import { TrackPicker } from '@/components/plans/track-picker';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { api, calendarApi, posterApi, type Project } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * 사업 시작.
 *
 * 먼저 트랙을 고른다 — 모두의창업이냐 일반 정부사업이냐에 따라 **받는 것이
 * 다르다.** 정부사업은 제목·아이디어·공고문을 받고, 모두의창업은 공고가
 * 고정이라 대신 주최측 지원서 문항을 받는다.
 *
 * 여기서 사업계획서 양식은 고르지 않는다. 요약 한 장이 끝난 뒤에 고른다.
 *
 * 시작하면 요약 한 장을 만들기 시작하고, 만드는 동안 다른 페이지를 봐도 된다.
 * 상태는 서버가 들고 있어서 돌아오면 이어서 보인다.
 */
export default function NewPlanPage() {
  return (
    <Suspense fallback={null}>
      <NewPlanForm />
    </Suspense>
  );
}

function NewPlanForm() {
  const { session } = useAuth();
  const router = useRouter();
  const params = useSearchParams();

  /** 캘린더에서 "이 공고로 사업계획서 만들기"를 눌러 넘어온 경우 */
  const grantId = params.get('grantId');

  /*
   * 공고를 들고 왔다면 물어볼 것이 없다 — 그건 정부사업이다.
   * 그 외에는 팝업부터 띄운다.
   */
  const [track, setTrack] = useState<ProjectTrack | null>(
    grantId ? 'gov' : ((params.get('track') as ProjectTrack | null) ?? null),
  );

  /**
   * 공고 정보 — 원문 링크를 보여주려면 필요하다.
   * 공고문 파일은 대개 원문 페이지에서 받는다.
   */
  const [grant, setGrant] = useState<{
    title: string;
    agency: string;
    applyEndAt: string | null;
    sourceUrl: string | null;
  } | null>(null);

  useEffect(() => {
    if (!grantId) return;
    void calendarApi
      .grant(grantId)
      .then(setGrant)
      .catch(() => setGrant(null));
  }, [grantId]);

  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [notice, setNotice] = useState<File | null>(null);
  /** 공고문 없이 시작하려 할 때 한 번 확인받는다 */
  const [confirmNoNotice, setConfirmNoNotice] = useState(false);

  const fileInput = useRef<HTMLInputElement>(null);

  async function begin() {
    if (!session) return;
    setStarting(true);
    setError(null);
    try {
      const project = await api.createProject({
        track: 'gov',
        title: title.trim(),
        idea: idea.trim(),
        tenantId: session.tenantId,
        userId: session.userId,
        ...(grantId ? { grantId } : {}),
      } as Partial<Project>);

      await posterApi.start(project.id, notice ?? undefined);
      router.push(`/plans/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setStarting(false);
    }
  }

  /**
   * 모두의창업 — 제목과 아이디어를 따로 받지 않는다.
   *
   * Q1 이 제목이고 문항 전체가 아이디어다. 그 변환은 서버가 한다 —
   * 여기서도 만들면 규칙이 두 군데가 되고, 한쪽만 고쳐지면 목록에 뜨는
   * 제목과 요약 한 장이 어긋난다.
   */
  async function beginModoo(answers: ModooAnswers) {
    if (!session) return;
    setStarting(true);
    setError(null);
    try {
      const project = await api.createProject({
        track: 'modoo',
        modooAnswers: answers,
        tenantId: session.tenantId,
        userId: session.userId,
      } as Partial<Project>);

      // 공고문은 올리지 않는다. 실행기가 정해진 공고 요약을 읽는다.
      await posterApi.start(project.id);
      router.push(`/plans/${project.id}`);
    } catch (err) {
      setError((err as Error).message);
      setStarting(false);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    // 공고문 없이 시작하면 결과가 달라진다. 미리 알린다.
    if (!notice) {
      setConfirmNoNotice(true);
      return;
    }
    void begin();
  }

  const ready = title.trim().length > 0 && idea.trim().length >= 10;

  return (
    <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-[26px] font-bold tracking-tight text-[var(--moai-ink)]">
            사업 시작
          </h1>
          {track && (
            <button
              type="button"
              onClick={() => setTrack(null)}
              disabled={Boolean(grantId) || starting}
              className="border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-2.5 py-1 text-xs font-bold text-[var(--moai-accent)] disabled:cursor-default disabled:opacity-70"
              title={grantId ? undefined : '트랙 바꾸기'}
            >
              {TRACK_SPECS[track].label}
            </button>
          )}
        </div>
        <p className="mt-1 text-[15px] text-[var(--moai-muted)]">
          {track === 'modoo'
            ? '지원서 문항을 채우면 요약 한 장부터 만들어 드립니다. 공고는 이미 정해져 있습니다.'
            : '아이디어를 적으면 요약 한 장부터 만들어 드립니다. 사업계획서는 그 다음입니다.'}
        </p>
      </header>

      {/* 트랙부터 고른다. 안 고르면 아래 폼이 어느 쪽인지 알 수 없다. */}
      {/* 고르지 않고 닫으면 앞 화면으로 — 빈 폼만 남겨 두지 않는다 */}
      <TrackPicker
        open={track === null}
        onPick={setTrack}
        onCancel={() => router.back()}
      />

      {error && (
        <div className="mb-6 border border-danger-soft bg-[var(--moai-risk-bg)] px-4 py-3 text-sm text-[var(--moai-risk-fg)]">
          {error}
        </div>
      )}

      {track === 'modoo' && (
        <section className="mb-10 border border-[var(--moai-border)] bg-white p-6">
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-4 py-3">
            <Icon name="award" size={15} className="text-[var(--moai-accent)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[var(--moai-ink)]">
                모두의 창업 프로젝트 통합 모집공고 (2차)
              </p>
              <p className="mt-0.5 text-xs text-[var(--moai-muted)]">
                공고문은 이미 등록되어 있습니다. 올리지 않아도 됩니다.
              </p>
            </div>
          </div>

          <h2 className="mb-1 text-lg font-bold text-[var(--moai-ink)]">
            지원서 문항
          </h2>
          <p className="mb-5 text-[13px] leading-relaxed text-[var(--moai-muted)]">
            주최측 지원서와 같은 문항입니다. 여기 쓴 답을 그대로 옮겨 낼 수
            있습니다. 모르는 것은 비워 두세요 — 지어내는 것보다 낫습니다.
          </p>

          <ModooForm onSubmit={beginModoo} submitting={starting} />
        </section>
      )}

      {track === 'gov' && (
      <section className="mb-10 border border-[var(--moai-border)] bg-white p-6">
        <h2 className="mb-5 text-lg font-bold text-[var(--moai-ink)]">
          새로운 사업
        </h2>

        {grantId && grant && (
          <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-4 py-3">
            <Icon name="grant" size={15} className="text-[var(--moai-accent)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-bold text-[var(--moai-ink)]">
                {grant.title}
              </p>
              <p className="mt-0.5 text-xs text-[var(--moai-muted)]">
                이 공고로 시작합니다
                {grant.applyEndAt &&
                  ` · 마감 ${grant.applyEndAt.slice(0, 10).replace(/-/g, '.')}`}
              </p>
            </div>
            {/* 공고문 파일은 대개 원문 페이지에서 받는다 */}
            {grant.sourceUrl && (
              <a
                href={grant.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0"
              >
                <Button type="button" variant="secondary" size="sm">
                  <Icon name="external" size={14} />
                  공고 원문 보기
                </Button>
              </a>
            )}
          </div>
        )}

        <form onSubmit={submit} className="space-y-5">
          <Field label="제목" hint="한 줄로 무엇을 하는 사업인지">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder="예: 이륜차 정비 매칭 플랫폼"
              className="w-full border border-[var(--moai-border)] px-4 py-3 text-sm text-[var(--moai-ink)] outline-none focus:border-[var(--moai-accent)]"
            />
          </Field>

          <Field
            label="아이디어"
            hint="아는 만큼만 적으면 됩니다. 모르는 건 나중에 채웁니다"
          >
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              required
              rows={10}
              placeholder={
                '누가 어떤 불편을 겪는지, 그걸 어떻게 해결하는지 적어 주세요.\n\n' +
                '예)\n' +
                '배달 라이더들이 정비소를 못 찾아 헤맨다. 이륜차 전문 정비소가 어디\n' +
                '있는지 정보가 흩어져 있고, 대기 시간도 모른 채 찾아간다.\n' +
                '위치·차종·증상으로 정비소를 매칭하고 예약까지 하는 앱을 만든다.'
              }
              className="w-full resize-none border border-[var(--moai-border)] px-4 py-3 text-sm leading-relaxed text-[var(--moai-ink)] outline-none focus:border-[var(--moai-accent)]"
            />
            <p className="mt-1 text-right text-xs text-[var(--moai-subtle)]">
              {idea.trim().length < 10
                ? `${10 - idea.trim().length}자 더 필요합니다`
                : `${idea.length}자`}
            </p>
          </Field>

          <Field
            label="해당 사업 공고문 업로드"
            hint="선택 — 올리면 그 공고에 맞춰 씁니다"
          >
            <div
              className="flex items-center gap-3 border border-dashed border-[var(--moai-border)] bg-[var(--moai-surface)] px-4 py-4"
            >
              <Icon
                name={notice ? 'verified' : 'upload'}
                size={18}
                className={
                  notice
                    ? 'text-[var(--moai-accent)]'
                    : 'text-[var(--moai-subtle)]'
                }
              />
              <div className="min-w-0 flex-1">
                {notice ? (
                  <>
                    <p className="truncate text-sm font-semibold text-[var(--moai-ink)]">
                      {notice.name}
                    </p>
                    <p className="text-xs text-[var(--moai-subtle)]">
                      {(notice.size / 1024).toFixed(0)}KB
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-[var(--moai-muted)]">
                    공고문 파일을 올려 주세요 (PDF · DOCX · TXT)
                  </p>
                )}
              </div>

              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,.hwp,.hwpx"
                onChange={(e) => setNotice(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              {notice ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setNotice(null);
                    if (fileInput.current) fileInput.current.value = '';
                  }}
                >
                  지우기
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => fileInput.current?.click()}
                >
                  파일 선택
                </Button>
              )}
            </div>
          </Field>

          <Button
            type="submit"
            variant="brand"
            size="lg"
            full
            disabled={!ready || starting}
          >
            {starting ? '시작하는 중…' : '사업 시작하기'}
          </Button>
        </form>
      </section>
      )}

      {/* 공고문 없이 시작 — 결과가 달라지므로 미리 알린다 */}
      <Modal
        open={confirmNoNotice}
        onClose={() => setConfirmNoNotice(false)}
        title="공고문 없이 시작할까요?"
      >
        <p className="text-sm leading-relaxed text-[var(--moai-ink)]">
          공고문이 없으면 특정 공고에 맞추지 않고{' '}
          <b>일반적인 정부지원사업 기준</b>으로 만들어집니다.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-[var(--moai-muted)]">
          지원할 공고가 정해져 있다면 공고문을 올리는 편이 낫습니다. 그 공고가
          요구하는 항목에 맞춰 쓰고, 요구하는데 아이디어에 없는 것은 따로
          표시해 드려요.
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirmNoNotice(false)}>
            공고문 올리기
          </Button>
          <Button
            variant="brand"
            onClick={() => {
              setConfirmNoNotice(false);
              void begin();
            }}
          >
            그대로 시작
          </Button>
        </div>
      </Modal>
    </main>
  );
}

/** 라벨 + 도움말이 붙은 입력 한 칸 */
function Field({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline gap-2">
        <label className="text-sm font-bold text-[var(--moai-ink)]">
          {label}
        </label>
        {hint && (
          <span className="text-xs text-[var(--moai-subtle)]">{hint}</span>
        )}
      </div>
      {children}
    </div>
  );
}
