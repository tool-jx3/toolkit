/**
 * 一張圖的欄位：縮圖、名稱（示範圖的名稱或放進來的檔名，太長時省略、滑過顯示完整檔名）與尺寸、拖放或選檔（換一張）、移除。
 */
import { ImageMinus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn, FileDrop, IconButton, ThumbnailImage } from '@/ui';
import { addImage, notify } from './actions';
import { DEMO_PREFIX, isDemoImage } from './demo';
import { loadImageInfo, useImages } from './media';
import { withImageName } from './model';
import { edit, useSettings } from './store';
import { S } from './strings';

export const IMAGE_ACCEPT = 'image/png,image/webp,image/gif,image/jpeg,image/avif,image/bmp';

/** 圖片的顯示名稱：示範圖的名稱、放進來的圖的檔名（沒記到時「放進來的圖片」） */
export function imageLabel(id: string | null, fileName?: string): string {
  if (!id) return S.image.empty;
  if (isDemoImage(id)) return S.demoLabels[id.slice(DEMO_PREFIX.length)] ?? id;
  return fileName || S.image.unnamed;
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
  const fileName = useSettings((s) => (id ? s.data.names[id] : undefined));
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (id) void loadImageInfo(id).catch(() => {});
  }, [id]);
  const info = entry && entry !== 'loading' && entry !== 'error' ? entry : null;
  const name = imageLabel(id, fileName);
  const detail = !id
    ? null
    : entry === 'error'
      ? S.image.missing
      : info
        ? `${info.width} × ${info.height}`
        : S.image.loading;
  return (
    <div className="flex min-w-0 flex-col gap-2" data-image-slot={label}>
      <div className="flex min-w-0 items-center gap-2">
        <div className="checker flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-border">
          {info ? <ThumbnailImage source={info.canvas} /> : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col text-xs" data-testid="image-meta">
          <span
            className={cn('truncate', id ? 'text-fg' : 'text-muted')}
            title={id ? name : undefined}
            data-testid="image-name"
          >
            {name}
          </span>
          {detail ? (
            <span
              className={cn('tabular-nums', entry === 'error' ? 'text-danger' : 'text-muted')}
              data-testid={info ? 'image-size' : 'image-status'}
            >
              {detail}
            </span>
          ) : null}
        </div>
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
            if (next) {
              /* 記下檔名與換圖算同一步復原 */
              const outer = useSettings.inGesture();
              useSettings.beginGesture();
              try {
                edit((d) => {
                  d.names = withImageName(d, next, file.name);
                });
                onChange(next);
              } finally {
                if (!outer) useSettings.endGesture();
              }
            }
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
