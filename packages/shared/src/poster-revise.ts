import { collectSlots, slotKey } from './poster';
import type { PosterDoc, PosterSlot, SlotNote } from './poster';

/**
 * 요약 한 장 다시 만들기.
 *
 * 핵심 원칙 하나 — **한 칸만 고쳐서 끝나지 않는다.**
 *
 * 내부 문제점을 바꾸면 해결 방안이 그대로일 수 없다. 그 해결 방안이
 * 겨냥하던 문제가 더 이상 그 문제가 아니기 때문이다. 기대 효과의 수치도,
 * 외부 문제점도 같이 움직인다. 새 내용에서 **새로운 빈틈**이 생기는 것도
 * 정상이다 — 그건 실패가 아니라 검토가 한 단계 진행됐다는 뜻이다.
 *
 * 그래서 재작성은 칸 단위 패치가 아니라 **문서 전체 재구성**이고,
 * 대신 무엇이 왜 바뀌었는지를 사용자에게 그대로 보여준다.
 */

export const POSTER_SYSTEM_PROMPT = `당신은 정부지원사업 사업계획서를 한 장으로 압축하는 편집자입니다.

주어진 요약 문서(JSON)를 사용자의 보완 요청에 따라 다시 만듭니다.

가장 중요한 규칙 — **연결된 칸을 함께 고칠 것**
문서의 칸들은 서로 맞물려 있습니다.
- 문제 인식이 바뀌면, 그 문제를 겨냥하던 해결 방안도 바뀌어야 합니다.
- 해결 방안이 바뀌면, 기대 효과의 지표와 근거도 따라 바뀝니다.
- 새 내용 때문에 없던 위험이나 빈틈이 생기면 숨기지 말고 드러냅니다.
사용자가 지목한 칸만 고치고 나머지를 그대로 두면 앞뒤가 맞지 않는 문서가 됩니다.

그 밖의 규칙
1. 지어내지 마세요. 근거가 없으면 그 칸에 gap 을 남기고 무엇이 없는지 적습니다.
2. 보완 요청이 없는 칸이라도, 연결 때문에 손봐야 하면 손봅니다.
   반대로 손볼 이유가 없으면 **글자 하나도 바꾸지 마세요.**
3. 블록의 id 와 type, 카테고리 이름(category)은 문서의 뼈대입니다. 바꾸지 마세요.
4. 블록의 개수와 순서를 바꾸지 마세요. 칸 안의 내용만 다시 씁니다.
5. tone 은 accent(핵심·해결) / neutral(일반) / risk(문제) / caution(확인 필요) 중에서만 고릅니다.
6. 아이콘 이름(icon)은 원래 값을 그대로 두세요.
7. 한 장에 들어가야 합니다. 카드 설명은 줄당 28자 이내, 3줄 이내로 씁니다.
8. gap 은 **객체**입니다. 문자열이 아닙니다.
   올바름: "gap": { "reason": "측정 근거가 없습니다" }
   틀림:   "gap": "측정 근거가 없습니다"
   빈틈이 없어졌으면 gap 을 아예 빼세요.

출력은 원본과 같은 구조의 JSON 문서 하나뿐입니다. 다른 말은 쓰지 마세요.`;

/** 재작성 요청문 */
export function buildPosterRevisionPrompt(
  doc: PosterDoc,
  notes: SlotNote[],
): string {
  const slots = collectSlots(doc);
  const byKey = new Map(slots.map((s) => [slotKey(s), s]));

  const asked = notes
    .map((n, i) => {
      const slot = byKey.get(slotKey(n));
      if (!slot) return null;
      return [
        `${i + 1}. [${slot.category}] ${slot.title}`,
        `   현재: ${slot.text || '(비어 있음)'}`,
        `   요청: ${n.request}`,
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n\n');

  const gaps = slots
    .filter((s) => s.gap)
    .map((s) => `- [${s.category}] ${s.title}: ${s.gap!.reason}`)
    .join('\n');

  return `## 현재 요약 문서
\`\`\`json
${JSON.stringify(doc, null, 2)}
\`\`\`

## 사용자가 보완을 요청한 칸
${asked || '(없음)'}

## 아직 근거가 없다고 표시된 칸
${gaps || '(없음)'}

## 할 일
위 요청을 반영해 문서를 다시 만드세요.
요청받은 칸을 고친 결과로 **앞뒤가 맞지 않게 되는 다른 칸도 함께** 고치세요.
새로 생긴 빈틈은 감추지 말고 해당 칸의 gap 에 적으세요.`;
}

/* ────────────── 무엇이 바뀌었나 ────────────── */

export type ChangeKind = 'requested' | 'ripple' | 'gap-added' | 'gap-cleared';

/**
 * 재작성 전후 비교 결과 한 줄.
 *
 * `ripple` 이 이 구조의 존재 이유다. 사용자가 건드리지 않았는데 바뀐 칸을
 * 말없이 갈아 끼우면, 다음에 그 칸을 보고 "내가 언제 이렇게 썼지" 하게 된다.
 */
export interface SlotChange {
  blockId: string;
  slot: string;
  category: string;
  title: string;
  kind: ChangeKind;
  before: string;
  after: string;
  /** gap-added 일 때 새로 생긴 빈틈 설명 */
  gapReason?: string;
}

/** 재작성 전후를 비교해 바뀐 칸을 찾는다 */
export function diffPoster(
  before: PosterDoc,
  after: PosterDoc,
  notes: SlotNote[] = [],
): SlotChange[] {
  const prev = new Map(collectSlots(before).map((s) => [slotKey(s), s]));
  const requested = new Set(notes.map((n) => slotKey(n)));
  const changes: SlotChange[] = [];

  for (const now of collectSlots(after)) {
    const key = slotKey(now);
    const was = prev.get(key);
    if (!was) continue; // 블록 구조는 유지되므로 보통 일어나지 않는다

    const textChanged = was.text !== now.text || was.title !== now.title;
    const gapAdded = !was.gap && !!now.gap;
    const gapCleared = !!was.gap && !now.gap;

    if (!textChanged && !gapAdded && !gapCleared) continue;

    changes.push({
      blockId: now.blockId,
      slot: now.slot,
      category: now.category,
      title: now.title,
      kind: textChanged
        ? requested.has(key)
          ? 'requested'
          : 'ripple'
        : gapAdded
          ? 'gap-added'
          : 'gap-cleared',
      before: describe(was),
      after: describe(now),
      gapReason: now.gap?.reason,
    });
  }

  return changes;
}

function describe(slot: PosterSlot): string {
  return slot.title && slot.title !== slot.text
    ? `${slot.title} — ${slot.text}`
    : slot.text;
}

export const CHANGE_LABELS: Record<ChangeKind, string> = {
  requested: '요청 반영',
  ripple: '연결되어 함께 바뀜',
  'gap-added': '새로 생긴 빈틈',
  'gap-cleared': '빈틈 채워짐',
};
