/**
 * 貼紙（可自由移動、縮放、旋轉的圖片）的幾何與繪圖：版型畫布（LayoutCanvas）的拖曳控點與匯出共用。
 * 位置以「中心點＋寬高＋旋轉角度（度，順時針）」記錄。
 */
import { makeCanvas } from '../image';
import { sourceSize } from './draw';
import { fontString } from './text';
import type { Rect } from './types';

export interface Placement {
  cx: number;
  cy: number;
  width: number;
  height: number;
  /** 度，順時針 */
  rotation: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Corner = 'nw' | 'ne' | 'se' | 'sw';

const rad = (deg: number) => (deg * Math.PI) / 180;

/** 局部座標（以中心為原點、未旋轉）→ 畫布座標 */
export function localToWorld(p: Placement, lx: number, ly: number): Point {
  const a = rad(p.rotation);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.cx + lx * c - ly * s, y: p.cy + lx * s + ly * c };
}

/** 畫布座標 → 局部座標 */
export function worldToLocal(p: Placement, x: number, y: number): Point {
  const a = rad(-p.rotation);
  const c = Math.cos(a);
  const s = Math.sin(a);
  const dx = x - p.cx;
  const dy = y - p.cy;
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

const CORNER_SIGN: Record<Corner, [number, number]> = {
  nw: [-1, -1],
  ne: [1, -1],
  se: [1, 1],
  sw: [-1, 1],
};

/** 四個角（畫布座標）：左上、右上、右下、左下 */
export function placementCorners(p: Placement): Record<Corner, Point> {
  const hw = p.width / 2;
  const hh = p.height / 2;
  return {
    nw: localToWorld(p, -hw, -hh),
    ne: localToWorld(p, hw, -hh),
    se: localToWorld(p, hw, hh),
    sw: localToWorld(p, -hw, hh),
  };
}

/** 旋轉後的外接矩形 */
export function placementBounds(p: Placement): Rect {
  const cs = Object.values(placementCorners(p));
  const xs = cs.map((c) => c.x);
  const ys = cs.map((c) => c.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

/** 點在貼紙裡面嗎 */
export function pointInPlacement(p: Placement, x: number, y: number, pad = 0): boolean {
  const l = worldToLocal(p, x, y);
  return Math.abs(l.x) <= p.width / 2 + pad && Math.abs(l.y) <= p.height / 2 + pad;
}

/**
 * 新加入的貼紙：縮放到長邊 maxSide（小圖會放大），中心在範圍中央，不旋轉。
 */
export function initialPlacement(
  img: { width: number; height: number },
  area: Rect,
  maxSide = 300,
): Placement {
  const k = Math.min(maxSide / img.width, maxSide / img.height);
  return {
    cx: area.x + area.width / 2,
    cy: area.y + area.height / 2,
    width: img.width * k,
    height: img.height * k,
    rotation: 0,
  };
}

/**
 * 放開時的範圍限制：外接矩形至少要有 margin 與 bounds 重疊（拖出去的拉回來）。
 */
export function keepInside(p: Placement, bounds: Rect, margin = 16): Placement {
  const b = placementBounds(p);
  let dx = 0;
  let dy = 0;
  if (b.x + b.width < bounds.x + margin) dx = bounds.x + margin - (b.x + b.width);
  if (b.y + b.height < bounds.y + margin) dy = bounds.y + margin - (b.y + b.height);
  if (b.x > bounds.x + bounds.width - margin) dx = bounds.x + bounds.width - margin - b.x;
  if (b.y > bounds.y + bounds.height - margin) dy = bounds.y + bounds.height - margin - b.y;
  return dx || dy ? { ...p, cx: p.cx + dx, cy: p.cy + dy } : p;
}

export interface SizeRange {
  /** 寬、高的最小值 */
  min: number;
  /** 寬、高的最大值 */
  max: number;
}

/**
 * 拖曳角落的控點縮放（維持比例）：對角固定，比例＝指標在對角線方向上的投影；寬高夾在 range 內。
 */
export function resizeFromCorner(
  start: Placement,
  corner: Corner,
  pointer: Point,
  range: SizeRange,
): Placement {
  const [sx, sy] = CORNER_SIGN[corner];
  const hw = start.width / 2;
  const hh = start.height / 2;
  const anchor = localToWorld(start, -sx * hw, -sy * hh);
  /* 對角線（固定角 → 拖曳的角），畫布座標 */
  const handle = localToWorld(start, sx * hw, sy * hh);
  const dx = handle.x - anchor.x;
  const dy = handle.y - anchor.y;
  const len2 = dx * dx + dy * dy || 1;
  let k = ((pointer.x - anchor.x) * dx + (pointer.y - anchor.y) * dy) / len2;
  const lo = range.min / Math.min(start.width, start.height);
  const hi = range.max / Math.max(start.width, start.height);
  k = Math.max(lo, Math.min(hi, k));
  const w = start.width * k;
  const h = start.height * k;
  /* 新的中心＝固定角＋對角線的一半（同方向） */
  return {
    ...start,
    width: w,
    height: h,
    cx: anchor.x + (dx * k) / 2,
    cy: anchor.y + (dy * k) / 2,
  };
}

/** 角度正規化到 (−180, 180] */
export function normalizeAngle(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

/**
 * 旋轉控點：角度＝開始時的角度＋（指標相對中心的角度變化）；snap 給了就吸附到它的倍數（例如按住 Shift 時 15°）。
 */
export function rotateTo(start: Placement, from: Point, to: Point, snap = 0): Placement {
  const a0 = Math.atan2(from.y - start.cy, from.x - start.cx);
  const a1 = Math.atan2(to.y - start.cy, to.x - start.cx);
  let deg = start.rotation + ((a1 - a0) * 180) / Math.PI;
  if (snap > 0) deg = Math.round(deg / snap) * snap;
  return { ...start, rotation: normalizeAngle(deg) };
}

/* ---------- 繪圖 ---------- */

export interface StickerLook {
  shadow?: boolean;
  outline?: boolean;
  /** 出處（空白不畫） */
  cite?: string;
}

/** 外框線的寬度（原圖像素） */
export const OUTLINE_PX = 10;

const outlineCache = new WeakMap<object, HTMLCanvasElement | OffscreenCanvas>();

/**
 * 白色外框：把原圖往外擴 d 個原圖像素（圓形範圍），再把不透明處塗白。結果比原圖四邊各多 d。
 */
export function outlineCanvas(
  img: CanvasImageSource,
  d = OUTLINE_PX,
): HTMLCanvasElement | OffscreenCanvas {
  const hit = outlineCache.get(img as object);
  if (hit) return hit;
  const { width, height } = sourceSize(img);
  const c = makeCanvas(width + d * 2, height + d * 2);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  for (let dx = -d; dx <= d; dx++)
    for (let dy = -d; dy <= d; dy++)
      if (dx * dx + dy * dy <= d * d) ctx.drawImage(img, d + dx, d + dy);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  outlineCache.set(img as object, c);
  return c;
}

export const STICKER_SHADOW = { color: 'rgba(0,0,0,0.3)', blur: 4, x: 0, y: 4 } as const;

/** 出處的字型（約 11 px） */
export const STICKER_CITE = { size: 11, color: '#5f5f5f', inset: 6 } as const;

/**
 * 畫一張貼紙：外框線（陰影在外框那一層）→ 圖（沒有外框時陰影在圖上）→ 出處（內側下緣中央，跟著旋轉）。
 */
export function drawSticker(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  p: Placement,
  img: CanvasImageSource,
  look: StickerLook = {},
  citeFamily = 'Noto Sans TC',
): void {
  const { width: iw, height: ih } = sourceSize(img);
  if (!iw || !ih) return;
  ctx.save();
  ctx.translate(p.cx, p.cy);
  ctx.rotate(rad(p.rotation));
  const x = -p.width / 2;
  const y = -p.height / 2;
  const shadow = () => {
    ctx.shadowColor = STICKER_SHADOW.color;
    ctx.shadowBlur = STICKER_SHADOW.blur;
    ctx.shadowOffsetX = STICKER_SHADOW.x;
    ctx.shadowOffsetY = STICKER_SHADOW.y;
  };
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (look.outline) {
    const o = outlineCanvas(img);
    const kx = p.width / iw;
    const ky = p.height / ih;
    ctx.save();
    if (look.shadow) shadow();
    ctx.drawImage(
      o,
      x - OUTLINE_PX * kx,
      y - OUTLINE_PX * ky,
      p.width + OUTLINE_PX * 2 * kx,
      p.height + OUTLINE_PX * 2 * ky,
    );
    ctx.restore();
  }
  ctx.save();
  if (look.shadow && !look.outline) shadow();
  ctx.drawImage(img, x, y, p.width, p.height);
  ctx.restore();
  const cite = look.cite?.trim();
  if (cite) {
    ctx.save();
    ctx.font = fontString({ family: citeFamily, size: STICKER_CITE.size });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = STICKER_CITE.color;
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 4;
    ctx.fillText(
      `ⓒ ${cite}`,
      0,
      y + p.height - STICKER_CITE.inset - STICKER_CITE.size * 0.2,
      p.width,
    );
    ctx.restore();
  }
  ctx.restore();
}
