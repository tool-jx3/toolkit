/**
 * 畫一格：預覽與匯出共用同一段程式。
 *
 * 順序：底圖（背景＋圖的陰影＋圓角的圖，設定不變時快取）→ 圖上的標記與塗黑 → 聚光（周圍變暗）→
 * 放大框（以框的中心放大、樣式外框；框裡重畫一次圖與跟它重疊的標記、塗黑，所以它們跟著放大）→ 出處。
 * 引擎畫背景、陰影、塗黑（黑塊、馬賽克、毛玻璃、邊界演出）、聚光、出處；工具（RenderKit）畫自己的標記與放大框的樣式，
 * 也可以加自己的塗黑樣式。
 *
 * 也有：運鏡（只畫畫面的一塊、放大到整個畫面；圖在放大的倍率下重畫一次，字不會糊）、
 * 逐步公開用的「每個框各自的進度」、圖層（背景／放大框／標記）。
 * 陰影一律只畫在形狀外面（shadowOutside）：圖有透明處時，底下不會透出陰影。
 */
import { makeCanvas, roundRectPath } from '@/core/image';
import { blurCanvas } from '@/core/scene';
import { clamp01, hashUnit, seedOf } from '@/core/timeline';
import {
  CARD_MARGIN,
  cardRect,
  computeLayout,
  intersects,
  type Layout,
  type Placement,
  spanRect,
  unitOf,
} from './layout';
import {
  actionEase,
  buildTimeline,
  type Cover,
  edgeEnvelope,
  type Progress,
  popupAlpha,
  redactCover,
  type TimelineKit,
  timeProgress,
  zoomFactor,
} from './timeline';
import {
  type FrameBase,
  type FxDoc,
  isMark,
  type Point,
  type Rect,
  type RedactFrameBase,
  type Size,
  type ZoomFrameBase,
} from './types';
import type { LayerId } from './view';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type ImageSource = ImageBitmap | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement;

/** 出處文字與範例圖的字型 */
export const UI_FONT_STACK =
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';
export const CREDIT_FONT_FAMILY = 'Noto Sans TC';
export const CREDIT_FONT_WEIGHT = 700;

/** 目前的變換倍率（運鏡時 > 1）：陰影、光暈的模糊不跟著變換縮放，要自己乘 */
export const devScale = (g: Ctx): number => {
  const m = typeof g.getTransform === 'function' ? g.getTransform() : null;
  return m ? Math.hypot(m.a, m.b) || 1 : 1;
};

export const ctxOf = (c: AnyCanvas, willRead = false): Ctx => {
  const g = c.getContext('2d', willRead ? { willReadFrequently: true } : undefined) as Ctx | null;
  if (!g) throw new Error('無法建立畫布');
  return g;
};

/** 陰影的設定（模糊、位移是裝置 px：運鏡時呼叫的人自己乘 devScale） */
export interface ShadowSpec {
  color: string;
  blur: number;
  offsetY: number;
}

/**
 * 只在圓角矩形外面畫陰影，形狀本身與它底下都不畫（圖、放大框的內容有透明處時，不會透出陰影或黑底）。
 * 做法：形狀畫在可見範圍外、只留位移回來的陰影；剪裁＝很大的矩形挖掉形狀（evenodd）。挖掉的範圍往內縮
 * 1 個裝置 px，讓邊緣半透明的那圈像素底下照樣有陰影（不然邊上會多一圈亮線）。
 * extent：可見範圍的大小（使用者座標的寬高上限），用來把形狀移出去。
 */
export function shadowOutside(g: Ctx, r: Rect, radius: number, sh: ShadowSpec, extent: Size): void {
  if (r.w <= 0 || r.h <= 0 || sh.blur < 0) return;
  const k = devScale(g);
  const inset = 1 / k;
  const span = Math.max(extent.width, extent.height);
  const off = r.x + r.w + span + 100;
  g.save();
  g.beginPath();
  g.rect(-span * 2, -span * 2, span * 5, span * 5);
  roundRectPath(
    g,
    r.x + inset,
    r.y + inset,
    Math.max(0, r.w - inset * 2),
    Math.max(0, r.h - inset * 2),
    Math.max(0, radius - inset),
  );
  g.clip('evenodd');
  g.shadowColor = sh.color;
  g.shadowBlur = sh.blur;
  g.shadowOffsetX = off * k;
  g.shadowOffsetY = sh.offsetY;
  g.fillStyle = '#000';
  g.beginPath();
  roundRectPath(g, r.x - off, r.y, r.w, r.h, radius);
  g.fill();
  g.restore();
}

/** 範圍往外（d > 0）或往內擴 */
export const growRect = (r: Rect, d: number): Rect => ({
  x: r.x - d,
  y: r.y - d,
  w: r.w + d * 2,
  h: r.h + d * 2,
});

/* ---------- 快取 ---------- */

const imageIds = new WeakMap<object, number>();
let imageSeq = 0;
/** 圖的快取鍵（同一個物件同一個鍵） */
export const imageKey = (img: ImageSource | null): string => {
  if (!img) return 'none';
  let id = imageIds.get(img);
  if (id === undefined) {
    id = ++imageSeq;
    imageIds.set(img, id);
  }
  return `i${id}`;
};

export interface Cached {
  key: string;
  canvas: AnyCanvas;
}

/** 不隨時間改變的部分（背景、底圖、塗黑的馬賽克與毛玻璃、工具自己的）；同一組設定只算一次 */
export class RenderCache {
  bg: Cached | null = null;
  base: Cached | null = null;
  crops = new Map<string, Cached>();
  /** 工具自己的快取（鍵自己取） */
  extra = new Map<string, Cached>();
  clear(): void {
    this.bg = null;
    this.base = null;
    this.crops.clear();
    this.extra.clear();
  }
}

/* ---------- 背景 ---------- */

/** 模糊背景：圖片蓋滿畫面、模糊、調暗。先縮小再模糊（快），四周多畫一圈，邊緣才不會變透明 */
function blurBackground(img: ImageSource | null, canvas: Size, bg: FxDoc['bg']): AnyCanvas {
  const { width: W, height: H } = canvas;
  const out = makeCanvas(W, H);
  const g = ctxOf(out);
  if (!img) {
    g.fillStyle = '#10131a';
    g.fillRect(0, 0, W, H);
    return out;
  }
  const d = bg.blur >= 8 ? 4 : 2;
  const sigma = bg.blur / d;
  const pad = Math.ceil(sigma * 3) + 2;
  const ww = Math.ceil(W / d) + pad * 2;
  const wh = Math.ceil(H / d) + pad * 2;
  const work = makeCanvas(ww, wh);
  const wg = ctxOf(work);
  const k = Math.max(ww / img.width, wh / img.height);
  const dw = img.width * k;
  const dh = img.height * k;
  wg.imageSmoothingQuality = 'high';
  wg.drawImage(img, (ww - dw) / 2, (wh - dh) / 2, dw, dh);
  blurCanvas(work, sigma);
  g.imageSmoothingQuality = 'high';
  g.drawImage(work, pad, pad, ww - pad * 2, wh - pad * 2, 0, 0, W, H);
  g.fillStyle = `rgba(0, 0, 0, ${(1 - bg.brightness / 100).toFixed(3)})`;
  g.fillRect(0, 0, W, H);
  return out;
}

function backgroundOf(cache: RenderCache, img: ImageSource | null, s: FxDoc, canvas: Size) {
  const key = `${imageKey(img)}|${canvas.width}x${canvas.height}|${s.bg.blur}|${s.bg.brightness}`;
  if (cache.bg?.key !== key) cache.bg = { key, canvas: blurBackground(img, canvas, s.bg) };
  return cache.bg.canvas;
}

/** 圖的圓角（畫面 px） */
const shotRadius = (s: FxDoc, p: Placement) => Math.min(s.shot.radius, p.w / 2, p.h / 2);

function clipShot(g: Ctx, s: FxDoc, p: Placement) {
  g.beginPath();
  roundRectPath(g, p.x, p.y, p.w, p.h, shotRadius(s, p));
  g.clip();
}

/** 底圖：背景＋陰影＋圓角的圖（設定、圖片不變時沿用） */
function baseOf(cache: RenderCache, img: ImageSource | null, s: FxDoc, layout: Layout) {
  const { canvas, shot } = layout;
  const key = [
    imageKey(img),
    canvas.width,
    canvas.height,
    s.bg.mode,
    s.bg.mode === 'blur' ? `${s.bg.blur},${s.bg.brightness}` : '',
    s.bg.mode === 'solid' ? s.bg.color : '',
    shot.x.toFixed(3),
    shot.y.toFixed(3),
    shot.w.toFixed(3),
    shot.h.toFixed(3),
    s.shot.radius,
    s.shot.shadow,
  ].join('|');
  if (cache.base?.key === key) return cache.base.canvas;
  const out = makeCanvas(canvas.width, canvas.height);
  const g = ctxOf(out);
  if (s.bg.mode === 'blur') g.drawImage(backgroundOf(cache, img, s, canvas), 0, 0);
  else if (s.bg.mode === 'solid') {
    g.fillStyle = s.bg.color;
    g.fillRect(0, 0, canvas.width, canvas.height);
  }
  if (img) {
    if (s.shot.shadow > 0)
      shadowOutside(
        g,
        shot,
        shotRadius(s, shot),
        { color: 'rgba(0, 0, 0, 0.55)', blur: s.shot.shadow, offsetY: s.shot.shadow * 0.35 },
        canvas,
      );
    g.save();
    clipShot(g, s, shot);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, shot.x, shot.y, shot.w, shot.h);
    g.restore();
  }
  cache.base = { key, canvas: out };
  return out;
}

/* ---------- 座標 ---------- */

/** 原圖 px → 畫面 px：x' = ox + x × s；k＝放大框的倍率（線寬、粒大小跟著放大） */
export interface Mapping {
  ox: number;
  oy: number;
  s: number;
  k: number;
}

export const mapRect = (m: Mapping, r: Rect): Rect => ({
  x: m.ox + r.x * m.s,
  y: m.oy + r.y * m.s,
  w: r.w * m.s,
  h: r.h * m.s,
});
export const mapPoint = (m: Mapping, p: Point): Point => ({
  x: m.ox + p.x * m.s,
  y: m.oy + p.y * m.s,
});

/* ---------- 線 ---------- */

/** 折線的長度 */
export function polylineLength(pts: readonly [number, number][]): number {
  let total = 0;
  for (let i = 1; i < pts.length; i++)
    total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return total;
}

/** 沿折線畫前 q（0～1）的長度 */
export function strokePartial(g: Ctx, pts: readonly [number, number][], q: number): void {
  if (pts.length < 2 || q <= 0) return;
  const lens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    lens.push(l);
    total += l;
  }
  let left = total * clamp01(q);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length && left > 0; i++) {
    const l = lens[i - 1];
    if (l <= left) {
      g.lineTo(pts[i][0], pts[i][1]);
      left -= l;
    } else {
      const u = left / l;
      g.lineTo(
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u,
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u,
      );
      left = 0;
    }
  }
  g.stroke();
}

/* ---------- 塗黑 ---------- */

/** 毛玻璃的模糊（原圖 px）：框短邊的 5%～25%，依濃度（自訂） */
export const frostSigma = (f: Pick<RedactFrameBase, 'density' | 'w' | 'h'>): number =>
  Math.max(1.5, (0.05 + 0.2 * (f.density / 100)) * Math.min(f.w, f.h));

/** 馬賽克的格數（框的寬、高各幾格）：粒大小以圖原本的大小（畫面 px）計 */
export function mosaicCells(
  f: Pick<RedactFrameBase, 'grain' | 'w' | 'h'>,
  baseScale: number,
): { cols: number; rows: number } {
  const g = Math.max(1, f.grain / Math.max(1e-6, baseScale));
  return { cols: Math.max(1, Math.round(f.w / g)), rows: Math.max(1, Math.round(f.h / g)) };
}

/** 讀像素用的最小介面（ImageData 或測試用的陣列） */
export interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * 馬賽克的格色：嚴格的區塊平均。src 是原圖從 (ox, oy) 開始的一塊（原圖 px）；
 * 每格只平均「中心落在框內、那一格裡」的像素，依不透明度加權（透明的像素不會把顏色拉黑）；
 * 一個像素中心都沒有的格（格比 1 px 小）取最接近格中心的那個像素。回傳 cols × rows 的 RGBA。
 */
export function blockAverage(
  src: Pixels,
  ox: number,
  oy: number,
  f: Rect,
  cols: number,
  rows: number,
): Uint8ClampedArray {
  const n = cols * rows;
  const sum = new Float64Array(n * 5);
  const { data, width, height } = src;
  for (let py = 0; py < height; py++) {
    const cy = oy + py + 0.5;
    if (cy < f.y || cy >= f.y + f.h) continue;
    const row = Math.min(rows - 1, Math.floor(((cy - f.y) * rows) / f.h));
    for (let px = 0; px < width; px++) {
      const cx = ox + px + 0.5;
      if (cx < f.x || cx >= f.x + f.w) continue;
      const col = Math.min(cols - 1, Math.floor(((cx - f.x) * cols) / f.w));
      const i = (py * width + px) * 4;
      const a = data[i + 3];
      const o = (row * cols + col) * 5;
      sum[o] += data[i] * a;
      sum[o + 1] += data[i + 1] * a;
      sum[o + 2] += data[i + 2] * a;
      sum[o + 3] += a;
      sum[o + 4] += 1;
    }
  }
  const out = new Uint8ClampedArray(n * 4);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const c = row * cols + col;
      const o = c * 5;
      if (sum[o + 4] > 0) {
        const a = sum[o + 3];
        if (a > 0) {
          out[c * 4] = Math.round(sum[o] / a);
          out[c * 4 + 1] = Math.round(sum[o + 1] / a);
          out[c * 4 + 2] = Math.round(sum[o + 2] / a);
        }
        out[c * 4 + 3] = Math.round(a / sum[o + 4]);
        continue;
      }
      const px = Math.min(
        width - 1,
        Math.max(0, Math.floor(f.x + ((col + 0.5) * f.w) / cols - ox)),
      );
      const py = Math.min(
        height - 1,
        Math.max(0, Math.floor(f.y + ((row + 0.5) * f.h) / rows - oy)),
      );
      if (width <= 0 || height <= 0) continue;
      const i = (py * width + px) * 4;
      out.set(data.subarray(i, i + 4), c * 4);
    }
  }
  return out;
}

/** 塗黑的底材：馬賽克（區塊平均）或毛玻璃（模糊＋白霧） */
export type CropKind = 'mosaic' | 'frost';

/** 馬賽克、毛玻璃的圖（原圖解析度；設定不變時沿用） */
function redactCrop(
  cache: RenderCache,
  img: ImageSource,
  f: RedactFrameBase,
  baseScale: number,
  type: CropKind,
): { canvas: AnyCanvas; pad: number; smooth: boolean } {
  const key = `${imageKey(img)}|${f.x},${f.y},${f.w},${f.h}|${type}|${f.density}|${f.grain}|${baseScale.toFixed(5)}`;
  const id = `${f.id}`;
  const hit = cache.crops.get(id);
  if (type === 'mosaic') {
    if (hit?.key === key) return { canvas: hit.canvas, pad: 0, smooth: false };
    const { cols, rows } = mosaicCells(f, baseScale);
    /* 框蓋到的原圖像素讀出來，自己算每格的平均（drawImage 縮小會混進隔壁格與框外的顏色） */
    const x0 = Math.max(0, Math.floor(f.x));
    const y0 = Math.max(0, Math.floor(f.y));
    const x1 = Math.min(img.width, Math.ceil(f.x + f.w));
    const y1 = Math.min(img.height, Math.ceil(f.y + f.h));
    const work = makeCanvas(Math.max(1, x1 - x0), Math.max(1, y1 - y0));
    const wg = ctxOf(work, true);
    wg.drawImage(img, x0, y0, work.width, work.height, 0, 0, work.width, work.height);
    const cells = blockAverage(
      wg.getImageData(0, 0, work.width, work.height),
      x0,
      y0,
      f,
      cols,
      rows,
    );
    const c = makeCanvas(cols, rows);
    const g = ctxOf(c);
    const out = g.createImageData(cols, rows);
    out.data.set(cells);
    g.putImageData(out, 0, 0);
    cache.crops.set(id, { key, canvas: c });
    return { canvas: c, pad: 0, smooth: false };
  }
  const sigma = frostSigma(f);
  const pad = Math.ceil(sigma * 2.5);
  if (hit?.key === key) return { canvas: hit.canvas, pad, smooth: true };
  const c = makeCanvas(f.w + pad * 2, f.h + pad * 2);
  const g = ctxOf(c);
  /* 先把框裡的圖拉滿整張（邊緣不會變透明），再把框連同四周的圖畫上去 */
  g.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, c.width, c.height);
  const sx = Math.max(0, f.x - pad);
  const sy = Math.max(0, f.y - pad);
  const ex = Math.min(img.width, f.x + f.w + pad);
  const ey = Math.min(img.height, f.y + f.h + pad);
  g.drawImage(img, sx, sy, ex - sx, ey - sy, sx - (f.x - pad), sy - (f.y - pad), ex - sx, ey - sy);
  blurCanvas(c, sigma);
  g.fillStyle = `rgba(255, 255, 255, ${(0.1 + 0.3 * (f.density / 100)).toFixed(3)})`;
  g.fillRect(0, 0, c.width, c.height);
  cache.crops.set(id, { key, canvas: c });
  return { canvas: c, pad, smooth: true };
}

/** 畫塗黑時拿得到的東西 */
export interface RedactEnv {
  img: ImageSource;
  cache: RenderCache;
  /** 圖放上畫面的縮放（馬賽克的粒大小以它計） */
  baseScale: number;
  /** 短邊 1080 為 1 */
  u: number;
  /** 原圖 px → 畫面 px（k＝放大框的倍率） */
  m: Mapping;
  /** 畫面大小（標籤之類的不要超出畫面時用） */
  canvas: Size;
}

/** 黑塊：#0c0c0e，不透明度＝濃度 */
export function paintBlack(g: Ctx, r: Rect, density: number): void {
  g.fillStyle = `rgba(12, 12, 14, ${(density / 100).toFixed(3)})`;
  g.fillRect(r.x, r.y, r.w, r.h);
}

/** 馬賽克或毛玻璃的底材，畫滿 r */
export function paintCrop(
  g: Ctx,
  f: RedactFrameBase,
  r: Rect,
  env: RedactEnv,
  type: CropKind,
): void {
  const crop = redactCrop(env.cache, env.img, f, env.baseScale, type);
  g.imageSmoothingEnabled = crop.smooth;
  if (crop.smooth) g.imageSmoothingQuality = 'high';
  if (crop.smooth) g.drawImage(crop.canvas, crop.pad, crop.pad, f.w, f.h, r.x, r.y, r.w, r.h);
  else g.drawImage(crop.canvas, r.x, r.y, r.w, r.h);
}

/** 引擎內建的三種：black（黑塊）、mosaic（馬賽克）、frost（毛玻璃） */
export function paintBuiltinRedact(g: Ctx, f: RedactFrameBase, r: Rect, env: RedactEnv): void {
  if (f.style === 'black') paintBlack(g, r, f.density);
  else if (f.style === 'mosaic' || f.style === 'frost') paintCrop(g, f, r, env, f.style);
}

/** 框不是長方形時（工具的 `redactShape` 回傳 true）再剪到那個形狀；長方形的框什麼都不做（路徑也不動） */
function clipShape(g: Ctx, f: RedactFrameBase, r: Rect, shape?: RenderKit['redactShape']): boolean {
  if (!shape?.(g, f, r)) return false;
  g.clip();
  return true;
}

/**
 * 蓋住的那一段（cover）：先剪到那一段、乘上淡出的透明度，再畫樣式。
 * shape：工具的 `redactShape`（框不是長方形時再剪到那個形狀；2026-10-29 map-fx 的 L 形房間遮罩加的，不給時與以前相同）。
 */
export function drawRedact(
  g: Ctx,
  f: RedactFrameBase,
  r: Rect,
  cover: Cover,
  env: RedactEnv,
  paint?: RenderKit['paintRedact'],
  shape?: RenderKit['redactShape'],
): void {
  const [a, b] = cover.span;
  if (b <= a || r.w <= 0 || r.h <= 0 || cover.alpha <= 0) return;
  const part = f.dir === 'fade' ? r : spanRect(r, f.dir, a, b);
  g.save();
  g.beginPath();
  g.rect(part.x, part.y, part.w, part.h);
  g.clip();
  clipShape(g, f, r, shape);
  if (cover.alpha < 1) g.globalAlpha *= cover.alpha;
  if (!paint?.(g, f, r, env)) paintBuiltinRedact(g, f, r, env);
  g.restore();
}

/* ---------- 塗黑的邊界演出（自訂） ---------- */

export const EDGE_GOLD = { r: 255, g: 200, b: 90 } as const;
export const EDGE_SCAN = { r: 150, g: 245, b: 255 } as const;

/**
 * 揭開、蓋上時移動中的那條邊：金光＝以邊為中心的橢圓金色光暈＋兩端淡出的亮線＋往露出那一側飄散的金色粒子；
 * 掃描線＝一條青白的亮線＋拖在露出那一側的淡青色。濃度＝發光強度 × 頭尾淡入淡出；q＝動作的進度（已套曲線）。
 * 整塊淡出（fade）沒有邊，不畫。
 */
export function drawEdge(
  g: Ctx,
  f: RedactFrameBase,
  r: Rect,
  q: number,
  u: number,
  k: number,
  shape?: RenderKit['redactShape'],
): void {
  if (f.mode === 'static' || f.edge === 'none' || f.dir === 'fade') return;
  const A = edgeEnvelope(q) * (f.glow / 100);
  if (A <= 0) return;
  /* 框不是長方形時（L 形）光與掃描線只畫在框的形狀裡（長方形的框、不給 shape 時與以前相同：光暈可以超出框） */
  if (shape) {
    g.save();
    if (clipShape(g, f, r, shape)) {
      drawEdge(g, f, r, q, u, k);
      g.restore();
      return;
    }
    g.restore();
  }
  const horiz = f.dir === 'h';
  const len = horiz ? r.w : r.h;
  const cross = horiz ? r.h : r.w;
  const c0 = horiz ? r.y : r.x;
  const start = horiz ? r.x : r.y;
  const pos = start + len * q;
  /* 露出的那一側：揭開＝起點那一側（已經掀開）、蓋上＝終點那一側（還沒蓋上） */
  const side = f.mode === 'reveal' ? -1 : 1;
  const at = (along: number, across: number): [number, number] =>
    horiz ? [along, across] : [across, along];
  const rgba = (c: { r: number; g: number; b: number }, a: number) =>
    `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
  /** 沿著邊的一條線（兩端淡出） */
  const line = (width: number, color: { r: number; g: number; b: number }, a: number) => {
    const [x0, y0] = at(pos, c0);
    const [x1, y1] = at(pos, c0 + cross);
    const grad = g.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, rgba(color, 0));
    grad.addColorStop(0.2, rgba(color, a));
    grad.addColorStop(0.8, rgba(color, a));
    grad.addColorStop(1, rgba(color, 0));
    g.fillStyle = grad;
    const [lx, ly] = at(pos - width / 2, c0);
    if (horiz) g.fillRect(lx, ly, width, cross);
    else g.fillRect(lx, ly, cross, width);
  };
  const core = Math.max(1.5 * k, 2.5 * u * k);
  g.save();
  if (f.edge === 'glow') {
    /* 光暈：以邊的中點為中心的橢圓 */
    const gr = Math.max(10 * u * k, cross * 0.55);
    const [cx, cy] = at(pos, c0 + cross / 2);
    g.save();
    g.translate(cx, cy);
    g.scale(horiz ? gr : cross * 0.8, horiz ? cross * 0.8 : gr);
    const halo = g.createRadialGradient(0, 0, 0, 0, 0, 1);
    halo.addColorStop(0, rgba(EDGE_GOLD, 0.6 * A));
    halo.addColorStop(0.45, rgba(EDGE_GOLD, 0.28 * A));
    halo.addColorStop(1, rgba(EDGE_GOLD, 0));
    g.fillStyle = halo;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
    line(core * 2.4, EDGE_GOLD, 0.7 * A);
    line(core, { r: 255, g: 248, b: 225 }, 0.95 * A);
    /* 粒子：每顆在某個進度從邊上出生，往露出的那一側飄、往上一點，慢慢變小變淡（依框固定） */
    const seed = seedOf(f.id);
    const n = Math.round(8 + 16 * (f.glow / 100));
    const life = 0.2;
    for (let i = 0; i < n; i++) {
      const born = hashUnit(seed, i, 1) * (1 - life * 0.5);
      const age = (q - born) / life;
      if (age < 0 || age > 1) continue;
      const along = start + len * born + side * age * gr * (0.8 + hashUnit(seed, i, 2));
      const across = c0 + cross * hashUnit(seed, i, 3) - age * cross * 0.35 * hashUnit(seed, i, 4);
      const size = (1.2 + 2.2 * hashUnit(seed, i, 5)) * u * k * (1 - age * 0.5);
      const [x, y] = at(along, across);
      g.fillStyle = rgba(EDGE_GOLD, A * (1 - age));
      g.beginPath();
      g.arc(x, y, Math.max(0.7, size), 0, Math.PI * 2);
      g.fill();
      g.fillStyle = rgba({ r: 255, g: 250, b: 230 }, A * (1 - age) * 0.9);
      g.beginPath();
      g.arc(x, y, Math.max(0.35, size * 0.45), 0, Math.PI * 2);
      g.fill();
    }
  } else {
    /* 掃描線：拖在露出那一側的淡光＋亮線 */
    const tail = Math.max(14 * u * k, len * 0.12);
    const [x0, y0] = at(pos, 0);
    const [x1, y1] = at(pos + side * tail, 0);
    const grad = horiz
      ? g.createLinearGradient(x0, 0, x1, 0)
      : g.createLinearGradient(0, y0, 0, y1);
    grad.addColorStop(0, rgba(EDGE_SCAN, 0.4 * A));
    grad.addColorStop(1, rgba(EDGE_SCAN, 0));
    g.fillStyle = grad;
    const a0 = Math.min(pos, pos + side * tail);
    if (horiz) g.fillRect(a0, c0, tail, cross);
    else g.fillRect(c0, a0, cross, tail);
    line(core * 1.4, EDGE_SCAN, 0.95 * A);
  }
  g.restore();
}

/* ---------- 工具畫的部分 ---------- */

/** 畫標記時拿得到的東西 */
export interface MarkEnv extends RedactEnv {
  /** 線性的動作進度（0～1；q 是套了平滑曲線的） */
  p: number;
  /** 螢光筆一類以色彩增值疊上（圖層匯出時 false） */
  multiply: boolean;
}

/** 畫放大框的樣式時拿得到的東西 */
export interface CardEnv {
  /** 卡片的內容在畫面上的範圍 */
  C: Rect;
  /** 外框、陰影的濃度（緩停） */
  a: number;
  /** 邊框粗細（畫面 px） */
  b: number;
  u: number;
  /** 目前的變換倍率（模糊、位移要乘） */
  ds: number;
  layout: Layout;
  /** 畫框裡的內容（圖＋跟它重疊的標記與塗黑），clip 建好剪裁的路徑 */
  content: (clip: () => void) => void;
}

/** 工具提供：哪些框會動、怎麼畫自己的標記、放大框的樣式、自己的塗黑樣式 */
export interface RenderKit<F extends FrameBase = FrameBase> extends TimelineKit<F> {
  /** 畫一個標記（放大框、塗黑以外的框）；r＝畫面上的範圍，q＝動作進度（已套平滑曲線） */
  drawMark(g: Ctx, f: F, r: Rect, q: number, env: MarkEnv): void;
  /** 放大框的樣式（外框、陰影，中間呼叫 env.content） */
  paintCard(g: Ctx, z: ZoomFrameBase, env: CardEnv): void;
  /** 工具自己的塗黑樣式：畫滿 r（已剪到蓋住的那一段）；回傳 false＝交給引擎（black、mosaic、frost） */
  paintRedact?(g: Ctx, f: RedactFrameBase, r: Rect, env: RedactEnv): boolean;
  /**
   * 塗黑的框不是長方形時：`beginPath()` 之後把框在畫面上的形狀（r＝外框）加進路徑、回傳 true，引擎再剪到這個形狀畫塗黑與邊界演出；
   * 長方形的框什麼都不畫、回傳 false（2026-10-29 map-fx 的 L 形房間遮罩加的；不給＝都是長方形，與以前相同）。
   */
  redactShape?(g: Ctx, f: RedactFrameBase, r: Rect): boolean;
  /** 框上要畫的文字（標籤、房名…）：預覽與匯出先等介面字型（粗體）載好這些字 */
  fontText?(frames: readonly F[]): string;
}

/* ---------- 圖上的框 ---------- */

interface AnnotationOptions {
  /** 只畫這些框 */
  filter?: (f: FrameBase) => boolean;
  /** 只畫跟它重疊的（放大框裡） */
  only?: Rect;
  /** 螢光筆以色彩增值疊上（圖層匯出時 false） */
  multiply?: boolean;
}

/** 標記與塗黑（清單順序） */
function drawAnnotations<F extends FrameBase>(
  g: Ctx,
  m: Mapping,
  frames: readonly F[],
  prog: Progress,
  img: ImageSource,
  cache: RenderCache,
  baseScale: number,
  u: number,
  canvas: Size,
  kit: RenderKit<F>,
  { filter, only, multiply = true }: AnnotationOptions = {},
) {
  for (const f of frames) {
    if (f.kind === 'zoom') continue;
    if (filter && !filter(f)) continue;
    if (only && !intersects(f, only)) continue;
    const r = mapRect(m, f);
    const p = prog.action(f);
    const q = actionEase(p);
    if (f.kind === 'redact') {
      const rf = f as unknown as RedactFrameBase;
      drawRedact(
        g,
        rf,
        r,
        redactCover(rf.mode, rf.dir, q),
        { img, cache, baseScale, u, m, canvas },
        kit.paintRedact,
        kit.redactShape,
      );
      drawEdge(g, rf, r, q, u, m.k, kit.redactShape);
    } else kit.drawMark(g, f, r, q, { img, cache, baseScale, u, m, canvas, p, multiply });
  }
}

/* ---------- 放大框 ---------- */

interface CardOptions {
  /** 畫外框、陰影與框裡的圖（圖層「標記」時 false：只畫框裡的標記） */
  body: boolean;
  annotations: AnnotationOptions;
}

function drawCard<F extends FrameBase>(
  g: Ctx,
  z: ZoomFrameBase,
  p: number,
  layout: Layout,
  frames: readonly F[],
  prog: Progress,
  img: ImageSource,
  cache: RenderCache,
  kit: RenderKit<F>,
  { body, annotations }: CardOptions,
) {
  if (p <= 0) return;
  const { shot, canvas } = layout;
  const u = unitOf(canvas);
  const ds = devScale(g);
  const k = zoomFactor(z.scale, p);
  const a = popupAlpha(p);
  const C = cardRect(z, shot, canvas, k, CARD_MARGIN * u);
  const m: Mapping = { ox: C.x - z.x * shot.f * k, oy: C.y - z.y * shot.f * k, s: shot.f * k, k };
  const b = z.border * u;
  const content = (clip: () => void) => {
    g.save();
    clip();
    g.clip();
    if (body) {
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, z.x, z.y, z.w, z.h, C.x, C.y, C.w, C.h);
    }
    drawAnnotations(g, m, frames, prog, img, cache, shot.f, u, canvas, kit, {
      ...annotations,
      only: z,
    });
    g.restore();
  };
  if (!body) {
    content(() => {
      g.beginPath();
      g.rect(C.x, C.y, C.w, C.h);
    });
    return;
  }
  kit.paintCard(g, z, { C, a, b, u, ds, layout, content });
}

/** 「只有陰影」的放大框（兩個工具共用的樣子）：沒有框，圓角 6u，陰影只畫在卡片外面 */
export function paintShadowOnlyCard(g: Ctx, env: CardEnv): void {
  const { C, a, u, ds, layout, content } = env;
  const R = 6 * u;
  shadowOutside(
    g,
    C,
    R,
    {
      color: `rgba(0, 0, 0, ${(0.62 * a).toFixed(3)})`,
      blur: 40 * u * a * ds,
      offsetY: 16 * u * a * ds,
    },
    layout.canvas,
  );
  content(() => {
    g.beginPath();
    roundRectPath(g, C.x, C.y, C.w, C.h, R);
  });
}

/* ---------- 出處 ---------- */

/** 亮度（0～1） */
export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function drawCredit(g: Ctx, s: FxDoc, layout: Layout) {
  const c = layout.credit;
  const textValue = s.credit.text.trim();
  if (!c || !textValue) return;
  const { shot, canvas } = layout;
  g.save();
  g.font = `${CREDIT_FONT_WEIGHT} ${c.px}px ${UI_FONT_STACK}`;
  g.textBaseline = 'alphabetic';
  g.textAlign = c.align;
  if (s.credit.pos === 'badge') {
    const padX = c.px * 0.6;
    const max = Math.max(c.px, shot.w - c.px * 2.4);
    const tw = Math.min(max, g.measureText(textValue).width);
    const box = {
      x: c.x - tw - padX,
      y: c.y - c.px * 1.08,
      w: tw + padX * 2,
      h: c.px * 1.5,
    };
    g.fillStyle = 'rgba(10, 12, 16, 0.72)';
    g.beginPath();
    roundRectPath(g, box.x, box.y, box.w, box.h, box.h / 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.fillText(textValue, c.x, c.y, max);
  } else {
    const dark = s.bg.mode === 'solid' && luminance(s.bg.color) > 0.6;
    if (!dark) {
      const ds = devScale(g);
      g.shadowColor = 'rgba(0, 0, 0, 0.65)';
      g.shadowBlur = c.px * 0.35 * ds;
      g.shadowOffsetY = c.px * 0.06 * ds;
    }
    g.fillStyle = dark ? 'rgba(24, 24, 28, 0.88)' : 'rgba(255, 255, 255, 0.9)';
    const max = s.credit.pos === 'below' ? shot.w : canvas.width * 0.92;
    g.fillText(textValue, c.x, c.y, max);
  }
  g.restore();
}

/* ---------- 一格 ---------- */

export interface FrameInput<S extends FxDoc = FxDoc> {
  state: S;
  /** 解碼好的原圖（沒有圖時 null） */
  image: ImageSource | null;
}

export interface RenderOptions {
  /** 運鏡：畫面上的哪一塊（畫面 px）放大到整個畫面；null＝全圖 */
  view?: Rect | null;
  /** 每個框各自的進度（逐步公開）；不給時依時間 */
  progress?: Progress;
  /** 圖層：背景（背景＋圖＋靜止的塗黑＋出處）、放大框（周圍變暗＋放大框，框裡只有靜止的塗黑）、標記、完成（預設） */
  layer?: LayerId;
}

const isStaticRedact = (f: FrameBase) =>
  f.kind === 'redact' && (f as RedactFrameBase).mode === 'static';

/** 畫 t 秒的那一格（畫布大小要等於畫面大小） */
export function renderFrame<F extends FrameBase>(
  g: Ctx,
  input: FrameInput<FxDoc<F>>,
  t: number,
  cache: RenderCache,
  kit: RenderKit<F>,
  opts: RenderOptions = {},
): void {
  const { state: s, image } = input;
  const layout = computeLayout(s, image ? { width: image.width, height: image.height } : null);
  const { canvas, shot } = layout;
  const { width: W, height: H } = canvas;
  const layer = opts.layer ?? 'final';
  const view = opts.view && (opts.view.w < W - 1e-6 || opts.view.h < H - 1e-6) ? opts.view : null;
  const withBase = layer === 'final' || layer === 'background';
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, W, H);
  if (withBase) {
    const base = baseOf(cache, image, s, layout);
    if (view) {
      g.imageSmoothingQuality = 'high';
      g.drawImage(base, view.x, view.y, view.w, view.h, 0, 0, W, H);
    } else g.drawImage(base, 0, 0);
  }
  if (view) {
    const kx = W / view.w;
    const ky = H / view.h;
    g.setTransform(kx, 0, 0, ky, -view.x * kx, -view.y * ky);
    /* 放大後圖從原圖重畫一次（底圖是畫面解析度，放大會糊） */
    if (image && withBase) {
      g.save();
      clipShot(g, s, shot);
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, shot.x, shot.y, shot.w, shot.h);
      g.restore();
    }
  }
  if (image) {
    const prog = opts.progress ?? timeProgress(buildTimeline(s.timing, s.frames, kit, s.camera), t);
    const u = unitOf(canvas);
    const filter =
      layer === 'background' || layer === 'cutouts'
        ? isStaticRedact
        : layer === 'markers'
          ? isMark
          : undefined;
    const ann: AnnotationOptions = { filter, multiply: layer !== 'markers' };
    const zooms = s.frames.filter((f) => f.kind === 'zoom') as unknown as ZoomFrameBase[];
    if (layer !== 'cutouts') {
      g.save();
      clipShot(g, s, shot);
      if (layer === 'markers') {
        /* 標記圖層：放大框蓋住的地方不畫圖上的那一份（放大框裡另外畫，疊起來才不會重複） */
        g.beginPath();
        g.rect(-W, -H, W * 3, H * 3);
        for (const z of zooms) {
          const p = prog.popup(z);
          if (p <= 0) continue;
          const C = cardRect(z, shot, canvas, zoomFactor(z.scale, p), CARD_MARGIN * u);
          g.rect(C.x, C.y, C.w, C.h);
        }
        g.clip('evenodd');
      }
      drawAnnotations(
        g,
        { ox: shot.x, oy: shot.y, s: shot.f, k: 1 },
        s.frames,
        prog,
        image,
        cache,
        shot.f,
        u,
        canvas,
        kit,
        ann,
      );
      g.restore();
    }
    if (layer !== 'background') {
      const p = zooms.reduce((mx, z) => Math.max(mx, prog.popup(z)), 0);
      if (layer !== 'markers' && zooms.length && s.shot.spotlight > 0 && p > 0) {
        g.save();
        if (s.bg.mode === 'transparent') clipShot(g, s, shot);
        /* 完成圖：只把已經畫上去的東西調暗（source-atop）——圖的透明處維持透明，不會變成一層半透明的黑 */
        if (layer === 'final') g.globalCompositeOperation = 'source-atop';
        g.fillStyle = `rgba(0, 0, 0, ${((s.shot.spotlight / 100) * popupAlpha(p)).toFixed(4)})`;
        g.fillRect(-W, -H, W * 3, H * 3);
        g.restore();
      }
      for (const z of zooms)
        drawCard(g, z, prog.popup(z), layout, s.frames, prog, image, cache, kit, {
          body: layer !== 'markers',
          annotations: ann,
        });
    }
  }
  if (withBase) drawCredit(g, s, layout);
  g.restore();
}

/** 畫成一張新的畫布 */
export function renderToCanvas<F extends FrameBase>(
  input: FrameInput<FxDoc<F>>,
  t: number,
  kit: RenderKit<F>,
  cache = new RenderCache(),
  opts: RenderOptions = {},
): AnyCanvas {
  const layout = computeLayout(
    input.state,
    input.image ? { width: input.image.width, height: input.image.height } : null,
  );
  const c = makeCanvas(layout.canvas.width, layout.canvas.height);
  renderFrame(ctxOf(c), input, t, cache, kit, opts);
  return c;
}
