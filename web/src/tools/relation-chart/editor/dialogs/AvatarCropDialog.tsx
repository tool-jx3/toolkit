/**
 * 頭像的調整範圍（共用的 ImageFrameDialog：1:1、蓋滿；圓形頭像時圓以外變暗並沿著圓畫虛線）。
 * 套用後依位置重做 256 × 256 的頭像並記住位置（下次打開還原）。
 */
import { useEffect, useState } from 'react';
import { ImageFrameDialog, useToast } from '@/ui';
import { charIsSquare, displayName, sheetCtx } from '../../engine/geom';
import { updateChar } from '../../state/actions';
import { AVATAR_SIZE, renderAvatar } from '../../state/images';
import { activeSheet, assets, setUi, useUi } from '../../state/store';
import { S } from '../../strings';

export function AvatarCropDialog() {
  const open = useUi((u) => u.dialog === 'crop');
  const cropFor = useUi((u) => u.cropFor);
  const toast = useToast();
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const c =
    open && cropFor !== null ? activeSheet().chars.find((x) => x.id === cropFor) : undefined;
  const src = c?.avatar?.src ?? null;
  useEffect(() => {
    let alive = true;
    setBmp(null);
    if (!src) return;
    void assets.bitmap(src).then((b) => {
      if (alive) setBmp(b ?? null);
    });
    return () => {
      alive = false;
    };
  }, [src]);
  const close = () => setUi({ dialog: null, cropFor: null });
  if (!c || !src) return null;
  const square = charIsSquare(sheetCtx(activeSheet()), c);
  return (
    <ImageFrameDialog
      open={open && !!bmp}
      onOpenChange={(o) => {
        if (!o) close();
      }}
      image={bmp}
      aspect={1}
      output={{ width: AVATAR_SIZE, height: AVATAR_SIZE }}
      cover={{ maxZoom: 4 }}
      shape={square ? 'rect' : 'circle'}
      outline="shape"
      initialPlacement={c.avatar?.place ?? null}
      title={`${S.char.crop}：${displayName(c)}`}
      onApply={(place) => {
        const id = c.id;
        void renderAvatar(src, place)
          .then((img) => {
            updateChar(id, (d) => {
              if (d.avatar && d.avatar.src === src) d.avatar = { img, src, place };
            });
          })
          .catch(() => toast({ title: S.char.imageFail, tone: 'danger' }));
        close();
      }}
    />
  );
}
