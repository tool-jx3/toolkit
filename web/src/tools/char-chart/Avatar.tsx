/**
 * 關係圖的頭像範圍（2026-10，規格 F78～F80）：選取的角色面板上的圓形小預覽，以及調整範圍的對話框
 * （共用的 ImageFrameDialog：1:1、蓋滿、圓形——圓以外變暗、沿著圓畫虛線）。從角色清單（關係圖時每列的按鈕）或
 * 選取的角色面板打開；套用時存位置（一步復原），換圖片時回到置中。
 */
import { useEffect, useRef } from 'react';
import { DEFAULT_PLACEMENT, drawPlacedCrop, type FramePlacement } from '@/core/image';
import { ImageFrameDialog } from '@/ui';
import { AVATAR_MAX_ZOOM, type Character, REL } from './model';
import { closeAvatar, setAvatar, useChart, usePrefs, useUi } from './store';
import { S } from './strings';

type Bitmaps = ReadonlyMap<string, ImageBitmap>;

/** 測試與說明用：位置的文字（置中時 center） */
export const avatarKey = (p: FramePlacement | null): string =>
  p ? `${p.zoom.toFixed(3)},${p.x.toFixed(4)},${p.y.toFixed(4)},${p.turns}` : 'center';

/** 圓形的小預覽（和關係圖上的頭像同一種取法） */
export function AvatarPreview({
  c,
  bitmap,
  size = 56,
}: {
  c: Character;
  bitmap: ImageBitmap;
  size?: number;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx || !c.image) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.round(size * dpr);
    el.width = px;
    el.height = px;
    ctx.clearRect(0, 0, px, px);
    ctx.save();
    ctx.beginPath();
    ctx.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
    ctx.clip();
    drawPlacedCrop(
      ctx,
      bitmap,
      c.image,
      { x: 0, y: 0, width: px, height: px },
      c.avatar ?? DEFAULT_PLACEMENT,
    );
    ctx.restore();
  }, [c.image, c.avatar, bitmap, size]);
  return (
    <canvas
      ref={canvas}
      aria-hidden
      className="shrink-0 rounded-full border border-border-strong bg-surface-2"
      style={{ width: size, height: size }}
      data-testid="avatar-preview"
      data-avatar={avatarKey(c.avatar)}
    />
  );
}

/** 調整頭像範圍的對話框（useUi.avatarFor 的角色；圖片讀不到、角色不見時關掉） */
export function AvatarDialog({ bitmaps }: { bitmaps: Bitmaps }) {
  const id = useUi((s) => s.avatarFor);
  const c = useChart((s) => (id ? s.data.characters.find((x) => x.id === id) : undefined));
  const scale = usePrefs((s) => s.data.scale);
  const bitmap = c?.image ? (bitmaps.get(c.image.id) ?? null) : null;
  const ready = !!(c?.image && bitmap);
  useEffect(() => {
    if (id && !ready) closeAvatar();
  }, [id, ready]);
  const out = REL.nodeRadius * 2 * scale;
  return (
    <ImageFrameDialog
      open={ready}
      onOpenChange={(o) => {
        if (!o) closeAvatar();
      }}
      image={bitmap}
      aspect={1}
      output={{ width: out, height: out }}
      cover={{ maxZoom: AVATAR_MAX_ZOOM }}
      shape="circle"
      outline="shape"
      initialPlacement={c?.avatar ?? null}
      title={S.avatarTitle(c?.name || S.noName)}
      note={S.avatarNote}
      onApply={(p) => {
        if (c) setAvatar(c.id, p);
      }}
    />
  );
}
