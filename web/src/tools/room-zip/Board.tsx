/**
 * 盤面檢視（房間設計的畫布 F146～F155、右側預覽 F212～F217、立繪頁預覽 F225）：
 * 檢視區鋪背景（略為壓暗）；中央是盤面（依盤面寬高比例），盤面上依堆疊順序畫物件，前景相當於堆疊順序 0 與 1 之間。
 * 物件的位置以「中心座標＋盤面一半」換算，所以畫面上看到的位置就是輸出的位置。
 * 縮放（按鈕、滾輪）、平移（按住空白鍵或中鍵拖曳）、點選（Shift／Ctrl／⌘ 加選）、拖曳移動（Shift 鎖軸）、
 * 右下角控制點改大小（以中心為準對稱）。
 */
import { Lock } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/ui';
import { useImageUrl } from './common';

export interface BoardItem {
  id: string;
  label: string;
  imageUrl: string | null;
  text?: string;
  /** 中心（格） */
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
  kind: 'marker' | 'panel' | 'tachie' | 'effect' | 'placeholder' | 'cutin';
  locked?: boolean;
  resizable?: boolean;
  /** 只能上下拖（立繪頁的抬升） */
  axis?: 'y';
  /** 全畫面演出不顯示外框 */
  frameless?: boolean;
  /** 圖片的即時預覽樣式（房間設計的快速加工：裁切、透明、翻轉） */
  imageStyle?: CSSProperties;
}

export interface BoardMove {
  ids: string[];
  /** 位移（格，已依 step 取整） */
  dx: number;
  dy: number;
  phase: 'move' | 'end';
}

export interface BoardResize {
  id: string;
  width: number;
  height: number;
  phase: 'move' | 'end';
}

export interface BoardProps {
  fieldWidth: number;
  fieldHeight: number;
  background: string | null;
  foreground: string | null;
  /** 前景蓋滿（cover）或拉伸（fill） */
  autoCrop: boolean;
  items: readonly BoardItem[];
  selected: readonly string[];
  zoom: number;
  onZoomChange: (z: number) => void;
  zoomRange: [number, number];
  /** 滾輪每格的倍率變化（0.08＝8%） */
  wheelStep: number;
  /** 100% 時的每格 px 怎麼算：fit＝盤面貼合檢視區；room＝40×30 的盤面貼合檢視區 */
  base: 'fit' | 'room';
  pan: { x: number; y: number };
  onPanChange: (p: { x: number; y: number }) => void;
  height: number;
  guides: { on: boolean; color: string };
  /** 顯示框線、名稱、控制點（實際顯示時關閉） */
  decorations: boolean;
  /** 拖曳追蹤的單位（格） */
  step: number;
  /** Shift 鎖軸：一軸量大於另一軸幾倍時鎖成水平或垂直 */
  axisRatio: number;
  /** 45° 時兩軸取平均（預覽）或取較大的量（房間設計） */
  diagonal: 'mean' | 'max';
  /** 位移超過幾 px 才算拖曳 */
  threshold: number;
  onSelect: (id: string, additive: boolean) => void;
  /** 按下這個物件時不開始拖曳（例如還有未確定的快速加工要先確認）；仍會呼叫 onSelect */
  dragBlocked?: (id: string) => boolean;
  onBlankClick?: () => void;
  onMove?: (m: BoardMove) => void;
  onResize?: (r: BoardResize) => void;
  /** 檢視區下方的資訊列 */
  footer?: ReactNode;
  /** 盤面上的額外 DOM（例如快速裁切框） */
  overlay?: (geo: { left: number; top: number; cell: number }) => ReactNode;
  'aria-label': string;
  testId?: string;
}

/** 依 step 取整 */
const snap = (v: number, step: number) => Math.round(v / step) * step;

/** Shift 鎖軸 */
function lockAxis(
  dx: number,
  dy: number,
  ratio: number,
  diagonal: 'mean' | 'max',
): [number, number] {
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > ay * ratio) return [dx, 0];
  if (ay > ax * ratio) return [0, dy];
  const m = diagonal === 'mean' ? (ax + ay) / 2 : Math.max(ax, ay);
  return [Math.sign(dx) * m, Math.sign(dy) * m];
}

function ItemView({
  item,
  geo,
  selected,
  decorations,
  onDown,
  onHandle,
}: {
  item: BoardItem;
  geo: { left: number; top: number; cell: number; W: number; H: number };
  selected: boolean;
  decorations: boolean;
  onDown: (e: React.PointerEvent) => void;
  onHandle: (e: React.PointerEvent) => void;
}) {
  const url = useImageUrl(item.imageUrl);
  const { cell } = geo;
  const style: CSSProperties = {
    left: geo.left + (item.x - item.width / 2 + geo.W / 2) * cell,
    top: geo.top + (item.y - item.height / 2 + geo.H / 2) * cell,
    width: item.width * cell,
    height: item.height * cell,
  };
  const placeholder = item.kind === 'placeholder';
  return (
    <div
      data-board-item={item.id}
      data-kind={item.kind}
      data-selected={selected || undefined}
      title={item.label}
      onPointerDown={onDown}
      className={cn(
        'absolute touch-none select-none',
        item.locked ? 'cursor-not-allowed' : 'cursor-move',
        decorations && !item.frameless && 'outline outline-1 outline-[#ffffff66]',
        decorations && placeholder && 'border-2 border-dashed border-warning bg-warning-soft',
        !decorations && placeholder && 'bg-[#808080]',
        selected && 'outline-2 outline-accent',
      )}
      style={style}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className="pointer-events-none size-full object-fill"
          style={item.imageStyle}
        />
      ) : null}
      {item.text ? (
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden p-0.5 text-center text-[10px] leading-tight whitespace-pre-wrap text-[#fff] [text-shadow:0_0_3px_#000]">
          {item.text}
        </span>
      ) : null}
      {decorations ? (
        <span className="pointer-events-none absolute top-0 left-0 inline-flex max-w-full items-center gap-0.5 truncate rounded-br-sm bg-[#000000a6] px-1 text-[10px] leading-4 text-[#fff]">
          {item.locked ? <Lock className="size-2.5 shrink-0" aria-hidden /> : null}
          {item.label}
        </span>
      ) : null}
      {decorations && selected && item.resizable && !item.locked ? (
        <span
          role="presentation"
          data-board-handle={item.id}
          onPointerDown={onHandle}
          className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm border border-[#fff] bg-accent"
        />
      ) : null}
    </div>
  );
}

function Backdrop({ name }: { name: string | null }) {
  const url = useImageUrl(name);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      draggable={false}
      className="pointer-events-none absolute inset-0 size-full object-cover opacity-45"
    />
  );
}

function Foreground({
  name,
  autoCrop,
  style,
}: {
  name: string | null;
  autoCrop: boolean;
  style: CSSProperties;
}) {
  const url = useImageUrl(name);
  return (
    <div
      className="pointer-events-none absolute bg-[#0000004d]"
      style={style}
      data-board-foreground={name ?? ''}
    >
      {url ? (
        <img
          src={url}
          alt=""
          draggable={false}
          className={cn('size-full', autoCrop ? 'object-cover' : 'object-fill')}
        />
      ) : null}
    </div>
  );
}

export function Board(props: BoardProps) {
  const { fieldWidth: W, fieldHeight: H, items, selected, zoom, pan, height, decorations } = props;
  const ref = useRef<HTMLDivElement>(null);
  const [vw, setVw] = useState(600);
  const [space, setSpace] = useState(false);
  const latest = useRef(props);
  latest.current = props;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVw(el.clientWidth || 600));
    ro.observe(el);
    setVw(el.clientWidth || 600);
    return () => ro.disconnect();
  }, []);

  /* 滾輪縮放（不讓頁面捲動） */
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const p = latest.current;
      const k = e.deltaY < 0 ? 1 + p.wheelStep : 1 - p.wheelStep;
      const z = Math.max(
        p.zoomRange[0],
        Math.min(p.zoomRange[1], Math.round(p.zoom * k * 100) / 100),
      );
      p.onZoomChange(z);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  /* 空白鍵平移（焦點不在輸入欄時） */
  useEffect(() => {
    const editable = (t: EventTarget | null) =>
      t instanceof HTMLElement &&
      (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !editable(e.target) && ref.current?.matches(':hover')) {
        e.preventDefault();
        setSpace(true);
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false);
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const pad = 24;
  const base =
    props.base === 'room'
      ? Math.min((vw - pad) / 40, (height - pad) / 30)
      : Math.min((vw - pad) / W, (height - pad) / H);
  const cell = Math.max(0.5, base * zoom);
  const geo = {
    left: vw / 2 - (W * cell) / 2 + pan.x,
    top: height / 2 - (H * cell) / 2 + pan.y,
    cell,
    W,
    H,
  };

  const startPan = (e: React.PointerEvent) => {
    const sx = e.clientX;
    const sy = e.clientY;
    const p0 = { ...pan };
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    const move = (ev: PointerEvent) =>
      latest.current.onPanChange({ x: p0.x + ev.clientX - sx, y: p0.y + ev.clientY - sy });
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onViewportDown = (e: React.PointerEvent) => {
    if (e.button === 1 || space) {
      e.preventDefault();
      startPan(e);
      return;
    }
    if (e.button !== 0) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (Math.abs(ev.clientX - sx) > 3 || Math.abs(ev.clientY - sy) > 3) moved = true;
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (!moved) latest.current.onBlankClick?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /**
   * 按下物件（同舊版）：Shift／Ctrl／⌘ 先切換這一個的選取；沒按時，未選取的改成只選它，已在多選中的先保留多選。
   * 接著拖動所有選取中、未鎖定的物件（先按住 Shift 也照樣拖，並鎖方向，F153）；
   * 沒拖動就放開、也沒按加選鍵時，改成只選這一個（F152）。
   */
  const onItemDown = (item: BoardItem) => (e: React.PointerEvent) => {
    if (e.button === 1 || space) return;
    if (e.button !== 0) return;
    e.stopPropagation();
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const p = latest.current;
    const was = p.selected.includes(item.id);
    const multi = p.selected.length > 1;
    if (additive || !was) p.onSelect(item.id, additive);
    if (p.dragBlocked?.(item.id)) return;
    const sx = e.clientX;
    const sy = e.clientY;
    let dragging = false;
    /** 要拖的物件：開始拖動時才看選取（選取的更新可能是非同步的） */
    let ids: string[] = [];
    let last = { dx: 0, dy: 0 };
    const move = (ev: PointerEvent) => {
      const q = latest.current;
      const px = ev.clientX - sx;
      const py = ev.clientY - sy;
      if (!dragging && Math.abs(px) < q.threshold && Math.abs(py) < q.threshold) return;
      if (!dragging) {
        const cur = q.selected;
        /* 選取由外面管理時用目前的選取；加選鍵取消了這一個時拖其他選取中的；外面不管選取時只拖這一個 */
        const base = cur.includes(item.id) || (additive && was) ? cur : [item.id];
        ids = base.filter((id) => {
          const it = q.items.find((x) => x.id === id);
          return it && !it.locked;
        });
      }
      dragging = true;
      if (!ids.length) return;
      let dx = px / cell;
      let dy = py / cell;
      if (item.axis === 'y') dx = 0;
      if (ev.shiftKey) [dx, dy] = lockAxis(dx, dy, q.axisRatio, q.diagonal);
      dx = snap(dx, q.step);
      dy = snap(dy, q.step);
      if (dx === last.dx && dy === last.dy) return;
      last = { dx, dy };
      q.onMove?.({ ids, dx, dy, phase: 'move' });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragging) {
        if (ids.length) latest.current.onMove?.({ ids, ...last, phase: 'end' });
      } else if (!additive && was && multi) latest.current.onSelect(item.id, false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onHandleDown = (item: BoardItem) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const sx = e.clientX;
    const sy = e.clientY;
    let last: { w: number; h: number } | null = null;
    const move = (ev: PointerEvent) => {
      const q = latest.current;
      const w = Math.max(1, snap(item.width + ((ev.clientX - sx) / cell) * 2, q.step));
      const h = Math.max(1, snap(item.height + ((ev.clientY - sy) / cell) * 2, q.step));
      if (last && last.w === w && last.h === h) return;
      last = { w, h };
      q.onResize?.({ id: item.id, width: w, height: h, phase: 'move' });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (last)
        latest.current.onResize?.({ id: item.id, width: last.w, height: last.h, phase: 'end' });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const sorted = [...items].sort((a, b) => a.z - b.z);
  const below = sorted.filter((i) => i.z <= 0);
  const above = sorted.filter((i) => i.z > 0);
  const boardStyle: CSSProperties = {
    left: geo.left,
    top: geo.top,
    width: W * cell,
    height: H * cell,
  };
  const render = (i: BoardItem) => (
    <ItemView
      key={i.id}
      item={i}
      geo={geo}
      selected={selected.includes(i.id)}
      decorations={decorations}
      onDown={onItemDown(i)}
      onHandle={onHandleDown(i)}
    />
  );

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div
        ref={ref}
        role="application"
        aria-label={props['aria-label']}
        data-testid={props.testId}
        data-zoom={Math.round(zoom * 100)}
        onPointerDown={onViewportDown}
        onAuxClick={(e) => e.preventDefault()}
        className={cn(
          'relative w-full touch-none overflow-hidden rounded-md border border-border bg-[#101317]',
          space && 'cursor-grab',
        )}
        style={{ height }}
      >
        <Backdrop name={props.background} />
        {below.map(render)}
        <Foreground name={props.foreground} autoCrop={props.autoCrop} style={boardStyle} />
        {above.map(render)}
        {props.guides.on ? (
          <svg
            aria-hidden
            className="pointer-events-none absolute"
            style={boardStyle}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
          >
            <g
              stroke={props.guides.color}
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
              fill="none"
              opacity={0.85}
            >
              <rect x={0} y={0} width={W} height={H} vectorEffect="non-scaling-stroke" />
              <line x1={0} y1={0} x2={W} y2={H} vectorEffect="non-scaling-stroke" />
              <line x1={W} y1={0} x2={0} y2={H} vectorEffect="non-scaling-stroke" />
              <line x1={W / 2} y1={0} x2={W / 2} y2={H} vectorEffect="non-scaling-stroke" />
              <line x1={0} y1={H / 2} x2={W} y2={H / 2} vectorEffect="non-scaling-stroke" />
            </g>
          </svg>
        ) : null}
        {props.overlay?.(geo)}
      </div>
      {props.footer}
    </div>
  );
}
