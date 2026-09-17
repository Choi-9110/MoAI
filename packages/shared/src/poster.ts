/**
 * 사업 요약 한 장 (Poster).
 *
 * 사업계획서 본문을 고정된 블록 구조로 재배치해 한눈에 보게 만든다.
 * 이미지 파일이 아니라 웹 레이아웃이며, **영역마다 따로 보완**할 수 있다.
 *
 * LLM 이 HTML 을 직접 쓰게 하면 매번 다르게 나오고 레이아웃이 깨진다.
 * 그래서 **LLM 은 이 JSON 만 만들고, 그리는 것은 렌더러가 한다.**
 *
 * 편집 단위는 블록이 아니라 그 안의 **칸(slot)** 이다.
 * "내부 문제점" 같은 카테고리 라벨은 문서의 뼈대라 고칠 수 없고,
 * 그 아래 항목 하나하나를 따로 보완한다.
 */

/**
 * 블록의 의미를 색으로 구분한다.
 *
 * 브랜드킷(v2 딥 그린)의 의미 색과 1:1로 맞췄다.
 * 색은 네 가지뿐이다 — 한 장에 여러 색이 흩어지면 무엇이 중요한지 사라진다.
 */
export const POSTER_TONES = ['accent', 'neutral', 'risk', 'caution'] as const;
export type PosterTone = (typeof POSTER_TONES)[number];

/** 참여 형태 */
export const ORG_ROLES = ['주관', '참여', '공동', '수요처', '자문'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/**
 * 아직 근거가 없거나 사용자 확인이 필요한 지점.
 *
 * 이걸 비워 두면 안 된다. 요약을 예쁘게 만드는 것보다
 * **무엇이 비어 있는지 보이게 하는 것**이 이 화면의 목적이다.
 */
export interface Gap {
  /** 한 문장으로 무엇이 부족한지 */
  reason: string;
}

/* ────────────── 블록 ────────────── */

/** 기업·기관 카드 그리드 — 컨소시엄 구성 */
export interface OrgGridBlock {
  id: string;
  type: 'org_grid';
  /** 이 블록의 카테고리 이름 — 사용자가 고칠 수 없다 */
  category: string;
  items: {
    role: OrgRole;
    name: string;
    /** 기업 형태 등 괄호 보조 표기 */
    suffix?: string;
    /** 역할 설명. 슬래시로 끊어 3줄 이내 */
    lines: string[];
    gap?: Gap;
  }[];
}

/** 한 줄짜리 보조 설명 바 */
export interface NoteBarBlock {
  id: string;
  type: 'note_bar';
  /** 브랜드 아이콘 이름 */
  icon: string;
  text: string;
  gap?: Gap;
}

/** 좌측 라벨 + 우측 본문 */
export interface LabeledTextBlock {
  id: string;
  type: 'labeled_text';
  category: string;
  tone: PosterTone;
  body: string;
  gap?: Gap;
}

/** 좌측 라벨 + 우측 카드 (2~4개) */
export interface LabeledCardsBlock {
  id: string;
  type: 'labeled_cards';
  category: string;
  tone: PosterTone;
  cards: {
    title: string;
    lines: string[];
    /** 브랜드 아이콘 이름 */
    icon?: string;
    gap?: Gap;
  }[];
}

/** 문제 ↔ 해결 2열 대비 */
export interface CompareBlock {
  id: string;
  type: 'compare';
  left: { category: string; tone: PosterTone; icon?: string; text: string; gap?: Gap };
  right: { category: string; tone: PosterTone; icon?: string; text: string; gap?: Gap };
}

/** 지표 그리드 — 숫자를 크게 보여준다 */
export interface MetricsBlock {
  id: string;
  type: 'metrics';
  category: string;
  tone: PosterTone;
  items: {
    /** 화면 상단 라벨 (예: 정확도) */
    caption: string;
    /** 크게 보일 값 (예: ≥90%) */
    value: string;
    /** 괄호 보조 설명 */
    note?: string;
    gap?: Gap;
  }[];
}

export type PosterBlock =
  | OrgGridBlock
  | NoteBarBlock
  | LabeledTextBlock
  | LabeledCardsBlock
  | CompareBlock
  | MetricsBlock;

export interface PosterDoc {
  title: string;
  /** 제목 위 작은 머리말 (사업명·공고명 등) */
  eyebrow?: string;
  blocks: PosterBlock[];
}

/* ────────────── 편집 단위 ────────────── */

/** 칸 하나를 가리키는 주소 */
export interface SlotRef {
  blockId: string;
  /** 블록 안에서의 위치. 예: 'card:1', 'left', 'body' */
  slot: string;
}

/** 화면에 그려지고 클릭할 수 있는 칸 하나 */
export interface PosterSlot extends SlotRef {
  /** 이 칸이 속한 카테고리 (수정 불가 영역) */
  category: string;
  /** 칸 제목 — 없으면 카테고리를 그대로 쓴다 */
  title: string;
  /** 현재 내용 */
  text: string;
  gap?: Gap;
}

/** 사용자가 한 칸에 남긴 보완 요청 */
export interface SlotNote extends SlotRef {
  /** "이렇게 고쳐 달라"는 사용자 문장 */
  request: string;
}

export function slotKey(ref: SlotRef): string {
  return `${ref.blockId}::${ref.slot}`;
}

/**
 * 문서에서 편집 가능한 칸을 모두 뽑는다.
 *
 * 화면과 재작성 프롬프트가 **같은 목록**을 쓰게 하려는 것이다.
 * 화면에 뜬 칸과 모델이 고치는 칸이 어긋나면 사용자는 원인을 알 수 없다.
 */
export function collectSlots(doc: PosterDoc): PosterSlot[] {
  const out: PosterSlot[] = [];

  for (const b of doc.blocks) {
    switch (b.type) {
      case 'org_grid':
        b.items.forEach((it, i) =>
          out.push({
            blockId: b.id,
            slot: `item:${i}`,
            category: b.category,
            title: it.name,
            text: it.lines.join(' / '),
            gap: it.gap,
          }),
        );
        break;

      case 'note_bar':
        out.push({
          blockId: b.id,
          slot: 'text',
          category: '보조 설명',
          title: '보조 설명',
          text: b.text,
          gap: b.gap,
        });
        break;

      case 'labeled_text':
        out.push({
          blockId: b.id,
          slot: 'body',
          category: b.category,
          title: b.category,
          text: b.body,
          gap: b.gap,
        });
        break;

      case 'labeled_cards':
        b.cards.forEach((c, i) =>
          out.push({
            blockId: b.id,
            slot: `card:${i}`,
            category: b.category,
            title: c.title,
            text: c.lines.join(' / '),
            gap: c.gap,
          }),
        );
        break;

      case 'compare':
        for (const side of ['left', 'right'] as const) {
          const s = b[side];
          out.push({
            blockId: b.id,
            slot: side,
            category: s.category,
            title: s.category,
            text: s.text,
            gap: s.gap,
          });
        }
        break;

      case 'metrics':
        b.items.forEach((m, i) =>
          out.push({
            blockId: b.id,
            slot: `metric:${i}`,
            category: b.category,
            title: m.caption,
            text: m.note ? `${m.value} (${m.note})` : m.value,
            gap: m.gap,
          }),
        );
        break;
    }
  }

  return out;
}

/** 아직 근거가 없는 칸만 */
export function openGaps(doc: PosterDoc): PosterSlot[] {
  return collectSlots(doc).filter((s) => s.gap);
}

/* ────────────── 분량 제약 ────────────── */

/**
 * 한 장에 담아야 하므로 글자 수가 강제된다.
 * 넘치면 잘라내지 말고 **다시 요약하게 한다.** 압축 과정이 곧 검토다.
 */
export const POSTER_LIMITS = {
  title: 40,
  eyebrow: 30,
  orgName: 20,
  orgLine: 26,
  orgLines: 3,
  cardTitle: 24,
  cardLine: 28,
  cardLines: 3,
  bodyChars: 120,
  metricValue: 8,
  metricCaption: 10,
  noteText: 44,
  /** 카테고리 라벨은 세로 칸에 들어가므로 더 짧다 */
  category: 10,
} as const;

/** 분량 위반 지점을 찾아낸다 — 재요약 대상 판정용 */
export function findOverflows(doc: PosterDoc): string[] {
  const over: string[] = [];
  const check = (ok: boolean, msg: string) => {
    if (!ok) over.push(msg);
  };

  check(doc.title.length <= POSTER_LIMITS.title, `제목이 ${POSTER_LIMITS.title}자를 넘습니다`);

  for (const b of doc.blocks) {
    switch (b.type) {
      case 'org_grid':
        for (const it of b.items) {
          check(it.name.length <= POSTER_LIMITS.orgName, `기관명 초과: ${it.name}`);
          check(it.lines.length <= POSTER_LIMITS.orgLines, `기관 설명 줄 수 초과: ${it.name}`);
        }
        break;
      case 'labeled_text':
        check(b.body.length <= POSTER_LIMITS.bodyChars, `${b.category} 본문이 깁니다`);
        break;
      case 'labeled_cards':
        for (const c of b.cards) {
          check(c.title.length <= POSTER_LIMITS.cardTitle, `카드 제목 초과: ${c.title}`);
          check(c.lines.length <= POSTER_LIMITS.cardLines, `카드 줄 수 초과: ${c.title}`);
        }
        break;
      case 'metrics':
        for (const m of b.items) {
          check(m.value.length <= POSTER_LIMITS.metricValue, `지표 값 초과: ${m.value}`);
        }
        break;
      default:
        break;
    }
  }
  return over;
}

/* ────────────── 모델 응답 정규화 ────────────── */

/**
 * 모델이 돌려준 문서를 다듬는다.
 *
 * 형식을 아무리 정확히 지시해도 `gap` 을 객체가 아니라 문자열로 주는 일이
 * 실제로 일어난다. 그 정도는 여기서 받아 준다 —
 * 뜻이 분명한 응답을 형식 하나 때문에 통째로 버리는 건 낭비다.
 */
export function normalizeGap(value: unknown): Gap | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') {
    const reason = value.trim();
    return reason ? { reason } : undefined;
  }
  if (typeof value === 'object' && 'reason' in value) {
    const reason = String((value as Gap).reason ?? '').trim();
    return reason ? { reason } : undefined;
  }
  return undefined;
}

/**
 * 모델이 자주 틀리는 필드 이름을 바로잡는다.
 *
 * org_grid 와 metrics 는 `items` 인데 `cards` 로 쓰는 일이 잦다.
 * 형식 하나 어긋났다고 통째로 버리면 몇 분을 다시 기다려야 한다.
 */
function fixBlockShape(block: Record<string, unknown>): Record<string, unknown> {
  const b = { ...block };

  if ((b.type === 'org_grid' || b.type === 'metrics') && !b.items && b.cards) {
    b.items = b.cards;
    delete b.cards;
  }
  if (b.type === 'labeled_cards' && !b.cards && b.items) {
    b.cards = b.items;
    delete b.items;
  }
  // 최상위에만 있어야 할 것이 블록에 붙어 오는 경우가 있다.
  delete b.subtitle;
  delete b.skeleton;

  return b;
}

/** 문서 전체의 gap 을 정규화한다 */
export function normalizePosterDoc(doc: PosterDoc): PosterDoc {
  const fix = <T extends { gap?: unknown }>(o: T): T => {
    const gap = normalizeGap(o.gap);
    if (gap) return { ...o, gap };
    const { gap: _drop, ...rest } = o;
    return rest as T;
  };

  return {
    title: doc.title,
    ...(doc.eyebrow ? { eyebrow: doc.eyebrow } : {}),
    blocks: doc.blocks.map((raw) => {
      const b = fixBlockShape(
        raw as unknown as Record<string, unknown>,
      ) as unknown as PosterBlock;

      switch (b.type) {
        case 'org_grid':
          return { ...b, items: b.items.map(fix) };
        case 'labeled_cards':
          return { ...b, cards: b.cards.map(fix) };
        case 'metrics':
          return { ...b, items: b.items.map(fix) };
        case 'compare':
          return { ...b, left: fix(b.left), right: fix(b.right) };
        default:
          return fix(b);
      }
    }),
  };
}

/* ────────────── 세로 라벨 줄바꿈 ────────────── */

/**
 * 좁은 세로 라벨에 들어갈 카테고리를 **의미 단위로** 끊는다.
 *
 *   "내부 문제점"  →  ["내부", "문제점"]
 *
 * 그냥 흘려 두면 "내부문제" / "점" 처럼 글자 중간에서 잘린다.
 * 낱말이 두 동강 나면 읽는 속도가 눈에 띄게 떨어진다.
 */
export function splitCategoryLabel(label: string, maxPerLine = 4): string[] {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [label];

  // 띄어쓰기가 있으면 그대로 줄을 나눈다 — 글쓴이가 이미 끊어 준 것이다.
  if (words.length > 1) return words;

  // 한 낱말이면 길이에 맞춰 나눈다.
  const word = words[0];
  if (word.length <= maxPerLine) return [word];

  const lines: string[] = [];
  for (let i = 0; i < word.length; i += maxPerLine) {
    lines.push(word.slice(i, i + maxPerLine));
  }
  return lines;
}
