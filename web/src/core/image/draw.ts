/**
 * 畫布小工具：圓角矩形路徑、簡單花紋（圓點、斜線、格紋、細格線）、大圖匯出的解析度上限、
 * 直接對影像讀某幾列的左右界。
 *
 * ```ts
 * ctx.save();
 * ctx.beginPath(); roundRectPath(ctx, 31, 31, 962, 962, 50); ctx.clip();
 * ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 1024);
 * fillPattern(ctx, 'dots', { x: 0, y: 0, width: 1024, height: 1024 }, { color: '#000000', opacity: 0.08 });
 * ctx.restore();
 * ```
 */
import { opaqueSpanInRows } from './effects';
import { type DrawableImage, imageSize, makeCanvas, type Rect, type Size } from './index';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 圓角半徑：一個數字（四角相同）或 [左上, 右上, 右下, 左下] */
export type Radii = number | readonly [number, number, number, number];

/** 加一個圓角矩形的子路徑（不會 beginPath；半徑超過一半時自動縮小） */
export function roundRectPath(
  ctx: CanvasPath,
  x: number,
  y: number,
  width: number,
  height: number,
  radii: Radii,
): void {
  const [tl, tr, br, bl] = (typeof radii === 'number' ? [radii, radii, radii, radii] : radii).map(
    (r) => Math.max(0, Math.min(r, width / 2, height / 2)),
  );
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + width - tr, y);
  ctx.arcTo(x + width, y, x + width, y + tr, tr);
  ctx.lineTo(x + width, y + height - br);
  ctx.arcTo(x + width, y + height, x + width - br, y + height, br);
  ctx.lineTo(x + bl, y + height);
  ctx.arcTo(x, y + height, x, y + height - bl, bl);
  ctx.lineTo(x, y + tl);
  ctx.arcTo(x, y, x + tl, y, tl);
  ctx.closePath();
}

/** 圓角矩形的 Path2D（可重複 fill／clip） */
export function roundRectPath2D(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: Radii,
): Path2D {
  const p = new Path2D();
  roundRectPath(p, x, y, width, height, radii);
  return p;
}

export type PatternKind = 'dots' | 'stripes' | 'checker' | 'grid';

export interface PatternOptions {
  /** 花紋顏色 */
  color: string;
  /** 0～1（預設 0.12，很淡） */
  opacity?: number;
  /** 一個花紋單位的大小（px，預設 24） */
  size?: number;
  /** 線寬（斜線、細格線；預設 size × 0.18） */
  lineWidth?: number;
}

/**
 * 一個可以平鋪的花紋單位（canvas）：
 * - dots：每格中央一個圓點（直徑約 size × 0.3）；
 * - stripes：45° 斜線（左下到右上），平鋪後線條連續；
 * - checker：棋盤格紋（一格 size ÷ 2）；
 * - grid：細格線。
 */
export function patternTile(
  kind: PatternKind,
  options: PatternOptions,
): HTMLCanvasElement | OffscreenCanvas {
  const size = Math.max(4, Math.round(options.size ?? 24));
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d') as Ctx2D | null;
  if (!ctx) return c;
  ctx.fillStyle = options.color;
  ctx.strokeStyle = options.color;
  ctx.globalAlpha = Math.min(1, Math.max(0, options.opacity ?? 0.12));
  const lw = options.lineWidth ?? Math.max(1, size * 0.18);
  switch (kind) {
    case 'dots':
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.15, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'stripes':
      ctx.lineWidth = lw;
      ctx.beginPath();
      /* 主線與兩個角落的延伸，平鋪時接得起來 */
      for (const o of [-size, 0, size]) {
        ctx.moveTo(o, size);
        ctx.lineTo(o + size, 0);
      }
      ctx.stroke();
      break;
    case 'checker':
      ctx.fillRect(0, 0, size / 2, size / 2);
      ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
      break;
    case 'grid':
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(0, lw / 2);
      ctx.lineTo(size, lw / 2);
      ctx.moveTo(lw / 2, 0);
      ctx.lineTo(lw / 2, size);
      ctx.stroke();
      break;
  }
  return c;
}

/**
 * 在範圍（或路徑）內平鋪花紋。花紋從 (0, 0) 起算，所以預覽與匯出（同尺寸）完全一樣；
 * 要等比放大到別的尺寸時用 ctx.scale 後再呼叫。
 */
export function fillPattern(
  ctx: Ctx2D,
  kind: PatternKind,
  area: Rect | Path2D,
  options: PatternOptions,
): void {
  const pattern = ctx.createPattern(patternTile(kind, options) as CanvasImageSource, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.fillStyle = pattern;
  if (area instanceof Path2D) ctx.fill(area);
  else ctx.fillRect(area.x, area.y, area.width, area.height);
  ctx.restore();
}

export interface ResolutionLimits {
  /** 整張最多幾個像素（預設 40,000,000） */
  maxPixels?: number;
  /** 任一邊最多幾 px（預設 16,000） */
  maxSide?: number;
}

/**
 * 大圖匯出的解析度上限：想要每單位 desired px，內容是 size（單位，例如 cm），
 * 總面積與邊長超過上限時等比降低。回傳實際可用的「每單位 px」。
 * ```ts
 * const pxPerCm = limitResolution(maxSourcePxPerCm, { width: boardWidthCm, height: boardHeightCm });
 * ```
 */
export function limitResolution(
  desired: number,
  size: Size,
  { maxPixels = 40_000_000, maxSide = 16_000 }: ResolutionLimits = {},
): number {
  const w = Math.max(1e-9, size.width);
  const h = Math.max(1e-9, size.height);
  return Math.max(0, Math.min(desired, Math.sqrt(maxPixels / (w * h)), maxSide / Math.max(w, h)));
}

/** 輸出 width × height px 時的縮小倍率（≤ 1） */
export function limitScale(width: number, height: number, limits?: ResolutionLimits): number {
  return limitResolution(1, { width, height }, limits);
}

/** iPhone／iPad 的 Safari：畫布面積超過 16,777,216 px（4096²）就畫不出來（空白） */
export const IOS_RESOLUTION_LIMITS: Required<ResolutionLimits> = {
  maxPixels: 16_777_216,
  maxSide: 16_000,
};

/**
 * 這台裝置的大圖上限：iPhone、iPad（含「桌面版網站」模式）回傳 IOS_RESOLUTION_LIMITS，其他回傳 `{}`（limitResolution 的預設）。
 * ```ts
 * const pxPerCell = limitResolution(48, { width: cols, height: rows }, deviceResolutionLimits());
 * ```
 */
export function deviceResolutionLimits(
  nav:
    | { userAgent?: string; platform?: string; maxTouchPoints?: number }
    | undefined = typeof navigator === 'undefined' ? undefined : navigator,
): ResolutionLimits {
  if (!nav) return {};
  const ios =
    /iP(hone|ad|od)/.test(nav.userAgent ?? '') ||
    (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1);
  return ios ? IOS_RESOLUTION_LIMITS : {};
}

/**
 * 直接對影像讀某幾列（y0 ≤ y < y1）的不透明左右界（結果同 opaqueSpanInRows(getImageData(img), …)），
 * 只讀那幾列。
 */
export function imageOpaqueSpanInRows(
  img: DrawableImage,
  y0: number,
  y1: number,
  threshold = 0,
): { left: number; right: number } | null {
  const { width, height } = imageSize(img);
  const from = Math.max(0, Math.floor(y0));
  const to = Math.min(height, Math.ceil(y1));
  if (to <= from || width <= 0) return null;
  const c = makeCanvas(width, to - from);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as Ctx2D | null;
  if (!ctx) return null;
  ctx.drawImage(img, 0, -from);
  const band = ctx.getImageData(0, 0, width, to - from);
  return opaqueSpanInRows(band, 0, to - from, threshold);
}
