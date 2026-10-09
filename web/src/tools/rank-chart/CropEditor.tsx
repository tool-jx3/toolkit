/**
 * 角色照片的正方形裁切（規格 F26）：共用的裁切對話框（比例固定 1:1、範圍只能在照片裡）＋裁切結果的預覽。
 * 範圍換成「放大＋位置」存起來（放大 1～4：範圍最小是短邊的 1/4），套用時做成 512 × 512 的裁切圖。
 */
import { useEffect, useRef } from 'react';
import { CropDialog, type CropRect } from '@/ui';
import { drawThumb } from './images';
import { type Crop, cropRect, type PhotoRef, rectToCrop } from './model';
import { S } from './strings';

export interface CropTarget {
  charId: string;
  name: string;
  photo: PhotoRef;
  bitmap: ImageBitmap;
  crop: Crop;
}

function Preview({ target, rect }: { target: CropTarget; rect: CropRect }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const crop = rectToCrop(target.photo, rect);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.drawImage(drawThumb(target.bitmap, target.photo, crop), 0, 0, c.width, c.height);
  }, [target, rect]);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-fg">{S.cropPreview}</span>
        <canvas
          ref={ref}
          width={160}
          height={160}
          className="block rounded-md border border-border"
          data-testid="crop-preview"
        />
      </div>
      <p className="m-0 max-w-60 text-xs text-muted">{S.cropHint}</p>
    </div>
  );
}

const roundRect = (r: CropRect): CropRect => ({
  x: Math.round(r.x),
  y: Math.round(r.y),
  width: Math.round(r.width),
  height: Math.round(r.height),
});

export function CropEditor({
  target,
  onClose,
  onApply,
}: {
  target: CropTarget | null;
  onClose: () => void;
  onApply: (target: CropTarget, crop: Crop) => void;
}) {
  const short = target ? Math.min(target.photo.width, target.photo.height) : 1;
  return (
    <CropDialog
      open={!!target}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      image={target?.bitmap ?? null}
      title={target ? S.cropTitle(target.name) : ''}
      aspect={1}
      initialRect={target ? roundRect(cropRect(target.photo, target.crop)) : undefined}
      minSize={Math.max(1, Math.ceil(short / 4))}
      confirmLabel={S.cropApply}
      onConfirm={(rect) => {
        if (target) onApply(target, rectToCrop(target.photo, rect));
      }}
      renderPreview={(rect) => (target ? <Preview target={target} rect={rect} /> : null)}
    />
  );
}
