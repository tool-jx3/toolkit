/**
 * 清單的拖曳排序（指標事件，滑鼠與觸控都能用）：SortableList、LayerList、ThumbnailList 共用。
 * - 從列上按住、移動超過 threshold 才開始拖（從輸入欄、按鈕、開關開始的不算）；沒拖就放開＝點一下（onClick）。
 * - mode 'live'：拖過另一列的中線就立刻換位置（onMove 會呼叫多次），整次拖曳以 onMoveStart／onMoveEnd 包起來，
 *   工具可以記成一步復原；mode 'drop'：拖曳中只標示目標列，放開時呼叫一次 onMove（往下落在目標後、往上落在目標前）。
 * - 拖到捲動範圍的上下邊緣（edge px 內）時自動捲動。
 * - disabled 時不能拖（按住只會變成點一下）。
 * - 鍵盤：列有焦點時 Alt＋↑／↓ 移動一格（keyMove）。
 * - cancelOutside（選填，drop 模式）：指標在所有列的範圍外時沒有目標列，放開不移動
 *   （例如一頁有好幾個清單，拖到別的清單上放開不算；color-palette 移植時新增，不給時行為不變）。
 * - G2：`axis: 'xy'`（格狀排列，例如一列縮圖卡）時依指標落在哪一張（或最近的那一張）決定目標，左右拖也可以；
 *   預設 'y'（直向清單，行為不變）。鍵盤 Alt＋←／→ 也能移動。
 */
import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from 'react';

export interface SortableOptions {
  count: number;
  onMove: (from: number, to: number) => void;
  onMoveStart?: (index: number) => void;
  onMoveEnd?: () => void;
  /** 沒有拖動就放開 */
  onClick?: (index: number) => void;
  mode?: 'live' | 'drop';
  disabled?: boolean;
  /** 開始拖曳的移動門檻（px，預設 4） */
  threshold?: number;
  /** 自動捲動的邊緣範圍（px，預設 24） */
  edge?: number;
  /** drop 模式：指標在所有列的範圍外時沒有目標列、放開不移動（預設 false：落在最近的列） */
  cancelOutside?: boolean;
  /** 'y'（預設，直向清單）或 'xy'（格狀／橫向排列：依指標所在的那一張決定目標） */
  axis?: 'y' | 'xy';
}

const NO_DRAG =
  'input,textarea,select,button,a,label,[contenteditable="true"],[data-no-drag],[role="switch"],[role="slider"],[role="spinbutton"],[role="checkbox"]';

function scrollParent(el: HTMLElement | null): HTMLElement | null {
  let p = el?.parentElement ?? null;
  while (p) {
    const s = getComputedStyle(p);
    if (/(auto|scroll)/.test(s.overflowY) && p.scrollHeight > p.clientHeight) return p;
    p = p.parentElement;
  }
  return null;
}

export function useSortable(options: SortableOptions) {
  const opts = useRef(options);
  opts.current = options;
  const rows = useRef(new Map<number, HTMLElement>());
  const [state, setState] = useState<{ drag: number; over: number } | null>(null);
  const g = useRef<{
    /** 觸控、不是從把手開始：不拖（交給捲動），放開仍算點一下 */
    touchOnly: boolean;
    id: number;
    index: number;
    cur: number;
    over: number;
    x: number;
    y: number;
    lastX: number;
    lastY: number;
    active: boolean;
    scroller: HTMLElement | null;
    raf: number;
  } | null>(null);

  useEffect(() => () => cancelAnimationFrame(g.current?.raf ?? 0), []);

  const mid = (i: number) => {
    const r = rows.current.get(i)?.getBoundingClientRect();
    return r ? r.top + r.height / 2 : 0;
  };

  /** 指標是否在所有列的外接範圍之外 */
  const outside = (x: number, y: number) => {
    let top = Number.POSITIVE_INFINITY;
    let bottom = Number.NEGATIVE_INFINITY;
    let left = Number.POSITIVE_INFINITY;
    let right = Number.NEGATIVE_INFINITY;
    for (const el of rows.current.values()) {
      const r = el.getBoundingClientRect();
      top = Math.min(top, r.top);
      bottom = Math.max(bottom, r.bottom);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
    }
    return !(y >= top && y <= bottom && x >= left && x <= right);
  };

  /** 格狀排列：指標所在（或中心最近）的那一張 */
  const nearest = (x: number, y: number) => {
    let best = -1;
    let bestD = Number.POSITIVE_INFINITY;
    for (let i = 0; i < opts.current.count; i++) {
      const r = rows.current.get(i)?.getBoundingClientRect();
      if (!r) continue;
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
      const d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  };

  /** 依指標位置算目標列（drop 模式且 cancelOutside 時，範圍外是 -1＝沒有目標） */
  const track = (x: number, y: number) => {
    const s = g.current;
    if (!s?.active) return;
    if (opts.current.axis === 'xy') {
      const t = opts.current.cancelOutside && outside(x, y) ? -1 : nearest(x, y);
      if (opts.current.mode === 'drop') {
        if (t !== s.over) {
          s.over = t;
          setState({ drag: s.index, over: t });
        }
        return;
      }
      if (t >= 0 && t !== s.cur) {
        opts.current.onMove(s.cur, t);
        s.cur = t;
        s.over = t;
        setState({ drag: t, over: t });
      }
      return;
    }
    const n = opts.current.count;
    if (opts.current.mode === 'drop') {
      let t = 0;
      if (opts.current.cancelOutside && outside(x, y)) t = -1;
      else
        for (let i = 0; i < n; i++) {
          const r = rows.current.get(i)?.getBoundingClientRect();
          if (r && y >= r.top) t = i;
        }
      if (t !== s.over) {
        s.over = t;
        setState({ drag: s.index, over: t });
      }
      return;
    }
    let t = s.cur;
    while (t + 1 < n && y > mid(t + 1)) t++;
    while (t - 1 >= 0 && y < mid(t - 1)) t--;
    if (t !== s.cur) {
      opts.current.onMove(s.cur, t);
      s.cur = t;
      s.over = t;
      setState({ drag: t, over: t });
    }
  };

  const autoScroll = () => {
    const s = g.current;
    if (!s?.active || !s.scroller) return;
    const edge = opts.current.edge ?? 24;
    const r = s.scroller.getBoundingClientRect();
    let v = 0;
    if (s.lastY < r.top + edge) v = -Math.ceil((r.top + edge - s.lastY) / 3);
    else if (s.lastY > r.bottom - edge) v = Math.ceil((s.lastY - (r.bottom - edge)) / 3);
    if (v) {
      s.scroller.scrollTop += v;
      track(s.lastX, s.lastY);
    }
    s.raf = requestAnimationFrame(autoScroll);
  };

  const finish = (commit: boolean) => {
    const s = g.current;
    g.current = null;
    if (!s) return;
    cancelAnimationFrame(s.raf);
    setState(null);
    if (!s.active) return;
    if (opts.current.mode === 'drop') {
      if (commit && s.over >= 0 && s.over !== s.index) {
        opts.current.onMoveStart?.(s.index);
        opts.current.onMove(s.index, s.over);
        opts.current.onMoveEnd?.();
      }
      return;
    }
    opts.current.onMoveEnd?.();
  };

  const rowProps = (index: number) => ({
    ref: (el: HTMLElement | null) => {
      if (el) rows.current.set(index, el);
      else rows.current.delete(index);
    },
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || g.current) return;
      const target = e.target as Element;
      if (target.closest?.(NO_DRAG)) return;
      /* 觸控時整列留給捲動，只有拖曳把手（[data-drag-handle]，要加 touch-none）可以拖 */
      const touchOnly = e.pointerType === 'touch' && !target.closest?.('[data-drag-handle]');
      /* 還沒開始拖就離開這一列放開時，清掉這次按下 */
      const id = e.pointerId;
      const clear = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== id) return;
        window.removeEventListener('pointerup', clear);
        window.removeEventListener('pointercancel', clear);
        if (g.current?.id === id && !g.current.active) g.current = null;
      };
      window.addEventListener('pointerup', clear);
      window.addEventListener('pointercancel', clear);
      g.current = {
        touchOnly,
        id: e.pointerId,
        index,
        cur: index,
        over: index,
        x: e.clientX,
        y: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        active: false,
        scroller: null,
        raf: 0,
      };
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = g.current;
      if (!s || s.id !== e.pointerId) return;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      if (!s.active) {
        if (opts.current.disabled || s.touchOnly) return;
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < (opts.current.threshold ?? 4)) return;
        s.active = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        s.scroller = scrollParent(e.currentTarget);
        setState({ drag: s.index, over: s.index });
        if (opts.current.mode !== 'drop') opts.current.onMoveStart?.(s.index);
        s.raf = requestAnimationFrame(autoScroll);
      }
      track(e.clientX, e.clientY);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = g.current;
      if (!s || s.id !== e.pointerId) return;
      if (!s.active) {
        g.current = null;
        /* 按下的那一列（沒有開始拖、例如排序停用時，可能在別列放開） */
        opts.current.onClick?.(s.index);
        return;
      }
      finish(true);
    },
    onPointerCancel: () => finish(false),
  });

  /** Alt＋↑／↓：移動一格（回傳是否處理了） */
  const keyMove = (index: number, e: KeyboardEvent<HTMLElement>): boolean => {
    if (!e.altKey || e.ctrlKey || e.metaKey || opts.current.disabled) return false;
    const xy = opts.current.axis === 'xy';
    const to =
      e.key === 'ArrowUp' || (xy && e.key === 'ArrowLeft')
        ? index - 1
        : e.key === 'ArrowDown' || (xy && e.key === 'ArrowRight')
          ? index + 1
          : -1;
    if (to < 0 || to >= opts.current.count) return false;
    e.preventDefault();
    opts.current.onMoveStart?.(index);
    opts.current.onMove(index, to);
    opts.current.onMoveEnd?.();
    return true;
  };

  return {
    /** 拖曳中的列（live 模式下是它目前的位置） */
    dragIndex: state?.drag ?? null,
    /** drop 模式的目標列 */
    overIndex: state?.over ?? null,
    rowProps,
    keyMove,
  };
}
