/**
 * 畫一格（規格 3.3～3.7）：預覽與匯出共用同一段程式。
 *
 * 順序：底圖（背景＋截圖的陰影＋圓角截圖，設定不變時快取）→ 截圖上的螢光筆與塗黑 → 聚光（周圍變暗）→
 * 放大框（以框的中心放大、樣式外框；框裡重畫一次截圖與跟它重疊的螢光筆、塗黑，所以它們跟著放大）→ 出處。
 * 螢光筆、塗黑、放大框的外觀都是本站自己設計的（原作的程式與樣式拿不到，也不能沿用）。
 *
 * 第二批：運鏡（只畫畫面的一塊、放大到整個畫面；截圖在放大的倍率下重畫一次，字不會糊）、塗黑揭開／蓋上的邊界演出、
 * 段階公開用的「每個框各自的進度」、圖層（背景／放大框／螢光筆）。
 * 陰影一律只畫在形狀外面（shadowOutside）：截圖有透明處時，底下不會透出陰影（第一批驗證 R1）。
 */
import { makeCanvas, roundRectPath } from '@/core/image';
import { blurCanvas } from '@/core/scene';
import { clamp01, hashSigned, hashUnit, seedOf } from '@/core/timeline';
import {
  actionEase,
  CARD_MARGIN,
  cardRect,
  computeLayout,
  coverSpan,
  edgeEnvelope,
  type Frame,
  type FxState,
  HIGHLIGHT_COLORS,
  intersects,
  isHighlight,
  type LayerId,
  type Layout,
  type MarkerFrame,
  type Placement,
  type Progress,
  popupAlpha,
  RED_PEN,
  type Rect,
  type RedactFrame,
  type Size,
  spanRect,
  timelineOf,
  timeProgress,
  unitOf,
  type ZoomFrame,
  zoomFactor,
} from './model';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type ImageSource = ImageBitmap | HTMLCanvasElement | OffscreenCanvas | HTMLImageElement;

/** 出處文字與範例圖的字型 */
export const UI_FONT_STACK =
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';
export const CREDIT_FONT_FAMILY = 'Noto Sans TC';
export const CREDIT_FONT_WEIGHT = 700;

/** 目前的變換倍率（運鏡時 > 1）：陰影、光暈的模糊不跟著變換縮放，要自己乘 */
const devScale = (g: Ctx): number => {
  const m = typeof g.getTransform === 'function' ? g.getTransform() : null;
  return m ? Math.hypot(m.a, m.b) || 1 : 1;
};

const ctxOf = (c: AnyCanvas, willRead = false): Ctx => {
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
 * 只在圓角矩形外面畫陰影，形狀本身與它底下都不畫（截圖、放大框的內容有透明處時，不會透出陰影或黑底）。
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

/* ---------- 快取 ---------- */

const imageIds = new WeakMap<object, number>();
let imageSeq = 0;
const imageKey = (img: ImageSource | null): string => {
  if (!img) return 'none';
  let id = imageIds.get(img);
  if (id === undefined) {
    id = ++imageSeq;
    imageIds.set(img, id);
  }
  return `i${id}`;
};

interface Cached {
  key: string;
  canvas: AnyCanvas;
}

/** 不隨時間改變的部分（背景、底圖、塗黑的馬賽克與毛玻璃）；同一組設定只算一次 */
export class RenderCache {
  bg: Cached | null = null;
  base: Cached | null = null;
  crops = new Map<string, Cached>();
  clear(): void {
    this.bg = null;
    this.base = null;
    this.crops.clear();
  }
}

/* ---------- 背景 ---------- */

/** 模糊背景：圖片蓋滿畫面、模糊、調暗。先縮小再模糊（快），四周多畫一圈，邊緣才不會變透明 */
function blurBackground(img: ImageSource | null, canvas: Size, bg: FxState['bg']): AnyCanvas {
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

function backgroundOf(cache: RenderCache, img: ImageSource | null, s: FxState, canvas: Size) {
  const key = `${imageKey(img)}|${canvas.width}x${canvas.height}|${s.bg.blur}|${s.bg.brightness}`;
  if (cache.bg?.key !== key) cache.bg = { key, canvas: blurBackground(img, canvas, s.bg) };
  return cache.bg.canvas;
}

/** 截圖的圓角（畫面 px） */
const shotRadius = (s: FxState, p: Placement) => Math.min(s.shot.radius, p.w / 2, p.h / 2);

function clipShot(g: Ctx, s: FxState, p: Placement) {
  g.beginPath();
  roundRectPath(g, p.x, p.y, p.w, p.h, shotRadius(s, p));
  g.clip();
}

/** 底圖：背景＋陰影＋圓角截圖（設定、圖片不變時沿用） */
function baseOf(cache: RenderCache, img: ImageSource | null, s: FxState, layout: Layout) {
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

const mapRect = (m: Mapping, r: Rect): Rect => ({
  x: m.ox + r.x * m.s,
  y: m.oy + r.y * m.s,
  w: r.w * m.s,
  h: r.h * m.s,
});

/* ---------- 螢光筆 ---------- */

/** 紅筆的線寬（畫面 px；短邊 1080 時 4.5 px，至少 2，自訂） */
export const penWidth = (u: number): number => Math.max(2, 4.5 * u);

/** 沿折線畫前 q（0～1）的長度 */
function strokePartial(g: Ctx, pts: readonly [number, number][], q: number) {
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

/** 手繪的圈：從左上角附近出發繞一圈、收尾時越過起點一點；每個框的抖動固定（依 id） */
function handBoxPoints(r: Rect, pad: number, seed: number, dir: 'h' | 'v'): [number, number][] {
  const x0 = r.x - pad;
  const y0 = r.y - pad;
  const x1 = r.x + r.w + pad;
  const y1 = r.y + r.h + pad;
  const jx = Math.min(pad * 0.5, (x1 - x0) * 0.03);
  const jy = Math.min(pad * 0.5, (y1 - y0) * 0.06);
  const j = (i: number, amp: number) => hashSigned(seed, i) * amp;
  const W = x1 - x0;
  const H = y1 - y0;
  /* 角稍微圓、邊上加一點起伏；橫向＝先往右（順時針），直向＝先往下（逆時針）；收尾越過起點一點 */
  const pts: [number, number][] =
    dir === 'h'
      ? [
          [x0 + W * 0.08, y0 + j(1, jy)],
          [x1 - W * 0.04 + j(2, jx), y0 + j(3, jy)],
          [x1 + j(4, jx), y0 + H * 0.18],
          [x1 + j(5, jx), y1 - H * 0.12],
          [x1 - W * 0.06, y1 + j(6, jy)],
          [x0 + W * 0.05 + j(7, jx), y1 + j(8, jy)],
          [x0 + j(9, jx), y1 - H * 0.16],
          [x0 + j(10, jx), y0 + H * 0.14],
          [x0 + W * 0.06, y0 - jy * 0.6],
          [x0 + W * 0.24, y0 + j(11, jy)],
        ]
      : [
          [x0 + j(1, jx), y0 + H * 0.08],
          [x0 + j(2, jx), y1 - H * 0.04 + j(3, jy)],
          [x0 + W * 0.18, y1 + j(4, jy)],
          [x1 - W * 0.12, y1 + j(5, jy)],
          [x1 + j(6, jx), y1 - H * 0.06],
          [x1 + j(7, jx), y0 + H * 0.05 + j(8, jy)],
          [x1 - W * 0.16, y0 + j(9, jy)],
          [x0 + W * 0.14, y0 + j(10, jy)],
          [x0 - jx * 0.6, y0 + H * 0.06],
          [x0 + j(11, jx), y0 + H * 0.24],
        ];
  /* 中間插點讓線有點彎 */
  const out: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push(a);
    const nx = -(b[1] - a[1]);
    const ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1;
    const bow = hashSigned(seed, 40 + i) * Math.min(pad * 0.35, 3 + nl * 0.01);
    out.push([(a[0] + b[0]) / 2 + (nx / nl) * bow, (a[1] + b[1]) / 2 + (ny / nl) * bow]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

/** 一條稍微不直的線（a → b） */
function wobblyLine(
  a: [number, number],
  b: [number, number],
  seed: number,
  amp: number,
): [number, number][] {
  const n = 6;
  const nx = -(b[1] - a[1]);
  const ny = b[0] - a[0];
  const nl = Math.hypot(nx, ny) || 1;
  return Array.from({ length: n + 1 }, (_, i) => {
    const u = i / n;
    const off = i === 0 || i === n ? 0 : hashSigned(seed, i) * amp;
    return [a[0] + (b[0] - a[0]) * u + (nx / nl) * off, a[1] + (b[1] - a[1]) * u + (ny / nl) * off];
  });
}

export function drawMarker(
  g: Ctx,
  f: MarkerFrame,
  r: Rect,
  q: number,
  lw: number,
  multiply = true,
): void {
  if (q <= 0 || r.w <= 0 || r.h <= 0) return;
  const seed = seedOf(f.id);
  g.save();
  if (isHighlight(f.style)) {
    /* 螢光筆：色塊以色彩增值疊上，兩端稍圓，沿方向長出（圖層匯出時一般疊上，剪輯軟體裡再設色彩增值） */
    if (multiply) g.globalCompositeOperation = 'multiply';
    g.fillStyle = HIGHLIGHT_COLORS[f.style];
    g.globalAlpha = 0.92;
    const grow = spanRect(r, f.dir, 0, q);
    const inset = f.dir === 'h' ? r.h * 0.04 : r.w * 0.04;
    const body =
      f.dir === 'h'
        ? { x: grow.x, y: grow.y + inset, w: grow.w, h: grow.h - inset * 2 }
        : { x: grow.x + inset, y: grow.y, w: grow.w - inset * 2, h: grow.h };
    const rad = Math.min(body.w, body.h) * 0.22;
    g.beginPath();
    roundRectPath(g, body.x, body.y, body.w, body.h, rad);
    g.fill();
    g.restore();
    return;
  }
  g.strokeStyle = RED_PEN;
  g.lineWidth = lw;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.globalAlpha = 0.95;
  if (f.style === 'redBox') {
    const pad = Math.max(lw * 1.6, Math.min(r.w, r.h) * 0.12);
    strokePartial(g, handBoxPoints(r, pad, seed, f.dir), q);
  } else if (f.style === 'redLine') {
    const amp = lw * 0.35;
    const pts =
      f.dir === 'h'
        ? wobblyLine([r.x, r.y + r.h + lw * 0.9], [r.x + r.w, r.y + r.h + lw * 0.6], seed, amp)
        : wobblyLine([r.x + r.w + lw * 0.9, r.y], [r.x + r.w + lw * 0.6, r.y + r.h], seed, amp);
    strokePartial(g, pts, q);
  } else {
    /* 雙刪除線：先畫第一條、再畫第二條 */
    const amp = lw * 0.25;
    const lines: [[number, number], [number, number]][] =
      f.dir === 'h'
        ? [
            [
              [r.x, r.y + r.h * 0.42],
              [r.x + r.w, r.y + r.h * 0.38],
            ],
            [
              [r.x, r.y + r.h * 0.64],
              [r.x + r.w, r.y + r.h * 0.6],
            ],
          ]
        : [
            [
              [r.x + r.w * 0.6, r.y],
              [r.x + r.w * 0.62, r.y + r.h],
            ],
            [
              [r.x + r.w * 0.38, r.y],
              [r.x + r.w * 0.4, r.y + r.h],
            ],
          ];
    strokePartial(g, wobblyLine(lines[0][0], lines[0][1], seed, amp), clamp01(q * 2));
    strokePartial(g, wobblyLine(lines[1][0], lines[1][1], seed + 7, amp), clamp01(q * 2 - 1));
  }
  g.restore();
}

/* ---------- 塗黑 ---------- */

/** 毛玻璃的模糊（原圖 px）：框短邊的 5%～25%，依濃度（自訂） */
export const frostSigma = (f: RedactFrame): number =>
  Math.max(1.5, (0.05 + 0.2 * (f.density / 100)) * Math.min(f.w, f.h));

/** 馬賽克的格數（框的寬、高各幾格）：粒大小以截圖原本的大小（畫面 px）計 */
export function mosaicCells(f: RedactFrame, baseScale: number): { cols: number; rows: number } {
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
 * 馬賽克的格色：嚴格的區塊平均（規格 3.7）。src 是原圖從 (ox, oy) 開始的一塊（原圖 px）；
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

/** 馬賽克、毛玻璃的圖（原圖解析度；設定不變時沿用） */
function redactCrop(
  cache: RenderCache,
  img: ImageSource,
  f: RedactFrame,
  baseScale: number,
): { canvas: AnyCanvas; pad: number; smooth: boolean } | null {
  if (f.style === 'black') return null;
  const key = `${imageKey(img)}|${f.x},${f.y},${f.w},${f.h}|${f.style}|${f.density}|${f.grain}|${baseScale.toFixed(5)}`;
  const id = `${f.id}`;
  const hit = cache.crops.get(id);
  if (f.style === 'mosaic') {
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

export function drawRedact(
  g: Ctx,
  f: RedactFrame,
  r: Rect,
  span: [number, number],
  img: ImageSource,
  cache: RenderCache,
  baseScale: number,
): void {
  const [a, b] = span;
  if (b <= a || r.w <= 0 || r.h <= 0) return;
  const part = spanRect(r, f.dir, a, b);
  g.save();
  g.beginPath();
  g.rect(part.x, part.y, part.w, part.h);
  g.clip();
  if (f.style === 'black') {
    g.fillStyle = `rgba(12, 12, 14, ${(f.density / 100).toFixed(3)})`;
    g.fillRect(r.x, r.y, r.w, r.h);
  } else {
    const crop = redactCrop(cache, img, f, baseScale);
    if (crop) {
      g.imageSmoothingEnabled = crop.smooth;
      if (crop.smooth) g.imageSmoothingQuality = 'high';
      if (crop.smooth) g.drawImage(crop.canvas, crop.pad, crop.pad, f.w, f.h, r.x, r.y, r.w, r.h);
      else g.drawImage(crop.canvas, r.x, r.y, r.w, r.h);
    }
  }
  g.restore();
}

/* ---------- 塗黑的邊界演出（第二批，自訂） ---------- */

export const EDGE_GOLD = { r: 255, g: 200, b: 90 } as const;
export const EDGE_SCAN = { r: 150, g: 245, b: 255 } as const;

/**
 * 揭開、蓋上時移動中的那條邊：金光＝以邊為中心的橢圓金色光暈＋兩端淡出的亮線＋往露出那一側飄散的金色粒子；
 * 掃描線＝一條青白的亮線＋拖在露出那一側的淡青色。濃度＝發光強度 × 頭尾淡入淡出；q＝動作的進度（已套曲線）。
 */
export function drawEdge(g: Ctx, f: RedactFrame, r: Rect, q: number, u: number, k: number): void {
  if (f.mode === 'static' || f.edge === 'none') return;
  const A = edgeEnvelope(q) * (f.glow / 100);
  if (A <= 0) return;
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

/* ---------- 截圖上的框 ---------- */

interface AnnotationOptions {
  /** 只畫這些框 */
  filter?: (f: Frame) => boolean;
  /** 只畫跟它重疊的（放大框裡） */
  only?: Rect;
  /** 螢光筆以色彩增值疊上（圖層匯出時 false） */
  multiply?: boolean;
}

/** 螢光筆與塗黑（清單順序） */
function drawAnnotations(
  g: Ctx,
  m: Mapping,
  frames: readonly Frame[],
  prog: Progress,
  img: ImageSource,
  cache: RenderCache,
  baseScale: number,
  u: number,
  { filter, only, multiply = true }: AnnotationOptions = {},
) {
  const lw = penWidth(u);
  for (const f of frames) {
    if (f.kind === 'zoom') continue;
    if (filter && !filter(f)) continue;
    if (only && !intersects(f, only)) continue;
    const r = mapRect(m, f);
    const q = actionEase(prog.action(f));
    if (f.kind === 'marker') drawMarker(g, f, r, q, lw * m.k, multiply);
    else {
      drawRedact(g, f, r, coverSpan(f.mode, q), img, cache, baseScale);
      drawEdge(g, f, r, q, u, m.k);
    }
  }
}

/* ---------- 放大框 ---------- */

/** 撕紙的邊（依 id 固定）：沿外框每隔一段往內縮一點 */
function tornPath(g: Ctx, r: Rect, depth: number, step: number, seed: number) {
  const pts: [number, number][] = [];
  const edge = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    nx: number,
    ny: number,
    s: number,
  ) => {
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(2, Math.round(len / step));
    for (let i = 0; i < n; i++) {
      const u = i / n;
      const d = (hashSigned(seed, s * 1000 + i) * 0.5 + 0.5) * depth;
      pts.push([ax + (bx - ax) * u + nx * d, ay + (by - ay) * u + ny * d]);
    }
  };
  edge(r.x, r.y, r.x + r.w, r.y, 0, 1, 1);
  edge(r.x + r.w, r.y, r.x + r.w, r.y + r.h, -1, 0, 2);
  edge(r.x + r.w, r.y + r.h, r.x, r.y + r.h, 0, -1, 3);
  edge(r.x, r.y + r.h, r.x, r.y, 1, 0, 4);
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts.slice(1)) g.lineTo(p[0], p[1]);
  g.closePath();
}

const grow = (r: Rect, d: number): Rect => ({
  x: r.x - d,
  y: r.y - d,
  w: r.w + d * 2,
  h: r.h + d * 2,
});

/** 放大框的外觀參數（畫面 px；u＝短邊 1080 為 1） */
export const CARD = {
  radius: 12,
  cyan: '#3be6ff',
  paper: '#f3ecdb',
  tape: 'rgba(236, 222, 180, 0.78)',
} as const;

interface CardOptions {
  /** 畫外框、陰影與框裡的截圖（圖層「螢光筆」時 false：只畫框裡的螢光筆） */
  body: boolean;
  annotations: AnnotationOptions;
}

function drawCard(
  g: Ctx,
  z: ZoomFrame,
  p: number,
  layout: Layout,
  frames: readonly Frame[],
  prog: Progress,
  img: ImageSource,
  cache: RenderCache,
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
    drawAnnotations(g, m, frames, prog, img, cache, shot.f, u, { ...annotations, only: z });
    g.restore();
  };
  if (!body) {
    content(() => {
      g.beginPath();
      g.rect(C.x, C.y, C.w, C.h);
    });
    return;
  }
  const rectPath = (r: Rect, rad: number) => {
    g.beginPath();
    roundRectPath(g, r.x, r.y, r.w, r.h, rad);
  };

  if (z.style === 'card') {
    const R = CARD.radius * u;
    const outer = grow(C, b);
    g.save();
    g.shadowColor = `rgba(0, 0, 0, ${(0.5 * a).toFixed(3)})`;
    g.shadowBlur = 36 * u * a * ds;
    g.shadowOffsetY = 14 * u * a * ds;
    g.fillStyle = `rgba(255, 255, 255, ${a.toFixed(3)})`;
    rectPath(outer, R + b);
    g.fill();
    g.restore();
    content(() => rectPath(C, R));
    return;
  }
  if (z.style === 'torn') {
    const mg = (6 + 2.5 * z.border) * u;
    const paper = grow(C, mg);
    const seed = seedOf(z.id);
    g.save();
    g.globalAlpha = a;
    g.shadowColor = 'rgba(0, 0, 0, 0.45)';
    g.shadowBlur = 24 * u * ds;
    g.shadowOffsetY = 8 * u * ds;
    g.fillStyle = CARD.paper;
    tornPath(g, paper, mg * 0.55, 12 * u, seed);
    g.fill();
    g.restore();
    content(() => {
      g.beginPath();
      g.rect(C.x, C.y, C.w, C.h);
    });
    /* 上緣中間貼一段膠帶 */
    const tw = Math.min(paper.w * 0.28, 180 * u);
    const th = Math.max(14 * u, mg * 1.6);
    g.save();
    g.globalAlpha = a;
    g.translate(paper.x + paper.w / 2, paper.y + mg * 0.2);
    g.rotate((-3 * Math.PI) / 180);
    g.fillStyle = CARD.tape;
    g.fillRect(-tw / 2, -th / 2, tw, th);
    g.restore();
    return;
  }
  if (z.style === 'cyber') {
    g.save();
    g.globalAlpha = a;
    g.fillStyle = '#04121a';
    g.fillRect(C.x, C.y, C.w, C.h);
    g.restore();
    content(() => {
      g.beginPath();
      g.rect(C.x, C.y, C.w, C.h);
    });
    /* 掃描線與淡淡的青色 */
    g.save();
    g.beginPath();
    g.rect(C.x, C.y, C.w, C.h);
    g.clip();
    g.globalAlpha = a;
    g.fillStyle = 'rgba(59, 230, 255, 0.07)';
    g.fillRect(C.x, C.y, C.w, C.h);
    g.fillStyle = 'rgba(0, 0, 0, 0.08)';
    const gap = Math.max(3, 4 * u);
    for (let y = C.y; y < C.y + C.h; y += gap) g.fillRect(C.x, y, C.w, Math.max(1, gap * 0.4));
    g.restore();
    /* 發光的框與四角的括號 */
    g.save();
    g.globalAlpha = a;
    g.strokeStyle = CARD.cyan;
    g.shadowColor = CARD.cyan;
    g.shadowBlur = 18 * u * ds;
    g.lineWidth = b;
    g.strokeRect(C.x - b / 2, C.y - b / 2, C.w + b, C.h + b);
    const L = Math.min(C.w, C.h) * 0.18;
    const o = b * 2.5;
    g.lineWidth = b * 2;
    g.lineCap = 'square';
    g.beginPath();
    for (const [x, y, sx, sy] of [
      [C.x - o, C.y - o, 1, 1],
      [C.x + C.w + o, C.y - o, -1, 1],
      [C.x + C.w + o, C.y + C.h + o, -1, -1],
      [C.x - o, C.y + C.h + o, 1, -1],
    ] as const) {
      g.moveTo(x + sx * L, y);
      g.lineTo(x, y);
      g.lineTo(x, y + sy * L);
    }
    g.stroke();
    g.restore();
    return;
  }
  /* 只有陰影（陰影只在卡片外面：框裡的截圖有透明處時看得到底下的畫面，不是黑底） */
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
  content(() => rectPath(C, R));
}

/* ---------- 出處 ---------- */

/** 亮度（0～1） */
function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

function drawCredit(g: Ctx, s: FxState, layout: Layout) {
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

export interface FrameInput {
  state: FxState;
  /** 解碼好的原圖（沒有圖時 null） */
  image: ImageSource | null;
}

export interface RenderOptions {
  /** 運鏡：畫面上的哪一塊（畫面 px）放大到整個畫面；null＝全圖 */
  view?: Rect | null;
  /** 每個框各自的進度（段階公開）；不給時依時間 */
  progress?: Progress;
  /** 圖層：背景（背景＋截圖＋靜止的塗黑＋出處）、放大框（周圍變暗＋放大框，框裡只有靜止的塗黑）、螢光筆、完成（預設） */
  layer?: LayerId;
}

const isStaticRedact = (f: Frame) => f.kind === 'redact' && f.mode === 'static';
const isMarker = (f: Frame) => f.kind === 'marker';

/** 畫 t 秒的那一格（畫布大小要等於畫面大小） */
export function renderFrame(
  g: Ctx,
  input: FrameInput,
  t: number,
  cache: RenderCache,
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
    /* 放大後截圖從原圖重畫一次（底圖是畫面解析度，放大會糊） */
    if (image && withBase) {
      g.save();
      clipShot(g, s, shot);
      g.imageSmoothingQuality = 'high';
      g.drawImage(image, shot.x, shot.y, shot.w, shot.h);
      g.restore();
    }
  }
  if (image) {
    const prog = opts.progress ?? timeProgress(timelineOf(s), t);
    const u = unitOf(canvas);
    const filter =
      layer === 'background' || layer === 'cutouts'
        ? isStaticRedact
        : layer === 'markers'
          ? isMarker
          : undefined;
    const ann: AnnotationOptions = { filter, multiply: layer !== 'markers' };
    const zooms = s.frames.filter((f): f is ZoomFrame => f.kind === 'zoom');
    if (layer !== 'cutouts') {
      g.save();
      clipShot(g, s, shot);
      if (layer === 'markers') {
        /* 螢光筆圖層：放大框蓋住的地方不畫截圖上的那一份（放大框裡另外畫，疊起來才不會重複） */
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
        ann,
      );
      g.restore();
    }
    if (layer !== 'background') {
      const p = zooms.reduce((mx, z) => Math.max(mx, prog.popup(z)), 0);
      if (layer !== 'markers' && zooms.length && s.shot.spotlight > 0 && p > 0) {
        g.save();
        if (s.bg.mode === 'transparent') clipShot(g, s, shot);
        /* 完成圖：只把已經畫上去的東西調暗（source-atop）——截圖的透明處維持透明，不會變成一層半透明的黑 */
        if (layer === 'final') g.globalCompositeOperation = 'source-atop';
        g.fillStyle = `rgba(0, 0, 0, ${((s.shot.spotlight / 100) * popupAlpha(p)).toFixed(4)})`;
        g.fillRect(-W, -H, W * 3, H * 3);
        g.restore();
      }
      for (const z of zooms)
        drawCard(g, z, prog.popup(z), layout, s.frames, prog, image, cache, {
          body: layer !== 'markers',
          annotations: ann,
        });
    }
  }
  if (withBase) drawCredit(g, s, layout);
  g.restore();
}

/** 畫成一張新的畫布 */
export function renderToCanvas(
  input: FrameInput,
  t: number,
  cache = new RenderCache(),
  opts: RenderOptions = {},
): AnyCanvas {
  const layout = computeLayout(
    input.state,
    input.image ? { width: input.image.width, height: input.image.height } : null,
  );
  const c = makeCanvas(layout.canvas.width, layout.canvas.height);
  renderFrame(ctxOf(c), input, t, cache, opts);
  return c;
}
