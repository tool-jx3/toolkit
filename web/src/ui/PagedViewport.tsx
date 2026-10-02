/**
 * 書頁的檢視區（劇本排版台移植時新增）：一般的 DOM 內容（例如一疊 A4 頁面）放大縮小、捲動、平移。
 * PanZoomViewport 是畫布盤面；這個是「排好版的 HTML」用的。
 *
 * - 內容以原尺寸排版，再整個以 transform 縮放（排版、分頁不受倍率影響）；捲動範圍跟著縮放後的大小。
 * - Ctrl（⌘）＋滾輪：以指標位置為中心縮放（指標下的點不動）；Shift＋滾輪：左右捲動。
 * - 平移：中鍵拖曳，或按住空白鍵拖曳（焦點在輸入欄時空白鍵照常打字）。
 * - 內容比檢視區窄時置中。
 *
 * ```tsx
 * const vp = useRef<PagedViewportHandle>(null);
 * <PagedViewport ref={vp} zoom={zoom} onZoomChange={setZoom} contentWidth={mmToPx(210)} aria-label="紙面">
 *   <div ref={stage} />
 * </PagedViewport>
 * vp.current?.revealRect(el.getBoundingClientRect(), 0.3); // 看不到時捲到從上方三成的位置
 * ```
 */
import {
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
import { cn } from './cn';
import { isEditableTarget } from './shortcuts';

export interface PagedViewportHandle {
  /** 捲動的容器 */
  scroller: HTMLElement | null;
  /** 內容（未縮放的座標系） */
  content: HTMLDivElement | null;
  /** 配合寬度的倍率（可用寬度 ÷ 內容寬，夾在 min～max） */
  fitWidthZoom: (min?: number, max?: number) => number;
  /**
   * 元素（getBoundingClientRect）看不到時捲動，讓它出現在從上方 ratio 的位置；回傳有沒有捲動。
   */
  revealRect: (r: DOMRect, ratio?: number) => boolean;
  /** 捲到內容座標（未縮放的 px）的 y 位置（放在從上方 ratio 的地方） */
  scrollToContentY: (y: number, ratio?: number) => void;
}

export interface PagedViewportProps {
  zoom: number;
  onZoomChange?: (zoom: number) => void;
  /** 內容在倍率 1 時的寬度（px） */
  contentWidth: number;
  minZoom?: number;
  maxZoom?: number;
  /** 滾輪每 100 px 的倍率（預設 ×1.12） */
  wheelStep?: number;
  /** 內容四周的留白（px，不縮放） */
  padding?: number;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
  ref?: Ref<PagedViewportHandle>;
}

export function PagedViewport({
  zoom,
  onZoomChange,
  contentWidth,
  minZoom = 0.15,
  maxZoom = 3,
  wheelStep = 1.12,
  padding = 16,
  className,
  children,
  'aria-label': ariaLabel,
  ref,
}: PagedViewportProps) {
  const scroller = useRef<HTMLElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [panning, setPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  /** 縮放後要把哪個內容點放在檢視區的哪裡 */
  const anchor = useRef<{ cx: number; cy: number; px: number; py: number } | null>(null);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  /* 內容的高度（未縮放） */
  useLayoutEffect(() => {
    const el = content.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 縮放後保持錨點不動 */
  useLayoutEffect(() => {
    const a = anchor.current;
    const s = scroller.current;
    if (!a || !s) return;
    anchor.current = null;
    const offX = offsetX(s, contentWidth * zoom, padding);
    s.scrollLeft = a.cx * zoom + offX - a.px;
    s.scrollTop = a.cy * zoom + padding - a.py;
  }, [zoom, contentWidth, padding]);

  const setZoomAt = useCallback(
    (next: number, px: number, py: number) => {
      const s = scroller.current;
      const z = zoomRef.current;
      const nz = Math.max(minZoom, Math.min(maxZoom, next));
      if (!s || Math.abs(nz - z) < 1e-4) return;
      const offX = offsetX(s, contentWidth * z, padding);
      anchor.current = {
        cx: (s.scrollLeft + px - offX) / z,
        cy: (s.scrollTop + py - padding) / z,
        px,
        py,
      };
      onZoomChange?.(Math.round(nz * 1000) / 1000);
    },
    [contentWidth, maxZoom, minZoom, onZoomChange, padding],
  );

  /* 滾輪（passive: false 才能攔下 Ctrl＋滾輪） */
  useEffect(() => {
    const s = scroller.current;
    if (!s) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const r = s.getBoundingClientRect();
        const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
        setZoomAt(
          zoomRef.current * wheelStep ** (-dy / 100),
          e.clientX - r.left,
          e.clientY - r.top,
        );
      } else if (e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY)) {
        e.preventDefault();
        s.scrollLeft += e.deltaY;
      }
    };
    s.addEventListener('wheel', onWheel, { passive: false });
    return () => s.removeEventListener('wheel', onWheel);
  }, [setZoomAt, wheelStep]);

  /* 空白鍵＋拖曳 */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat || isEditableTarget(e.target)) return;
      const s = scroller.current;
      if (!s?.matches(':hover')) return;
      e.preventDefault();
      setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    const blur = () => setSpaceDown(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    const s = scroller.current;
    if (!s) return;
    if (!(e.button === 1 || (e.button === 0 && spaceDown))) return;
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    const l0 = s.scrollLeft;
    const t0 = s.scrollTop;
    setPanning(true);
    const move = (ev: PointerEvent) => {
      s.scrollLeft = l0 - (ev.clientX - sx);
      s.scrollTop = t0 - (ev.clientY - sy);
    };
    const end = () => {
      setPanning(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  useImperativeHandle(
    ref,
    () => ({
      get scroller() {
        return scroller.current;
      },
      get content() {
        return content.current;
      },
      fitWidthZoom: (min = minZoom, max = 2) => {
        const s = scroller.current;
        if (!s || !contentWidth) return 1;
        const avail = s.clientWidth - padding * 2;
        return Math.max(min, Math.min(max, avail / contentWidth));
      },
      revealRect: (r, ratio = 0.3) => {
        const s = scroller.current;
        if (!s) return false;
        const v = s.getBoundingClientRect();
        const visible =
          r.bottom > v.top + 4 && r.top < v.bottom - 4 && r.right > v.left && r.left < v.right;
        if (visible) return false;
        s.scrollTop += r.top - v.top - s.clientHeight * ratio;
        if (r.left < v.left || r.right > v.right) s.scrollLeft += r.left - v.left - 16;
        return true;
      },
      scrollToContentY: (y, ratio = 0) => {
        const s = scroller.current;
        if (!s) return;
        s.scrollTop = y * zoomRef.current + padding - s.clientHeight * ratio;
      },
    }),
    [contentWidth, minZoom, padding],
  );

  const w = contentWidth * zoom;
  const h = height * zoom;
  return (
    <section
      ref={scroller}
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
      onAuxClick={(e) => {
        if (e.button === 1) e.preventDefault();
      }}
      className={cn(
        'relative min-h-0 min-w-0 overflow-auto overscroll-contain',
        (spaceDown || panning) && 'select-none',
        panning ? 'cursor-grabbing' : spaceDown ? 'cursor-grab' : undefined,
        className,
      )}
    >
      <div style={{ padding, width: 'max-content', minWidth: '100%', boxSizing: 'border-box' }}>
        <div style={{ width: w, height: h, margin: '0 auto', position: 'relative' }}>
          <div
            ref={content}
            style={{
              width: contentWidth,
              transform: `scale(${zoom})`,
              transformOrigin: '0 0',
              position: 'absolute',
              left: 0,
              top: 0,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}

/** 內容置中時左邊多出來的距離 */
function offsetX(s: HTMLElement, w: number, padding: number): number {
  const inner = s.clientWidth - padding * 2;
  return padding + Math.max(0, (inner - w) / 2);
}
