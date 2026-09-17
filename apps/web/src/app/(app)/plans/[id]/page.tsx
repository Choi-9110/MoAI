'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  CHANGE_LABELS, PLAN_FORMATS, PLAN_FORMAT_SPECS, collectSlots, defaultFormat,
  openGaps, slotKey,
} from '@moai/shared';
import type {
  PlanFormat, PosterDoc, PosterSlot, ProjectTrack, SlotChange, SlotNote,
  SlotRef,
} from '@moai/shared';
import { PlanSteps } from '@/components/plans/plan-steps';
import { Icon } from '@/components/brand/icon';
import { GrantPicker } from '@/components/poster/grant-picker';
import { PosterView } from '@/components/poster/poster-view';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { POSTER_MESSAGES, WorkingMessage } from '@/components/working-message';
import { humanError } from '@/lib/human-error';
import {
  api, planApi, posterApi, type PlanState, type PosterState, type Project,
} from '@/lib/api';

/**
 * 사업 하나 — 요약 한 장을 보고 다듬는 화면.
 *
 * 흐름
 *   생성 중  → 로딩 (다른 페이지 다녀와도 이어서 보인다)
 *   생성 완료 → 칸 클릭 → 보완 입력 → 저장
 *            → (반영하여 다시 만들기) 또는 (사업계획서 작성)
 */
export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [state, setState] = useState<PosterState | null>(null);
  /** 사업계획서 진행 상황 — 이미 쓰고 있으면 새로 시작시키면 안 된다 */
  const [plan, setPlan] = useState<PlanState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState<Record<string, SlotNote>>({});
  const [picked, setPicked] = useState<PosterSlot | null>(null);
  const [draft, setDraft] = useState('');
  const [changes, setChanges] = useState<SlotChange[] | null>(null);
  const [askTemplate, setAskTemplate] = useState(false);
  /** 같은 요약으로 문서를 하나 더 만들 때 이름을 묻는다 */
  const [askVersion, setAskVersion] = useState(false);
  const [pickGrant, setPickGrant] = useState(false);

  const doc: PosterDoc | null = state?.doc ?? null;
  /** 서버가 다시 쓰는 중인지 — 화면을 떠났다 와도 이어진다 */
  const revising = state?.status === 'running';
  const slots = useMemo(() => (doc ? collectSlots(doc) : []), [doc]);
  const gaps = useMemo(() => (doc ? openGaps(doc) : []), [doc]);
  const noteCount = Object.keys(notes).length;

  const changeMap = useMemo(() => {
    const m = new Map<string, SlotChange>();
    for (const c of changes ?? []) m.set(slotKey(c), c);
    return m;
  }, [changes]);

  const load = useCallback(async () => {
    try {
      const [p, s, pl] = await Promise.all([
        api.getProject(id),
        posterApi.state(id),
        planApi.state(id).catch(() => null),
      ]);
      setProject(p);
      setState(s);
      setPlan(pl);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [id]);

  /*
   * `#idea` 로 들어오면 그 자리로 내려 준다.
   *
   * 브라우저가 알아서 해 줄 것 같지만 안 된다 — 스크롤하는 것이 `body` 가
   * 아니라 레이아웃 안쪽 div 라서, 주소창의 해시로는 아무 일도 일어나지
   * 않는다. 다른 화면에서 "아이디어" 를 눌렀을 때 **페이지만 바뀌고
   * 화면은 그대로**여서 안 눌린 것처럼 보였다.
   */
  useEffect(() => {
    if (!doc || window.location.hash !== '#idea') return;

    /*
     * 한 번만 부르면 안 듣는다.
     *
     * 도착 직후에는 아직 그림이 덜 그려져 있어서, 그 사이 리렌더가 한 번
     * 더 돌면 스크롤이 되돌아간다. `smooth` 는 애니메이션이 도는 동안
     * 취소되기까지 해서 아예 안 움직인 것처럼 보였다.
     * 그래서 **곧바로 옮기고, 자리를 잡을 때까지 몇 번 더 확인한다.**
     */
    let tries = 0;
    const timer = setInterval(() => {
      document
        .getElementById('idea')
        ?.scrollIntoView({ behavior: 'auto', block: 'start' });

      if (++tries >= 3) {
        clearInterval(timer);
        /*
         * 해시를 지운다. 남겨 두면 이 화면에서 뒤로/앞으로 오갈 때마다 다시
         * 아래로 튄다 — 한 번 데려다 주면 그것으로 끝이다.
         */
        window.history.replaceState(null, '', window.location.pathname);
      }
    }, 150);

    return () => clearInterval(timer);
  }, [doc]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * 만드는 중이면 계속 물어본다.
   *
   * 상태가 서버에 있으므로 이 페이지를 떠났다 돌아와도, 새로고침을 해도
   * 이어서 로딩이 보인다.
   */
  /*
   * 만드는 중에는 **요약 상태만** 묻는다.
   * 사업 정보와 사업계획서 진행은 그동안 바뀌지 않는다.
   */
  useEffect(() => {
    if (state?.status !== 'running') return;
    const timer = setInterval(() => {
      void posterApi
        .state(id)
        .then(setState)
        .catch(() => undefined);
    }, 4000);
    return () => clearInterval(timer);
  }, [state?.status, id]);

  /*
   * 재작성이 끝나면 결과를 화면에 반영한다.
   *
   * 보완 요청은 서버가 이미 문서에 녹였으므로 여기서 지운다.
   * 변경 내역은 서버가 들고 있어서, 다른 페이지를 다녀와도 볼 수 있다.
   */
  useEffect(() => {
    if (state?.status !== 'done') return;
    if (state.changes && state.changes.length > 0) setChanges(state.changes);
    if (Object.keys(notes).length > 0 && state.changes) setNotes({});
    // state.changes 가 바뀔 때만 본다.
  }, [state?.status, state?.changes]);

  function pick(ref: SlotRef) {
    const slot = slots.find(
      (s) => s.blockId === ref.blockId && s.slot === ref.slot,
    );
    if (!slot) return;

    /*
     * 칸을 누르는 순간 지난 변경 표시를 걷는다.
     *
     * 한 번 고쳤다고 마음에 든다는 보장이 없다. 표시가 남아 있으면
     * "이미 끝난 칸"처럼 보여 다시 손대기를 망설이게 된다.
     */
    setChanges(null);
    setPicked(slot);
    setDraft(notes[slotKey(ref)]?.request ?? '');
  }

  function saveNote() {
    if (!picked) return;
    const key = slotKey(picked);
    const request = draft.trim();

    setNotes((prev) => {
      const next = { ...prev };
      if (!request) delete next[key];
      else next[key] = { blockId: picked.blockId, slot: picked.slot, request };
      return next;
    });
    setPicked(null);
  }

  /**
   * 다시 만들기 시작.
   *
   * 시작만 시키고 상태를 물어본다. 끝날 때까지 붙잡고 있으면 프록시가
   * 먼저 끊어서 실패한 것처럼 보인다 — 실제로 그래서 500 이 났다.
   * 이 방식이면 다른 페이지를 다녀와도 결과를 받을 수 있다.
   */
  async function revise() {
    setError(null);
    try {
      await posterApi.revise(id, Object.values(notes));
      await load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  /* ────────────── 화면 ────────────── */

  if (error && !project) {
    return <Center>{error}</Center>;
  }
  if (!project || !state) {
    return <Center>불러오는 중…</Center>;
  }

  // 처음 만드는 중일 때만 로딩 화면을 띄운다.
  // 다시 만드는 중에는 기존 요약을 그대로 두고 그 자리에서 표시한다.
  if (state.status === 'running' && !state.doc) {
    return <Building project={project} state={state} />;
  }

  if (state.status === 'failed') {
    return (
      <Failed project={project} state={state} onRetry={() => void load()} />
    );
  }

  /*
   * 요약이 아직 없는 경우.
   *
   * 새로 만든 사업(아이디어만 물려받은 복제본)이 여기로 온다. 예전에는
   * "아직 만들어진 요약이 없습니다" 한 줄만 띄웠는데, 그러면 **만들 방법이
   * 화면에 없다.** 여기서 바로 시작하게 한다.
   */
  if (!doc) {
    return <StartPoster project={project} onStarted={() => void load()} />;
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <PlanSteps
        projectId={project.id}
        current="poster"
        hasPoster
        hasPlan={plan?.status !== undefined && plan.status !== 'idle'}
      />

      <header className="mb-6">
        <p className="text-xs font-semibold text-[var(--moai-subtle)]">
          {project.title}
        </p>
        <h1 className="mt-0.5 text-[26px] font-bold tracking-tight text-[var(--moai-ink)]">
          사업 요약 한 장
        </h1>
        <p className="mt-1 text-[15px] text-[var(--moai-muted)]">
          고치고 싶은 칸을 누르면 보완할 내용을 적을 수 있어요.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-2">
        <Chip icon="needs-user" tone="needs-user" label="근거 필요" value={`${gaps.length}곳`} />
        <Chip icon="edit" tone="accent" label="보완 작성" value={`${noteCount}곳`} />
        <Chip icon="section" tone="neutral" label="전체 칸" value={`${slots.length}개`} />
        {state.noticeFileName && (
          <Chip icon="grant" tone="neutral" label="공고문" value={state.noticeFileName} />
        )}
        {/* 모두의창업은 공고가 이미 정해져 있다. 연결할 것이 없다. */}
        {project.track === 'modoo' ? null : state.grant?.sourceUrl ? (
          <a
            href={state.grant.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-[var(--moai-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--moai-accent)] hover:border-[var(--moai-accent)]"
          >
            <Icon name="external" size={13} />
            공고 원문
          </a>
        ) : (
          <button
            onClick={() => setPickGrant(true)}
            className="inline-flex items-center gap-1.5 border border-dashed border-[var(--moai-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--moai-muted)] hover:border-[var(--moai-accent)] hover:text-[var(--moai-accent)]"
          >
            <Icon name="search" size={13} />
            공고 연결하기
          </button>
        )}
      </div>

      {/*
        자동으로 찾아 묶은 공고는 확인을 받는다.
        엉뚱한 공고에 맞춰 사업계획서를 쓰면 처음부터 다시 해야 한다.
      */}
      {state.grant && state.grantLink && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-5 py-3">
          <Icon name="grant" size={15} className="text-[var(--moai-accent)]" />
          <p className="min-w-0 flex-1 text-xs leading-relaxed text-[var(--moai-ink)]">
            올리신 공고문을 보고 <b>{state.grant.title}</b> 공고로 짐작했어요.
            <span className="text-[var(--moai-muted)]"> 맞나요?</span>
          </p>
          <div className="flex shrink-0 gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPickGrant(true)}
            >
              다른 공고예요
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                // 사용자가 확인해 준 순간 추정이 아니게 된다.
                await posterApi.linkGrant(id, state.grant!.id);
                await load();
              }}
            >
              맞아요
            </Button>
          </div>
        </div>
      )}

      {changes && (
        <ChangeReport changes={changes} onDismiss={() => setChanges(null)} />
      )}

      {error && (
        <div className="mb-5 border border-danger-soft bg-[var(--moai-risk-bg)] px-5 py-4 text-sm text-[var(--moai-risk-fg)]">
          {error}
        </div>
      )}

      <PosterView
        doc={doc}
        handlers={{
          onPick: pick,
          noted: (ref) => slotKey(ref) in notes,
          changed: (ref) => {
            const c = changeMap.get(slotKey(ref));
            if (!c) return null;
            return c.kind === 'requested' ? 'requested' : 'ripple';
          },
          rewriting: revising,
        }}
      />

      <div className="mt-6 flex flex-col items-center gap-3 border-t border-[var(--moai-border)] pt-6 sm:flex-row sm:justify-center">
        <Button
          variant="secondary"
          disabled={noteCount === 0 || revising}
          onClick={revise}
        >
          {revising ? '다시 만드는 중…' : '반영하여 다시 만들기'}
          {!revising && noteCount > 0 && ` (${noteCount})`}
        </Button>
        {/*
          이미 쓰고 있거나 다 쓴 문서가 있으면 그리로 보낸다.
          여기서 또 "작성"을 띄우면 쓰던 것을 지우고 새로 시작하게 된다.
        */}
        {plan?.status === 'running' ? (
          <Button
            variant="brand"
            onClick={() => router.push(`/plans/${id}/document`)}
          >
            <Icon name="spinner" size={15} className="animate-spin" />
            작성 중 보기 ({plan.progress?.done ?? 0}/{plan.progress?.total ?? '?'})
          </Button>
        ) : plan?.status === 'done' ? (
          <>
            {/*
              이미 쓴 문서가 있으면 **덮어쓰지 않는다.** 공고마다 양식이 달라
              같은 아이템으로 여러 번 쓰는데, 여기서 다시 작성하면 앞서 낸
              것이 사라진다. 요약까지 그대로 옮긴 새 사업으로 갈라 낸다.
            */}
            <Button variant="secondary" onClick={() => setAskVersion(true)}>
              <Icon name="doc" size={15} />
              다른 공고용으로 하나 더
            </Button>
            <Button
              variant="brand"
              onClick={() => router.push(`/plans/${id}/document`)}
            >
              <Icon name="doc" size={15} />
              사업계획서 보기
            </Button>
          </>
        ) : (
          <Button
            variant="brand"
            disabled={revising}
            onClick={() => setAskTemplate(true)}
          >
            사업계획서 작성
          </Button>
        )}
      </div>
      {noteCount === 0 && !revising && (
        <p className="mt-2 text-center text-xs text-[var(--moai-subtle)]">
          보완할 칸을 누르면 &lsquo;반영하여 다시 만들기&rsquo;가 켜집니다.
        </p>
      )}
      {revising && (
        <p className="mt-2 text-center text-xs text-[var(--moai-muted)]">
          표시된 칸을 다시 쓰고 있습니다. 나머지는 그대로 둡니다.
        </p>
      )}

      {/*
        처음 입력한 아이디어.

        요약 한 장은 이걸 공고에 맞춰 압축한 것이라, 요약이 이상해 보일 때
        **원문이 그랬던 것인지 압축이 잘못된 것인지**를 여기서 바로 대볼 수
        있어야 한다. 접어 두는 것은 평소에 자리를 차지할 내용이 아니어서다.
      */}
      <details
        id="idea"
        className="mt-8 scroll-mt-6 border border-[var(--moai-border)] bg-white"
      >
        <summary className="cursor-pointer list-none px-5 py-3.5 text-sm font-bold text-[var(--moai-ink)] marker:content-none">
          처음 입력한 아이디어
          <span className="ml-2 text-xs font-normal text-[var(--moai-subtle)]">
            요약 한 장은 이 내용을 공고에 맞춰 압축한 것입니다
          </span>
        </summary>
        <div className="border-t border-[var(--moai-border)] px-5 py-4">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--moai-muted)]">
            {project.idea?.trim() || '(입력한 내용이 없습니다)'}
          </p>
        </div>
      </details>

      {/* 칸 하나 보완 */}
      <Modal
        open={picked !== null}
        onClose={() => setPicked(null)}
        title={picked ? `${picked.category} — ${picked.title}` : ''}
      >
        {picked && (
          <>
            <div className="mb-4 border border-[var(--moai-border)] bg-[var(--moai-surface)] px-4 py-3">
              <p className="mb-1 text-[11px] font-bold text-[var(--moai-subtle)]">
                현재 내용
              </p>
              <p className="text-sm leading-relaxed text-[var(--moai-ink)]">
                {picked.text || '(비어 있음)'}
              </p>
              {picked.gap && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-[var(--moai-needs-user-fg)]">
                  <Icon name="needs-user" size={13} className="mt-px" />
                  {picked.gap.reason}
                </p>
              )}
            </div>

            <label
              htmlFor="slot-note"
              className="mb-1.5 block text-sm font-semibold text-[var(--moai-ink)]"
            >
              이 내용을 어떻게 보완 / 수정하시겠습니까?
            </label>
            <textarea
              id="slot-note"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              autoFocus
              placeholder="예: 실제 운영자 인터뷰 결과를 근거로 넣어줘 / 수치를 빼고 더 짧게"
              className="w-full resize-y border border-[var(--moai-border)] px-4 py-3 text-sm leading-relaxed text-[var(--moai-ink)] outline-none focus:border-[var(--moai-accent)]"
            />
            <p className="mt-1.5 text-xs text-[var(--moai-subtle)]">
              지금 바로 다시 쓰지 않습니다. 다 적은 뒤 아래 &lsquo;반영하여 다시
              만들기&rsquo;를 누르면 한 번에 반영돼요.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setPicked(null)}>
                취소
              </Button>
              <Button variant="brand" onClick={saveNote}>
                저장
              </Button>
            </div>
          </>
        )}
      </Modal>

      {/* 사업계획서 단계 — 그 공고의 양식을 받는다 */}
      <TemplateAsk
        open={askTemplate}
        onClose={() => setAskTemplate(false)}
        noticeFileName={state.noticeFileName}
        grant={state.grant}
        onPickGrant={() => {
          setAskTemplate(false);
          setPickGrant(true);
        }}
        track={project.track}
        onStart={async (format, template) => {
          await planApi.start(id, format, template);
          router.push(`/plans/${id}/document`);
        }}
      />

      {/*
        새 버전 이름 묻기.

        기본값을 채워 두고 그대로 확인만 눌러도 되게 한다 — 대부분은 이름을
        고민하지 않고, 고민하고 싶은 사람만 고치면 된다.
      */}
      <VersionAsk
        open={askVersion}
        defaultTitle={nextTitle(project.title)}
        onClose={() => setAskVersion(false)}
        onCreate={async (title, keepPoster) => {
          const made = await planApi.duplicate(id, title, keepPoster);
          router.push(`/plans/${made.id}`);
        }}
      />

      <GrantPicker
        open={pickGrant}
        onClose={() => setPickGrant(false)}
        projectId={id}
        initialTerm={state.noticeFileName ?? project.title}
        onLinked={load}
      />
    </main>
  );
}

/* ────────────── 상태 화면 ────────────── */

function Center({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20 text-center text-sm text-[var(--moai-muted)]">
      {children}
    </main>
  );
}

/**
 * 만드는 중.
 *
 * 얼마나 걸릴지 알 수 없어서 남은 시간을 약속하지 않는다.
 * 대신 지금까지 걸린 시간을 보여주고, 나가도 된다고 분명히 말한다.
 */
function Building({
  project, state,
}: {
  project: Project;
  state: PosterState;
}) {
  const started = state.startedAt ? new Date(state.startedAt).getTime() : null;
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!started) return;
    const tick = () => setElapsed(Math.floor((Date.now() - started) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [started]);

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const ss = String(elapsed % 60).padStart(2, '0');

  return (
    <main className="mx-auto max-w-2xl px-6 py-20">
      <div className="border border-[var(--moai-border)] bg-white px-8 py-12 text-center">
        <Icon
          name="spinner"
          size={32}
          className="mx-auto animate-spin text-[var(--moai-accent)]"
        />
        <h1 className="mt-5 text-xl font-bold text-[var(--moai-ink)]">
          요약 한 장을 만들고 있습니다
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--moai-muted)]">
          {state.noticeFileName ? (
            <>
              <b className="text-[var(--moai-ink)]">{state.noticeFileName}</b>
              를 읽고
              <br />
            </>
          ) : null}
          {/*
            멈춘 화면처럼 보이지 않도록 지금 하는 일을 돌아가며 보여 준다.
            숫자(남은 시간·순번)를 약속하지 않는 원칙은 그대로다.
          */}
          <WorkingMessage messages={POSTER_MESSAGES} />
        </p>

        <p className="tabular mt-6 text-[28px] font-bold text-[var(--moai-ink)]">
          {mm}:{ss}
        </p>

        <div className="mt-6 border-t border-[var(--moai-border)] pt-5 text-xs leading-relaxed text-[var(--moai-subtle)]">
          <b className="text-[var(--moai-muted)]">이 화면을 켜 둘 필요 없어요.</b>
          <br />
          다른 곳을 보다 돌아오면 이어서 보입니다. 창을 닫아도 계속 만듭니다.
        </div>

        <p className="mt-4 text-xs text-[var(--moai-subtle)]">{project.title}</p>
      </div>
    </main>
  );
}

/**
 * 요약 한 장을 처음 만드는 화면.
 *
 * 공고문을 받아 두는 것이 핵심이다. **공고문 없이 만든 요약은 그 공고에
 * 맞춘 요약이 아니다** — 그걸 모르고 지나가면 엉뚱한 기준으로 사업계획서까지
 * 쓰게 된다. 그래서 없이도 만들 수는 있게 하되, 무엇이 달라지는지 적어 둔다.
 */
function StartPoster({
  project, onStarted,
}: {
  project: Project;
  onStarted: () => void;
}) {
  const [notice, setNotice] = useState<File | null>(null);
  const [idea, setIdea] = useState(project.idea ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const ideaChanged = idea.trim() !== (project.idea ?? '').trim();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="border border-[var(--moai-border)] bg-white px-8 py-10">
        <p className="text-xs font-semibold text-[var(--moai-subtle)]">
          {project.title}
        </p>
        <h1 className="mt-1 text-xl font-bold text-[var(--moai-ink)]">
          요약 한 장부터 만들어요
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--moai-muted)]">
          아이디어는 그대로 물려받았습니다. 낼 공고의 공고문을 올리면 그 공고에
          맞춰 요약을 뽑아요.
        </p>

        {/*
          아이디어를 여기서 고칠 수 있게 한다.

          요약은 **아이디어를 공고에 맞춰 압축한 것**이라, 낼 곳이 달라지면
          강조할 것도 달라진다. 기술 과제에 낼 것이면 기술 얘기를 더 적고,
          창업지원이면 시장 얘기를 더 적는 식이다. 요약을 뽑은 뒤에 고치면
          이미 압축된 것을 되돌려야 하므로, **뽑기 전인 지금**이 고치기
          가장 싼 자리다.
        */}
        <label
          id="idea"
          className="mt-6 block scroll-mt-6 text-xs font-bold text-[var(--moai-ink)]"
        >
          아이디어
          <span className="ml-2 font-normal text-[var(--moai-subtle)]">
            낼 공고에 맞춰 고쳐도 됩니다
          </span>
          <textarea
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            rows={7}
            className="thin-scroll mt-1.5 w-full resize-y border border-[var(--moai-border)] bg-white px-3 py-2.5 text-sm font-normal leading-relaxed text-[var(--moai-ink)] outline-none focus:border-[var(--moai-accent)]"
          />
        </label>
        <p className="mt-1 text-xs text-[var(--moai-subtle)]">
          {idea.trim().length < 10
            ? '10자 이상 적어야 요약을 만들 수 있어요.'
            : ideaChanged
              ? '고친 내용으로 요약을 만듭니다.'
              : `${idea.trim().length}자`}
        </p>

        <div className="mt-4 border border-[var(--moai-border)] bg-[var(--moai-surface)] px-4 py-3.5">
          <div className="flex items-center gap-3">
            <Icon
              name={notice ? 'verified' : 'upload'}
              size={16}
              className={
                notice ? 'text-[var(--moai-accent)]' : 'text-[var(--moai-subtle)]'
              }
            />
            <p className="min-w-0 flex-1 truncate text-sm text-[var(--moai-muted)]">
              {notice ? notice.name : '공고문 올리기 (선택)'}
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md,.hwp,.hwpx"
              onChange={(e) => setNotice(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => fileInput.current?.click()}
            >
              파일 선택
            </Button>
          </div>
          <p className="mt-2.5 text-xs leading-relaxed text-[var(--moai-subtle)]">
            올리지 않아도 만들 수 있지만,{' '}
            <b className="text-[var(--moai-ink)]">그 공고에 맞춘 요약은 아닙니다.</b>{' '}
            평가 항목과 지원 대상을 모르는 채로 쓰게 돼요.
          </p>
        </div>

        {error && (
          <p className="mt-4 border border-danger-soft bg-[var(--moai-risk-bg)] px-3 py-2 text-xs text-[var(--moai-risk-fg)]">
            {error}
          </p>
        )}

        <Button
          variant="brand"
          className="mt-6"
          disabled={busy || idea.trim().length < 10}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              // 고쳤으면 먼저 저장한다. 저장 전에 시작하면 옛 내용으로 만든다.
              if (ideaChanged) await api.updateProject(project.id, { idea: idea.trim() });
              await posterApi.start(project.id, notice ?? undefined);
              onStarted();
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy
            ? '시작하는 중…'
            : notice
              ? '이 공고로 요약 만들기'
              : '공고문 없이 만들기'}
        </Button>
      </div>
    </main>
  );
}

function Failed({
  project, state, onRetry,
}: {
  project: Project;
  state: PosterState;
  onRetry: () => void;
}) {
  const [retrying, setRetrying] = useState(false);
  const [notice, setNotice] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  /*
   * 올렸던 공고문은 서버에 남아 있지 않다. 한 번 읽고 지우기 때문이다.
   * 그래서 그냥 "다시 시도"를 누르면 **공고문 없이** 다시 만들어진다 —
   * 요약은 나오지만 그 공고에 맞춘 요약이 아니다. 그걸 모르고 지나가면
   * 엉뚱한 기준으로 사업계획서까지 쓰게 된다. 그래서 다시 올리게 한다.
   */
  const hadNotice = Boolean(state.noticeFileName);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="border border-danger-soft bg-[var(--moai-risk-bg)] px-8 py-10 text-center">
        <Icon
          name="warning"
          size={28}
          className="mx-auto text-[var(--moai-risk-fg)]"
        />
        <h1 className="mt-4 text-xl font-bold text-[var(--moai-ink)]">
          요약을 만들지 못했습니다
        </h1>
        <p className="mt-2 break-words text-sm leading-relaxed text-[var(--moai-risk-fg)]">
          {humanError(state.error)}
        </p>
        <p className="mt-3 text-xs text-[var(--moai-muted)]">
          {/*
            **"실행기가 켜져 있는지 확인하라"고 적혀 있었는데, 이제 사용자가
            할 일이 아니다.** 죽으면 PM2 가 살리고, 떠 있는데 답을 못 하면
            감시기가 다시 띄운다. 사용자가 확인할 창도 이제 없다 —
            그런데 안내만 옛날에 머물러 있어서, 할 수도 없는 일을 하라고
            시키고 있었다.
          */}
          생성 서버가 다시 뜨는 중이면 잠깐 이럴 수 있습니다. 1~2분 뒤 다시
          시도해 주세요.
        </p>

        {hadNotice && (
          <div className="mt-6 border border-dashed border-[var(--moai-border)] bg-white px-4 py-4 text-left">
            <p className="mb-2 text-xs leading-relaxed text-[var(--moai-muted)]">
              올리셨던 <b className="text-[var(--moai-ink)]">{state.noticeFileName}</b>
              은 읽은 뒤 지워져 서버에 남아 있지 않습니다.{' '}
              <b className="text-[var(--moai-ink)]">다시 올리지 않으면 공고문 없이</b>{' '}
              만들어집니다.
            </p>
            <div className="flex items-center gap-3">
              <Icon
                name={notice ? 'verified' : 'upload'}
                size={16}
                className={
                  notice
                    ? 'text-[var(--moai-accent)]'
                    : 'text-[var(--moai-subtle)]'
                }
              />
              <p className="min-w-0 flex-1 truncate text-sm text-[var(--moai-muted)]">
                {notice ? notice.name : '공고문 다시 올리기 (선택)'}
              </p>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.doc,.docx,.txt,.md,.hwp,.hwpx"
                onChange={(e) => setNotice(e.target.files?.[0] ?? null)}
                className="hidden"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInput.current?.click()}
              >
                파일 선택
              </Button>
            </div>
          </div>
        )}

        <Button
          variant="brand"
          className="mt-6"
          disabled={retrying}
          onClick={async () => {
            setRetrying(true);
            try {
              await posterApi.start(project.id, notice ?? undefined);
              onRetry();
            } finally {
              setRetrying(false);
            }
          }}
        >
          {retrying
            ? '다시 시작하는 중…'
            : hadNotice && !notice
              ? '공고문 없이 다시 시도'
              : '다시 시도'}
        </Button>
      </div>
    </main>
  );
}

/* ────────────── 사업계획서 단계 ────────────── */

/**
 * 사업계획서 단계로 넘어가기 전, 그 공고의 양식을 받는다.
 *
 * **양식은 선택이다.** 공고에 양식이 안 붙어 있는 경우가 흔하고,
 * 있는지 없는지는 원문을 봐야 안다. 그래서 원문 링크를 같이 놓고,
 * 없으면 없는 대로 진행할 수 있게 한다 — 파일을 요구하며 막지 않는다.
 */
function TemplateAsk({
  open, onClose, track, noticeFileName, grant, onPickGrant, onStart,
}: {
  open: boolean;
  onClose: () => void;
  track: ProjectTrack;
  noticeFileName: string | null;
  grant: { title: string; sourceUrl: string | null } | null;
  onPickGrant: () => void;
  onStart: (format: PlanFormat, template?: File) => Promise<void>;
}) {
  /*
   * 트랙에 맞는 것을 미리 골라 둔다. 모두의창업으로 시작했으면 PSSD 가
   * 기본이지만, 같은 아이디어로 예비창업패키지(PSST)에 내는 일도 있어서
   * 트랙에 묶어 두지는 않는다.
   */
  const [format, setFormat] = useState<PlanFormat>(defaultFormat(track));
  const [file, setFile] = useState<File | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const spec = PLAN_FORMAT_SPECS[format];

  return (
    <Modal open={open} onClose={onClose} title="사업계획서 작성">
      <p className="text-sm leading-relaxed text-[var(--moai-ink)]">
        어떤 <b>틀</b>로 쓸지 고르세요. 목차와 채점 기준이 양식마다 다릅니다.
      </p>

      <div className="mt-3 space-y-2">
        {PLAN_FORMATS.map((key) => {
          const s = PLAN_FORMAT_SPECS[key];
          const on = key === format;
          const recommended = key === defaultFormat(track);
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFormat(key)}
              className={`flex w-full items-start gap-3 border px-4 py-3 text-left transition-colors ${
                on
                  ? 'border-[var(--moai-accent)] bg-[var(--moai-accent-50)]'
                  : 'border-[var(--moai-border)] bg-white hover:border-[var(--moai-subtle)]'
              }`}
            >
              <span
                className={`mt-1 size-3.5 shrink-0 rounded-full border-[5px] ${
                  on
                    ? 'border-[var(--moai-accent)]'
                    : 'border-[var(--moai-border)]'
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5 text-sm font-bold text-[var(--moai-ink)]">
                  {s.label}
                  {recommended && (
                    <span className="border border-[var(--moai-accent-100)] bg-white px-1.5 py-0.5 text-[11px] font-bold text-[var(--moai-accent)]">
                      {track === 'modoo' ? '1인 창업 기본' : '기본'}
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-[var(--moai-muted)]">
                  {s.summary}
                </span>
                <span className="mt-0.5 block text-xs text-[var(--moai-subtle)]">
                  {s.when}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {spec.fixedOutline ? (
        <p className="mt-4 flex items-start gap-2 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-4 py-3 text-xs leading-relaxed text-[var(--moai-ink)]">
          <Icon
            name="verified"
            size={14}
            className="mt-0.5 shrink-0 text-[var(--moai-accent)]"
          />
          <span>
            {spec.label.split(' ')[0]} 는 목차가 정해져 있어 <b>양식을 올리지
            않아도 됩니다.</b> 공개된 채점 기준과 작성 지침을 읽고 배점이 큰
            항목에 근거를 몰아 씁니다.
            {spec.context && (
              <>
                {' '}
                자금 계획은 <b>라운드별 지원 사다리</b>(1R 200만원 · 2R MVP 최대
                2,000만원 · 로컬트랙 사업화자금 최대 3,000만원)에 맞춰 씁니다.
              </>
            )}{' '}
            손에 든 양식 파일이 있으면 올려 주세요 — 그 목차가 우선합니다.
          </span>
        </p>
      ) : (
        <>
      <p className="mt-4 text-sm leading-relaxed text-[var(--moai-ink)]">
        공고에 <b>사업계획서 양식</b>이 붙어 있으면 올려 주세요. 그 양식의
        목차와 항목에 맞춰 씁니다.
      </p>
      <p className="mt-1.5 text-sm leading-relaxed text-[var(--moai-muted)]">
        양식이 없는 공고도 많습니다. 그럴 땐 그냥 진행하세요 — 일반적인
        정부지원사업 목차로 만들어집니다.
      </p>

      {/* 양식이 있는지 없는지는 원문을 봐야 안다 */}
      <div className="mt-4 border border-[var(--moai-border)] bg-[var(--moai-surface)] px-4 py-3">
        <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[var(--moai-muted)]">
          <Icon name="grant" size={13} />
          양식이 있는지 모르겠다면
        </p>
        {grant?.sourceUrl ? (
          <a href={grant.sourceUrl} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary" size="sm">
              <Icon name="external" size={14} />
              공고 원문 보러가기
            </Button>
          </a>
        ) : (
          <>
            <Button variant="secondary" size="sm" onClick={onPickGrant}>
              <Icon name="search" size={14} />
              공고 찾아서 연결하기
            </Button>
            <p className="mt-1.5 text-xs leading-relaxed text-[var(--moai-subtle)]">
              {noticeFileName
                ? '올리신 공고문과 맞는 공고를 찾지 못했습니다.'
                : '연결된 공고가 없습니다.'}{' '}
              직접 찾아 연결하면 원문을 바로 열어볼 수 있어요.
            </p>
          </>
        )}
      </div>

        </>
      )}

      <div className="mt-4 flex items-center gap-3 border border-dashed border-[var(--moai-border)] px-4 py-4">
        <Icon
          name={file ? 'verified' : 'upload'}
          size={18}
          className={file ? 'text-[var(--moai-accent)]' : 'text-[var(--moai-subtle)]'}
        />
        <p className="min-w-0 flex-1 truncate text-sm text-[var(--moai-muted)]">
          {file
            ? file.name
            : `사업계획서 양식 (HWP · DOCX · PDF) — 선택${
                spec.fixedOutline ? ' · 올리면 이 목차가 우선합니다' : ''
              }`}
        </p>
        <input
          ref={input}
          type="file"
          accept=".pdf,.doc,.docx,.hwp,.hwpx,.txt"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="hidden"
        />
        {file ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setFile(null);
              if (input.current) input.current.value = '';
            }}
          >
            지우기
          </Button>
        ) : (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => input.current?.click()}
          >
            파일 선택
          </Button>
        )}
      </div>

      {error && (
        <p className="mt-3 text-xs text-[var(--moai-risk-fg)]">{error}</p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={starting} onClick={onClose}>
          닫기
        </Button>
        <Button
          variant="brand"
          disabled={starting}
          onClick={async () => {
            setStarting(true);
            setError(null);
            try {
              await onStart(format, file ?? undefined);
            } catch (err) {
              setError((err as Error).message);
              setStarting(false);
            }
          }}
        >
          {starting
            ? '시작하는 중…'
            : file
              ? '이 양식으로 작성'
              : spec.fixedOutline
                ? `${spec.label.split(' ')[0]} 목차로 작성`
                : '양식 없이 작성'}
        </Button>
      </div>
      <p className="mt-2 flex items-center justify-end gap-1 text-xs text-[var(--moai-subtle)]">
        <Icon name="info" size={12} />
        보통 10~15분 걸려요. 창을 닫아도 계속 쓰고, 끝나면 알려드립니다.
      </p>
    </Modal>
  );
}

/* ────────────── 조각 ────────────── */

function Chip({
  icon, tone, label, value,
}: {
  icon: 'needs-user' | 'edit' | 'section' | 'grant';
  tone: 'needs-user' | 'accent' | 'neutral';
  label: string;
  value: string;
}) {
  const style = {
    'needs-user':
      'border-needs-user-soft bg-[var(--moai-needs-user-bg)] text-[var(--moai-needs-user-fg)]',
    accent:
      'border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] text-[var(--moai-accent)]',
    neutral:
      'border-[var(--moai-border)] bg-[var(--moai-surface)] text-[var(--moai-muted)]',
  }[tone];

  return (
    <span
      className={`inline-flex max-w-full items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold ${style}`}
    >
      <Icon name={icon} size={13} />
      {label}
      <b className="tabular truncate font-bold">{value}</b>
    </span>
  );
}

function ChangeReport({
  changes, onDismiss,
}: {
  changes: SlotChange[];
  onDismiss: () => void;
}) {
  const ripple = changes.filter((c) => c.kind === 'ripple');
  const added = changes.filter((c) => c.kind === 'gap-added');

  return (
    <div className="mb-5 border border-[var(--moai-accent-100)] bg-[var(--moai-accent-50)] px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--moai-accent)]">
            <Icon name="sync" size={15} />
            {changes.length === 0
              ? '바뀐 곳이 없습니다'
              : `${changes.length}곳이 바뀌었습니다`}
          </p>
          <p className="mt-1 text-xs text-[var(--moai-muted)]">
            {ripple.length > 0
              ? `요청한 칸 때문에 ${ripple.length}곳이 함께 조정됐어요.`
              : '요청한 칸만 바뀌었어요.'}
            {added.length > 0 &&
              ` 새로 확인이 필요해진 곳이 ${added.length}곳 있습니다.`}
          </p>
          <p className="mt-1 text-xs text-[var(--moai-accent)]">
            마음에 안 들면 그 칸을 다시 눌러 또 보완할 수 있어요.
          </p>
        </div>
        <button
          onClick={onDismiss}
          aria-label="닫기"
          className="shrink-0 text-[var(--moai-subtle)] hover:text-[var(--moai-muted)]"
        >
          <Icon name="close" size={16} />
        </button>
      </div>

      {changes.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-[var(--moai-accent-100)] pt-3">
          {changes.map((c, i) => (
            <li key={i} className="text-xs leading-relaxed">
              <span
                className={`mr-1.5 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                  c.kind === 'ripple'
                    ? 'bg-[var(--moai-needs-user-bg)] text-[var(--moai-needs-user-fg)]'
                    : c.kind === 'gap-added'
                      ? 'bg-[var(--moai-risk-bg)] text-[var(--moai-risk-fg)]'
                      : 'bg-white text-[var(--moai-accent)]'
                }`}
              >
                {CHANGE_LABELS[c.kind]}
              </span>
              <b className="font-bold text-[var(--moai-ink)]">
                {c.category} · {c.title}
              </b>
              {c.kind !== 'gap-added' && (
                <div className="mt-0.5 pl-1">
                  <p className="text-[var(--moai-subtle)] line-through">
                    {c.before}
                  </p>
                  <p className="text-[var(--moai-ink)]">{c.after}</p>
                </div>
              )}
              {c.gapReason && (
                <p className="mt-0.5 pl-1 text-[var(--moai-needs-user-fg)]">
                  {c.gapReason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ────────────── 새 버전 ────────────── */

/**
 * 다음 버전 이름 — 화면에 미리 채워 둘 값.
 *
 * 서버도 같은 규칙으로 붙이지만(`plan.service.ts`), 사용자가 확인 창에서
 * 미리 보고 고칠 수 있어야 해서 여기서도 만든다.
 */
function nextTitle(title: string): string {
  const m = /^(.*?)\s*v(\d+)\s*$/i.exec(title.trim());
  if (m) return `${m[1]} v${Number(m[2]) + 1}`;
  return `${title.trim()} v2`;
}

/**
 * 같은 요약으로 문서를 하나 더 만들 때 이름을 묻는다.
 *
 * **덮어쓰는 것이 아니라 갈라 내는 것**임을 여기서 분명히 한다. 버튼만
 * 보고는 지금 쓴 문서가 어떻게 되는지 알 수 없다.
 */
function VersionAsk({
  open, defaultTitle, onClose, onCreate,
}: {
  open: boolean;
  defaultTitle: string;
  onClose: () => void;
  onCreate: (title: string, keepPoster: boolean) => Promise<void>;
}) {
  const [title, setTitle] = useState(defaultTitle);
  const [keepPoster, setKeepPoster] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 팝업을 다시 열 때마다 기본값을 새로 채운다.
  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
      setKeepPoster(true);
      setError(null);
    }
  }, [open, defaultTitle]);

  return (
    <Modal open={open} onClose={onClose} title="사업계획서 하나 더 만들기">
      <p className="text-sm leading-relaxed text-[var(--moai-muted)]">
        <b>지금 쓴 문서는 그대로 남습니다.</b> 아이디어를 물려받은 새 사업을
        만들어요. 여기서 무엇을 고쳐도 원래 사업은 건드려지지 않습니다.
      </p>

      {/*
        어디서부터 갈라질 것인가.

        비슷한 공고면 요약을 베껴 몇 칸만 고치는 편이 빠르고, 공고 성격이
        아주 다르면(창업지원 ↔ R&D) 요약에 들어갈 내용 자체가 달라서
        새로 뽑는 편이 낫다. 고르는 값이 아니라 **상황이 정해 주는 값**이라
        각각 어떤 때 쓰는지를 함께 적는다.
      */}
      <div className="mt-4 space-y-2">
        {[
          {
            keep: true,
            label: '요약 한 장은 그대로 쓰기',
            hint: '비슷한 공고에 낼 때. 몇 칸만 고치면 됩니다.',
          },
          {
            keep: false,
            label: '요약 한 장부터 새로 만들기',
            hint: '공고 성격이 다를 때(창업지원 ↔ R&D). 새 공고문을 올려 처음부터 뽑습니다.',
          },
        ].map((opt) => (
          <label
            key={String(opt.keep)}
            className={`flex cursor-pointer items-start gap-3 border px-4 py-3 transition-colors ${
              keepPoster === opt.keep
                ? 'border-[var(--moai-accent)] bg-[var(--moai-accent-50)]'
                : 'border-[var(--moai-border)] bg-white hover:border-[var(--moai-accent-100)]'
            }`}
          >
            <input
              type="radio"
              name="keep-poster"
              checked={keepPoster === opt.keep}
              onChange={() => setKeepPoster(opt.keep)}
              className="mt-1"
            />
            <span className="min-w-0">
              <span className="block text-sm font-bold text-[var(--moai-ink)]">
                {opt.label}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-[var(--moai-muted)]">
                {opt.hint}
              </span>
            </span>
          </label>
        ))}
      </div>

      <label className="mt-4 block text-xs font-bold text-[var(--moai-ink)]">
        새 이름
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="mt-1.5 h-11 w-full border border-[var(--moai-border)] bg-white px-3 text-sm font-normal text-[var(--moai-ink)] outline-none focus:border-[var(--moai-accent)]"
        />
      </label>
      <p className="mt-1.5 text-xs text-[var(--moai-subtle)]">
        목록에서 나란히 보입니다. 어느 공고에 낸 것인지 알아볼 이름이면 좋아요.
      </p>

      {error && (
        <p className="mt-3 border border-danger-soft bg-[var(--moai-risk-bg)] px-3 py-2 text-xs text-[var(--moai-risk-fg)]">
          {error}
        </p>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>
          닫기
        </Button>
        <Button
          variant="brand"
          disabled={busy || title.trim().length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await onCreate(title.trim(), keepPoster);
            } catch (err) {
              setError((err as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? '만드는 중…' : '만들기'}
        </Button>
      </div>
    </Modal>
  );
}
