'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';

/**
 * 목록을 꾹 눌러 끌어서 순서를 바꾼다.
 *
 * 라이브러리를 쓰지 않는다. 필요한 것은 "세로로 늘어선 줄 하나를 다른
 * 자리로 옮긴다"뿐이고, 그 하나 때문에 드래그 라이브러리를 통째로
 * 들이면 목록 한 화면에 수십 KB 가 붙는다.
 *
 * ## 왜 곧바로 끌리지 않고 '꾹' 눌러야 하는가
 *
 * 줄 전체가 링크다. 누르자마자 끌리게 하면, 링크를 누르려다 손이 1px
 * 움직인 것까지 드래그로 잡혀서 정작 눌러야 할 화면이 안 열린다.
 * 그래서 **제자리에서 일정 시간 누르고 있을 때만** 드래그로 넘어간다.
 * 그 전에 움직이면 스크롤이고, 그냥 떼면 클릭이다.
 *
 * ## 손가락(터치)에서
 *
 * 꾹 누르기 전까지는 브라우저가 세로 스크롤을 가져간다. 드래그로 넘어간
 * 뒤에는 스크롤을 막아야 줄이 따라온다 — `touchmove` 를 passive 가 아닌
 * 리스너로 붙여야만 막을 수 있어서, 드래그 중에만 그렇게 붙인다.
 */

/** 드래그로 넘어가기까지 눌러야 하는 시간 */
const HOLD_MS = 260;

/** 이만큼 움직이면 드래그가 아니라 스크롤·클릭으로 본다 */
const SLOP_PX = 6;

export interface DragSortHandle {
  /** 지금 끌고 있는 줄의 자리. 아무것도 안 끌면 null */
  draggingIndex: number | null;
  /** 그 줄이 놓일 자리 */
  targetIndex: number | null;
  /** 한 줄에 그대로 펼쳐 주는 값 — 위치와 손잡이 역할을 한다 */
  rowProps: (index: number) => {
    ref: (el: HTMLElement | null) => void;
    onPointerDown: (e: ReactPointerEvent) => void;
    onContextMenu: (e: ReactMouseEvent) => void;
    style: CSSProperties;
    'data-dragging': string;
  };
}

/**
 * @param count   줄 개수
 * @param onMove  놓았을 때 부른다. (원래 자리, 새 자리)
 */
export function useDragSort(
  count: number,
  onMove: (from: number, to: number) => void,
): DragSortHandle {
  const [dragging, setDragging] = useState<number | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  /** 끌고 있는 줄이 처음 자리에서 얼마나 내려왔는가 */
  const [offset, setOffset] = useState(0);

  const els = useRef<(HTMLElement | null)[]>([]);
  const els_ = els.current;
  /*
   * 줄이 줄어들면 남아 있는 옛 참조를 버린다.
   *
   * 사업을 지우면 배열은 짧아지는데 여기 담아 둔 것은 그대로 남는다.
   * 그 상태로 자리를 재면 사라진 줄이 높이 0 인 줄로 끼어들어, 엉뚱한
   * 자리에 놓인다.
   */
  if (els_.length > count) els_.length = count;

  /** 누르기 시작한 순간의 정보. 드래그로 넘어가기 전까지도 들고 있는다. */
  const press = useRef<{
    index: number;
    x: number;
    y: number;
    timer: number | null;
    /** 드래그로 넘어갔는가 */
    active: boolean;
    /** 줄마다의 화면 위치 — 넘어가는 순간 한 번만 잰다 */
    rects: { top: number; height: number }[];
    /** 줄 사이 간격 */
    gap: number;
    /** 스크롤이 움직인 만큼을 빼기 위한 기준 */
    scroller: Element | Window;
    scrollTop: number;
  } | null>(null);

  /** 실제로 끌었으면 뒤따라오는 클릭 한 번을 삼킨다 (줄이 링크다) */
  const swallowClick = useRef(false);

  const clearTimer = () => {
    if (press.current?.timer !== null && press.current) {
      window.clearTimeout(press.current.timer);
      press.current.timer = null;
    }
  };

  const finish = useCallback(() => {
    clearTimer();
    press.current = null;
    setDragging(null);
    setTarget(null);
    setOffset(0);
    document.body.style.userSelect = '';
  }, []);

  /**
   * 지금 손이 있는 높이가 몇 번째 자리인가.
   *
   * **한 칸의 절반**을 지나면 그 자리로 넘어간다. 한 칸을 꽉 채워야
   * 넘어가게 하면, 옮기려는 자리에 줄을 정확히 겹쳐 놓아도 꿈쩍하지 않아서
   * 고장 난 것처럼 보인다. 반대로 조금만 움직여도 넘어가면 손이 떨릴 때마다
   * 순서가 뒤바뀐다. 절반이 그 사이다.
   *
   * 기준은 **끌고 있는 줄이 차지하던 높이**다. 줄마다 높이가 달라도 옮겨갈
   * 때 움직이는 거리는 끌고 있는 줄의 높이 하나이므로, 그 절반이 맞다.
   *
   * 위로 갈 때와 아래로 갈 때가 같은 값이어야 한다. 한쪽만 여유를 주면
   * 위로는 잘 가는데 아래로는 마지막 자리에 안 놓이는 식으로 어긋난다.
   */
  const indexAt = (dy: number): number => {
    const p = press.current;
    if (!p) return 0;

    const { rects, index, gap } = p;
    const mine = rects[index];
    const center = mine.top + mine.height / 2 + dy;
    const half = (mine.height + gap) / 2;

    for (let i = 0; i < index; i += 1) {
      const c = rects[i].top + rects[i].height / 2;
      if (center < c + half) return i;
    }
    for (let i = rects.length - 1; i > index; i -= 1) {
      const c = rects[i].top + rects[i].height / 2;
      if (center > c - half) return i;
    }
    return index;
  };

  /* ── 누르고 있는 동안 창 전체에서 듣는다 ─────────────────
     줄 밖으로 손이 벗어나도 계속 따라와야 한다. 줄에만 붙이면
     빠르게 끌었을 때 손이 줄을 벗어나는 순간 끊긴다. */
  useEffect(() => {
    const scrolled = () => {
      const p = press.current;
      if (!p) return 0;
      const now =
        p.scroller === window
          ? window.scrollY
          : (p.scroller as Element).scrollTop;
      return now - p.scrollTop;
    };

    const move = (e: PointerEvent) => {
      const p = press.current;
      if (!p) return;

      if (!p.active) {
        // 아직 드래그로 안 넘어갔다. 움직였으면 누르기를 없던 일로 한다.
        const moved =
          Math.abs(e.clientX - p.x) > SLOP_PX ||
          Math.abs(e.clientY - p.y) > SLOP_PX;
        if (moved) finish();
        return;
      }

      const dy = e.clientY - p.y + scrolled();
      setOffset(dy);
      setTarget(indexAt(dy));
    };

    const up = () => {
      const p = press.current;
      if (p?.active) {
        const to = target ?? p.index;
        swallowClick.current = true;
        if (to !== p.index) onMove(p.index, to);
      }
      finish();
    };

    const click = (e: MouseEvent) => {
      if (!swallowClick.current) return;
      swallowClick.current = false;
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', finish);
    // capture 로 받아야 링크가 먼저 열리는 것을 막을 수 있다
    window.addEventListener('click', click, true);

    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', finish);
      window.removeEventListener('click', click, true);
    };
  }, [target, onMove, finish]);

  /* ── 드래그 중에는 손가락 스크롤을 막는다 ────────────────
     passive 리스너로는 못 막는다. 그래서 React 의 onTouchMove 가
     아니라 직접 붙인다. */
  useEffect(() => {
    if (dragging === null) return;
    const block = (e: TouchEvent) => e.preventDefault();
    document.addEventListener('touchmove', block, { passive: false });
    return () => document.removeEventListener('touchmove', block);
  }, [dragging]);

  const onPointerDown = (index: number) => (e: ReactPointerEvent) => {
    // 마우스는 왼쪽 버튼만. 오른쪽 버튼으로 끌리면 메뉴와 겹친다.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // 줄 안의 버튼(삭제 X)을 누른 것이면 관여하지 않는다
    if ((e.target as HTMLElement).closest('button')) return;
    if (count < 2) return;

    /*
     * 지난번에 세워 둔 '클릭 한 번 삼키기'를 여기서 내린다.
     *
     * 끌어서 놓은 뒤에는 보통 클릭이 한 번 따라오고 그것을 삼키면 되는데,
     * 놓은 자리에 따라 그 클릭이 아예 안 올 때가 있다. 그러면 깃발이 그대로
     * 남아서 **다음에 누른 줄이 안 열린다.** 새로 누르기 시작한 이상
     * 지난 일은 끝난 것으로 본다.
     */
    swallowClick.current = false;

    const x = e.clientX;
    const y = e.clientY;

    const timer = window.setTimeout(() => {
      const p = press.current;
      if (!p) return;

      const rects = els.current.map((el) => {
        const r = el?.getBoundingClientRect();
        return { top: r?.top ?? 0, height: r?.height ?? 0 };
      });
      const gap =
        rects.length > 1 ? rects[1].top - (rects[0].top + rects[0].height) : 0;

      // 스크롤 되는 조상을 찾아 둔다. 이 앱은 body 가 아니라 안쪽
      // 상자가 스크롤되므로, window 만 보면 보정이 안 된다.
      let node: HTMLElement | null = els.current[index] ?? null;
      let scroller: Element | Window = window;
      while (node) {
        const style = window.getComputedStyle(node);
        if (
          /(auto|scroll)/.test(style.overflowY) &&
          node.scrollHeight > node.clientHeight
        ) {
          scroller = node;
          break;
        }
        node = node.parentElement;
      }

      p.active = true;
      p.rects = rects;
      p.gap = gap;
      p.scroller = scroller;
      p.scrollTop =
        scroller === window ? window.scrollY : (scroller as Element).scrollTop;

      // 끌기 시작하면 글자가 파랗게 잡히는 것을 막는다
      document.body.style.userSelect = 'none';
      setDragging(index);
      setTarget(index);
    }, HOLD_MS);

    press.current = {
      index, x, y, timer,
      active: false,
      rects: [],
      gap: 0,
      scroller: window,
      scrollTop: 0,
    };
  };

  /**
   * 이 줄이 지금 어디로 밀려나 있어야 하는가.
   *
   * 끌고 있는 줄은 손을 따라가고, 그 사이에 낀 줄들은 **끌고 있는 줄이
   * 비운 만큼** 위나 아래로 한 칸 밀린다. 줄마다 높이가 달라도 비는
   * 자리는 끌고 있는 줄의 높이 하나뿐이라 이 값이 맞다.
   */
  const shiftOf = (index: number): number => {
    const p = press.current;
    if (!p?.active || dragging === null || target === null) return 0;
    if (index === dragging) return offset;

    const step = p.rects[dragging].height + p.gap;
    if (target > dragging && index > dragging && index <= target) return -step;
    if (target < dragging && index < dragging && index >= target) return step;
    return 0;
  };

  return {
    draggingIndex: dragging,
    targetIndex: target,
    rowProps: (index: number) => {
      const isDragging = dragging === index;
      const shift = shiftOf(index);

      return {
        ref: (el: HTMLElement | null) => {
          els_[index] = el;
        },
        onPointerDown: onPointerDown(index),
        onContextMenu: (e: ReactMouseEvent) => {
          // 손가락으로 꾹 누르면 브라우저가 메뉴를 띄운다. 드래그와 겹친다.
          if (dragging !== null) e.preventDefault();
        },
        style: {
          transform: shift ? `translateY(${shift}px)` : undefined,
          // 끌고 있는 줄은 손을 그대로 따라야 한다. 나머지만 부드럽게 비킨다.
          transition: isDragging ? 'none' : 'transform 160ms ease',
          zIndex: isDragging ? 20 : undefined,
          position: isDragging ? ('relative' as const) : undefined,
          // 꾹 누르기 전까지는 세로 스크롤을 브라우저에 맡긴다
          touchAction: 'pan-y' as const,
          cursor: isDragging ? ('grabbing' as const) : undefined,
        },
        'data-dragging': String(isDragging),
      };
    },
  };
}
