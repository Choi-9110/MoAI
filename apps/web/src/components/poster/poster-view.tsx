'use client';

import { splitCategoryLabel } from '@moai/shared';
import type {
  CompareBlock, Gap, LabeledCardsBlock, LabeledTextBlock, MetricsBlock,
  NoteBarBlock, OrgGridBlock, OrgRole, PosterBlock, PosterDoc, PosterTone,
  SlotRef,
} from '@moai/shared';
import { Icon } from '@/components/brand/icon';
import type { IconName } from '@/components/brand/icon';
import { BRAND_ICONS } from '@/components/brand/icons';

/**
 * 사업 요약 한 장 렌더러.
 *
 * 레이아웃이 고정 슬롯이라 내용이 길거나 짧아도 형태가 무너지지 않는다.
 *
 * 편집 단위는 **칸 하나**다. 카테고리 라벨("내부 문제점")은 문서의 뼈대라
 * 손댈 수 없고, 그 아래 항목을 각각 보완한다.
 * 수정 버튼을 따로 띄우지 않는다 — 칸 자체가 누를 수 있는 대상이고,
 * 마우스를 올리면 테두리 색으로 그 사실을 알린다.
 */

/* ────────────── 색 ────────────── */

const TONE: Record<
  PosterTone,
  { label: string; card: string; text: string; badge: string }
> = {
  accent: {
    label: 'bg-[var(--moai-accent)] text-white',
    card: 'bg-[var(--moai-accent-50)] border-[var(--moai-accent-100)]',
    text: 'text-[var(--moai-accent)]',
    badge: 'bg-[var(--moai-accent)] text-white',
  },
  neutral: {
    label: 'bg-[var(--moai-ink)] text-white',
    card: 'bg-[var(--moai-surface)] border-[var(--moai-border)]',
    text: 'text-[var(--moai-ink)]',
    badge: 'bg-[var(--moai-ink)] text-white',
  },
  risk: {
    label: 'bg-[var(--moai-risk-fg)] text-white',
    card: 'bg-[var(--moai-risk-bg)] border-danger-soft',
    text: 'text-[var(--moai-risk-fg)]',
    badge: 'bg-[var(--moai-risk-fg)] text-white',
  },
  caution: {
    label: 'bg-[var(--moai-needs-user-fg)] text-white',
    card: 'bg-[var(--moai-needs-user-bg)] border-needs-user-soft',
    text: 'text-[var(--moai-needs-user-fg)]',
    badge: 'bg-[var(--moai-needs-user-fg)] text-white',
  },
};

const ROLE_TONE: Record<OrgRole, PosterTone> = {
  주관: 'accent',
  참여: 'neutral',
  공동: 'neutral',
  수요처: 'neutral',
  자문: 'neutral',
};

/** 문서가 지정한 아이콘 이름이 실제로 있는지 확인한다 */
function iconName(name: string | undefined): IconName | null {
  return name && name in BRAND_ICONS ? (name as IconName) : null;
}

/* ────────────── 편집 가능한 칸 ────────────── */

export interface SlotHandlers {
  /** 칸을 누르면 보완 입력을 띄운다 */
  onPick?: (ref: SlotRef) => void;
  /** 이미 보완 요청을 남긴 칸 — 표시를 남겨 둔다 */
  noted?: (ref: SlotRef) => boolean;
  /**
   * 방금 재작성에서 바뀐 칸.
   *
   * 사용자가 건드리지 않았는데 바뀐 칸을 말없이 갈아 끼우면,
   * 다음에 그 칸을 보고 "내가 언제 이렇게 썼지" 하게 된다.
   */
  changed?: (ref: SlotRef) => 'requested' | 'ripple' | null;
  /** 지금 다시 쓰고 있는 중인지 — 어느 칸이 바뀌는지 보여준다 */
  rewriting?: boolean;
}

/**
 * 칸 하나를 감싼다.
 *
 * div 에 role="button" 을 쓰는 이유는 이 안에 다른 버튼이나 링크가
 * 들어올 수 있기 때문이다. button 안의 button 은 올바른 HTML 이 아니다.
 */
function Slot({
  blockId, slot, handlers, children, className = '',
}: {
  blockId: string;
  slot: string;
  handlers?: SlotHandlers;
  children: React.ReactNode;
  className?: string;
}) {
  const ref = { blockId, slot };
  const pick = handlers?.onPick;
  const isNoted = handlers?.noted?.(ref) ?? false;
  const change = handlers?.changed?.(ref) ?? null;
  const rewriting = handlers?.rewriting ?? false;

  if (!pick) return <div className={className}>{children}</div>;

  /*
   * 표시가 세 가지다.
   *
   *  연필  아직 반영 안 된 보완 요청 — 다시 만들기를 누르면 이 칸이 바뀐다
   *  체크  요청대로 바뀐 칸 — **작업이 끝났다는 뜻이지 잠겼다는 뜻이 아니다.**
   *        한 번 고쳤다고 마음에 든다는 보장이 없으니, 눌러서 또 보완할 수 있다.
   *  회전  요청하지 않았는데 따라 바뀐 칸 — 이게 제일 알려 줘야 하는 것이다
   */
  const mark =
    rewriting && isNoted
      ? {
          ring: 'border-[var(--moai-accent)]',
          badge: 'bg-[var(--moai-accent)] animate-pulse',
          icon: 'spinner' as const,
          spin: true,
          title: '이 칸을 다시 쓰는 중입니다',
        }
      : change === 'requested'
        ? {
            ring: 'border-[var(--moai-accent)]',
            badge: 'bg-[var(--moai-accent)]',
            icon: 'done' as const,
            spin: false,
            title: '요청대로 바뀌었습니다. 눌러서 또 보완할 수 있어요',
          }
        : change === 'ripple'
          ? {
              ring: 'border-[var(--moai-needs-user-fg)]',
              badge: 'bg-[var(--moai-needs-user-fg)]',
              icon: 'sync' as const,
              spin: false,
              title: '다른 칸이 바뀌면서 함께 조정된 칸입니다',
            }
          : isNoted
            ? {
                ring: 'border-[var(--moai-accent)]',
                badge: 'bg-[var(--moai-accent)]',
                icon: 'edit' as const,
                spin: false,
                title: '보완 요청을 남긴 칸입니다',
              }
            : null;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => pick(ref)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick(ref);
        }
      }}
      title={rewriting && isNoted ? '다시 쓰는 중' : '눌러서 보완하기'}
      className={`relative cursor-pointer rounded-xl outline-none ring-offset-2 transition-colors
        hover:border-[var(--moai-accent)]
        focus-visible:ring-2 focus-visible:ring-[var(--moai-accent)]
        ${rewriting && isNoted ? 'opacity-50' : ''}
        ${mark?.ring ?? ''} ${className}`}
    >
      {children}
      {mark && (
        <span
          className={`absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full text-white ${mark.badge}`}
          title={mark.title}
        >
          <Icon
            name={mark.icon}
            size={11}
            className={mark.spin ? 'animate-spin' : undefined}
          />
        </span>
      )}
    </div>
  );
}

/** 근거가 비었다는 표시 — 한 장 안에서 눈에 띄어야 한다 */
function GapNote({ gap }: { gap: Gap }) {
  return (
    <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-snug text-[var(--moai-needs-user-fg)]">
      <Icon name="needs-user" size={13} className="mt-px" />
      <span>{gap.reason}</span>
    </p>
  );
}

/* ────────────── 카테고리 라벨 ────────────── */

/**
 * 좌측 세로 라벨.
 *
 * "내부 문제점"이 "내부문제 / 점"으로 잘리지 않도록
 * 낱말 단위로 미리 끊어 각 줄을 따로 그린다.
 */
function CategoryLabel({
  label, tone,
}: {
  label: string;
  tone: PosterTone;
}) {
  const lines = splitCategoryLabel(label);

  return (
    <div
      className={`flex w-[78px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-2 py-4 text-center text-[14px] font-bold leading-tight tracking-tight ${TONE[tone].label}`}
    >
      {lines.map((line, i) => (
        <span key={i} className="block whitespace-nowrap">
          {line}
        </span>
      ))}
    </div>
  );
}

/* ────────────── 블록별 렌더 ────────────── */

function OrgGrid({ block, handlers }: { block: OrgGridBlock; handlers?: SlotHandlers }) {
  return (
    <div className="flex gap-3">
      <CategoryLabel label={block.category} tone="neutral" />
      <div className="grid flex-1 gap-2.5 sm:grid-cols-2">
        {block.items.map((it, i) => {
          const tone = ROLE_TONE[it.role] ?? 'neutral';
          return (
            <Slot
              key={i}
              blockId={block.id}
              slot={`item:${i}`}
              handlers={handlers}
              className="border border-[var(--moai-border)] bg-white p-4"
            >
              <span
                className={`inline-block rounded-md px-2 py-0.5 text-[11px] font-bold ${TONE[tone].badge}`}
              >
                {it.role}
              </span>
              <p className="mt-2.5 text-[16px] font-bold leading-tight text-[var(--moai-ink)]">
                {it.name}
                {it.suffix && (
                  <span className="ml-1 text-[13px] font-semibold text-[var(--moai-muted)]">
                    ({it.suffix})
                  </span>
                )}
              </p>
              <div className="mt-1.5 space-y-0.5">
                {it.lines.map((l, k) => (
                  <p key={k} className="text-[13px] leading-snug text-[var(--moai-muted)]">
                    {l}
                  </p>
                ))}
              </div>
              {it.gap && <GapNote gap={it.gap} />}
            </Slot>
          );
        })}
      </div>
    </div>
  );
}

function NoteBar({ block, handlers }: { block: NoteBarBlock; handlers?: SlotHandlers }) {
  const icon = iconName(block.icon);
  return (
    <Slot
      blockId={block.id}
      slot="text"
      handlers={handlers}
      className="border border-[var(--moai-border)] bg-[var(--moai-surface)] px-5 py-3"
    >
      <div className="flex items-center justify-center gap-2 text-[var(--moai-ink)]">
        {icon && <Icon name={icon} size={16} className="text-[var(--moai-accent)]" />}
        <p className="text-[14px] font-semibold">{block.text}</p>
      </div>
      {block.gap && <GapNote gap={block.gap} />}
    </Slot>
  );
}

function LabeledText({ block, handlers }: { block: LabeledTextBlock; handlers?: SlotHandlers }) {
  return (
    <div className="flex gap-3">
      <CategoryLabel label={block.category} tone={block.tone} />
      <Slot
        blockId={block.id}
        slot="body"
        handlers={handlers}
        className={`flex-1 border px-5 py-4 ${TONE[block.tone].card}`}
      >
        <p className="text-[14px] leading-relaxed text-[var(--moai-ink)]">
          {block.body}
        </p>
        {block.gap && <GapNote gap={block.gap} />}
      </Slot>
    </div>
  );
}

function LabeledCards({ block, handlers }: { block: LabeledCardsBlock; handlers?: SlotHandlers }) {
  const cols =
    block.cards.length >= 3
      ? 'sm:grid-cols-3'
      : block.cards.length === 2
        ? 'sm:grid-cols-2'
        : 'grid-cols-1';

  return (
    <div className="flex gap-3">
      <CategoryLabel label={block.category} tone={block.tone} />
      <div className={`grid flex-1 gap-2.5 ${cols}`}>
        {block.cards.map((c, i) => {
          const icon = iconName(c.icon);
          return (
            <Slot
              key={i}
              blockId={block.id}
              slot={`card:${i}`}
              handlers={handlers}
              className={`border px-4 py-3.5 ${TONE[block.tone].card}`}
            >
              <div className="flex items-start gap-2">
                <span
                  className={`mt-px grid size-[18px] shrink-0 place-items-center rounded-full text-[10px] font-bold ${TONE[block.tone].badge}`}
                >
                  {i + 1}
                </span>
                <p className="flex-1 text-[13px] font-bold leading-snug text-[var(--moai-ink)]">
                  {c.title}
                </p>
                {icon && (
                  <Icon name={icon} size={15} className={TONE[block.tone].text} />
                )}
              </div>
              <div className="mt-1.5 space-y-0.5 pl-[26px]">
                {c.lines.map((l, k) => (
                  <p key={k} className="text-[12px] leading-snug text-[var(--moai-muted)]">
                    {l}
                  </p>
                ))}
              </div>
              {c.gap && <GapNote gap={c.gap} />}
            </Slot>
          );
        })}
      </div>
    </div>
  );
}

function Compare({ block, handlers }: { block: CompareBlock; handlers?: SlotHandlers }) {
  const side = (which: 'left' | 'right') => {
    const s = block[which];
    const icon = iconName(s.icon);
    return (
      <div className="flex flex-1 gap-3">
        <CategoryLabel label={s.category} tone={s.tone} />
        <Slot
          blockId={block.id}
          slot={which}
          handlers={handlers}
          className={`flex-1 border px-4 py-4 ${TONE[s.tone].card}`}
        >
          <div className="flex items-start gap-2.5">
            {icon && (
              <Icon name={icon} size={17} className={`mt-px ${TONE[s.tone].text}`} />
            )}
            <p className="text-[13px] leading-snug text-[var(--moai-ink)]">{s.text}</p>
          </div>
          {s.gap && <GapNote gap={s.gap} />}
        </Slot>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2.5 lg:flex-row">
      {side('left')}
      {side('right')}
    </div>
  );
}

function Metrics({ block, handlers }: { block: MetricsBlock; handlers?: SlotHandlers }) {
  return (
    <div className="flex gap-3">
      <CategoryLabel label={block.category} tone={block.tone} />
      <div className="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {block.items.map((m, i) => (
          <Slot
            key={i}
            blockId={block.id}
            slot={`metric:${i}`}
            handlers={handlers}
            className={`border px-3 py-3 text-center ${TONE[block.tone].card}`}
          >
            <p className="text-[11px] font-semibold text-[var(--moai-muted)]">
              {m.caption}
            </p>
            <p
              className={`tabular mt-1 text-[20px] font-bold leading-none ${TONE[block.tone].text}`}
            >
              {m.value}
            </p>
            {m.note && (
              <p className="mt-1 text-[10px] leading-tight text-[var(--moai-subtle)]">
                {m.note}
              </p>
            )}
            {/*
              지표 칸은 좁아서 문장을 넣으면 글자가 눌린다.
              여기서는 표시만 하고, 내용은 눌렀을 때 팝업에서 보여준다.
            */}
            {m.gap && (
              <span
                title={m.gap.reason}
                className="mx-auto mt-1.5 flex w-fit items-center gap-1 text-[10px] font-semibold text-[var(--moai-needs-user-fg)]"
              >
                <Icon name="needs-user" size={11} />
                근거 필요
              </span>
            )}
          </Slot>
        ))}
      </div>
    </div>
  );
}

/* ────────────── 본체 ────────────── */

function Block({ block, handlers }: { block: PosterBlock; handlers?: SlotHandlers }) {
  switch (block.type) {
    case 'org_grid':
      return <OrgGrid block={block} handlers={handlers} />;
    case 'note_bar':
      return <NoteBar block={block} handlers={handlers} />;
    case 'labeled_text':
      return <LabeledText block={block} handlers={handlers} />;
    case 'labeled_cards':
      return <LabeledCards block={block} handlers={handlers} />;
    case 'compare':
      return <Compare block={block} handlers={handlers} />;
    case 'metrics':
      return <Metrics block={block} handlers={handlers} />;
    default:
      return null;
  }
}

export function PosterView({
  doc, handlers,
}: {
  doc: PosterDoc;
  handlers?: SlotHandlers;
}) {
  return (
    <article className="mx-auto w-full max-w-[900px] border border-[var(--moai-border)] bg-white p-6 sm:p-8">
      {/* 제목 — 그림자 대신 1px 보더와 배경 대비로 무게를 준다 */}
      <header className="border border-[var(--moai-ink)] bg-[var(--moai-ink)] px-6 py-5">
        {doc.eyebrow && (
          <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-white/60">
            {doc.eyebrow}
          </p>
        )}
        <h1 className="text-[21px] font-bold leading-snug tracking-tight text-white sm:text-[25px]">
          {doc.title}
        </h1>
      </header>

      <div className="mt-3 space-y-2.5">
        {doc.blocks.map((b) => (
          <Block key={b.id} block={b} handlers={handlers} />
        ))}
      </div>
    </article>
  );
}
