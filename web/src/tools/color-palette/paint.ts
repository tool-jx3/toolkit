/**
 * 色票櫃、色碼表共用的小畫法（canvas）：圓形頭像（沒有立繪時畫本站自己的剪影）、
 * 色塊（一色、兩色以上分格、「無」畫成透明的格子）、圓角矩形。
 */
import { DEFAULT_PLACEMENT, drawPlacedCrop, roundRectPath } from '@/core/image';
import { type PartColor, realColors, roleColors } from './characters';
import type { Bar } from './logic';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 「無」的透明格子（兩種灰） */
export const CHECKER = ['#d6d6d6', '#f5f5f5'] as const;

export function fillChecker(ctx: Ctx2D, x: number, y: number, w: number, h: number, cell = 6) {
  ctx.save();
  ctx.fillStyle = CHECKER[1];
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = CHECKER[0];
  for (let yy = 0, r = 0; yy < h; yy += cell, r++)
    for (let xx = r % 2 ? cell : 0; xx < w; xx += cell * 2)
      ctx.fillRect(x + xx, y + yy, Math.min(cell, w - xx), Math.min(cell, h - yy));
  ctx.restore();
}

/** 圓形或圓角方形的路徑 */
function shapePath(ctx: Ctx2D, x: number, y: number, size: number, radius: number | null) {
  ctx.beginPath();
  if (radius == null) ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  else roundRectPath(ctx, x, y, size, size, radius);
  ctx.closePath();
}

/**
 * 色塊：一色塗滿；兩色以上直向分成等寬的幾格（左到右依順序）；「無」的那一格畫透明格子。
 * radius 為 null 時畫圓。沒有顏色時畫虛線框（未指定）。
 */
export function drawSwatch(
  ctx: Ctx2D,
  x: number,
  y: number,
  size: number,
  colors: readonly PartColor[],
  radius: number | null = null,
) {
  ctx.save();
  if (!colors.length) {
    shapePath(
      ctx,
      x + 0.75,
      y + 0.75,
      size - 1.5,
      radius == null ? null : Math.max(0, radius - 0.75),
    );
    ctx.setLineDash([3, 3]);
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
    return;
  }
  shapePath(ctx, x, y, size, radius);
  ctx.clip();
  const band = size / colors.length;
  colors.forEach((c, k) => {
    const bx = x + k * band;
    const bw = k === colors.length - 1 ? size - k * band : Math.ceil(band);
    if (c.none) fillChecker(ctx, bx, y, bw, size, Math.max(3, size / 8));
    else {
      ctx.fillStyle = c.color;
      ctx.fillRect(bx, y, bw, size);
    }
  });
  ctx.restore();
  ctx.save();
  shapePath(ctx, x + 0.5, y + 0.5, size - 1, radius == null ? null : Math.max(0, radius - 0.5));
  ctx.strokeStyle = 'rgba(0,0,0,0.14)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * 沒有立繪時的剪影（本站自己畫的）：淺底、肩膀、臉；有髮色時頭髮塗髮色，有瞳色時畫兩個小點。
 * 範例角色的立繪也用同一個畫法畫大張的（samples.ts）。
 */
export function drawSilhouette(
  ctx: Ctx2D,
  x: number,
  y: number,
  w: number,
  h: number,
  look: {
    hair?: string | null;
    eye?: string | null;
    skin?: string | null;
    outfit?: string | null;
    back?: string | null;
  } = {},
) {
  const s = Math.min(w, h);
  const cx = x + w / 2;
  ctx.save();
  ctx.fillStyle = look.back ?? '#e8e5df';
  ctx.fillRect(x, y, w, h);
  const headR = s * 0.21;
  const headY = y + h * 0.42;
  /* 肩膀 */
  ctx.fillStyle = look.outfit ?? '#bdb7ad';
  ctx.beginPath();
  ctx.ellipse(cx, y + h * 1.02, s * 0.42, s * 0.36, 0, Math.PI, 0);
  ctx.fill();
  /* 脖子 */
  ctx.fillStyle = look.skin ?? '#d8d2c8';
  ctx.fillRect(cx - s * 0.07, headY + headR * 0.6, s * 0.14, s * 0.16);
  /* 後面的頭髮 */
  const hair = look.hair ?? '#a7a097';
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(cx, headY + headR * 0.15, headR * 1.18, headR * 1.3, 0, 0, Math.PI * 2);
  ctx.fill();
  /* 臉 */
  ctx.fillStyle = look.skin ?? '#d8d2c8';
  ctx.beginPath();
  ctx.ellipse(cx, headY + headR * 0.12, headR * 0.88, headR, 0, 0, Math.PI * 2);
  ctx.fill();
  /* 瀏海 */
  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(cx, headY - headR * 0.55, headR * 1.02, headR * 0.6, 0, Math.PI, 0);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx - headR * 1.02, headY - headR * 0.55);
  ctx.quadraticCurveTo(
    cx - headR * 0.2,
    headY - headR * 0.05,
    cx + headR * 0.35,
    headY - headR * 0.4,
  );
  ctx.quadraticCurveTo(
    cx + headR * 0.75,
    headY - headR * 0.1,
    cx + headR * 1.02,
    headY - headR * 0.55,
  );
  ctx.closePath();
  ctx.fill();
  /* 眼睛 */
  if (look.eye) {
    ctx.fillStyle = look.eye;
    for (const dx of [-0.36, 0.36]) {
      ctx.beginPath();
      ctx.ellipse(
        cx + headR * dx,
        headY + headR * 0.18,
        headR * 0.12,
        headR * 0.16,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  ctx.restore();
}

/** 剪影的顏色取自角色的部位（第一個真的有顏色的髮色、瞳色、膚色、服裝） */
export function lookOf(bar: Bar) {
  const first = (role: 'hair' | 'eye' | 'skin' | 'outfit') =>
    realColors(roleColors(bar, role))[0] ?? null;
  return { hair: first('hair'), eye: first('eye'), skin: first('skin'), outfit: first('outfit') };
}

/**
 * 圓形頭像：有立繪時依頭像範圍取圓裡的那一塊；沒有立繪（或還在讀）時畫剪影。外面描一圈細線。
 */
export function drawAvatar(
  ctx: Ctx2D,
  bar: Bar,
  bitmap: CanvasImageSource | null,
  x: number,
  y: number,
  d: number,
  ring = 'rgba(0,0,0,0.12)',
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2);
  ctx.clip();
  if (bitmap && bar.image) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, d, d);
    drawPlacedCrop(
      ctx,
      bitmap,
      bar.image,
      { x, y, width: d, height: d },
      bar.avatar ?? DEFAULT_PLACEMENT,
    );
  } else drawSilhouette(ctx, x, y, d, d, lookOf(bar));
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + d / 2, y + d / 2, d / 2 - 0.5, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** 字太長時截斷加「…」 */
export function fitText(ctx: Ctx2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxW) t = t.slice(0, -1);
  return `${t}…`;
}
