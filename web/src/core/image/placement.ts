/**
 * 圖片在框裡的位置（lock-screen 移植時新增；`ImageFrameDialog` 的 `initialPlacement`／`onApply` 用它）：
 * 和檢視區、輸出的大小無關，可以存進狀態、專案檔，之後再打開裁切時還原，畫的時候換算成任何大小。
 *
 * - zoom：以「蓋滿框」為 1 的縮放（2＝蓋滿時的兩倍大）。
 * - x、y：圖片中心相對框中心的位移，以框寬、框高為 1（0.1＝往右移框寬的 10%）。
 * - turns：順時針轉了幾個 90°（0～3）。
 *
 * ```ts
 * const t = placedTransform(imgSize, { x: 0, y: 0, width: 1080, height: 2340 }, placement);
 * drawPlaced(ctx, bitmap, imgSize, { x: 0, y: 0, width: 1080, height: 2340 }, placement);
 * ```
 */
import type { Rect, Size } from './index';

export interface FramePlacement {
  zoom: number;
  x: number;
  y: number;
  turns: number;
}

/** 圖片在框（檢視區座標）裡的變換：中心、縮放（檢視區 px ÷ 原圖 px）、轉了幾個 90° */
export interface PlacedTransform {
  cx: number;
  cy: number;
  scale: number;
  turns: number;
}

export const DEFAULT_PLACEMENT: Readonly<FramePlacement> = Object.freeze({
  zoom: 1,
  x: 0,
  y: 0,
  turns: 0,
});

const turnsOf = (turns: number): number => (((Math.round(turns) % 4) + 4) % 4) as number;

/** 圖片轉過之後蓋滿 w × h 的縮放 */
export function coverScale(img: Size, w: number, h: number, turns = 0): number {
  const odd = turnsOf(turns) % 2 === 1;
  const iw = odd ? img.height : img.width;
  const ih = odd ? img.width : img.height;
  if (!(iw > 0 && ih > 0)) return 1;
  return Math.max(w / iw, h / ih);
}

/** 位置 → 框（box）裡的變換 */
export function placedTransform(img: Size, box: Rect, p: FramePlacement): PlacedTransform {
  const turns = turnsOf(p.turns);
  return {
    cx: box.x + box.width / 2 + p.x * box.width,
    cy: box.y + box.height / 2 + p.y * box.height,
    scale: coverScale(img, box.width, box.height, turns) * p.zoom,
    turns,
  };
}

/** 框（box）裡的變換 → 位置 */
export function placementOf(img: Size, box: Rect, t: PlacedTransform): FramePlacement {
  const turns = turnsOf(t.turns);
  const base = coverScale(img, box.width, box.height, turns);
  return {
    zoom: base > 0 ? t.scale / base : 1,
    x: box.width > 0 ? (t.cx - (box.x + box.width / 2)) / box.width : 0,
    y: box.height > 0 ? (t.cy - (box.y + box.height / 2)) / box.height : 0,
    turns,
  };
}

/**
 * 夾在「圖片蓋滿框」的範圍內：縮放 1～maxZoom 倍（以蓋滿為 1），圖片的邊不會跑進框裡（框裡不會露出透明）。
 */
export function clampCover(
  img: Size,
  box: Rect,
  t: PlacedTransform,
  maxZoom = Number.POSITIVE_INFINITY,
): PlacedTransform {
  const turns = turnsOf(t.turns);
  const base = coverScale(img, box.width, box.height, turns);
  const scale = Math.min(base * Math.max(1, maxZoom), Math.max(base, t.scale));
  const odd = turns % 2 === 1;
  const w = (odd ? img.height : img.width) * scale;
  const h = (odd ? img.width : img.height) * scale;
  const clampAxis = (c: number, start: number, size: number, len: number) => {
    const lo = start + size - len / 2;
    const hi = start + len / 2;
    return lo > hi ? start + size / 2 : Math.min(hi, Math.max(lo, c));
  };
  return {
    cx: clampAxis(t.cx, box.x, box.width, w),
    cy: clampAxis(t.cy, box.y, box.height, h),
    scale,
    turns,
  };
}

/**
 * 位置夾在蓋滿的範圍內（縮放 1～maxZoom、位移不露出框外）。位置和框的大小無關，
 * 但「蓋滿」和框的比例有關，所以要給框的寬高（任何大小、比例對就好）。
 */
export function clampPlacement(
  img: Size,
  box: Size,
  p: FramePlacement,
  maxZoom?: number,
): FramePlacement {
  const r = { x: 0, y: 0, width: box.width, height: box.height };
  return placementOf(img, r, clampCover(img, r, placedTransform(img, r, p), maxZoom));
}

/**
 * 依位置把圖片畫在 ctx 的 box 範圍（不裁切，框外的部分呼叫端自己 clip；高品質縮放）。
 */
export function drawPlaced(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: CanvasImageSource,
  imgSize: Size,
  box: Rect,
  p: FramePlacement,
): void {
  const t = placedTransform(imgSize, box, p);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.translate(t.cx, t.cy);
  ctx.rotate((t.turns * Math.PI) / 2);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(img, -imgSize.width / 2, -imgSize.height / 2, imgSize.width, imgSize.height);
  ctx.restore();
}

const finite = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/**
 * 存檔、專案檔讀回來的位置：不是數字的換成預設；縮放夾在 minZoom～maxZoom、位移夾在 ±limit、turns 0～3。
 */
export function normalizePlacement(
  raw: unknown,
  {
    minZoom = 0.01,
    maxZoom = 100,
    limit = 10,
  }: { minZoom?: number; maxZoom?: number; limit?: number } = {},
): FramePlacement {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    zoom: Math.min(maxZoom, Math.max(minZoom, finite(o.zoom, 1))),
    x: Math.min(limit, Math.max(-limit, finite(o.x, 0))),
    y: Math.min(limit, Math.max(-limit, finite(o.y, 0))),
    turns: turnsOf(finite(o.turns, 0)),
  };
}
