/**
 * 3D 預覽區：放一張 WebGL 畫布（three.js 由工具用 `@/core/three` 接上），本身不含 three.js。
 *
 * 和 Stage 的差別：Stage 以 CSS transform 縮放「原始尺寸」的內容；3D 畫布要讓滑鼠／觸控的座標與畫面一致
 * （轉動鏡頭的靈敏度依畫布的顯示大小計算），所以這裡直接以 CSS 大小顯示畫布（繪圖緩衝區大小由工具決定）。
 *
 * - 畫布依 `aspect` 維持比例、置中，最高 `maxViewportHeight`（預設同 Stage：min(60dvh, 560px)，或外層的 `--stage-max-h`）。
 * - 畫布後面鋪 `background`（輸出的底色；null＝透明，顯示棋盤格），畫布外是素色。
 * - `busy`：蓋一層半透明遮罩與轉圈圖示（產生中、匯出中）；`overlay`：疊在畫面下方的訊息。
 * - `immersive`：全螢幕沉浸模式（隱藏頁面其他部分，畫布盡量放大，下方一顆返回按鈕；Esc 也會返回）。
 *   畫布元素不會重建（不用 Portal），WebGL 不會因此重新初始化。整塊預覽放進瀏覽器的頂層（Popover API 的
 *   `showPopover`，元素留在原地），蓋住頁首等所有內容，不受上層 sticky、transform 的疊層影響；
 *   不支援 Popover API 的瀏覽器照舊用 fixed＋z-index。
 * - `busyDelay`：處理中的遮罩延後多久才淡入（ms，預設 0）。很快就做完的處理不會閃一下；遮罩先畫上畫面再開始
 *   耗時的計算時，主執行緒卡住期間淡入與轉圈照樣會動（合成器上的動畫）。
 *
 * ```tsx
 * <Viewport3D canvasRef={ref} background={transparent ? null : color} busy={building ? '產生中…' : null}
 *   toolbar={<Button onClick={resetCamera}>重設鏡頭</Button>} canvasLabel="3D 預覽：拖曳轉動" />
 * ```
 */
import { Loader2, Minimize2 } from 'lucide-react';
import {
  type CanvasHTMLAttributes,
  type CSSProperties,
  type ReactNode,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import { Button } from './Button';
import { cn } from './cn';

export interface Viewport3DProps {
  /** WebGL 畫布 */
  canvasRef: Ref<HTMLCanvasElement>;
  /** 寬高比（寬 ÷ 高，預設 1） */
  aspect?: number;
  /** 畫布後面的底色（CSS 顏色）；null 或不給＝透明（棋盤格） */
  background?: string | null;
  /** 處理中的遮罩文字（null／undefined＝不顯示） */
  busy?: ReactNode;
  /** 遮罩延後多久才淡入（ms，預設 0＝立刻顯示） */
  busyDelay?: number;
  /** 疊在畫面下方的內容（例如錯誤訊息） */
  overlay?: ReactNode;
  /** 畫面上方的工具列 */
  toolbar?: ReactNode;
  /** 畫面下方（框內）的內容 */
  footer?: ReactNode;
  /** 全螢幕沉浸模式 */
  immersive?: boolean;
  onExitImmersive?: () => void;
  /** 沉浸模式的返回按鈕文字（預設「回到編輯畫面」） */
  exitLabel?: string;
  /** 畫面區域的最高高度（CSS 長度） */
  maxViewportHeight?: string;
  /** 畫布的名稱（螢幕閱讀器） */
  canvasLabel?: string;
  /** 畫布上的其他屬性（鍵盤事件、tabIndex、data-*） */
  canvasProps?: Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'ref' | 'className' | 'style'> &
    Record<`data-${string}`, string | number | boolean | undefined>;
  'aria-label'?: string;
  className?: string;
}

export function Viewport3D({
  canvasRef,
  aspect = 1,
  background = null,
  busy,
  busyDelay = 0,
  overlay,
  toolbar,
  footer,
  immersive = false,
  onExitImmersive,
  exitLabel = '回到編輯畫面',
  maxViewportHeight,
  canvasLabel,
  canvasProps,
  className,
  ...rest
}: Viewport3DProps) {
  const root = useRef<HTMLDivElement>(null);

  /* 沉浸模式：放進頂層（蓋住頁首，不受上層的疊層影響）；元素不搬家，畫布不重建 */
  useLayoutEffect(() => {
    const el = root.current;
    if (!immersive || !el || typeof el.showPopover !== 'function') return;
    el.setAttribute('popover', 'manual');
    let shown = false;
    try {
      el.showPopover();
      shown = true;
    } catch {
      /* 放不進頂層時照舊（fixed＋z-index） */
    }
    return () => {
      if (shown) {
        try {
          el.hidePopover();
        } catch {
          /* 已經不在頂層 */
        }
      }
      el.removeAttribute('popover');
    };
  }, [immersive]);

  /* 沉浸模式：頁面不捲動、Esc 返回 */
  useEffect(() => {
    if (!immersive) return;
    const prev = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        onExitImmersive?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.documentElement.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [immersive, onExitImmersive]);

  const content: CSSProperties = {
    aspectRatio: String(aspect),
    ...(background ? { backgroundColor: background } : null),
  };

  return (
    <div
      ref={root}
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface',
        /* 頂層（popover）的預設樣式（置中、fit-content、邊框、內距、系統色）一併蓋掉 */
        immersive &&
          'fixed inset-0 z-[60] m-0 size-full max-h-none max-w-none rounded-none border-0 p-0 text-fg',
        className,
      )}
      data-immersive={immersive || undefined}
    >
      {toolbar && !immersive ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
          {toolbar}
        </div>
      ) : null}
      <section
        aria-label={rest['aria-label'] ?? '3D 預覽'}
        className={cn(
          'relative flex w-full min-w-0 items-center justify-center bg-surface-2 p-3',
          immersive
            ? 'h-full flex-1 flex-col gap-4'
            : 'min-h-64 max-h-[var(--stage-max-h,min(60dvh,560px))]',
        )}
        style={
          immersive
            ? undefined
            : ({
                aspectRatio: String(aspect),
                ...(maxViewportHeight ? { '--stage-max-h': maxViewportHeight } : null),
              } as CSSProperties)
        }
      >
        <div
          className={cn(
            'relative max-h-full max-w-full overflow-hidden rounded-sm shadow-1',
            !background && 'checker',
            /* 沉浸模式：最大 90vmin，下面留返回按鈕的位置 */
            immersive ? 'h-[min(90vw,90dvh,calc(100dvh_-_7rem))]' : 'h-full',
          )}
          style={content}
          data-viewport-background={background ?? 'transparent'}
        >
          <canvas
            ref={canvasRef}
            aria-label={canvasLabel}
            {...canvasProps}
            className="block size-full cursor-grab touch-none outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset active:cursor-grabbing"
          />
          {busy ? (
            <div
              role="status"
              className={cn(
                'absolute inset-0 flex flex-col items-center justify-center gap-2 bg-overlay text-sm text-fg backdrop-blur-[2px]',
                busyDelay > 0 && 'animate-[tk-fade-in_150ms_var(--ease-out)_both]',
              )}
              style={busyDelay > 0 ? { animationDelay: `${busyDelay}ms` } : undefined}
              data-testid="viewport-busy"
            >
              <Loader2 aria-hidden className="size-7 animate-spin text-accent" />
              <span className="rounded-sm bg-surface px-2 py-1">{busy}</span>
            </div>
          ) : null}
        </div>
        {overlay ? (
          <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col items-center gap-2 [&>*]:pointer-events-auto">
            {overlay}
          </div>
        ) : null}
        {immersive ? (
          <Button
            variant="primary"
            size="lg"
            icon={<Minimize2 />}
            onClick={onExitImmersive}
            className="shrink-0 shadow-2"
          >
            {exitLabel}
          </Button>
        ) : null}
      </section>
      {footer && !immersive ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
