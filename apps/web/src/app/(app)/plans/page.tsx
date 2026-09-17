'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { collectSlots, modooPreview, openGaps } from '@moai/shared';
import type { PosterDoc } from '@moai/shared';
import { Icon } from '@/components/brand/icon';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { api, planApi, posterApi, type PlanState, type Project } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useDragSort, type DragSortHandle } from '@/lib/use-drag-sort';

/** 목록 한 줄에 붙일 진행 상태 */
interface Row {
  project: Project;
  doc: PosterDoc | null;
  status: 'idle' | 'running' | 'done' | 'failed';
  plan: PlanState | null;
}

/**
 * 이 사업에서 이어서 볼 곳.
 *
 * 사업계획서를 쓰기 시작했으면 그 화면으로 간다. 목록에서 눌렀는데
 * 요약 한 장으로 가 버리면, 쓰던 문서로 돌아갈 길이 없다.
 */
function nextStep(row: Row): string {
  const writing = row.plan?.status === 'running' || row.plan?.status === 'done';
  return writing
    ? `/plans/${row.project.id}/document`
    : `/plans/${row.project.id}`;
}

/**
 * 사업계획서 목록.
 *
 * 한 줄만 보고 어떤 아이템인지 알아볼 수 있어야 한다.
 * 그래서 제목이 아니라 **아이디어 두 줄**을 같이 보여준다.
 * "이륜차 정비 플랫폼 / 라이더 맵 큐레이션" 정도면 충분하다.
 */
export default function PlansPage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** 삭제하려는 사업 — 확인을 받고 지운다 */
  const [removing, setRemoving] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      setError(null);
      const page = await api.listProjects();
      const mine = page.items.filter((p) => p.tenantId === session.tenantId);

      // 진행률을 보여주려면 요약 문서가 필요하다.
      const next = await Promise.all(
        mine.map(async (project) => {
          try {
            const [s, plan] = await Promise.all([
              posterApi.state(project.id),
              planApi.state(project.id).catch(() => null),
            ]);
            return { project, doc: s.doc, status: s.status, plan };
          } catch {
            return {
              project, doc: null, status: 'idle' as const, plan: null,
            };
          }
        }),
      );
      setRows(next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 끌어서 놓은 순서를 저장한다.
   *
   * 화면을 **먼저** 바꾸고 서버에 알린다. 저장을 기다렸다 바꾸면 손을 뗀
   * 뒤 줄이 원래 자리로 튕겼다가 다시 옮겨 가서, 잘못 놓은 것처럼 보인다.
   * 저장이 안 되면 그때 되돌리고 이유를 적는다 — 조용히 실패하면
   * 다음에 들어왔을 때 순서가 그대로여서 무엇이 잘못됐는지 알 수 없다.
   */
  const move = useCallback(
    async (from: number, to: number) => {
      const before = rows;
      const next = [...rows];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      setRows(next);
      setError(null);

      try {
        await api.reorderProjects(next.map((r) => r.project.id));
      } catch (err) {
        setRows(before);
        setError(`순서를 저장하지 못했습니다. ${(err as Error).message}`);
      }
    },
    [rows],
  );

  const drag = useDragSort(rows.length, (from, to) => void move(from, to));

  /**
   * 진행 중인 사업만 다시 읽는다.
   *
   * 목록 전체를 다시 읽으면 사업 수만큼 요청이 곱해진다. 사업이 다섯 개면
   * 한 번 확인할 때마다 열한 번을 부르는데, 정작 바뀌는 건 돌아가는 한 건뿐이다.
   */
  useEffect(() => {
    const busy = rows.filter(
      (r) => r.status === 'running' || r.plan?.status === 'running',
    );
    if (busy.length === 0) return;

    const timer = setInterval(() => {
      void Promise.all(
        busy.map(async (r) => {
          const [s, plan] = await Promise.all([
            posterApi.state(r.project.id),
            planApi.state(r.project.id).catch(() => null),
          ]);
          return { id: r.project.id, doc: s.doc, status: s.status, plan };
        }),
      )
        .then((updates) => {
          const byId = new Map(updates.map((u) => [u.id, u]));
          setRows((prev) =>
            prev.map((row) => {
              const u = byId.get(row.project.id);
              return u
                ? { ...row, doc: u.doc, status: u.status, plan: u.plan }
                : row;
            }),
          );
        })
        .catch(() => undefined);
    }, 5000);

    return () => clearInterval(timer);
  }, [rows]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-[var(--moai-ink)]">
            사업계획서
          </h1>
          <p className="mt-1 text-[15px] text-[var(--moai-muted)]">
            시작한 사업과 작성 진행 상황입니다.
          </p>
        </div>
        {/*
          사업이 하나도 없을 때는 아래 빈 화면에 "첫 사업 시작하기"가 있다.
          같은 일을 하는 버튼을 두 개 띄우면 어느 쪽을 눌러야 하는지 헷갈린다.
          불러오는 중에도 감춘다 — 잠깐 떴다 사라지면 깜빡이는 것처럼 보인다.
        */}
        {!loading && rows.length > 0 && (
          <Link href="/plans/new">
            <Button variant="brand">
              <Icon name="plus" size={15} />
              사업 시작
            </Button>
          </Link>
        )}
      </header>

      {error && (
        <div className="mb-6 border border-danger-soft bg-[var(--moai-risk-bg)] px-4 py-3 text-sm text-[var(--moai-risk-fg)]">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-[var(--moai-subtle)]">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <div className="border border-[var(--moai-border)] bg-[var(--moai-surface)] px-6 py-14 text-center">
          <p className="text-sm text-[var(--moai-muted)]">
            아직 시작한 사업이 없습니다.
          </p>
          <Link href="/plans/new">
            <Button variant="brand" className="mt-4">
              첫 사업 시작하기
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <ul className="space-y-2">
            {rows.map((row, index) => (
              <PlanRow
                key={row.project.id}
                row={row}
                onRemove={() => setRemoving(row.project)}
                drag={drag.rowProps(index)}
              />
            ))}
          </ul>
          {/*
            끌어서 옮길 수 있다는 것을 말해 준다. 한 건뿐이면 옮길 곳이
            없으므로 적지 않는다 — 안 되는 일을 안내하면 눌러 보게 된다.
          */}
          {rows.length > 1 && (
            <p className="mt-3 text-center text-xs text-[var(--moai-subtle)]">
              줄을 꾹 눌렀다 끌면 순서를 바꿀 수 있어요.
            </p>
          )}
        </>
      )}

      {/*
        삭제는 되돌릴 수 없다. 무엇이 함께 사라지는지 적어 두고 확인받는다.
        목록에서 X 한 번에 지워지면 잘못 눌렀을 때 복구할 방법이 없다.
      */}
      <Modal
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="이 사업을 삭제할까요?"
      >
        {removing && (
          <>
            <p className="border border-[var(--moai-border)] bg-[var(--moai-surface)] px-4 py-3 text-sm font-bold text-[var(--moai-ink)]">
              {removing.title}
            </p>

            <div className="mt-4 flex items-start gap-2 border border-danger-soft bg-[var(--moai-risk-bg)] px-4 py-3">
              <Icon
                name="warning"
                size={15}
                className="mt-0.5 shrink-0 text-[var(--moai-risk-fg)]"
              />
              <div className="text-sm leading-relaxed text-[var(--moai-risk-fg)]">
                <b>삭제하면 되돌릴 수 없습니다.</b>
                <p className="mt-1 text-xs text-[var(--moai-ink)]">
                  아이디어, 만들어 둔 요약 한 장, 칸마다 적어 둔 보완 내용이
                  모두 함께 지워집니다. 복구할 방법이 없어요.
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="secondary"
                disabled={deleting}
                onClick={() => setRemoving(null)}
              >
                취소
              </Button>
              <Button
                variant="danger"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  setError(null);
                  try {
                    await api.deleteProject(removing.id);
                    setRemoving(null);
                    await load();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? '삭제 중…' : '삭제'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </main>
  );
}

function PlanRow({
  row, onRemove, drag,
}: {
  row: Row;
  onRemove: () => void;
  /** 끌어서 옮기기 — 위치와 손잡이 역할을 한꺼번에 준다 */
  drag: ReturnType<DragSortHandle['rowProps']>;
}) {
  const { project, doc, status, plan } = row;
  const dragging = drag['data-dragging'] === 'true';

  /**
   * 서류 작성률.
   *
   * 근거가 없는 칸(gap)이 남아 있는 만큼 덜 된 것으로 본다.
   * 글자를 채웠는지가 아니라 **근거가 있는지**가 기준이다.
   */
  const progress = (() => {
    if (!doc) return null;
    const total = collectSlots(doc).length;
    if (total === 0) return null;
    const open = openGaps(doc).length;
    return Math.round(((total - open) / total) * 100);
  })();

  return (
    /*
      삭제 버튼은 링크 안이 아니라 형제로 둔다.
      <a> 안에 <button> 을 넣는 것은 올바른 HTML 이 아니다.
    */
    <li {...drag} className="group relative">
      <Link
        href={nextStep(row)}
        draggable={false}
        className={`flex items-center gap-5 border bg-white py-4 pl-5 pr-12 transition-colors ${
          dragging
            ? 'border-[var(--moai-accent)] shadow-[0_8px_24px_rgba(0,0,0,0.14)]'
            : 'border-[var(--moai-border)] hover:border-[var(--moai-accent)]'
        }`}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-bold text-[var(--moai-ink)]">
            {project.track === 'modoo' && (
              <span className="shrink-0 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-1.5 py-0.5 text-[11px] font-bold text-[var(--moai-accent)]">
                모두의창업
              </span>
            )}
            <span className="truncate">{project.title}</span>
          </p>
          {/* 두 줄 안에서 어떤 아이템인지 알아보게 한다 */}
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-[var(--moai-muted)]">
            {project.track === 'modoo'
              ? modooPreview(project.modooAnswers)
              : project.idea}
          </p>
        </div>

        {plan?.status === 'running' ? (
          <span className="flex shrink-0 items-center gap-1.5 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-2.5 py-1 text-xs font-semibold text-[var(--moai-accent)]">
            <Icon name="spinner" size={12} className="animate-spin" />
            사업계획서 {plan.progress?.done ?? 0}/{plan.progress?.total ?? '?'}
          </span>
        ) : plan?.status === 'done' ? (
          <span className="flex shrink-0 items-center gap-1.5 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-2.5 py-1 text-xs font-semibold text-[var(--moai-accent)]">
            <Icon name="doc" size={12} />
            사업계획서 완료
          </span>
        ) : status === 'running' ? (
          <span className="flex shrink-0 items-center gap-1.5 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-2.5 py-1 text-xs font-semibold text-[var(--moai-accent)]">
            <Icon name="spinner" size={12} className="animate-spin" />
            만드는 중
          </span>
        ) : status === 'failed' ? (
          <span className="shrink-0 border border-danger-soft bg-[var(--moai-risk-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--moai-risk-fg)]">
            실패
          </span>
        ) : progress !== null ? (
          <div className="w-24 shrink-0">
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-[10px] font-semibold text-[var(--moai-subtle)]">
                작성률
              </span>
              <span className="tabular text-[13px] font-bold text-[var(--moai-ink)]">
                {progress}%
              </span>
            </div>
            <div className="h-1.5 w-full bg-[var(--moai-border-soft)]">
              <div
                className="h-full bg-[var(--moai-accent)]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <span className="shrink-0 border border-[var(--moai-border)] bg-[var(--moai-surface)] px-2.5 py-1 text-xs font-semibold text-[var(--moai-muted)]">
            작성 전
          </span>
        )}
      </Link>

      <button
        onClick={onRemove}
        aria-label={`${project.title} 삭제`}
        title="삭제"
        className="absolute right-2 top-2 grid size-7 place-items-center text-[var(--moai-subtle)] opacity-0 transition-opacity hover:bg-[var(--moai-risk-bg)] hover:text-[var(--moai-risk-fg)] focus-visible:opacity-100 group-hover:opacity-100"
      >
        <Icon name="close" size={14} />
      </button>
    </li>
  );
}
