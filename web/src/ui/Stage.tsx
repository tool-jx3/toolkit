/**
 * 預覽舞台：背景（棋盤格／深／淺／自訂色／上傳背景圖，只供預覽）、縮放、符合畫面。
 *
 * 內容以「原始尺寸」排版（width × height），Stage 負責縮放。內容可以是 <canvas>、DOM 子元素或兩者混用：
 *   <Stage width={512} height={512}><canvas ref={ref} width={512} height={512} className="block size-full" /></Stage>
 *
 * 鍵盤：工具列的按鈕；在舞台上 Ctrl＋滾輪縮放。
 *
 * 選填（G3 立繪工作台加的，不給時行為不變）：
 * - `wheelZoom="plain"`：不按 Ctrl 的滾輪也縮放（頁面不捲動）；`wheelFactors` 每格的倍率；`zoomRange` 範圍；
 *   `wheelLinear`：改成依滾動量加減（例如 0.5 ＝ 每 100 px 滾動量 ±50 個百分點）。
 * - `zoomBase="fit"`：數字倍率以「符合畫面」為 100%（例如 20%～500%）。
 * - `dragPan`：在空白處（或用中鍵）拖曳平移內容；`pan`／`onPanChange` 受控。
 * - 疊在內容上的元件（LayoutEditor、CropFrame）用 `useStageScale()` 或 CSS 變數 `--stage-scale` 取得目前倍率。
 */
import { ImagePlus, Maximize, Minus, Plus } from 'lucide-react';
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { IconButton } from './Button';
import { ColorField } from './ColorField';
import { cn } from './cn';
import { Segmented } from './Segmented';

export type StageBackgroundKind = 'checker' | 'dark' | 'light' | 'color' | 'image';

export interface StageBackground {
  kind: StageBackgroundKind;
  /** kind = 'color' 時的顏色 */
  color?: string;
  /** kind = 'image' 時的圖片網址（object URL） */
  imageUrl?: string;
}

export type StageZoom = number | 'fit';

export interface StageProps {
  /** 內容的原始寬高（px） */
  width: number;
  height: number;
  children: ReactNode;
  background?: StageBackground;
  onBackgroundChange?: (bg: StageBackground) => void;
  defaultBackground?: StageBackground;
  zoom?: StageZoom;
  onZoomChange?: (zoom: StageZoom) => void;
  /** 顯示工具列（預設 true） */
  toolbar?: boolean;
  /** 工具列提供哪些背景（預設全部：透明、黑、白、自訂色、背景圖） */
  backgrounds?: readonly StageBackgroundKind[];
  /** 工具列右側的額外按鈕 */
  toolbarExtra?: ReactNode;
  /** 放大時用最近鄰（像素圖） */
  pixelated?: boolean;
  /** 符合畫面時允許放大超過 100%（預設 false） */
  fitUpscale?: boolean;
  'aria-label'?: string;
  className?: string;
  /** 舞台區域的 class（例如改高度：h-[480px]） */
  viewportClassName?: string;
  /** 滾輪縮放：'ctrl'（預設：按住 Ctrl／⌘ 才縮放）或 'plain'（直接滾就縮放，頁面不捲動） */
  wheelZoom?: 'ctrl' | 'plain';
  /** 滾輪一格的倍率 [往上（放大）, 往下（縮小）]（預設 [1.1, 1 ÷ 1.1]） */
  wheelFactors?: readonly [number, number];
  /** 滾輪改成依滾動量加減倍率：每 100 px 滾動量加減多少（例如 0.5 ＝ 50 個百分點）；給了就不用 wheelFactors */
  wheelLinear?: number;
  /** 縮放範圍（預設 [0.05, 8]；zoomBase 為 'fit' 時是相對倍率） */
  zoomRange?: readonly [number, number];
  /** 數字倍率的基準：'content'（預設，1＝原始尺寸）或 'fit'（1＝符合畫面，畫面顯示 100%） */
  zoomBase?: 'content' | 'fit';
  /** 在空白處按住拖曳（或中鍵拖曳）平移內容 */
  dragPan?: boolean;
  /** 平移量（螢幕 px；受控） */
  pan?: StagePan;
  onPanChange?: (pan: StagePan) => void;
}

export interface StagePan {
  x: number;
  y: number;
}

export interface StageView {
  /** 目前實際的顯示倍率（螢幕 px ÷ 內容 px） */
  scale: number;
  width: number;
  height: number;
}

const StageContext = createContext<StageView | null>(null);

/** 疊在 Stage 內容上的元件取得目前倍率（控點、標籤要維持固定的螢幕大小時用）；不在 Stage 裡時是 1 */
export function useStageScale(): number {
  return useContext(StageContext)?.scale ?? 1;
}

/** 不在 Stage 裡時是 null */
export function useStageView(): StageView | null {
  return useContext(StageContext);
}

/** 背景選項（順序即工具列順序）。深＝純黑、淺＝純白，方便檢查透明部分 */
const BACKGROUND_OPTIONS: { value: StageBackgroundKind; label: string; ariaLabel: string }[] = [
  { value: 'checker', label: '透明', ariaLabel: '棋盤格（透明）' },
  { value: 'dark', label: '黑', ariaLabel: '黑色背景' },
  { value: 'light', label: '白', ariaLabel: '白色背景' },
  { value: 'color', label: '色', ariaLabel: '自訂顏色背景' },
  { value: 'image', label: '圖', ariaLabel: '背景圖（只供預覽）' },
];

export const ALL_STAGE_BACKGROUNDS: readonly StageBackgroundKind[] = BACKGROUND_OPTIONS.map(
  (o) => o.value,
);

const ZOOM_STEPS = [0.1, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];

function backgroundStyle(bg: StageBackground): { className: string; style?: CSSProperties } {
  switch (bg.kind) {
    case 'dark':
      return { className: '', style: { background: '#000000' } };
    case 'light':
      return { className: '', style: { background: '#ffffff' } };
    case 'color':
      /* 自訂色可以半透明：疊在棋盤格上 */
      return {
        className: 'checker',
        style: { boxShadow: `inset 0 0 0 9999px ${bg.color ?? '#808080'}` },
      };
    case 'image':
      return bg.imageUrl
        ? {
            className: '',
            style: {
              backgroundImage: `url("${bg.imageUrl}")`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            },
          }
        : { className: 'checker' };
    default:
      return { className: 'checker' };
  }
}

export function Stage({
  width,
  height,
  children,
  background,
  onBackgroundChange,
  defaultBackground = { kind: 'checker' },
  zoom,
  onZoomChange,
  toolbar = true,
  backgrounds = ALL_STAGE_BACKGROUNDS,
  toolbarExtra,
  pixelated,
  fitUpscale = false,
  className,
  viewportClassName,
  wheelZoom = 'ctrl',
  wheelFactors = [1.1, 1 / 1.1],
  wheelLinear,
  zoomRange = [0.05, 8],
  zoomBase = 'content',
  dragPan = false,
  pan,
  onPanChange,
  ...rest
}: StageProps) {
  const [innerBg, setInnerBg] = useState<StageBackground>(defaultBackground);
  const bg = background ?? innerBg;
  const setBg = (b: StageBackground) => {
    if (!background) setInnerBg(b);
    onBackgroundChange?.(b);
  };
  const [innerZoom, setInnerZoom] = useState<StageZoom>('fit');
  const z = zoom ?? innerZoom;
  const setZoom = (v: StageZoom) => {
    if (zoom === undefined) setInnerZoom(v);
    onZoomChange?.(v);
  };

  const viewport = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => {
      const pad = 24;
      const s = Math.min((el.clientWidth - pad) / width, (el.clientHeight - pad) / height);
      setFit(Math.max(0.02, fitUpscale ? s : Math.min(1, s)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, height, fitUpscale]);
  const relative = zoomBase === 'fit';
  /* 工具列與滾輪操作的倍率（zoomBase 'fit' 時是相對於符合畫面的倍率） */
  const level = z === 'fit' ? (relative ? 1 : fit) : z;
  const scale = relative ? level * fit : level;
  const view = useMemo(() => ({ scale, width, height }), [scale, width, height]);
  const [zMin, zMax] = zoomRange;
  const clampZoom = (v: number) => Math.min(zMax, Math.max(zMin, v));

  const [innerPan, setInnerPan] = useState<StagePan>({ x: 0, y: 0 });
  const p = pan ?? innerPan;
  const setPan = (v: StagePan) => {
    if (pan === undefined) setInnerPan(v);
    onPanChange?.(v);
  };

  /* Ctrl＋滾輪縮放（要非被動監聽才能阻止頁面縮放）；wheelZoom="plain" 時不按 Ctrl 也縮放 */
  const zoomRef = useRef({ level, setZoom, wheelZoom, wheelFactors, wheelLinear, clampZoom });
  zoomRef.current = { level, setZoom, wheelZoom, wheelFactors, wheelLinear, clampZoom };
  useEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const r = zoomRef.current;
      if (!e.ctrlKey && !e.metaKey && r.wheelZoom !== 'plain') return;
      if (e.deltaY === 0) return;
      e.preventDefault();
      if (r.wheelLinear) {
        const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? 800 : 1;
        r.setZoom(
          r.clampZoom(Number((r.level - ((e.deltaY * unit) / 100) * r.wheelLinear).toFixed(4))),
        );
        return;
      }
      const f = e.deltaY < 0 ? r.wheelFactors[0] : r.wheelFactors[1];
      r.setZoom(r.clampZoom(Number((r.level * f).toFixed(4))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const stepZoom = (dir: 1 | -1) => {
    const next =
      dir > 0
        ? ZOOM_STEPS.find((s) => s > level + 1e-3)
        : [...ZOOM_STEPS].reverse().find((s) => s < level - 1e-3);
    setZoom(clampZoom(next ?? (dir > 0 ? 8 : 0.1)));
  };

  /* 拖曳平移：子元素（裁切框、版面物件）在 pointerdown 時 stopPropagation 就不會觸發 */
  const panDrag = useRef<{ id: number; x: number; y: number; start: StagePan } | null>(null);
  const [panning, setPanning] = useState(false);
  const onPanDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (!dragPan || (e.button !== 0 && e.button !== 1)) return;
    const el = e.currentTarget;
    /* 點在捲軸上時不平移 */
    if (e.target === el) {
      const r = el.getBoundingClientRect();
      if (e.clientX - r.left > el.clientWidth || e.clientY - r.top > el.clientHeight) return;
    }
    if (e.button === 1) e.preventDefault();
    panDrag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, start: p };
    el.setPointerCapture?.(e.pointerId);
    setPanning(true);
  };
  const onPanMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = panDrag.current;
    if (!d || d.id !== e.pointerId) return;
    setPan({ x: d.start.x + e.clientX - d.x, y: d.start.y + e.clientY - d.y });
  };
  const onPanUp = (e: ReactPointerEvent<HTMLElement>) => {
    if (panDrag.current?.id !== e.pointerId) return;
    panDrag.current = null;
    setPanning(false);
  };

  const fileInput = useRef<HTMLInputElement>(null);
  const lastUrl = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
    },
    [],
  );

  const look = backgroundStyle(bg);
  const label = rest['aria-label'] ?? '預覽';

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface',
        className,
      )}
    >
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
          <Segmented
            aria-label="預覽背景"
            size="sm"
            value={bg.kind}
            onValueChange={(kind) => {
              if (kind === 'image' && !bg.imageUrl) fileInput.current?.click();
              setBg({ ...bg, kind });
            }}
            options={BACKGROUND_OPTIONS.filter((o) => backgrounds.includes(o.value))}
          />
          {bg.kind === 'color' ? (
            <ColorField
              aria-label="背景色"
              value={bg.color ?? '#808080'}
              onChange={(color) => setBg({ ...bg, color })}
              showInput={false}
              className="w-auto"
            />
          ) : null}
          {bg.kind === 'image' ? (
            <IconButton
              label="選擇背景圖（只供預覽，不會匯出）"
              icon={<ImagePlus />}
              size="sm"
              variant="secondary"
              onClick={() => fileInput.current?.click()}
            />
          ) : null}
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
              const url = URL.createObjectURL(f);
              lastUrl.current = url;
              setBg({ kind: 'image', imageUrl: url });
            }}
          />
          <div className="ml-auto flex items-center gap-0.5">
            {toolbarExtra}
            <IconButton label="縮小" icon={<Minus />} size="sm" onClick={() => stepZoom(-1)} />
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                if (dragPan) setPan({ x: 0, y: 0 });
              }}
              aria-label={`目前縮放 ${Math.round(level * 100)}%，按一下回到 100%`}
              className="h-7 min-w-14 rounded-md px-1 text-xs tabular-nums text-muted hover:bg-surface-2 hover:text-fg"
            >
              {Math.round(level * 100)}%
            </button>
            <IconButton label="放大" icon={<Plus />} size="sm" onClick={() => stepZoom(1)} />
            <IconButton
              label="符合畫面"
              icon={<Maximize />}
              size="sm"
              pressed={z === 'fit'}
              onClick={() => {
                setZoom('fit');
                if (dragPan) setPan({ x: 0, y: 0 });
              }}
            />
          </div>
        </div>
      ) : null}
      <section
        ref={viewport}
        aria-label={label}
        data-zoom={Math.round(level * 100)}
        className={cn(
          'relative flex max-h-[min(60dvh,560px)] min-h-64 w-full overflow-auto p-3',
          look.className,
          dragPan && 'touch-none',
          dragPan && (panning ? 'cursor-grabbing select-none' : 'cursor-grab'),
          viewportClassName,
        )}
        /* 高度跟著內容比例（橫幅不會留一大塊空白），最高 60dvh／560px */
        style={{ aspectRatio: `${width} / ${height}`, ...look.style }}
        onPointerDown={dragPan ? onPanDown : undefined}
        onPointerMove={dragPan ? onPanMove : undefined}
        onPointerUp={dragPan ? onPanUp : undefined}
        onPointerCancel={dragPan ? onPanUp : undefined}
      >
        {/* m-auto：放得下時置中，放不下時從左上角開始捲動 */}
        <div
          style={{
            width: width * scale,
            height: height * scale,
            transform: p.x || p.y ? `translate(${p.x}px, ${p.y}px)` : undefined,
          }}
          className="relative m-auto shrink-0"
        >
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={
              {
                width,
                height,
                transform: `scale(${scale})`,
                imageRendering: pixelated && scale > 1 ? 'pixelated' : undefined,
                '--stage-scale': scale,
              } as CSSProperties
            }
          >
            <StageContext.Provider value={view}>{children}</StageContext.Provider>
          </div>
        </div>
      </section>
    </div>
  );
}
