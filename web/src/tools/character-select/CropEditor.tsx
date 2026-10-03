/**
 * 角色的裁切視窗（規格 F28、F29、3.9）：共用的裁切對話框＋「套用到這個角色／所有角色」＋依格子比例的預覽。
 * 範圍以原圖的比例存（0～1）；選整張圖時等於清除範圍。
 */
import { useEffect, useMemo, useRef } from 'react';
import type { CropRect } from '@/ui';
import { CropDialog } from '@/ui';
import { applyCrop, imageOf } from './actions';
import { mainPanelRects, tileRects } from './layout';
import type { NormCrop } from './model';
import { drawCropped } from './render';
import { useSession, useSettings } from './store';
import { S } from './strings';

export interface CropTarget {
  characterId: string;
  target: 'main' | 'list';
}

/** 原圖座標 → 比例；整張圖時 null */
export function toNormCrop(rect: CropRect, w: number, h: number): NormCrop | null {
  const crop = { x: rect.x / w, y: rect.y / h, width: rect.width / w, height: rect.height / h };
  const whole = rect.x <= 0 && rect.y <= 0 && rect.width >= w && rect.height >= h;
  return whole ? null : crop;
}

function Preview({
  image,
  rect,
  aspect,
  fit,
  hint,
}: {
  image: ImageBitmap;
  rect: CropRect;
  aspect: number;
  fit: 'cover' | 'contain';
  hint: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.round(240 * Math.min(1, aspect));
  const h = Math.round(240 / Math.max(1, aspect));
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const crop = toNormCrop(rect, image.width, image.height);
    drawCropped(ctx, image, { x: 0, y: 0, width: c.width, height: c.height }, crop, fit);
  }, [image, rect, fit]);
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-fg">{S.crop.preview}</span>
        <canvas
          ref={ref}
          width={w}
          height={h}
          className="checker block rounded-sm border border-border"
          data-testid="crop-preview"
        />
      </div>
      <p className="m-0 max-w-60 text-xs text-muted">{hint}</p>
    </div>
  );
}

export function CropEditor({ value, onClose }: { value: CropTarget | null; onClose: () => void }) {
  const s = useSettings((st) => st.data);
  useSession((st) => st.images);
  const character = value ? s.characters.find((c) => c.id === value.characterId) : undefined;
  const image = character ? imageOf(character.image) : null;
  const isMain = value?.target === 'main';
  /* 比例：第一個大格（沒有大主格時以畫布比例代替）或第一個格子 */
  const aspect = useMemo(() => {
    const r = isMain ? mainPanelRects(s)[0] : tileRects(s)[0];
    if (r) return r.width / r.height;
    return isMain ? s.layout.width / Math.max(1, s.layout.height) : 1;
  }, [s, isMain]);
  const crop = character ? (isMain ? character.mainCrop : character.listCrop) : null;
  const initialRect =
    image && crop
      ? {
          x: Math.round(crop.x * image.width),
          y: Math.round(crop.y * image.height),
          width: Math.round(crop.width * image.width),
          height: Math.round(crop.height * image.height),
        }
      : image
        ? { x: 0, y: 0, width: image.width, height: image.height }
        : undefined;
  const apply = (rect: CropRect, all: boolean) => {
    if (!value || !image) return;
    applyCrop(value.characterId, value.target, toNormCrop(rect, image.width, image.height), all);
  };
  const fit = isMain ? s.mainPanel.fit : s.layout.fit;
  const label = isMain ? S.crop.labelMain : S.crop.labelList;
  return (
    <CropDialog
      open={!!value && !!image}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      image={image}
      title={
        character
          ? isMain
            ? S.crop.titleMain(character.name)
            : S.crop.titleList(character.name)
          : ''
      }
      aspectOptions={[
        { label: S.crop.free, value: null },
        { label: isMain ? S.crop.fitMain : S.crop.fitList, value: aspect },
      ]}
      initialRect={initialRect}
      minSize={8}
      confirmLabel={S.crop.applyOne}
      secondaryConfirm={{ label: S.crop.applyAll, onConfirm: (r) => apply(r, true) }}
      onConfirm={(r) => apply(r, false)}
      renderPreview={(rect) =>
        image ? (
          <Preview
            image={image}
            rect={rect}
            aspect={aspect}
            fit={fit}
            hint={`${S.crop.previewHint(label)}${isMain ? '' : S.crop.listNote}`}
          />
        ) : null
      }
    />
  );
}
