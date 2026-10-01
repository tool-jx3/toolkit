/**
 * 縮圖清單：批次處理圖片的工具（立繪工作台等）列出已載入的圖片。
 * - 縮圖：圖片範圍內的透明處以棋盤格顯示（看得出左右補的透明邊）；來源可以是圖片網址或可畫的影像（處理結果的 canvas、ImageBitmap）；還沒有來源時顯示讀取中的佔位。
 * - 名稱：過長時省略，滑過可看全名；可加狀態標記（例如「已處理」）與補充說明（尺寸、大小）。
 * - 每張可以移除。
 */
import { CheckCircle2, ImageOff, X, XCircle } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { IconButton } from './Button';
import { cn } from './cn';

export type ThumbnailSource = string | ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

export interface ThumbnailItem {
  id: string;
  /** 名稱（通常是檔名） */
  name: string;
  /** 縮圖來源：網址（blob:、data:…）或可畫的影像；null／undefined 顯示讀取中的佔位 */
  image?: ThumbnailSource | null;
  /** 名稱下方的補充說明（尺寸、檔案大小…） */
  meta?: ReactNode;
  /** 名稱旁的狀態標記 */
  status?: 'done' | 'error';
  /** 狀態標記的文字（預設「完成」／「錯誤」） */
  statusLabel?: string;
}

export interface ThumbnailListProps {
  items: readonly ThumbnailItem[];
  /** 清單的無障礙名稱，例如「已載入的立繪」 */
  'aria-label': string;
  /** 有給才顯示移除按鈕 */
  onRemove?: (id: string) => void;
  /** 移除按鈕的名稱（預設「移除「<名稱>」」） */
  removeLabel?: (item: ThumbnailItem) => string;
  removeDisabled?: boolean;
  /** 沒有項目時顯示的內容 */
  empty?: ReactNode;
  /** 縮圖的最小寬度（px，預設 120；格線會依寬度自動排列） */
  minItemWidth?: number;
  className?: string;
}

/** 讀取中／讀不到的佔位 */
function Placeholder({ broken }: { broken?: boolean }) {
  return (
    <div
      className={cn(
        'flex size-full items-center justify-center text-muted [&_svg]:size-6',
        !broken && 'animate-pulse bg-surface-3',
      )}
      data-placeholder=""
    >
      {broken ? <ImageOff aria-hidden /> : null}
    </div>
  );
}

/** 把可畫的影像縮小畫到自己的 canvas（不超過 2 倍顯示大小，省記憶體） */
function DrawnThumb({ source }: { source: Exclude<ThumbnailSource, string> }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const k = Math.min(1, 320 / Math.max(source.width, source.height, 1));
    c.width = Math.max(1, Math.round(source.width * k));
    c.height = Math.max(1, Math.round(source.height * k));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(source, 0, 0, c.width, c.height);
  }, [source]);
  return (
    <canvas
      ref={ref}
      data-width={source.width}
      data-height={source.height}
      className="checker block max-h-full max-w-full"
    />
  );
}

function UrlThumb({ src }: { src: string }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return (
    <>
      {state !== 'ready' ? <Placeholder broken={state === 'error'} /> : null}
      <img
        src={src}
        alt=""
        decoding="async"
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
        className={cn(
          'checker block max-h-full max-w-full object-contain',
          state !== 'ready' && 'hidden',
        )}
      />
    </>
  );
}

export function ThumbnailList({
  items,
  onRemove,
  removeLabel = (item) => `移除「${item.name}」`,
  removeDisabled,
  empty,
  minItemWidth = 120,
  className,
  ...rest
}: ThumbnailListProps) {
  if (!items.length) {
    return empty ? (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        {empty}
      </div>
    ) : null;
  }
  return (
    <ul
      aria-label={rest['aria-label']}
      className={cn('m-0 grid list-none gap-2 p-0', className)}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(min(${minItemWidth}px, 100%), 1fr))`,
      }}
    >
      {items.map((item) => (
        <li
          key={item.id}
          data-status={item.status}
          className={cn(
            'relative flex min-w-0 flex-col gap-1 rounded-md border bg-surface p-1.5',
            item.status === 'done'
              ? 'border-success'
              : item.status === 'error'
                ? 'border-danger'
                : 'border-border',
          )}
        >
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-sm bg-surface-2">
            {!item.image ? (
              <Placeholder />
            ) : typeof item.image === 'string' ? (
              /* key：換來源時重新顯示佔位 */
              <UrlThumb key={item.image} src={item.image} />
            ) : (
              <DrawnThumb source={item.image} />
            )}
          </div>
          <div className="flex min-w-0 items-center gap-1">
            {item.status ? (
              <span
                className={cn(
                  'inline-flex shrink-0 items-center gap-0.5 text-xs font-medium [&_svg]:size-3.5',
                  item.status === 'done' ? 'text-success' : 'text-danger',
                )}
              >
                {item.status === 'done' ? <CheckCircle2 aria-hidden /> : <XCircle aria-hidden />}
                {item.statusLabel ?? (item.status === 'done' ? '完成' : '錯誤')}
              </span>
            ) : null}
            <span className="min-w-0 truncate text-xs text-fg" title={item.name}>
              {item.name}
            </span>
          </div>
          {item.meta ? <div className="truncate text-xs text-muted">{item.meta}</div> : null}
          {onRemove ? (
            <IconButton
              size="sm"
              variant="secondary"
              label={removeLabel(item)}
              icon={<X />}
              disabled={removeDisabled}
              onClick={() => onRemove(item.id)}
              className="absolute top-2.5 right-2.5 bg-surface/90 shadow-1"
            />
          ) : null}
        </li>
      ))}
    </ul>
  );
}
