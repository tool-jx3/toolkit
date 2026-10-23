/**
 * 畫一格（規格 3.3～3.7）：預覽與匯出共用同一段程式。
 *
 * 順序：底圖（背景＋截圖的陰影＋圓角截圖，設定不變時快取）→ 截圖上的螢光筆與塗黑 → 聚光（周圍變暗）→
 * 放大框（以框的中心放大、樣式外框；框裡重畫一次截圖與跟它重疊的螢光筆、塗黑，所以它們跟著放大）→ 出處。
 * 螢光筆、塗黑、放大框的外觀都是本站自己設計的（原作的程式與樣式拿不到，也不能沿用）。
 */
import { makeCanvas, roundRectPath } from '@/core/image';
import { blurCanvas } from '@/core/scene';
import { clamp01, hashSigned, seedOf } from '@/core/timeline';
import {
  actionEase,
  actionProgress,
  buildTimeline,
  cardRect,
  computeLayout,
  coverSpan,
  type Frame,
  type FxState,
  HIGHLIGHT_COLORS,
  intersects,
  isHighlight,
  type Layout,
  type MarkerFrame,
  type Placement,
  popupAlpha,
  popupProgress,
  RED_PEN,
  type Rect,
  type RedactFrame,
  type Size,
  spanRect,
  type Timeline,
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

const ctxOf = (c: AnyCanvas): Ctx => {
  const g = c.getContext('2d') as Ctx | null;
  if (!g) throw new Error('無法建立畫布');
  return g;
};

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
    if (s.shot.shadow > 0) {
      /* 陰影：形狀畫在畫面外、只留陰影（圖片有透明處時不會透出黑底） */
      const off = canvas.width + shot.w + 100;
      g.save();
      g.shadowColor = 'rgba(0, 0, 0, 0.55)';
      g.shadowBlur = s.shot.shadow;
      g.shadowOffsetX = off;
      g.shadowOffsetY = s.shot.shadow * 0.35;
      g.fillStyle = '#000';
      g.beginPath();
      roundRectPath(g, shot.x - off, shot.y, shot.w, shot.h, shotRadius(s, shot));
      g.fill();
      g.restore();
    }
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

export function drawMarker(g: Ctx, f: MarkerFrame, r: Rect, q: number, lw: number): void {
  if (q <= 0 || r.w <= 0 || r.h <= 0) return;
  const seed = seedOf(f.id);
  g.save();
  if (isHighlight(f.style)) {
    /* 螢光筆：色塊以色彩增值疊上，兩端稍圓，沿方向長出 */
    g.globalCompositeOperation = 'multiply';
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
    const c = makeCanvas(cols, rows);
    const g = ctxOf(c);
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, f.x, f.y, f.w, f.h, 0, 0, cols, rows);
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

/* ---------- 截圖上的框 ---------- */

/** 螢光筆與塗黑（清單順序）；only 給了時只畫跟它重疊的（放大框裡） */
function drawAnnotations(
  g: Ctx,
  m: Mapping,
  frames: readonly Frame[],
  tl: Timeline,
  t: number,
  img: ImageSource,
  cache: RenderCache,
  baseScale: number,
  lw: number,
  only?: Rect,
) {
  for (const f of frames) {
    if (f.kind === 'zoom') continue;
    if (only && !intersects(f, only)) continue;
    const r = mapRect(m, f);
    const q = actionEase(actionProgress(tl, f.id, t));
    if (f.kind === 'marker') drawMarker(g, f, r, q, lw * m.k);
    else drawRedact(g, f, r, coverSpan(f.mode, q), img, cache, baseScale);
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
  margin: 12,
  cyan: '#3be6ff',
  paper: '#f3ecdb',
  tape: 'rgba(236, 222, 180, 0.78)',
} as const;

function drawCard(
  g: Ctx,
  z: ZoomFrame,
  p: number,
  layout: Layout,
  frames: readonly Frame[],
  tl: Timeline,
  t: number,
  img: ImageSource,
  cache: RenderCache,
  lw: number,
) {
  if (p <= 0) return;
  const { shot, canvas } = layout;
  const u = unitOf(canvas);
  const k = zoomFactor(z.scale, p);
  const a = popupAlpha(p);
  const C = cardRect(z, shot, canvas, k, CARD.margin * u);
  const m: Mapping = { ox: C.x - z.x * shot.f * k, oy: C.y - z.y * shot.f * k, s: shot.f * k, k };
  const b = z.border * u;
  const content = (clip: () => void) => {
    g.save();
    clip();
    g.clip();
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, z.x, z.y, z.w, z.h, C.x, C.y, C.w, C.h);
    drawAnnotations(g, m, frames, tl, t, img, cache, shot.f, lw, z);
    g.restore();
  };
  const rectPath = (r: Rect, rad: number) => {
    g.beginPath();
    roundRectPath(g, r.x, r.y, r.w, r.h, rad);
  };

  if (z.style === 'card') {
    const R = CARD.radius * u;
    const outer = grow(C, b);
    g.save();
    g.shadowColor = `rgba(0, 0, 0, ${(0.5 * a).toFixed(3)})`;
    g.shadowBlur = 36 * u * a;
    g.shadowOffsetY = 14 * u * a;
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
    g.shadowBlur = 24 * u;
    g.shadowOffsetY = 8 * u;
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
    g.shadowBlur = 18 * u;
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
  /* 只有陰影 */
  const R = 6 * u;
  g.save();
  g.shadowColor = `rgba(0, 0, 0, ${(0.62 * a).toFixed(3)})`;
  g.shadowBlur = 40 * u * a;
  g.shadowOffsetY = 16 * u * a;
  g.fillStyle = '#000';
  rectPath(C, R);
  g.fill();
  g.restore();
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
      g.shadowColor = 'rgba(0, 0, 0, 0.65)';
      g.shadowBlur = c.px * 0.35;
      g.shadowOffsetY = c.px * 0.06;
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

/** 畫 t 秒的那一格（畫布大小要等於畫面大小） */
export function renderFrame(g: Ctx, input: FrameInput, t: number, cache: RenderCache): void {
  const { state: s, image } = input;
  const layout = computeLayout(s, image ? { width: image.width, height: image.height } : null);
  const { canvas, shot } = layout;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(baseOf(cache, image, s, layout), 0, 0);
  if (image) {
    const tl = buildTimeline(s.timing, s.frames);
    const u = unitOf(canvas);
    const lw = penWidth(u);
    const base: Mapping = { ox: shot.x, oy: shot.y, s: shot.f, k: 1 };
    g.save();
    clipShot(g, s, shot);
    drawAnnotations(g, base, s.frames, tl, t, image, cache, shot.f, lw);
    g.restore();
    const zooms = s.frames.filter((f): f is ZoomFrame => f.kind === 'zoom');
    const p = popupProgress(tl, t);
    if (zooms.length && s.shot.spotlight > 0 && p > 0) {
      g.save();
      if (s.bg.mode === 'transparent') clipShot(g, s, shot);
      g.fillStyle = `rgba(0, 0, 0, ${((s.shot.spotlight / 100) * popupAlpha(p)).toFixed(4)})`;
      g.fillRect(0, 0, canvas.width, canvas.height);
      g.restore();
    }
    for (const z of zooms) drawCard(g, z, p, layout, s.frames, tl, t, image, cache, lw);
  }
  drawCredit(g, s, layout);
  g.restore();
}

/** 畫成一張新的畫布 */
export function renderToCanvas(input: FrameInput, t: number, cache = new RenderCache()): AnyCanvas {
  const layout = computeLayout(
    input.state,
    input.image ? { width: input.image.width, height: input.image.height } : null,
  );
  const c = makeCanvas(layout.canvas.width, layout.canvas.height);
  renderFrame(ctxOf(c), input, t, cache);
  return c;
}
