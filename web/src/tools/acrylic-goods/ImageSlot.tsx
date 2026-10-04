/**
 * 一張圖的欄位：縮圖、名稱與尺寸、拖放或選檔（換一張）、移除。
 */
import { ImageMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { FileDrop, IconButton, ThumbnailImage } from '@/ui';
import { addImage, notify } from './actions';
import { DEMO_PREFIX, isDemoImage } from './demo';
import { loadImageInfo, useImages } from './media';
import { S } from './strings';

export const IMAGE_ACCEPT = 'image/png,image/webp,image/gif,image/jpeg,image/avif,image/bmp';

/** 圖片的顯示名稱 */
export function imageLabel(id: string | null): string {
  if (!id) return S.image.empty;
  if (isDemoImage(id)) return S.demoLabels[id.slice(DEMO_PREFIX.length)] ?? id;
  return '';
}

export function ImageSlot({
  id,
  onChange,
  removable = false,
  label,
  disabled,
}: {
  id: string | null;
  onChange: (id: string | null) => void;
  /** 可以移除（可省略的圖） */
  removable?: boolean;
  /** 欄位名稱（選檔按鈕、移除按鈕的說明） */
  label: string;
  disabled?: boolean;
}) {
  const entry = useImages((s) => (id ? s.images[id] : undefined));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (id) void loadImageInfo(id).catch(() => {});
  }, [id]);
  const info = entry && entry !== 'loading' && entry !== 'error' ? entry : null;
  const meta = !id
    ? S.image.empty
    : entry === 'error'
      ? S.image.missing
      : info
        ? `${imageLabel(id) ? `${imageLabel(id)} · ` : ''}${info.width} × ${info.height}`
        : S.image.loading;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-image-slot={label}>
      <div className="flex min-w-0 items-center gap-2">
        <div className="checker flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border">
          {info ? <ThumbnailImage source={info.canvas} /> : null}
        </div>
        <span
          className={`min-w-0 flex-1 truncate text-xs ${entry === 'error' ? 'text-danger' : 'text-muted'}`}
          data-testid="image-meta"
        >
          {meta}
        </span>
        {removable && id ? (
          <IconButton
            label={`${label}：${S.image.remove}`}
            icon={<ImageMinus />}
            size="sm"
            variant="ghost"
            onClick={() => onChange(null)}
            disabled={disabled}
          />
        ) : null}
      </div>
      <FileDrop
        compact
        paste="off"
        accept={IMAGE_ACCEPT}
        label={S.image.drop}
        hint={S.image.dropHint}
        buttonLabel={id ? S.image.replace : S.image.pick}
        aria-label={label}
        disabled={disabled || busy}
        onFiles={async ([file]) => {
          if (!file) return;
          setBusy(true);
          try {
            const next = await addImage(file);
            if (next) onChange(next);
          } finally {
            setBusy(false);
          }
        }}
        onReject={([file]) => {
          if (file) notify({ title: S.image.notImage(file.name || '檔案'), tone: 'danger' });
        }}
      />
    </div>
  );
}
