/**
 * 版型畫布的操作層（G7 介紹圖與宣傳共用）：疊在 Stage 的內容上（DOM，不畫進輸出）。
 * 圖本身由工具用 `@/core/scene` 畫在 canvas 上（預覽與匯出同一段程式），這一層負責：
 * - **點選區**：每個可編輯的元素一個透明按鈕（滑過、聚焦時淡色外框；點一下或 Enter 呼叫 onPick）；
 * - **貼紙**：點選、拖曳移動、四角縮放（維持比例）、旋轉控點（Shift 每 15°），放開時拉回範圍內（keepInside）；
 *   選取中的貼紙下方可以放一排工具按鈕（stickerToolbar）；鍵盤：方向鍵移動 1 px（Shift 10 px）、Delete／Backspace 刪除、Esc 取消選取；
 * - **從畫布取色**：picker 啟動時整個畫布變成取色區，游標旁顯示放大鏡（15 × 15 像素放大 8 倍）與色碼，點一下取色、Esc 取消。
 *
 * ```tsx
 * const picker = useMemo(() => createCanvasPicker(), []);
 * <Stage width={W} height={H}>
 *   <canvas ref={canvas} width={W} height={H} className="block size-full" />
 *   <LayoutCanvas width={W} height={H} regions={regions} onPick={(key) => openGroup(key)}
 *     stickers={stickers} selectedSticker={sel} onSelectSticker={setSel}
 *     onStickerChange={(id, p, phase) => { if (phase === 'start') g.begin(); setPlacement(id, p); if (phase === 'end') g.commit(); }}
 *     onStickerDelete={remove} stickerRange={{ min: 12, max: Math.max(W, H) * 2 }}
 *     picker={picker} pickSource={() => canvas.current} />
 * </Stage>
 * <ColorField value={c} onChange={setC} pickFromCanvas={picker.pick} />
 * ```
 */
import { RotateCw } from 'lucide-react';
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { clientToLocal } from '@/core/layout';
import {
  type Corner,
  type HitRegion,
  keepInside,
  type Placement,
  type Point,
  pixelHex,
  placementBounds,
  type Rect,
  resizeFromCorner,
  rotateTo,
} from '@/core/scene';
import { Button } from './Button';
import { cn } from './cn';
import { useStageScale } from './Stage';
import { isEditableTarget, isFormControlTarget } from './shortcuts';

/* ---------- 從畫布取色 ---------- */

export interface CanvasPicker {
  /** 開始取色：回傳選到的色碼（#rrggbb），取消時 null。已經在取色時先取消前一次 */
  pick: () => Promise<string | null>;
  /** 取消目前的取色 */
  cancel: () => void;
  /** 完成（LayoutCanvas 呼叫） */
  finish: (hex: string | null) => void;
  /** 是否正在取色（React hook） */
  useActive: () => boolean;
  isActive: () => boolean;
}

/** 建立一個取色控制器（工具裡一個就夠；交給 LayoutCanvas 與色彩欄的 pickFromCanvas） */
export function createCanvasPicker(): CanvasPicker {
  let resolve: ((v: string | null) => void) | null = null;
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const l of listeners) l();
  };
  const finish = (hex: string | null) => {
    const r = resolve;
    resolve = null;
    emit();
    r?.(hex);
  };
  const subscribe = (fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  };
  const isActive = () => resolve !== null;
  return {
    pick: () => {
      if (resolve) finish(null);
      return new Promise<string | null>((r) => {
        resolve = r;
        emit();
      });
    },
    cancel: () => finish(null),
    finish,
    isActive,
    useActive: () => useSyncExternalStore(subscribe, isActive, isActive),
  };
}

/* ---------- 型別 ---------- */

export interface LayoutSticker {
  id: string;
  /** 無障礙名稱（例如「貼紙：星星.png」） */
  label: string;
  placement: Placement;
  /** 放開時要留在這個範圍裡（預設整個畫布） */
  bounds?: Rect;
  hidden?: boolean;
}

export type StickerPhase = 'start' | 'move' | 'end' | 'nudge';

export interface LayoutCanvasProps {
  /** 內容的原始尺寸（與 Stage 相同） */
  width: number;
  height: number;
  /** 點選區（依畫的順序；後面的在上層） */
  regions?: readonly HitRegion[];
  /** 點了點選區 */
  onPick?: (key: string, region: HitRegion) => void;
  /** 目前開啟中的點選區（顯示淡色外框） */
  activeKey?: string | null;
  stickers?: readonly LayoutSticker[];
  selectedSticker?: string | null;
  onSelectSticker?: (id: string | null) => void;
  onStickerChange?: (id: string, placement: Placement, phase: StickerPhase) => void;
  onStickerDelete?: (id: string) => void;
  /** 貼紙寬高的範圍（預設 12～畫布長邊 × 2） */
  stickerRange?: { min: number; max: number };
  /** 放開時至少留在範圍裡的距離（預設 16） */
  stickerMargin?: number;
  /** 選取中的貼紙下方的工具按鈕 */
  stickerToolbar?: (id: string) => ReactNode;
  /** 取色控制器 */
  picker?: CanvasPicker;
  /** 取色的來源（與輸出相同的畫面，例如預覽的 canvas） */
  pickSource?: () => HTMLCanvasElement | OffscreenCanvas | null | undefined;
  /** 取色時的說明（預設「在畫布上點一個顏色」） */
  pickHint?: string;
  'aria-label'?: string;
  className?: string;
}

const CORNERS: Corner[] = ['nw', 'ne', 'se', 'sw'];
const CORNER_AT: Record<Corner, [number, number]> = {
  nw: [0, 0],
  ne: [1, 0],
  se: [1, 1],
  sw: [0, 1],
};
const CORNER_LABEL: Record<Corner, string> = { nw: '左上', ne: '右上', se: '右下', sw: '左下' };
const CORNER_CURSOR: Record<Corner, string> = {
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
};

interface Drag {
  id: string;
  pointer: number;
  op: 'move' | 'resize' | 'rotate';
  corner?: Corner;
  start: Placement;
  /** 開始時的指標（內容座標） */
  from: Point;
  moved: boolean;
}

/* ---------- 元件 ---------- */

export function LayoutCanvas({
  width,
  height,
  regions = [],
  onPick,
  activeKey,
  stickers = [],
  selectedSticker = null,
  onSelectSticker,
  onStickerChange,
  onStickerDelete,
  stickerRange,
  stickerMargin = 16,
  stickerToolbar,
  picker,
  pickSource,
  pickHint = '在畫布上點一個顏色',
  className,
  ...rest
}: LayoutCanvasProps) {
  const scale = useStageScale();
  const k = 1 / scale;
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const picking = picker?.useActive() ?? false;
  const range = stickerRange ?? { min: 12, max: Math.max(width, height) * 2 };

  const toLocal = (clientX: number, clientY: number): Point => {
    const r = root.current?.getBoundingClientRect();
    if (!r) return { x: 0, y: 0 };
    return clientToLocal(clientX, clientY, r, { width, height });
  };

  /* 鍵盤（window）：選取中的貼紙 */
  const latest = useRef({
    stickers,
    selectedSticker,
    onStickerChange,
    onStickerDelete,
    onSelectSticker,
  });
  latest.current = { stickers, selectedSticker, onStickerChange, onStickerDelete, onSelectSticker };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')
      )
        return;
      const l = latest.current;
      const s = l.stickers.find((it) => it.id === l.selectedSticker && !it.hidden);
      if (!s) return;
      if (e.key === 'Escape') {
        if (isEditableTarget(t)) return;
        l.onSelectSticker?.(null);
        return;
      }
      if (e.metaKey || e.altKey || e.ctrlKey) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (isEditableTarget(t)) return;
        e.preventDefault();
        l.onStickerDelete?.(s.id);
        return;
      }
      if (isFormControlTarget(t)) return;
      const step = e.shiftKey ? 10 : 1;
      const d =
        e.key === 'ArrowLeft'
          ? [-step, 0]
          : e.key === 'ArrowRight'
            ? [step, 0]
            : e.key === 'ArrowUp'
              ? [0, -step]
              : e.key === 'ArrowDown'
                ? [0, step]
                : null;
      if (!d) return;
      e.preventDefault();
      l.onStickerChange?.(
        s.id,
        { ...s.placement, cx: s.placement.cx + d[0], cy: s.placement.cy + d[1] },
        'nudge',
      );
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const begin = (
    e: PointerEvent<HTMLElement>,
    s: LayoutSticker,
    op: Drag['op'],
    corner?: Corner,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    onSelectSticker?.(s.id);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = {
      id: s.id,
      pointer: e.pointerId,
      op,
      corner,
      start: s.placement,
      from: toLocal(e.clientX, e.clientY),
      moved: false,
    };
    setDragging(s.id);
    onStickerChange?.(s.id, s.placement, 'start');
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const p = toLocal(e.clientX, e.clientY);
    let next: Placement;
    if (d.op === 'move')
      next = { ...d.start, cx: d.start.cx + p.x - d.from.x, cy: d.start.cy + p.y - d.from.y };
    else if (d.op === 'resize' && d.corner) next = resizeFromCorner(d.start, d.corner, p, range);
    else next = rotateTo(d.start, d.from, p, e.shiftKey ? 15 : 0);
    d.moved = true;
    onStickerChange?.(d.id, next, 'move');
  };

  const end = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    setDragging(null);
    const s = stickers.find((it) => it.id === d.id);
    const cur = s?.placement ?? d.start;
    const fixed = keepInside(cur, s?.bounds ?? { x: 0, y: 0, width, height }, stickerMargin);
    onStickerChange?.(d.id, fixed, 'end');
  };

  const selected = stickers.find((s) => s.id === selectedSticker && !s.hidden) ?? null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: 疊在預覽上的一組可點的元素，不是表單分組
    <div
      ref={root}
      role="group"
      aria-label={rest['aria-label'] ?? '版型畫布'}
      className={cn('absolute inset-0 select-none', className)}
      data-testid="layout-canvas"
      data-picking={picking || undefined}
      onPointerDown={(e) => {
        /* 點到沒有點選區的空白處：取消選取貼紙 */
        if (e.target === e.currentTarget) onSelectSticker?.(null);
      }}
    >
      {regions.map((r, i) => (
        <button
          // biome-ignore lint/suspicious/noArrayIndexKey: 同一個 key 可能有好幾個區塊（例如名字與標語都開同一個分類）
          key={`${r.key}#${i}`}
          type="button"
          aria-label={r.label}
          data-region={r.key}
          data-active={activeKey === r.key || undefined}
          onClick={() => {
            onSelectSticker?.(null);
            onPick?.(r.key, r);
          }}
          className={cn(
            'absolute cursor-pointer bg-transparent outline-none',
            'hover:[outline:var(--region-line)_dashed_var(--accent)] focus-visible:[outline:var(--region-line)_solid_var(--focus)]',
            'data-[active]:[outline:var(--region-line)_dashed_color-mix(in_srgb,var(--accent)_55%,transparent)]',
          )}
          style={{
            left: r.box.x,
            top: r.box.y,
            width: r.box.width,
            height: r.box.height,
            borderRadius: r.circle ? '50%' : r.radius ? r.radius : undefined,
            ['--region-line' as string]: `${2 * k}px`,
            outlineOffset: -2 * k,
          }}
        />
      ))}
      {stickers.map((s) =>
        s.hidden ? null : (
          <button
            key={s.id}
            type="button"
            aria-label={s.label}
            aria-pressed={s.id === selectedSticker}
            data-sticker={s.id}
            data-placement={`${Math.round(s.placement.cx)},${Math.round(s.placement.cy)},${Math.round(s.placement.width)},${Math.round(s.placement.height)},${Math.round(s.placement.rotation)}`}
            onPointerDown={(e) => begin(e, s, 'move')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            onClick={() => onSelectSticker?.(s.id)}
            className="absolute cursor-move touch-none bg-transparent outline-none focus-visible:[outline:var(--region-line)_solid_var(--focus)]"
            style={{
              left: s.placement.cx - s.placement.width / 2,
              top: s.placement.cy - s.placement.height / 2,
              width: s.placement.width,
              height: s.placement.height,
              transform: `rotate(${s.placement.rotation}deg)`,
              ['--region-line' as string]: `${2 * k}px`,
            }}
          />
        ),
      )}
      {selected ? (
        <Frame
          s={selected}
          k={k}
          begin={begin}
          move={move}
          end={end}
          showToolbar={dragging === null}
          toolbar={stickerToolbar?.(selected.id)}
          canvas={{ width, height }}
        />
      ) : null}
      {picking && picker ? (
        <PickLayer
          k={k}
          width={width}
          height={height}
          toLocal={toLocal}
          source={pickSource}
          picker={picker}
          hint={pickHint}
        />
      ) : null}
    </div>
  );
}

/* ---------- 選取框 ---------- */

function Frame({
  s,
  k,
  begin,
  move,
  end,
  showToolbar,
  toolbar,
  canvas,
}: {
  s: LayoutSticker;
  k: number;
  begin: (e: PointerEvent<HTMLElement>, s: LayoutSticker, op: Drag['op'], corner?: Corner) => void;
  move: (e: PointerEvent<HTMLElement>) => void;
  end: (e: PointerEvent<HTMLElement>) => void;
  showToolbar: boolean;
  toolbar?: ReactNode;
  canvas: { width: number; height: number };
}) {
  const p = s.placement;
  const handle = 14 * k;
  const stem = 26 * k;
  const b = placementBounds(p);
  /* 工具列：外接框下方置中；放不下時放上方（固定螢幕大小） */
  const below = b.y + b.height + 10 * k;
  const toolbarTop = below + 44 * k > canvas.height ? Math.max(0, b.y - 54 * k) : below;
  return (
    <>
      <div
        className="pointer-events-none absolute"
        data-testid="sticker-frame"
        style={{
          left: p.cx - p.width / 2,
          top: p.cy - p.height / 2,
          width: p.width,
          height: p.height,
          transform: `rotate(${p.rotation}deg)`,
        }}
      >
        <div
          aria-hidden
          className="absolute inset-0"
          style={{
            outline: `${2 * k}px solid var(--accent)`,
            boxShadow: `0 0 0 ${3 * k}px rgba(0, 0, 0, 0.3)`,
          }}
        />
        {/* 旋轉控點：上緣中央往上一段 */}
        <div
          aria-hidden
          className="absolute bg-accent"
          style={{ left: p.width / 2 - k, top: -stem, width: 2 * k, height: stem }}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label={`旋轉「${s.label}」`}
          data-sticker-rotate={s.id}
          onPointerDown={(e) => begin(e, s, 'rotate')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          className="pointer-events-auto absolute flex cursor-grab touch-none items-center justify-center rounded-md border-accent bg-surface text-fg shadow-1"
          style={{
            left: p.width / 2 - 12 * k,
            top: -stem - 24 * k,
            width: 24 * k,
            height: 24 * k,
            borderWidth: 2 * k,
            borderStyle: 'solid',
          }}
        >
          <RotateCw aria-hidden style={{ width: 14 * k, height: 14 * k }} />
        </button>
        {CORNERS.map((c) => {
          const [ax, ay] = CORNER_AT[c];
          return (
            <button
              key={c}
              type="button"
              tabIndex={-1}
              aria-label={`縮放「${s.label}」（${CORNER_LABEL[c]}）`}
              data-sticker-corner={c}
              onPointerDown={(e) => begin(e, s, 'resize', c)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              className={cn(
                'pointer-events-auto absolute touch-none rounded-sm border-accent bg-surface shadow-1',
                CORNER_CURSOR[c],
              )}
              style={{
                left: p.width * ax - handle / 2,
                top: p.height * ay - handle / 2,
                width: handle,
                height: handle,
                borderWidth: 2 * k,
                borderStyle: 'solid',
              }}
            />
          );
        })}
      </div>
      {toolbar && showToolbar ? (
        <div
          className="pointer-events-auto absolute top-0 left-0 flex items-center gap-1 rounded-md border border-border bg-surface p-1 shadow-2"
          data-testid="sticker-toolbar"
          style={{
            transform: `translate(${b.x + b.width / 2}px, ${toolbarTop}px) scale(${k}) translateX(-50%)`,
            transformOrigin: '0 0',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {toolbar}
        </div>
      ) : null}
    </>
  );
}

/* ---------- 取色 ---------- */

const LOUPE = 120;
const LOUPE_PX = 15;

function PickLayer({
  k,
  width,
  height,
  toLocal,
  source,
  picker,
  hint,
}: {
  k: number;
  width: number;
  height: number;
  toLocal: (x: number, y: number) => Point;
  source?: () => HTMLCanvasElement | OffscreenCanvas | null | undefined;
  picker: CanvasPicker;
  hint: string;
}) {
  const loupe = useRef<HTMLCanvasElement>(null);
  const [at, setAt] = useState<{ x: number; y: number; hex: string } | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        picker.cancel();
      }
    };
    /* 點畫布以外的地方＝取消 */
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Element | null;
      if (t?.closest('[data-pick-layer]')) return;
      picker.cancel();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, [picker]);

  const sample = (clientX: number, clientY: number) => {
    const p = toLocal(clientX, clientY);
    if (p.x < 0 || p.y < 0 || p.x >= width || p.y >= height) {
      setAt(null);
      return null;
    }
    const src = source?.();
    if (!src) return null;
    const sx = (p.x / width) * src.width;
    const sy = (p.y / height) * src.height;
    const hex = pixelHex(src, sx, sy);
    const c = loupe.current?.getContext('2d');
    if (c) {
      c.imageSmoothingEnabled = false;
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, LOUPE, LOUPE);
      const half = Math.floor(LOUPE_PX / 2);
      c.drawImage(
        src,
        Math.floor(sx) - half,
        Math.floor(sy) - half,
        LOUPE_PX,
        LOUPE_PX,
        0,
        0,
        LOUPE,
        LOUPE,
      );
      const cell = LOUPE / LOUPE_PX;
      const o = half * cell;
      c.lineWidth = 3;
      c.strokeStyle = '#ffffff';
      c.strokeRect(o, o, cell, cell);
      c.lineWidth = 1;
      c.strokeStyle = '#111111';
      c.strokeRect(o, o, cell, cell);
    }
    setAt({ x: p.x, y: p.y, hex });
    return hex;
  };

  return (
    <div
      data-pick-layer
      data-testid="pick-layer"
      className="absolute inset-0 cursor-crosshair touch-none"
      onPointerMove={(e) => sample(e.clientX, e.clientY)}
      onPointerLeave={() => setAt(null)}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerUp={(e) => {
        e.stopPropagation();
        const hex = sample(e.clientX, e.clientY);
        if (hex) picker.finish(hex);
      }}
    >
      <div
        role="dialog"
        aria-label="從畫布取色"
        className="absolute top-0 left-0 flex items-center gap-2 rounded-md border border-border bg-surface px-2 py-1 text-sm text-fg shadow-2"
        style={{
          transform: `translate(${8 * k}px, ${8 * k}px) scale(${k})`,
          transformOrigin: '0 0',
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <span role="status">{hint}</span>
        <Button ref={cancelRef} size="sm" variant="secondary" onClick={() => picker.cancel()}>
          取消
        </Button>
      </div>
      <div
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-0 left-0 flex flex-col items-center gap-1 rounded-md border border-border bg-surface p-1 shadow-2',
          !at && 'invisible',
        )}
        data-testid="pick-loupe"
        data-hex={at?.hex}
        style={{
          transform: at
            ? `translate(${Math.min(width - (LOUPE + 16) * k, at.x + 20 * k)}px, ${Math.max(0, at.y - (LOUPE + 48) * k)}px) scale(${k})`
            : undefined,
          transformOrigin: '0 0',
        }}
      >
        <canvas ref={loupe} width={LOUPE} height={LOUPE} className="block rounded-sm" />
        <span className="font-mono text-xs">{at?.hex.toUpperCase() ?? ''}</span>
      </div>
    </div>
  );
}
