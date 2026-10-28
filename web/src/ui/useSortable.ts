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
 * - windowEdge（選填）：清單沒有可捲動的上層容器時，拖到視窗上下緣 windowEdge px 內慢慢捲動整頁
 *   （character-editor 移植時新增，不給時行為不變）。
 * - 拖曳開始後在 window 聽 pointerup／pointercancel（bg-motion 對等驗證後新增）：live 模式拖過別列時 React 會在 DOM 裡
 *   移動被拖的列，瀏覽器因此放掉指標捕捉，pointerup 落在別的元素、列上收不到；沒有這個監聽，在清單範圍外放開時
 *   拖曳（與 onMoveStart／onMoveEnd 的手勢）一直不結束，放開後列還跟著滑鼠重排、沒有復原步驟。
 *   在列上放開時列自己的 pointerup 先結束，window 的不會重複（結束是冪等的）。
 * - 只想從把手開始拖（例如每列都是輸入欄的表單）：把 rowProps 的 ref 給整列、其餘的指標事件給把手。
 *   把手本身（標 `data-drag-handle`）可以是 `<button>`（有名稱、可聚焦）：按鈕、輸入欄等不能開始拖的元素
 *   只有在把手裡面時例外（character-editor 移植時新增；原本的把手都是 span，行為不變）。
 * - cancelOnGap（選填，drop 模式＋axis 'xy'）：只有指標正在某一張上面時才有目標，放在卡片之間的空白、
 *   清單外面都不移動（回原位）。escapeCancels（選填）：拖曳中按 Esc 取消（回原位）。
 *   （color-palette 的色票櫃對等驗證後新增，不給時行為不變）
 * - handleOnly（選填）：指標事件照樣給整列，但滑鼠也只能從把手（`[data-drag-handle]`）開始拖，
 *   從列上其他地方按住只算點一下（同觸控）。每列有縮圖、拖放區等大塊內容時用，避免從那裡拖到卻排了序
 *   （acrylic-goods 對等驗證後新增，不給時行為不變）。
 * - longPress（選填，毫秒）：觸控時在列上（不是把手）按住不動這麼久就開始拖（開始前手指移動 LONG_PRESS_SLOP px 以上
 *   ＝捲動清單，這次不拖；沒移動就放開＝點一下）。開始拖之後不讓瀏覽器捲動、不跳出長按選單。
 *   （height-board 跟進原作 2026-10 更新時新增，不給時行為不變）
 */
import {
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react';

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
  /** drop 模式＋axis 'xy'：指標不在任何一張上面（卡片之間的空白、清單外）時沒有目標，放開不移動 */
  cancelOnGap?: boolean;
  /** 拖曳中按 Esc 取消（不移動） */
  escapeCancels?: boolean;
  /** 滑鼠也只能從把手（`[data-drag-handle]`）開始拖（預設 false：滑鼠可以從列上任何不是輸入欄、按鈕的地方開始） */
  handleOnly?: boolean;
  /**
   * 沒有可捲動的上層容器（清單直接放在頁面上）時，指標離視窗上下緣在這個距離（px）內就慢慢捲動整頁，
   * 越靠近邊緣越快（每個畫面最多 WINDOW_SCROLL_MAX px）。不給時不捲動整頁（行為不變）。
   * （character-editor 移植時新增）
   */
  windowEdge?: number;
  /**
   * 觸控時在列上按住這麼久（毫秒）不動就開始拖（不給時觸控只能從把手拖，行為不變）。
   * （height-board 跟進原作 2026-10 更新時新增；原作 400 ms）
   */
  longPress?: number;
}

/** 長按開始拖之前，手指移動這麼多 px 就當成捲動（不拖） */
export const LONG_PRESS_SLOP = 8;

/** windowEdge 自動捲動整頁時，每個畫面最多捲動的距離（px） */
export const WINDOW_SCROLL_MAX = 6;

/**
 * 整頁自動捲動的速度（px／畫面，負數往上）：指標在視窗上緣或下緣 edge px 內時，依深入的比例
 * 線性增加到 max；不在邊緣時 0。指標跑到視窗外時以最大速度計。
 */
export function windowScrollSpeed(
  y: number,
  viewportHeight: number,
  edge: number,
  max = WINDOW_SCROLL_MAX,
): number {
  if (edge <= 0) return 0;
  const ratio = (d: number) => Math.min(1, Math.max(0, d / edge));
  if (y < edge) return -Math.ceil(ratio(edge - y) * max);
  if (y > viewportHeight - edge) return Math.ceil(ratio(y - (viewportHeight - edge)) * max);
  return 0;
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
    /** 不是從把手開始的觸控（或 handleOnly 時的滑鼠）：不拖（觸控交給捲動），放開仍算點一下 */
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
    /** 拖曳開始後掛在 window 上的 pointerup／pointercancel 監聽的拆除函式 */
    detach: (() => void) | null;
    /** 觸控按下（長按選單的處理） */
    touch: boolean;
    /** 等待長按的計時器（0＝沒有） */
    timer: ReturnType<typeof setTimeout> | 0;
  } | null>(null);

  useEffect(
    () => () => {
      cancelAnimationFrame(g.current?.raf ?? 0);
      if (g.current?.timer) clearTimeout(g.current.timer);
      g.current?.detach?.();
    },
    [],
  );

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

  /** 指標正在上面的那一張（沒有時 -1） */
  const under = (x: number, y: number) => {
    for (let i = 0; i < opts.current.count; i++) {
      const r = rows.current.get(i)?.getBoundingClientRect();
      if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return -1;
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
      const t =
        opts.current.mode === 'drop' && opts.current.cancelOnGap
          ? under(x, y)
          : opts.current.cancelOutside && outside(x, y)
            ? -1
            : nearest(x, y);
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
    if (!s?.active) return;
    if (!s.scroller) {
      /* 清單直接在頁面上：給了 windowEdge 時捲動整頁（不給時和以前一樣不捲） */
      const windowEdge = opts.current.windowEdge;
      if (!windowEdge) return;
      const v = windowScrollSpeed(s.lastY, window.innerHeight, windowEdge);
      if (v) {
        const before = window.scrollY;
        window.scrollBy(0, v);
        if (window.scrollY !== before) track(s.lastX, s.lastY);
      }
      s.raf = requestAnimationFrame(autoScroll);
      return;
    }
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
    if (s.timer) clearTimeout(s.timer);
    cancelAnimationFrame(s.raf);
    s.detach?.();
    s.detach = null;
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

  /** 開始拖曳（超過門檻，或長按到時間） */
  const start = (el: HTMLElement) => {
    const s = g.current;
    if (!s || s.active) return;
    s.active = true;
    s.touchOnly = false;
    try {
      el.setPointerCapture?.(s.id);
    } catch {
      /* 指標已經不在：不捕捉也能用（window 上有聽放開） */
    }
    /* 指標捕捉可能在拖曳中被瀏覽器放掉（列被移動位置）：在 window 上收放開與取消 */
    const id = s.id;
    const onUp = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId !== id || g.current?.id !== id) return;
      /* 捕捉掉了之後列收不到移動：以放開的位置算最後的目標（cancelOutside 時在範圍外就不移動） */
      track(ev.clientX, ev.clientY);
      finish(true);
    };
    const onCancel = (ev: globalThis.PointerEvent) => {
      if (ev.pointerId === id && g.current?.id === id) finish(false);
    };
    const onKey = (ev: globalThis.KeyboardEvent) => {
      if (ev.key !== 'Escape' || !opts.current.escapeCancels || g.current?.id !== id) return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(false);
    };
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    s.detach = () => {
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
    };
    s.scroller = scrollParent(el);
    setState({ drag: s.index, over: s.index });
    if (opts.current.mode !== 'drop') opts.current.onMoveStart?.(s.index);
    s.raf = requestAnimationFrame(autoScroll);
  };

  /**
   * 長按開始的拖曳：手指移動時不讓瀏覽器捲動清單（列沒有 touch-action: none）。觸控事件一律送到按下的那個元素，
   * 所以在每一列掛一次不被動的 touchmove 監聽（React 的 onTouchMove 是被動的、不能取消捲動）。
   */
  const touchBound = useRef(new WeakSet<HTMLElement>());
  const bindTouch = (el: HTMLElement) => {
    if (touchBound.current.has(el)) return;
    touchBound.current.add(el);
    el.addEventListener(
      'touchmove',
      (ev) => {
        if (g.current?.active && g.current.touch && ev.cancelable) ev.preventDefault();
      },
      { passive: false },
    );
  };

  const rowProps = (index: number) => ({
    ref: (el: HTMLElement | null) => {
      if (el) {
        rows.current.set(index, el);
        if (opts.current.longPress) bindTouch(el);
      } else rows.current.delete(index);
    },
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      if (e.button !== 0 || g.current) return;
      const target = e.target as Element;
      const blocked = target.closest?.(NO_DRAG);
      if (blocked && !blocked.closest('[data-drag-handle]')) return;
      /* 觸控時整列留給捲動，只有拖曳把手（[data-drag-handle]，要加 touch-none）可以拖；handleOnly 時滑鼠也一樣 */
      const fromHandle = !!target.closest?.('[data-drag-handle]');
      const touchOnly = (e.pointerType === 'touch' || !!opts.current.handleOnly) && !fromHandle;
      /*
       * handleOnly：列上的文字可以選取（從那裡拖不會排序），選取範圍蓋到把手時，從把手按下會變成拖曳選取的文字
       * （瀏覽器原生的拖放，指標事件被取消）。從把手按下時不讓瀏覽器開始選取或拖放。
       */
      if (opts.current.handleOnly && fromHandle && e.pointerType !== 'touch') {
        e.preventDefault();
        window.getSelection?.()?.removeAllRanges();
      }
      /* 還沒開始拖就離開這一列放開時，清掉這次按下 */
      const id = e.pointerId;
      const clear = (ev: globalThis.PointerEvent) => {
        if (ev.pointerId !== id) return;
        window.removeEventListener('pointerup', clear);
        window.removeEventListener('pointercancel', clear);
        if (g.current?.id === id && !g.current.active) {
          if (g.current.timer) clearTimeout(g.current.timer);
          g.current = null;
        }
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
        detach: null,
        touch: e.pointerType === 'touch',
        timer: 0,
      };
      /* 觸控、不是從把手：給了 longPress 時按住不動到時間就開始拖 */
      const hold = opts.current.longPress;
      if (touchOnly && e.pointerType === 'touch' && hold && !opts.current.disabled) {
        const el = e.currentTarget;
        const mine = g.current;
        mine.timer = setTimeout(() => {
          mine.timer = 0;
          if (g.current === mine && !mine.active && !opts.current.disabled) start(el);
        }, hold);
      }
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      const s = g.current;
      if (!s || s.id !== e.pointerId) return;
      s.lastX = e.clientX;
      s.lastY = e.clientY;
      if (!s.active) {
        /* 等長按的期間手指移動了：當成捲動清單，這次不拖 */
        if (s.timer && Math.hypot(e.clientX - s.x, e.clientY - s.y) >= LONG_PRESS_SLOP) {
          clearTimeout(s.timer);
          s.timer = 0;
        }
        if (opts.current.disabled || s.touchOnly) return;
        if (Math.hypot(e.clientX - s.x, e.clientY - s.y) < (opts.current.threshold ?? 4)) return;
        start(e.currentTarget);
      }
      track(e.clientX, e.clientY);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const s = g.current;
      if (!s || s.id !== e.pointerId) return;
      if (!s.active) {
        if (s.timer) clearTimeout(s.timer);
        g.current = null;
        /* 按下的那一列（沒有開始拖、例如排序停用時，可能在別列放開） */
        opts.current.onClick?.(s.index);
        return;
      }
      finish(true);
    },
    onPointerCancel: () => finish(false),
    /* 長按排序：按住時不跳出瀏覽器的長按選單 */
    onContextMenu: (e: MouseEvent<HTMLElement>) => {
      if (opts.current.longPress && g.current?.touch) e.preventDefault();
    },
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
