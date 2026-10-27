/**
 * 選項的縮圖（ThumbChoice 用）：世界觀預設（預設的背景＋框）、外框形狀、四角裝飾、質感、翻頁游標。
 * 縮圖是「目前的設定換成這個選項」的樣子。
 */
import { BASE_W } from './layout';
import type { CornerStyle, CursorShape, Design, Ornament, Preset, Texture } from './model';
import { palette } from './palette';
import { type Ctx, drawCursor, drawFrame } from './render';
import { drawScene } from './scenes';

export const THUMB_W = 200;
export const THUMB_H = 120;

const env = { scale: 1 };

export function drawPresetThumb(ctx: Ctx, p: Preset): void {
  ctx.save();
  const k = THUMB_W / BASE_W;
  ctx.scale(k, k);
  drawScene(ctx, p.scene);
  ctx.restore();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  drawFrame(
    ctx,
    {
      x: 18,
      y: 22,
      w: THUMB_W - 36,
      h: THUMB_H - 44,
      design: { ...p.design, ornamentScale: Math.min(p.design.ornamentScale, 90) },
      label: '字 Aa',
      fontSize: 24,
    },
    env,
  );
}

/** 只換一個欄位畫一個框 */
function frameWith(ctx: Ctx, design: Design, patch: Partial<Design>, label?: string) {
  drawFrame(
    ctx,
    {
      x: 22,
      y: 22,
      w: THUMB_W - 44,
      h: THUMB_H - 44,
      design: { ...design, ...patch },
      label,
      fontSize: 22,
    },
    env,
  );
}

export const drawCornerThumb = (ctx: Ctx, d: Design, v: CornerStyle) =>
  frameWith(ctx, d, { corner: v, ornament: 'none', cornerSize: Math.max(d.cornerSize, 18) });

export const drawOrnamentThumb = (ctx: Ctx, d: Design, v: Ornament) =>
  frameWith(ctx, d, { ornament: v, ornamentScale: Math.max(d.ornamentScale, 100) });

export const drawTextureThumb = (ctx: Ctx, d: Design, v: Texture) =>
  frameWith(ctx, d, {
    texture: v,
    textureAlpha: Math.max(d.textureAlpha, 35),
    ornament: 'none',
    innerOffset: 0,
  });

export function drawCursorThumb(ctx: Ctx, d: Design, v: CursorShape): void {
  const pal = palette(d);
  ctx.save();
  ctx.fillStyle = pal.panelMid;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  ctx.translate(THUMB_W / 2, THUMB_H / 2);
  ctx.scale(2.2, 2.2);
  drawCursor(ctx, { ...d, cursor: v }, 0, 0);
  ctx.restore();
}
