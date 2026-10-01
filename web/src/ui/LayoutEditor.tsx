/**
 * 版面編輯層：疊在 Stage 的內容上（DOM，不畫進輸出），在預覽上點選、拖曳、用控點縮放物件。
 * 圖本身由工具畫在 canvas 上（預覽與匯出用同一段繪圖程式＝所見即所得），這一層只負責操作與標示：
 * - 選取：按下即選取（同時只有一個），選取中的物件有主色外框；
 * - 拖曳移動、控點（預設右下角）調整大小，可以給 clamp 夾住位置；
 * - 參考線（拖曳中顯示）：參考範圍的中心十字、物件的四條邊線、與左右／上下邊的距離標籤；Esc 隱藏；
 *   距離標籤一律放在內容範圍裡看得到的地方（物件貼近邊緣時改放到線的另一側，見 guideLabelBoxes）；
 * - 頁面有反白時按下物件或控點也照常拖曳（pointerdown 阻止預設動作並清掉反白，不會變成瀏覽器原生的拖放）；
 * - 鍵盤（掛在 window；焦點在文字欄、選單、滑桿等表單控制項時不作用）：方向鍵微調（Shift 加大；
 *   ctrlNudge 時按住 Ctrl 也微調）、Delete／Backspace 取消選取、Esc 呼叫 onEscape。
 * - 座標單位：'px'（內容座標）或 'percent'（相對 frame 的百分比，例如頭像的內側區域）。
 *
 * ```tsx
 * <Stage width={1024} height={1024}>
 *   <canvas ref={canvas} width={1024} height={1024} className="block size-full" />
 *   <LayoutEditor width={1024} height={1024} frame={inner} units="percent"
 *     items={[
 *       { id: 'image', label: '圖片', box: imageBox, clamp: (b) => clampBoxPosition(b, { minX: -20, maxX: 120, minY: -20, maxY: 120 }, 'center') },
 *       { id: 'name', label: '名字牌', box: s.name, resizable: true, limits: { minWidth: 8, maxWidth: 80, minHeight: 6, maxHeight: 80 } },
 *     ]}
 *     selectedId={selected} onSelect={setSelected}
 *     onChange={(id, box, { phase }) => { if (phase === 'start') g.begin(); setBox(id, box); if (phase === 'end') g.commit(); }}
 *     nudgeStep={0.2} nudgeShiftStep={2} />
 * </Stage>
 * ```
 */
import {
  type PointerEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  arrowDelta,
  type Box,
  type BoxHandle,
  boxGuides,
  guideLabelBoxes,
  type LabelSize,
  moveBox,
  percentToBox,
  resizeBox,
  type SizeLimits,
} from '@/core/layout';
import { cn } from './cn';
import { useStageScale } from './Stage';
import { isEditableTarget, isFormControlTarget } from './shortcuts';

export interface LayoutItem {
  id: string;
  /** 名稱（無障礙名稱） */
  label: string;
  /** 位置與大小（單位見 units） */
  box: Box;
  /** 選取時出現控點、可以調整大小 */
  resizable?: boolean;
  /** 控點位置（預設只有右下角 'se'） */
  handles?: readonly BoxHandle[];
  /** 大小限制（同單位） */
  limits?: SizeLimits;
  /** 拖曳與調整大小後套用的限制（例如位置夾在範圍內）；方向鍵微調不套用 */
  clamp?: (box: Box, op: 'move' | 'resize') => Box;
  /** 可以選取但不能拖 */
  locked?: boolean;
  /** 點選範圍只算 frame 以內的部分（例如圖片超出內側區域的部分被裁掉時） */
  clipToFrame?: boolean;
}

export interface LayoutChange {
  /** start／move／end：拖曳或調整大小的過程；nudge：方向鍵（單次） */
  phase: 'start' | 'move' | 'end' | 'nudge';
  op: 'move' | 'resize';
}

export interface LayoutEditorProps {
  /** 內容的原始尺寸（與 Stage 相同） */
  width: number;
  height: number;
  /** 參考範圍（內容座標；百分比與參考線以它為準，預設整個內容） */
  frame?: Box;
  /** 物件座標的單位（預設 'px'） */
  units?: 'px' | 'percent';
  items: readonly LayoutItem[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onChange: (id: string, box: Box, change: LayoutChange) => void;
  /** 拖曳中顯示參考線（預設 true） */
  guides?: boolean;
  /** 距離標籤的數字格式（預設：百分比取整數「12%」、px 取整數「12 px」） */
  formatDistance?: (value: number) => string;
  /** 方向鍵、Delete、Esc（預設 true） */
  keyboard?: boolean;
  /** 方向鍵一次移動多少（單位同 units；預設 1） */
  nudgeStep?: number;
  /** Shift＋方向鍵（預設 nudgeStep × 10） */
  nudgeShiftStep?: number;
  /**
   * 按住 Ctrl 的方向鍵也微調（步距與不按 Ctrl 時相同，Shift 照樣加大；預設 false：Ctrl 組合不作用，
   * 留給工具的其他快捷鍵）。
   */
  ctrlNudge?: boolean;
  onEscape?: () => void;
  /** 標示安全範圍（虛線，不會輸出；內容座標） */
  safeArea?: Box;
  /** 疊在最上面的其他標示 */
  children?: ReactNode;
  'aria-label'?: string;
  className?: string;
}

const HANDLE_CURSOR: Record<BoxHandle, string> = {
  n: 'cursor-ns-resize',
  s: 'cursor-ns-resize',
  e: 'cursor-ew-resize',
  w: 'cursor-ew-resize',
  ne: 'cursor-nesw-resize',
  sw: 'cursor-nesw-resize',
  nw: 'cursor-nwse-resize',
  se: 'cursor-nwse-resize',
};

const HANDLE_AT: Record<BoxHandle, [number, number]> = {
  nw: [0, 0],
  n: [0.5, 0],
  ne: [1, 0],
  e: [1, 0.5],
  se: [1, 1],
  s: [0.5, 1],
  sw: [0, 1],
  w: [0, 0.5],
};

const HANDLE_LABEL: Record<BoxHandle, string> = {
  nw: '左上',
  n: '上方',
  ne: '右上',
  e: '右側',
  se: '右下',
  s: '下方',
  sw: '左下',
  w: '左側',
};

interface Drag {
  id: string;
  pointer: number;
  op: 'move' | 'resize';
  handle: BoxHandle | null;
  x: number;
  y: number;
  start: Box;
}

/** 標籤與線的間隔（螢幕 px） */
const LABEL_GAP = 2;

const NO_LABEL_SIZE: { x: LabelSize; y: LabelSize } = {
  x: { width: 0, height: 0 },
  y: { width: 0, height: 0 },
};

/** 清掉頁面上的反白（和一般的點擊一樣） */
function clearSelection() {
  const sel = typeof window === 'undefined' ? null : window.getSelection();
  if (sel && !sel.isCollapsed) sel.removeAllRanges();
}

function intersect(a: Box, b: Box): Box {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(0, Math.min(a.x + a.width, b.x + b.width) - x),
    height: Math.max(0, Math.min(a.y + a.height, b.y + b.height) - y),
  };
}

export function LayoutEditor({
  width,
  height,
  frame = { x: 0, y: 0, width, height },
  units = 'px',
  items,
  selectedId,
  onSelect,
  onChange,
  guides = true,
  formatDistance,
  keyboard = true,
  nudgeStep = 1,
  nudgeShiftStep,
  ctrlNudge = false,
  onEscape,
  safeArea,
  children,
  className,
  ...rest
}: LayoutEditorProps) {
  const scale = useStageScale();
  const k = 1 / scale;
  const root = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState<{ id: string; op: 'move' | 'resize' } | null>(null);
  const [guidesHidden, setGuidesHidden] = useState(false);

  const toPx = (b: Box) => (units === 'percent' ? percentToBox(b, frame) : b);
  const fmt =
    formatDistance ??
    ((v: number) => (units === 'percent' ? `${Math.round(v)}%` : `${Math.round(v)} px`));

  /* 鍵盤（window）：用 ref 拿最新的 props */
  const latest = useRef({
    items,
    selectedId,
    onChange,
    onSelect,
    onEscape,
    nudgeStep,
    nudgeShiftStep,
    ctrlNudge,
  });
  latest.current = {
    items,
    selectedId,
    onChange,
    onSelect,
    onEscape,
    nudgeStep,
    nudgeShiftStep,
    ctrlNudge,
  };
  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const t = e.target;
      if (
        t instanceof Element &&
        t.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')
      )
        return;
      const l = latest.current;
      if (e.key === 'Escape') {
        setGuidesHidden(true);
        l.onEscape?.();
        return;
      }
      if (!l.selectedId || e.metaKey || e.altKey) return;
      const item = l.items.find((it) => it.id === l.selectedId);
      if (!item) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (e.ctrlKey || isEditableTarget(t)) return;
        e.preventDefault();
        l.onSelect(null);
        return;
      }
      if (e.ctrlKey && !l.ctrlNudge) return;
      if (isFormControlTarget(t)) return;
      const step = e.shiftKey ? (l.nudgeShiftStep ?? l.nudgeStep * 10) : l.nudgeStep;
      const d = arrowDelta(e.key, step);
      if (!d || item.locked) return;
      e.preventDefault();
      l.onChange(item.id, moveBox(item.box, d.dx, d.dy), { phase: 'nudge', op: 'move' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [keyboard]);

  /* 拖曳中不讓瀏覽器開始原生的拖放（例如按在反白範圍裡；pointerdown 已阻止，這裡再保險一次） */
  useEffect(() => {
    const onDragStart = (e: DragEvent) => {
      if (drag.current) e.preventDefault();
    };
    window.addEventListener('dragstart', onDragStart, true);
    return () => window.removeEventListener('dragstart', onDragStart, true);
  }, []);

  const begin = (e: PointerEvent<HTMLElement>, item: LayoutItem, handle: BoxHandle | null) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    /* 頁面有反白時，按在反白範圍裡會變成原生拖放（指標被取消、拖曳只走第一步）：阻止預設動作並清掉反白 */
    e.preventDefault();
    clearSelection();
    onSelect(item.id);
    (e.currentTarget as HTMLElement).focus?.({ preventScroll: true });
    if (item.locked) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const op = handle ? 'resize' : 'move';
    drag.current = {
      id: item.id,
      pointer: e.pointerId,
      op,
      handle,
      x: e.clientX,
      y: e.clientY,
      start: item.box,
    };
    setActive({ id: item.id, op });
    setGuidesHidden(false);
    onChange(item.id, item.box, { phase: 'start', op });
  };

  const move = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const item = items.find((it) => it.id === d.id);
    if (!item) return;
    const r = root.current?.getBoundingClientRect();
    const kx = r?.width ? width / r.width : 1;
    const ky = r?.height ? height / r.height : 1;
    let dx = (e.clientX - d.x) * kx;
    let dy = (e.clientY - d.y) * ky;
    if (units === 'percent') {
      dx = (dx / frame.width) * 100;
      dy = (dy / frame.height) * 100;
    }
    let next =
      d.op === 'resize' && d.handle
        ? resizeBox(d.start, d.handle, dx, dy, item.limits)
        : moveBox(d.start, dx, dy);
    if (item.clamp) next = item.clamp(next, d.op);
    onChange(d.id, next, { phase: 'move', op: d.op });
  };

  const end = (e: PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    setActive(null);
    const item = items.find((it) => it.id === d.id);
    onChange(d.id, item?.box ?? d.start, { phase: 'end', op: d.op });
  };

  const activeItem = active ? items.find((it) => it.id === active.id) : null;
  const showGuides = guides && !guidesHidden && activeItem;
  const g = activeItem ? boxGuides(toPx(activeItem.box), frame) : null;
  const dist = activeItem
    ? boxGuides(
        activeItem.box,
        units === 'percent' ? { x: 0, y: 0, width: 100, height: 100 } : frame,
      )
    : null;

  /* 距離標籤：量實際大小（螢幕 px），換成內容座標後放在內容範圍裡看得到的地方 */
  const labelX = useRef<HTMLDivElement>(null);
  const labelY = useRef<HTMLDivElement>(null);
  const [labelSize, setLabelSize] = useState(NO_LABEL_SIZE);
  useLayoutEffect(() => {
    const ex = labelX.current;
    const ey = labelY.current;
    if (!ex || !ey) return;
    /* offsetWidth 是整數（可能少算不到 1 px）：多算 1 px，標籤才不會凸出邊緣 */
    const next = {
      x: { width: ex.offsetWidth + 1, height: ex.offsetHeight + 1 },
      y: { width: ey.offsetWidth + 1, height: ey.offsetHeight + 1 },
    };
    setLabelSize((prev) =>
      prev.x.width === next.x.width &&
      prev.x.height === next.x.height &&
      prev.y.width === next.y.width &&
      prev.y.height === next.y.height
        ? prev
        : next,
    );
  });
  const labels =
    showGuides && activeItem
      ? guideLabelBoxes(
          toPx(activeItem.box),
          {
            x: { width: labelSize.x.width * k, height: labelSize.x.height * k },
            y: { width: labelSize.y.width * k, height: labelSize.y.height * k },
          },
          { x: 0, y: 0, width, height },
          LABEL_GAP * k,
        )
      : null;

  return (
    // biome-ignore lint/a11y/useSemanticElements: 疊在預覽上的一組物件，不是表單分組
    <div
      ref={root}
      role="group"
      aria-label={rest['aria-label'] ?? '版面編輯'}
      className={cn('pointer-events-none absolute inset-0 select-none', className)}
      data-testid="layout-editor"
    >
      {safeArea ? (
        <div
          aria-hidden
          className="absolute rounded-sm"
          style={{
            left: safeArea.x,
            top: safeArea.y,
            width: safeArea.width,
            height: safeArea.height,
            outline: `${1 * k}px dashed rgba(127, 127, 127, 0.55)`,
          }}
        />
      ) : null}
      {items.map((item) => {
        const px = toPx(item.box);
        const hit = item.clipToFrame ? intersect(px, frame) : px;
        const selected = item.id === selectedId;
        return (
          <div key={item.id}>
            {/* 點選與拖曳的範圍 */}
            <button
              type="button"
              tabIndex={-1}
              aria-label={item.label}
              aria-pressed={selected}
              data-layout-item={item.id}
              data-selected={selected || undefined}
              onPointerDown={(e) => begin(e, item, null)}
              onPointerMove={move}
              onPointerUp={end}
              onPointerCancel={end}
              className={cn(
                'pointer-events-auto absolute touch-none outline-none',
                item.locked ? 'cursor-pointer' : 'cursor-move',
              )}
              style={{ left: hit.x, top: hit.y, width: hit.width, height: hit.height }}
            />
            {/* 選取框（整個物件，含超出 frame 的部分） */}
            {selected ? (
              <div
                aria-hidden
                className="pointer-events-none absolute"
                style={{
                  left: px.x,
                  top: px.y,
                  width: px.width,
                  height: px.height,
                  outline: `${2 * k}px solid var(--accent)`,
                  boxShadow: `0 0 0 ${3 * k}px rgba(0, 0, 0, 0.35)`,
                }}
              />
            ) : null}
            {selected && item.resizable && !item.locked
              ? (item.handles ?? (['se'] as const)).map((h) => {
                  const [ax, ay] = HANDLE_AT[h];
                  const size = 14 * k;
                  return (
                    <button
                      key={h}
                      type="button"
                      tabIndex={-1}
                      aria-label={`調整「${item.label}」大小（${HANDLE_LABEL[h]}）`}
                      data-layout-handle={h}
                      onPointerDown={(e) => begin(e, item, h)}
                      onPointerMove={move}
                      onPointerUp={end}
                      onPointerCancel={end}
                      className={cn(
                        'pointer-events-auto absolute touch-none rounded-full border-accent bg-surface shadow-1',
                        HANDLE_CURSOR[h],
                      )}
                      style={{
                        left: px.x + px.width * ax - size / 2,
                        top: px.y + px.height * ay - size / 2,
                        width: size,
                        height: size,
                        borderWidth: 2 * k,
                        borderStyle: 'solid',
                      }}
                    />
                  );
                })
              : null}
          </div>
        );
      })}
      {showGuides && g && dist && labels ? (
        <>
          <svg
            aria-hidden
            className="pointer-events-none absolute inset-0 overflow-visible"
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            data-testid="layout-guides"
          >
            <g
              stroke="var(--danger)"
              strokeWidth={1 * k}
              strokeDasharray={`${2 * k} ${3 * k}`}
              fill="none"
            >
              <line x1={g.center.x} y1={frame.y} x2={g.center.x} y2={frame.y + frame.height} />
              <line x1={frame.x} y1={g.center.y} x2={frame.x + frame.width} y2={g.center.y} />
              {[g.edges.left, g.edges.right].map((x, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 固定的兩條線
                <line key={`v${i}`} x1={x} y1={frame.y} x2={x} y2={frame.y + frame.height} />
              ))}
              {[g.edges.top, g.edges.bottom].map((y, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 固定的兩條線
                <line key={`h${i}`} x1={frame.x} y1={y} x2={frame.x + frame.width} y2={y} />
              ))}
            </g>
          </svg>
          {[
            {
              key: 'x',
              ref: labelX,
              text: `左 ${fmt(dist.distance.left)}｜右 ${fmt(dist.distance.right)}`,
              at: labels.x,
            },
            {
              key: 'y',
              ref: labelY,
              text: `上 ${fmt(dist.distance.top)}｜下 ${fmt(dist.distance.bottom)}`,
              at: labels.y,
            },
          ].map((l) => (
            <div
              key={l.key}
              ref={l.ref}
              data-testid={`layout-distance-${l.key}`}
              className="pointer-events-none absolute top-0 left-0 whitespace-nowrap rounded-sm bg-danger px-1 py-0.5 text-xs font-medium text-danger-contrast tabular-nums shadow-1"
              style={{
                transform: `translate(${l.at.x}px, ${l.at.y}px) scale(${k})`,
                transformOrigin: '0 0',
              }}
            >
              {l.text}
            </div>
          ))}
        </>
      ) : null}
      {children}
    </div>
  );
}
