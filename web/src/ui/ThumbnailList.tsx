/**
 * 縮圖清單：批次處理圖片的工具（立繪工作台等）列出已載入的圖片。
 * - 縮圖：圖片範圍內的透明處以棋盤格顯示（看得出左右補的透明邊）；來源可以是圖片網址或可畫的影像（處理結果的 canvas、ImageBitmap）；還沒有來源時顯示讀取中的佔位。
 * - 名稱：過長時省略，滑過可看全名；可加狀態標記（例如「已處理」）與補充說明（尺寸、大小）。
 * - 每張可以移除。
 *
 * 選填（G3 加的，不給時行為不變）：
 * - `layout="list"`：一張一列（縮圖在左、名稱與欄位在右），`thumbSize` 縮圖邊長（預設 82）；`numbered` 名稱前加「序號.」。
 * - `selectedId`／`onSelect`：選取中的項目有醒目樣式；點一列、或聚焦到該列裡的欄位就選取；
 *   清單有焦點時 ↑／↓ 選取上一張／下一張（到頭或到尾就停）；選到的列只捲清單所在的捲動區讓它露出來，
 *   不讓整頁跟著捲（見 reveal.ts：捲動區本身有一部分在畫面外、只捲它不夠時，才把頁面捲最少的距離）。
 * - `onReorder(from, to)`：拖曳一列到另一列放開來排序（往下拖落在目標後、往上拖落在目標前；從欄位上開始拖不算）。
 * - `renderFields(item, index)`：每列自訂的欄位（例如差分名、輸出檔名）。
 *
 * G2 加的（選填，不給時行為不變）：
 * - `thumbAspect`（格線版面的縮圖寬高比，預設 1）、`thumbFit="cover"`（裁成填滿，例如 16:9 的轉場順序卡）；
 * - 格線版面的拖曳排序依指標所在的那一張決定目標（左右拖也可以；Alt＋←／→ 也能移動）。
 */
import { CheckCircle2, ImageOff, X, XCircle } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { IconButton } from './Button';
import { cn } from './cn';
import { revealInScroller } from './reveal';
import { isEditableTarget } from './shortcuts';
import { useSortable } from './useSortable';

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

export interface ThumbnailListProps<I extends ThumbnailItem = ThumbnailItem> {
  items: readonly I[];
  /** 清單的無障礙名稱，例如「已載入的立繪」 */
  'aria-label': string;
  /** 有給才顯示移除按鈕 */
  onRemove?: (id: string) => void;
  /** 移除按鈕的名稱（預設「移除「<名稱>」」） */
  removeLabel?: (item: I) => string;
  removeDisabled?: boolean;
  /** 沒有項目時顯示的內容 */
  empty?: ReactNode;
  /** 縮圖的最小寬度（px，預設 120；格線會依寬度自動排列） */
  minItemWidth?: number;
  className?: string;
  /** 'grid'（預設，自動排列的格線）或 'list'（一張一列） */
  layout?: 'grid' | 'list';
  /** list 版面的縮圖邊長（px，預設 82） */
  thumbSize?: number;
  /** 名稱前加「序號.」 */
  numbered?: boolean;
  /** 選取中的項目 */
  selectedId?: string | null;
  /** 給了就可以選取（點選、聚焦欄位、↑／↓） */
  onSelect?: (id: string) => void;
  /** 給了就可以拖曳排序 */
  onReorder?: (from: number, to: number) => void;
  /** 每列自訂的欄位 */
  renderFields?: (item: I, index: number) => ReactNode;
  /** 格線版面的縮圖寬高比（寬 ÷ 高，預設 1） */
  thumbAspect?: number;
  /** 縮圖的擺法：'contain'（預設，完整顯示）或 'cover'（裁切填滿） */
  thumbFit?: 'contain' | 'cover';
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
function DrawnThumb({
  source,
  fit = 'contain',
}: {
  source: Exclude<ThumbnailSource, string>;
  fit?: 'contain' | 'cover';
}) {
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
      className={cn(
        'checker block',
        fit === 'cover' ? 'size-full object-cover' : 'max-h-full max-w-full',
      )}
    />
  );
}

function UrlThumb({ src, fit = 'contain' }: { src: string; fit?: 'contain' | 'cover' }) {
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  return (
    <>
      {state !== 'ready' ? <Placeholder broken={state === 'error'} /> : null}
      <img
        src={src}
        alt=""
        decoding="async"
        draggable={false}
        onLoad={() => setState('ready')}
        onError={() => setState('error')}
        className={cn(
          'checker block',
          fit === 'cover' ? 'size-full object-cover' : 'max-h-full max-w-full object-contain',
          state !== 'ready' && 'hidden',
        )}
      />
    </>
  );
}

/**
 * 一張縮圖（等比縮進父元素、透明處棋盤格；網址讀不到時破圖圖示；沒有來源時讀取中）。
 * 父元素決定大小與對齊（例如 `flex items-end justify-center` 讓立繪底部對齊）。
 */
export function ThumbnailImage({
  source,
  fit,
}: {
  source?: ThumbnailSource | null;
  /** 'contain'（預設）或 'cover'（裁切填滿父元素） */
  fit?: 'contain' | 'cover';
}) {
  if (!source) return <Placeholder />;
  /* key：換來源時重新顯示佔位 */
  if (typeof source === 'string') return <UrlThumb key={source} src={source} fit={fit} />;
  return <DrawnThumb source={source} fit={fit} />;
}

export function ThumbnailList<I extends ThumbnailItem = ThumbnailItem>({
  items,
  onRemove,
  removeLabel = (item) => `移除「${item.name}」`,
  removeDisabled,
  empty,
  minItemWidth = 120,
  className,
  layout = 'grid',
  thumbSize = 82,
  numbered,
  selectedId,
  onSelect,
  onReorder,
  renderFields,
  thumbAspect,
  thumbFit,
  ...rest
}: ThumbnailListProps<I>) {
  const list = useRef<HTMLUListElement>(null);
  const selectable = !!onSelect;
  const sortable = useSortable({
    count: items.length,
    mode: 'drop',
    axis: layout === 'list' ? 'y' : 'xy',
    disabled: !onReorder,
    onMove: (from, to) => {
      onReorder?.(from, to);
      const it = items[from];
      if (it) onSelect?.(it.id);
    },
    onClick: (i) => {
      const it = items[i];
      if (!it || !selectable) return;
      onSelect?.(it.id);
      /* 點選一列後焦點移到清單上，可以直接用上下鍵 */
      if (!isEditableTarget(document.activeElement)) list.current?.focus({ preventScroll: true });
    },
  });

  if (!items.length) {
    return empty ? (
      <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted">
        {empty}
      </div>
    ) : null;
  }

  const current = selectable
    ? Math.max(
        0,
        items.findIndex((it) => it.id === selectedId),
      )
    : -1;
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (!selectable || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    if (isEditableTarget(e.target)) return;
    e.preventDefault();
    const to = Math.min(items.length - 1, Math.max(0, current + (e.key === 'ArrowUp' ? -1 : 1)));
    if (to === current) return;
    onSelect?.(items[to].id);
    /* 只捲清單所在的捲動區，不讓整頁跟著捲（revealInScroller） */
    const row = list.current?.querySelectorAll<HTMLElement>(':scope > li')[to];
    if (row) revealInScroller(row);
  };

  const isList = layout === 'list';
  return (
    <ul
      ref={list}
      aria-label={rest['aria-label']}
      tabIndex={selectable ? 0 : undefined}
      onKeyDown={selectable ? onKeyDown : undefined}
      className={cn(
        'm-0 list-none p-0',
        isList ? 'flex flex-col gap-1.5' : 'grid gap-2',
        selectable && 'rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus',
        sortable.dragIndex !== null && 'select-none',
        className,
      )}
      style={
        isList
          ? undefined
          : { gridTemplateColumns: `repeat(auto-fill, minmax(min(${minItemWidth}px, 100%), 1fr))` }
      }
    >
      {items.map((item, index) => {
        const selected = selectable && index === current;
        const dragging = sortable.dragIndex === index;
        const over = sortable.overIndex === index && !dragging && sortable.dragIndex !== null;
        const interactive = selectable || !!onReorder;
        return (
          <li
            key={item.id}
            {...(interactive ? sortable.rowProps(index) : {})}
            data-status={item.status}
            data-selected={selected || undefined}
            data-dragging={dragging || undefined}
            data-over={over || undefined}
            aria-current={selected || undefined}
            onFocusCapture={
              selectable
                ? (e) => {
                    if (e.target !== e.currentTarget && !selected) onSelect?.(item.id);
                  }
                : undefined
            }
            className={cn(
              'relative flex min-w-0 gap-1 rounded-md border p-1.5',
              isList ? 'flex-row items-start gap-2' : 'flex-col',
              /* cn 不會合併衝突的 class：選取中、狀態、一般三選一 */
              selected
                ? 'border-accent bg-accent-soft'
                : item.status === 'done'
                  ? 'border-success bg-surface'
                  : item.status === 'error'
                    ? 'border-danger bg-surface'
                    : 'border-border bg-surface',
              interactive && 'cursor-pointer',
              dragging && 'opacity-50',
              over && 'ring-2 ring-accent',
            )}
          >
            <div
              className={cn(
                'flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-2',
                !isList && !thumbAspect && 'aspect-square',
              )}
              style={
                isList
                  ? { width: thumbSize, height: thumbSize }
                  : thumbAspect
                    ? { aspectRatio: String(thumbAspect) }
                    : undefined
              }
            >
              <ThumbnailImage source={item.image} fit={thumbFit} />
            </div>
            <div className={cn('flex min-w-0 flex-col gap-1', isList && 'flex-1')}>
              <div className="flex min-w-0 items-center gap-1">
                {item.status ? (
                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-0.5 text-xs font-medium [&_svg]:size-3.5',
                      item.status === 'done' ? 'text-success' : 'text-danger',
                    )}
                  >
                    {item.status === 'done' ? (
                      <CheckCircle2 aria-hidden />
                    ) : (
                      <XCircle aria-hidden />
                    )}
                    {item.statusLabel ?? (item.status === 'done' ? '完成' : '錯誤')}
                  </span>
                ) : null}
                <span
                  className={cn('min-w-0 truncate text-xs text-fg', isList && onRemove && 'pr-8')}
                  title={item.name}
                >
                  {numbered ? `${index + 1}. ` : ''}
                  {item.name}
                </span>
              </div>
              {item.meta ? <div className="truncate text-xs text-muted">{item.meta}</div> : null}
              {renderFields ? renderFields(item, index) : null}
            </div>
            {onRemove ? (
              <IconButton
                size="sm"
                variant="secondary"
                label={removeLabel(item)}
                icon={<X />}
                disabled={removeDisabled}
                onClick={() => onRemove(item.id)}
                className={cn(
                  'absolute bg-surface/90 shadow-1',
                  isList ? 'top-1.5 right-1.5' : 'top-2.5 right-2.5',
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
