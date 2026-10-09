/**
 * 小元件：圖片的網址（資產庫的物件網址或網址的圖）、縮圖、圖片選單、拖放目標、各區塊的狀態訊息。
 */
import { ImagePlus } from 'lucide-react';
import { type DragEvent, type ReactNode, useEffect, useState } from 'react';
import { filesInMemory, pickFiles } from '@/core/files';
import { Button, cn, Notice, Select, ThumbnailImage } from '@/ui';
import { addFiles } from './actions';
import type { ShelfImage } from './model';
import { assets, markMissing, type StatusArea, useUi } from './store';
import { S } from './strings';

/** 圖片庫接受的檔案（選檔視窗用；實際依檔頭判斷） */
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/gif,image/webp';

/** 圖片的顯示網址：網址的圖是網址本身；檔案的圖是資產庫的物件網址（讀取中 null） */
export function useImageSrc(im: ShelfImage | null | undefined): {
  src: string | null;
  missing: boolean;
} {
  const asset = im?.kind === 'file' ? im.asset : null;
  const url = im?.kind === 'url' ? im.url : null;
  const missing = useUi((s) => (asset ? s.missing.has(asset) : false));
  const [src, setSrc] = useState<{ asset: string; url: string } | null>(null);
  useEffect(() => {
    /* 找不到內容時不讀；重新加入同一張圖（missing 變回 false）時再讀一次 */
    if (!asset || missing) return;
    let alive = true;
    assets
      .url(asset)
      .then((u) => {
        if (!alive) return;
        if (u) setSrc({ asset, url: u });
        else markMissing([asset], true);
      })
      .catch(() => alive && markMissing([asset], true));
    return () => {
      alive = false;
    };
  }, [asset, missing]);
  if (url) return { src: url, missing: false };
  if (!asset) return { src: null, missing: false };
  return { src: src?.asset === asset ? src.url : null, missing };
}

/** 縮圖（透明處棋盤格）；沒有圖時文字，找不到內容時警告色文字 */
export function Thumb({
  image,
  className,
  emptyText = S.noImage,
}: {
  image: ShelfImage | null | undefined;
  className?: string;
  emptyText?: string;
}) {
  const { src, missing } = useImageSrc(image);
  return (
    <div
      className={cn(
        'flex items-end justify-center overflow-hidden rounded-md border border-dashed border-border-strong bg-surface-2 text-center text-xs text-muted',
        className,
      )}
    >
      {!image ? (
        <span className="self-center px-1">{emptyText}</span>
      ) : missing ? (
        <span className="self-center px-1 text-warning">{S.imageMissing}</span>
      ) : (
        <ThumbnailImage source={src} />
      )}
    </div>
  );
}

const hasFiles = (e: DragEvent): boolean => Array.from(e.dataTransfer.types).includes('Files');

/** 拖放目標：放開的圖片先加進圖片庫，再把第一張的 id 交給 onImage */
export function useImageDrop(onImage: (id: string) => void, area: StatusArea) {
  const [over, setOver] = useState(false);
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      },
      onDragLeave: () => setOver(false),
      onDrop: (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files);
        void filesInMemory(files)
          .then((list) => addFiles(list, area))
          .then((ids) => {
            if (ids[0]) onImage(ids[0]);
          });
      },
    },
  };
}

/** 選一個檔案加進圖片庫，回傳 id（取消、格式不符時 null） */
export async function pickOneImage(area: StatusArea): Promise<string | null> {
  const files = await pickFiles({ accept: IMAGE_ACCEPT });
  if (!files.length) return null;
  const [id] = await addFiles(files, area);
  return id ?? null;
}

const NONE = '__none__';

/** 圖片庫的圖片選單（第一項是「沒有圖」或自訂的前置選項）＋「＋圖片」 */
export function ImageSelect({
  images,
  value,
  onChange,
  label,
  area,
  lead,
  className,
}: {
  images: readonly ShelfImage[];
  /** 圖片庫 id；null＝沒有圖 */
  value: string | null;
  onChange: (id: string | null) => void;
  /** 選單與按鈕的無障礙名稱 */
  label: string;
  area: StatusArea;
  /** 取代「沒有圖」的前置選項（例如「自動」「沒有圖」） */
  lead?: { value: string; label: string }[];
  className?: string;
}) {
  const leadOptions = lead ?? [{ value: NONE, label: S.noImage }];
  /* 選單的值：圖片庫有這張就是它；前置選項之一就是它；其他（圖已經刪掉）是第一個前置選項 */
  const current =
    value && (images.some((im) => im.id === value) || leadOptions.some((o) => o.value === value))
      ? value
      : leadOptions[0].value;
  const options = [
    ...leadOptions,
    ...images.map((im) => ({
      value: im.id,
      label: `${im.name || S.noName}${im.kind === 'url' ? S.urlSuffix : ''}`,
    })),
  ];
  return (
    <div className={cn('flex min-w-0 flex-wrap items-center gap-1.5', className)}>
      <Select
        aria-label={label}
        size="sm"
        className="min-w-0 flex-1 basis-32"
        value={current}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
        options={options}
      />
      <Button
        size="sm"
        icon={<ImagePlus />}
        aria-label={S.addImageFor(label)}
        onClick={async () => {
          const id = await pickOneImage(area);
          if (id) onChange(id);
        }}
      >
        {S.addImage}
      </Button>
    </div>
  );
}

/** 一個區塊的狀態訊息（沒有訊息時不顯示） */
export function StatusLine({ area, className }: { area: StatusArea; className?: string }) {
  const st = useUi((s) => s.status[area]);
  if (!st?.text) return null;
  return (
    <Notice tone={st.tone} className={className}>
      <span data-testid={`status-${area}`} data-tone={st.tone} key={st.seq}>
        {st.text}
      </span>
    </Notice>
  );
}

/** 小標籤（清單的標記） */
export function Badge({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'warn' | 'accent';
}) {
  return (
    <span
      className={cn(
        'ml-1 inline-block rounded-sm border px-1 text-xs leading-4 whitespace-nowrap',
        tone === 'warn' && 'border-warning text-warning',
        tone === 'accent' && 'border-accent text-accent',
        tone === 'muted' && 'border-border-strong text-muted',
      )}
    >
      {children}
    </span>
  );
}
