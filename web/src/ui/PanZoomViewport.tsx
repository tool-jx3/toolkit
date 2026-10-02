/**
 * 可縮放、平移的盤面：工具在 draw(ctx, view) 裡用**世界座標**（例如 cm）作畫，這個元件負責
 * 換算、捲動、縮放與指標事件。內容比畫面大時有原生捲軸（觸控板、捲軸都能捲）。
 *
 * - 滾輪：以游標為中心縮放（游標下的點不動；每 100 px 滾動量 × wheelStep）；Shift＋滾輪橫向捲動；
 *   Ctrl＋滾輪不攔截（留給瀏覽器縮放）。
 * - 平移：在空白處按住拖曳（移動超過 panThreshold 才開始）、中鍵在任何地方拖曳、按住空白鍵拖曳。
 *   平移後放開不算點一下。
 * - 點選測試由工具決定：onPointerDown 回傳拖曳處理（{ onMove, onEnd, cursor }）表示點到物件，
 *   不回傳表示空白處（拖曳＝平移、沒拖就放開＝onEmptyClick）。
 * - 游標樣式 getCursor(p)（空白處預設「抓取」、平移中「抓住」）；跟著游標的提示框 getTooltip(p)。
 * - 左側固定尺規（gutter）：只跟著縱向捲動，橫向捲動時不會被捲走。
 *
 * ```tsx
 * const vp = useRef<PanZoomViewportHandle>(null);
 * <PanZoomViewport ref={vp} world={{ x: 0, y: -top, width: boardW, height: top - bottom }} baseScale="fit-height"
 *   zoom={zoom} onZoomChange={setZoom} minZoom={0.2} maxZoom={4} align={{ x: 'start', y: 'end' }}
 *   gutter={{ width: 58, draw: drawRuler }} draw={drawBoard}
 *   onPointerDown={(p) => { const hit = hitTest(chars, p.wx, p.wy); if (!hit) return; select(hit.id); return dragCharacter(hit, p); }}
 *   onEmptyClick={() => select(null)} getCursor={(p) => (hitTest(chars, p.wx, p.wy) ? 'move' : undefined)}
 *   getTooltip={(p) => { const h = hitTest(chars, p.wx, p.wy); return h ? `${h.name} ${h.height} cm` : null; }} />
 * ```
 */
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { Box } from '@/core/layout';
import { cn } from './cn';
import { isEditableTarget } from './shortcuts';

export interface PanZoomView {
  /** 目前的倍率（1 ＝ 100%） */
  zoom: number;
  /** 每世界單位幾個螢幕 px（＝ 基準 × 倍率） */
  scale: number;
  /** 畫布（不含左側尺規）的寬高（CSS px） */
  width: number;
  height: number;
  world: Box;
  /** 捲動量（內容 px） */
  scrollX: number;
  scrollY: number;
  /** 世界 → 畫布 px */
  toScreen: (wx: number, wy: number) => { x: number; y: number };
  /** 畫布 px → 世界 */
  toWorld: (sx: number, sy: number) => { x: number; y: number };
  /** 畫面上看得到的世界範圍 */
  visible: Box;
}

export interface ViewportPointer {
  /** 畫布上的位置（CSS px） */
  x: number;
  y: number;
  /** 世界座標 */
  wx: number;
  wy: number;
  button: number;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  pointerType: string;
}

export interface ViewportDrag {
  onMove?: (p: ViewportPointer) => void;
  /** moved：真的有移動（沒移動時可以當成點一下） */
  onEnd?: (p: ViewportPointer, moved: boolean) => void;
  onCancel?: () => void;
  /** 拖曳中的游標（預設 grabbing） */
  cursor?: string;
}

export interface PanZoomViewportHandle {
  getView: () => PanZoomView;
  /** 縮放到 zoom；anchor 是畫布上不動的點（預設畫面中心） */
  zoomTo: (zoom: number, anchor?: { x: number; y: number }) => void;
  zoomBy: (factor: number, anchor?: { x: number; y: number }) => void;
  /** 整個世界寬度放進畫面（不超過 max，預設 1），並捲回最左邊 */
  fitWidth: (options?: { max?: number }) => void;
  scrollTo: (x: number, y: number) => void;
  scrollBy: (dx: number, dy: number) => void;
  /** 只捲需要的最小距離，讓世界範圍 box 露出來；比畫面大時優先露出開頭（左／上） */
  scrollToWorld: (box: Box, options?: { margin?: number }) => void;
  redraw: () => void;
  element: () => HTMLElement | null;
  /** 螢幕座標（例如拖放放開的位置）→ 世界座標；不在盤面上時 null */
  clientToWorld: (clientX: number, clientY: number) => { x: number; y: number } | null;
}

type Align = 'start' | 'center' | 'end';
type Pad = { top: number; right: number; bottom: number; left: number };

export interface PanZoomViewportProps {
  /** 世界範圍（例如 { x: 0, y: -220, width: 300, height: 220 }：x 0～300 cm、y 往下為正） */
  world: Box;
  /** 倍率 1 時每世界單位幾 px：數字，或依畫面大小 'fit-height'／'fit-width'／'fit'（預設 'fit'） */
  baseScale?: number | 'fit-height' | 'fit-width' | 'fit';
  zoom?: number;
  defaultZoom?: number;
  onZoomChange?: (zoom: number) => void;
  minZoom?: number;
  maxZoom?: number;
  /** 每 100 px 滾動量的倍率（預設 1.16） */
  wheelStep?: number;
  /** 內容四周的留白（螢幕 px，預設 16） */
  padding?: number | Partial<Pad>;
  /** 內容比畫面小時放哪裡（預設置中） */
  align?: { x?: Align; y?: Align };
  /**
   * 世界範圍至少延伸到畫面看得到的地方（往右 'x'、往下 'y'）：盤面永遠填滿畫面。view.world 是延伸後的範圍
   * （作畫時用它鋪底）。縮放時讓錨點下的點不動，但不為了錨點把範圍延伸到內容之外，捲不到的地方由捲動範圍夾住
   * （和舊版身高比較板相同；延伸出去的空白會留在捲動範圍裡，縮放後內容反而被捲出畫面）。
   */
  extend?: 'x' | 'y' | 'both';
  /** 作畫（ctx 已換算成 CSS px；用 view.toScreen 把世界座標換成畫布座標） */
  draw: (ctx: CanvasRenderingContext2D, view: PanZoomView) => void;
  /** 左側固定欄（尺規）：寬度與作畫 */
  gutter?: { width: number; draw: (ctx: CanvasRenderingContext2D, view: PanZoomView) => void };
  onPointerDown?: (p: ViewportPointer) => ViewportDrag | null | undefined;
  /** 在空白處點一下（沒有拖動） */
  onEmptyClick?: (p: ViewportPointer) => void;
  /** 滑鼠移動（沒按鍵時）；移出盤面時 null */
  onHover?: (p: ViewportPointer | null) => void;
  getCursor?: (p: ViewportPointer) => string | null | undefined;
  getTooltip?: (p: ViewportPointer) => ReactNode;
  /** 平移起動門檻（px，預設 3） */
  panThreshold?: number;
  /** 按住空白鍵拖曳平移（預設 true） */
  spacePan?: boolean;
  /** 盤面背景（預設白色，與匯出一致） */
  background?: string;
  'aria-label'?: string;
  className?: string;
  ref?: Ref<PanZoomViewportHandle>;
}

const toPad = (p: PanZoomViewportProps['padding']): Pad => {
  if (typeof p === 'number') return { top: p, right: p, bottom: p, left: p };
  return { top: 16, right: 16, bottom: 16, left: 16, ...p };
};
const alignK = (a: Align | undefined) => (a === 'start' ? 0 : a === 'end' ? 1 : 0.5);

/** 跟著游標的提示框（自己的 state，不讓整個盤面重畫） */
function TooltipLayer({
  bind,
}: {
  bind: (set: (t: { x: number; y: number; node: ReactNode } | null) => void) => void;
}) {
  const [tip, setTip] = useState<{ x: number; y: number; node: ReactNode } | null>(null);
  useLayoutEffect(() => bind(setTip), [bind]);
  if (!tip || tip.node === null || tip.node === undefined || tip.node === false) return null;
  return (
    <div
      role="tooltip"
      data-testid="viewport-tooltip"
      className="pointer-events-none absolute z-10 max-w-64 rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg shadow-2"
      style={{ left: tip.x + 14, top: tip.y + 16 }}
    >
      {tip.node}
    </div>
  );
}

export function PanZoomViewport({
  world,
  baseScale = 'fit',
  zoom: zoomProp,
  defaultZoom = 1,
  onZoomChange,
  minZoom = 0.2,
  maxZoom = 4,
  wheelStep = 1.16,
  padding,
  align,
  draw,
  gutter,
  onPointerDown,
  onEmptyClick,
  onHover,
  getCursor,
  getTooltip,
  panThreshold = 3,
  spacePan = true,
  extend,
  background = '#ffffff',
  className,
  ref,
  ...rest
}: PanZoomViewportProps) {
  const [innerZoom, setInnerZoom] = useState(defaultZoom);
  const zoom = zoomProp ?? innerZoom;
  const scroller = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const gutterCanvas = useRef<HTMLCanvasElement>(null);
  const [client, setClient] = useState({ w: 0, h: 0 });
  const pad = toPad(padding);
  const gutterW = gutter?.width ?? 0;

  const base =
    typeof baseScale === 'number'
      ? baseScale
      : (() => {
          const fw = world.width > 0 ? (client.w - pad.left - pad.right) / world.width : 1;
          const fh = world.height > 0 ? (client.h - pad.top - pad.bottom) / world.height : 1;
          const v =
            baseScale === 'fit-height' ? fh : baseScale === 'fit-width' ? fw : Math.min(fw, fh);
          return Number.isFinite(v) && v > 0 ? v : 1;
        })();
  const scale = base * zoom;
  /* 延伸後的範圍：涵蓋目前畫面看得到的地方 */
  const ex = extend === 'x' || extend === 'both';
  const ey = extend === 'y' || extend === 'both';
  const area: Box = {
    x: world.x,
    y: world.y,
    width: ex ? Math.max(world.width, (client.w - pad.left - pad.right) / scale) : world.width,
    height: ey ? Math.max(world.height, (client.h - pad.top - pad.bottom) / scale) : world.height,
  };
  const contentW = area.width * scale + pad.left + pad.right;
  const contentH = area.height * scale + pad.top + pad.bottom;
  const offX = contentW < client.w ? (client.w - contentW) * alignK(align?.x) : 0;
  const offY = contentH < client.h ? (client.h - contentH) * alignK(align?.y) : 0;

  /* 最新的值放 ref：事件處理與 rAF 作畫都讀這裡 */
  const st = useRef({
    zoom,
    base,
    scale,
    offX,
    offY,
    pad,
    world,
    area,
    client,
    draw,
    gutter,
    onPointerDown,
    onEmptyClick,
    onHover,
    getCursor,
    getTooltip,
  });
  st.current = {
    zoom,
    base,
    scale,
    offX,
    offY,
    pad,
    world,
    area,
    client,
    draw,
    gutter,
    onPointerDown,
    onEmptyClick,
    onHover,
    getCursor,
    getTooltip,
  };

  const makeView = useCallback((): PanZoomView => {
    const s = st.current;
    const el = scroller.current;
    const sx = el?.scrollLeft ?? 0;
    const sy = el?.scrollTop ?? 0;
    const ox = s.offX + s.pad.left - sx;
    const oy = s.offY + s.pad.top - sy;
    const toScreen = (wx: number, wy: number) => ({
      x: ox + (wx - s.world.x) * s.scale,
      y: oy + (wy - s.world.y) * s.scale,
    });
    const toWorld = (x: number, y: number) => ({
      x: s.world.x + (x - ox) / s.scale,
      y: s.world.y + (y - oy) / s.scale,
    });
    const tl = toWorld(0, 0);
    return {
      zoom: s.zoom,
      scale: s.scale,
      width: s.client.w,
      height: s.client.h,
      world: s.area,
      scrollX: sx,
      scrollY: sy,
      toScreen,
      toWorld,
      visible: { x: tl.x, y: tl.y, width: s.client.w / s.scale, height: s.client.h / s.scale },
    };
  }, []);

  /* ---------- 作畫 ---------- */
  const frame = useRef(0);
  const paint = useCallback(() => {
    frame.current = 0;
    const view = makeView();
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const prep = (c: HTMLCanvasElement | null, w: number, h: number) => {
      if (!c || w <= 0 || h <= 0) return null;
      const W = Math.round(w * dpr);
      const H = Math.round(h * dpr);
      if (c.width !== W) c.width = W;
      if (c.height !== H) c.height = H;
      const ctx = c.getContext('2d');
      if (!ctx) return null;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      return ctx;
    };
    const s = st.current;
    const ctx = prep(canvas.current, s.client.w, s.client.h);
    if (ctx) {
      ctx.save();
      s.draw(ctx, view);
      ctx.restore();
    }
    if (s.gutter) {
      const g = prep(gutterCanvas.current, s.gutter.width, s.client.h);
      if (g) {
        g.save();
        s.gutter.draw(g, view);
        g.restore();
      }
    }
  }, [makeView]);
  const redraw = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(paint);
  }, [paint]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  /* props（作畫內容、世界範圍、倍率）一變就重畫 */
  useLayoutEffect(() => {
    redraw();
  });

  /* ---------- 畫面大小 ---------- */
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () =>
      setClient((c) =>
        c.w === el.clientWidth && c.h === el.clientHeight
          ? c
          : { w: el.clientWidth, h: el.clientHeight },
      );
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------- 縮放（以錨點為中心） ---------- */
  const pending = useRef<{ wx: number; wy: number; ax: number; ay: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const setZoom = useCallback(
    (z: number) => {
      if (zoomProp === undefined) setInnerZoom(z);
      onZoomChange?.(z);
    },
    [zoomProp, onZoomChange],
  );
  const zoomTo = useCallback(
    (z: number, anchor?: { x: number; y: number }) => {
      const next = Math.min(maxZoom, Math.max(minZoom, z));
      const s = st.current;
      const a = anchor ?? { x: s.client.w / 2, y: s.client.h / 2 };
      const w = makeView().toWorld(a.x, a.y);
      pending.current = { wx: w.x, wy: w.y, ax: a.x, ay: a.y };
      zoomRef.current = next;
      if (Math.abs(next - s.zoom) < 1e-9) {
        pending.current = null;
        return;
      }
      setZoom(next);
    },
    [maxZoom, minZoom, makeView, setZoom],
  );
  useLayoutEffect(() => {
    const p = pending.current;
    const el = scroller.current;
    if (!p || !el) return;
    pending.current = null;
    el.scrollLeft = offX + pad.left + (p.wx - world.x) * scale - p.ax;
    el.scrollTop = offY + pad.top + (p.wy - world.y) * scale - p.ay;
    redraw();
  });

  /* ---------- 滾輪 ---------- */
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? el.clientHeight : 1;
      if (e.shiftKey) {
        e.preventDefault();
        el.scrollLeft += (e.deltaX || e.deltaY) * unit;
        return;
      }
      if (!e.deltaY) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const factor = wheelStepRef.current ** (-(e.deltaY * unit) / 100);
      zoomToRef.current(zoomRef.current * factor, { x: e.clientX - r.left, y: e.clientY - r.top });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  const zoomToRef = useRef(zoomTo);
  zoomToRef.current = zoomTo;
  const wheelStepRef = useRef(wheelStep);
  wheelStepRef.current = wheelStep;

  /* ---------- 指標 ---------- */
  const tipSetter = useRef<((t: { x: number; y: number; node: ReactNode } | null) => void) | null>(
    null,
  );
  const bindTip = useCallback(
    (set: (t: { x: number; y: number; node: ReactNode } | null) => void) => {
      tipSetter.current = set;
    },
    [],
  );
  const gesture = useRef<
    | { kind: 'drag'; id: number; drag: ViewportDrag; x: number; y: number; moved: boolean }
    | {
        kind: 'pending' | 'pan';
        id: number;
        x: number;
        y: number;
        sx: number;
        sy: number;
        button: number;
      }
    | null
  >(null);
  const space = useRef(false);
  const inside = useRef(false);

  const pointerOf = (e: ReactPointerEvent<HTMLElement>): ViewportPointer => {
    const r = canvas.current?.getBoundingClientRect();
    const x = e.clientX - (r?.left ?? 0);
    const y = e.clientY - (r?.top ?? 0);
    const w = makeView().toWorld(x, y);
    return {
      x,
      y,
      wx: w.x,
      wy: w.y,
      button: e.button,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      pointerType: e.pointerType,
    };
  };
  const setCursor = (c: string) => {
    if (canvas.current) canvas.current.style.cursor = c;
  };
  const hoverCursor = (p: ViewportPointer | null) => {
    if (space.current) return setCursor('grab');
    setCursor((p && st.current.getCursor?.(p)) || 'grab');
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (gesture.current) return;
    const el = scroller.current;
    if (!el) return;
    const p = pointerOf(e);
    tipSetter.current?.(null);
    const startPan = (kind: 'pending' | 'pan') => {
      gesture.current = {
        kind,
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        sx: el.scrollLeft,
        sy: el.scrollTop,
        button: e.button,
      };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      if (kind === 'pan') setCursor('grabbing');
    };
    if (e.button === 1) {
      e.preventDefault();
      return startPan('pan');
    }
    if (e.button !== 0) return;
    if (space.current) return startPan('pan');
    const d = st.current.onPointerDown?.(p);
    if (d) {
      gesture.current = {
        kind: 'drag',
        id: e.pointerId,
        drag: d,
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      setCursor(d.cursor ?? 'grabbing');
      return;
    }
    startPan('pending');
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    const p = pointerOf(e);
    if (!g) {
      inside.current = true;
      st.current.onHover?.(p);
      hoverCursor(p);
      const tip = st.current.getTooltip?.(p);
      tipSetter.current?.(
        tip === null || tip === undefined || tip === false
          ? null
          : { x: p.x + gutterW, y: p.y, node: tip },
      );
      return;
    }
    if (g.id !== e.pointerId) return;
    if (g.kind === 'drag') {
      if (!g.moved && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 0) g.moved = true;
      g.drag.onMove?.(p);
      return;
    }
    if (g.kind === 'pending' && Math.hypot(e.clientX - g.x, e.clientY - g.y) > panThreshold) {
      g.kind = 'pan';
      setCursor('grabbing');
    }
    if (g.kind === 'pan' && scroller.current) {
      scroller.current.scrollLeft = g.sx - (e.clientX - g.x);
      scroller.current.scrollTop = g.sy - (e.clientY - g.y);
    }
  };
  const onUp = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    const p = pointerOf(e);
    if (g.kind === 'drag') g.drag.onEnd?.(p, g.moved);
    else if (g.kind === 'pending' && g.button === 0) st.current.onEmptyClick?.(p);
    hoverCursor(p);
  };
  const onCancel = () => {
    const g = gesture.current;
    gesture.current = null;
    if (g?.kind === 'drag') g.drag.onCancel?.();
    setCursor('grab');
  };
  const onLeave = () => {
    inside.current = false;
    if (gesture.current) return;
    st.current.onHover?.(null);
    tipSetter.current?.(null);
  };

  /* 空白鍵：游標在盤面上時按住即可拖曳平移（不捲動頁面） */
  useEffect(() => {
    if (!spacePan) return;
    const down = (e: KeyboardEvent) => {
      if (e.key !== ' ' || !inside.current || isEditableTarget(e.target)) return;
      e.preventDefault();
      if (!space.current) {
        space.current = true;
        if (!gesture.current && canvas.current) canvas.current.style.cursor = 'grab';
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ') space.current = false;
    };
    const blur = () => {
      space.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [spacePan]);

  useImperativeHandle(
    ref,
    () => ({
      getView: makeView,
      zoomTo,
      zoomBy: (f, a) => zoomTo(zoomRef.current * f, a),
      fitWidth: ({ max = 1 } = {}) => {
        const s = st.current;
        const avail = s.client.w - s.pad.left - s.pad.right;
        const z =
          s.world.width > 0 && s.base > 0 ? Math.min(max, avail / (s.world.width * s.base)) : 1;
        zoomTo(z, { x: 0, y: s.client.h / 2 });
        requestAnimationFrame(() => {
          if (scroller.current) scroller.current.scrollLeft = 0;
        });
      },
      scrollTo: (x, y) => scroller.current?.scrollTo({ left: x, top: y }),
      scrollBy: (dx, dy) => scroller.current?.scrollBy({ left: dx, top: dy }),
      scrollToWorld: (box, { margin = 16 } = {}) => {
        const el = scroller.current;
        if (!el) return;
        const s = st.current;
        const x0 = s.offX + s.pad.left + (box.x - s.world.x) * s.scale;
        const y0 = s.offY + s.pad.top + (box.y - s.world.y) * s.scale;
        const x1 = x0 + box.width * s.scale;
        const y1 = y0 + box.height * s.scale;
        const reveal = (a0: number, a1: number, cur: number, size: number) => {
          if (a1 - a0 + 2 * margin > size) return a0 - margin;
          if (a0 - margin < cur) return a0 - margin;
          if (a1 + margin > cur + size) return a1 + margin - size;
          return cur;
        };
        el.scrollTo({
          left: reveal(x0, x1, el.scrollLeft, el.clientWidth),
          top: reveal(y0, y1, el.scrollTop, el.clientHeight),
        });
      },
      redraw,
      element: () => scroller.current,
      clientToWorld: (cx, cy) => {
        const r = canvas.current?.getBoundingClientRect();
        if (!r || cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
        return makeView().toWorld(cx - r.left, cy - r.top);
      },
    }),
    [makeView, zoomTo, redraw],
  );

  return (
    <div
      className={cn(
        'relative h-[min(60dvh,560px)] min-h-64 overflow-hidden rounded-lg border border-border',
        className,
      )}
      style={{ background }}
      data-zoom={Math.round(zoom * 100)}
      data-testid="pan-zoom-viewport"
    >
      {gutter ? (
        <canvas
          ref={gutterCanvas}
          aria-hidden
          className="absolute top-0 left-0 block"
          style={{ width: gutter.width, height: client.h || '100%' }}
        />
      ) : null}
      <section
        ref={scroller}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: 可捲動的區域要能用鍵盤聚焦捲動
        tabIndex={0}
        aria-label={rest['aria-label'] ?? '盤面'}
        onScroll={redraw}
        className="absolute inset-y-0 right-0 overflow-auto outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset"
        style={{ left: gutterW }}
      >
        <div
          style={{
            position: 'relative',
            width: Math.max(contentW, client.w),
            height: Math.max(contentH, client.h),
          }}
        >
          <canvas
            ref={canvas}
            aria-hidden
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onCancel}
            onPointerLeave={onLeave}
            onMouseDown={(e: ReactMouseEvent) => {
              if (e.button === 1) e.preventDefault();
            }}
            className="sticky top-0 left-0 block touch-none select-none"
            style={{ width: client.w, height: client.h, cursor: 'grab' }}
          />
        </div>
      </section>
      <TooltipLayer bind={bindTip} />
    </div>
  );
}
