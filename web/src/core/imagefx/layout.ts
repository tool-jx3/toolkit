/**
 * 擺放：畫面大小、圖在畫面上的位置與縮放、出處的位置；原圖 px 與畫面 px 的換算；放大框彈出後的位置。
 */
import { clamp } from '@/core/timeline';
import {
  type CanvasPreset,
  type CreditSize,
  clampRect,
  type FxDoc,
  LIMITS,
  type Point,
  type Rect,
  type Size,
  type ZoomFrameBase,
} from './types';

export const PRESET_SIZE: Record<Exclude<CanvasPreset, 'original'>, Size> = {
  '1920x1080': { width: 1920, height: 1080 },
  '1080x1920': { width: 1080, height: 1920 },
  '1200x900': { width: 1200, height: 900 },
};
/** 原圖大小時的長邊上限（太大的圖等比縮小；自訂） */
export const ORIGINAL_MAX_SIDE = 4096;
/** 還沒有圖時「原圖大小」用的大小 */
export const FALLBACK_SIZE: Size = { width: 1920, height: 1080 };

/** 畫面大小 */
export function canvasSize(preset: CanvasPreset, image: Size | null): Size {
  if (preset !== 'original') return PRESET_SIZE[preset];
  if (!image || !(image.width > 0) || !(image.height > 0)) return FALLBACK_SIZE;
  const k = Math.min(1, ORIGINAL_MAX_SIDE / Math.max(image.width, image.height));
  return {
    width: Math.max(1, Math.round(image.width * k)),
    height: Math.max(1, Math.round(image.height * k)),
  };
}

/** 影片要偶數的寬高（往下取偶數，至少 2） */
export const evenSize = (s: Size): Size => ({
  width: Math.max(2, s.width - (s.width % 2)),
  height: Math.max(2, s.height - (s.height % 2)),
});

/** 介面比例：短邊 1080 為 1（線寬、邊框、出處字級都乘這個；自訂） */
export const unitOf = (canvas: Size): number => Math.min(canvas.width, canvas.height) / 1080;

/** 圖在畫面上的範圍（畫面 px）與縮放（畫面 px ÷ 原圖 px） */
export interface Placement extends Rect {
  f: number;
}

/** 出處的字級（畫面 px；小中大＝短邊 1080 時 20、26、34，自訂） */
export const CREDIT_PX: Record<CreditSize, number> = { sm: 20, md: 26, lg: 34 };
export const creditPx = (size: CreditSize, canvas: Size): number =>
  Math.max(10, Math.round(CREDIT_PX[size] * unitOf(canvas)));

export interface CreditLayout {
  px: number;
  /** 文字的基準點 */
  x: number;
  y: number;
  align: 'left' | 'center' | 'right';
}

export interface Layout {
  canvas: Size;
  shot: Placement;
  credit: CreditLayout | null;
}

/**
 * 圖：等比放進「畫面 × 比例」的範圍、置中（小圖也放大）。出處在圖下時，圖與出處一起置中（先扣掉一行字的高度）；
 * 在畫面底時放在畫面底部中央；圖內徽章在圖的右下角（字的右下角，徽章的底另外畫）。
 */
export function computeLayout(
  s: Pick<FxDoc, 'canvas' | 'credit' | 'shot'>,
  image: Size | null,
): Layout {
  const canvas = canvasSize(s.canvas, image);
  const src = image && image.width > 0 && image.height > 0 ? image : canvas;
  const hasCredit = s.credit.text.trim() !== '';
  const px = creditPx(s.credit.size, canvas);
  const boxW = (canvas.width * s.shot.scale) / 100;
  const boxH = (canvas.height * s.shot.scale) / 100;
  const reserve = hasCredit && s.credit.pos === 'below' ? Math.round(px * 1.9) : 0;
  const f = Math.min(boxW / src.width, Math.max(1, boxH - reserve) / src.height);
  const w = src.width * f;
  const h = src.height * f;
  const x = (canvas.width - w) / 2;
  const y = (canvas.height - h - reserve) / 2;
  const shot = { x, y, w, h, f };
  let credit: CreditLayout | null = null;
  if (hasCredit) {
    const u = unitOf(canvas);
    if (s.credit.pos === 'below')
      credit = { px, x: x + w, y: y + h + Math.round(px * 1.45), align: 'right' };
    else if (s.credit.pos === 'bottom')
      credit = {
        px,
        x: canvas.width / 2,
        y: canvas.height - Math.max(px * 0.8, 28 * u),
        align: 'center',
      };
    else {
      const pad = Math.round(px * 0.9);
      credit = { px, x: x + w - pad, y: y + h - pad, align: 'right' };
    }
  }
  return { canvas, shot, credit };
}

/** 原圖範圍 → 畫面範圍 */
export const toCanvasRect = (p: Placement, r: Rect): Rect => ({
  x: p.x + r.x * p.f,
  y: p.y + r.y * p.f,
  w: r.w * p.f,
  h: r.h * p.f,
});

/** 畫面範圍 → 原圖範圍（未取整、未夾範圍） */
export const toSourceRect = (p: Placement, r: Rect): Rect => ({
  x: (r.x - p.x) / p.f,
  y: (r.y - p.y) / p.f,
  w: r.w / p.f,
  h: r.h / p.f,
});

/** 畫面上的一點 → 原圖上的一點（夾在圖裡） */
export function toSourcePoint(p: Placement, image: Size, x: number, y: number): Point {
  return {
    x: clamp((x - p.x) / p.f, 0, image.width),
    y: clamp((y - p.y) / p.f, 0, image.height),
  };
}

/** 拖曳畫出的範圍（原圖 px）；太小（任一邊小於 minSize）時 null＝當成點一下 */
export function rectFromDrag(a: Point, b: Point, image: Size): Rect | null {
  const x0 = clamp(Math.min(a.x, b.x), 0, image.width);
  const y0 = clamp(Math.min(a.y, b.y), 0, image.height);
  const x1 = clamp(Math.max(a.x, b.x), 0, image.width);
  const y1 = clamp(Math.max(a.y, b.y), 0, image.height);
  if (x1 - x0 < LIMITS.minSize || y1 - y0 < LIMITS.minSize) return null;
  return clampRect({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, image);
}

/** 兩個範圍有沒有重疊（邊相接不算） */
export const intersects = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** 範圍的一段（沿方向，比例 a～b） */
export function spanRect(r: Rect, dir: 'h' | 'v', a: number, b: number): Rect {
  if (dir === 'h') return { x: r.x + r.w * a, y: r.y, w: r.w * Math.max(0, b - a), h: r.h };
  return { x: r.x, y: r.y + r.h * a, w: r.w, h: r.h * Math.max(0, b - a) };
}

/**
 * 放大框彈出後在畫面上的範圍：以框的中心放大 k 倍，超出畫面時推回來（留 margin；比畫面還大時置中）。
 */
export function cardRect(src: Rect, shot: Placement, canvas: Size, k: number, margin = 0): Rect {
  const c = toCanvasRect(shot, src);
  const w = c.w * k;
  const h = c.h * k;
  let x = c.x + c.w / 2 - w / 2;
  let y = c.y + c.h / 2 - h / 2;
  const place = (pos: number, len: number, total: number) =>
    len > total - margin * 2 ? (total - len) / 2 : clamp(pos, margin, total - margin - len);
  x = place(x, w, canvas.width);
  y = place(y, h, canvas.height);
  return { x, y, w, h };
}

/** 放大框推回畫面內時留的邊（畫面 px，乘 u） */
export const CARD_MARGIN = 12;

/** 放大框彈出後（倍率 k）它裡面的一個範圍（原圖 px）在畫面上的位置 */
export function rectInCard(z: ZoomFrameBase, r: Rect, layout: Layout, k = z.scale): Rect {
  const { shot, canvas } = layout;
  const C = cardRect(z, shot, canvas, k, CARD_MARGIN * unitOf(canvas));
  const s = shot.f * k;
  return { x: C.x + (r.x - z.x) * s, y: C.y + (r.y - z.y) * s, w: r.w * s, h: r.h * s };
}
