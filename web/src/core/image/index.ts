/**
 * 影像：載入、透明邊界偵測、等比縮放、裁切、取主色、轉檔。
 */
import { formatHex } from '../color';

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 可以畫到 canvas 上的來源 */
export type DrawableImage = ImageBitmap | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

export type ImageKind = 'png' | 'apng' | 'webp' | 'gif' | 'jpeg' | 'avif' | 'bmp';

/**
 * 依檔案開頭的位元組判斷實際格式（不看副檔名與瀏覽器回報的 MIME）。
 * PNG 會再看有沒有 acTL 判斷是不是 APNG。認不得時回傳 null。
 */
export function detectImageType(bytes: Uint8Array): ImageKind | null {
  const b = bytes;
  const at = (o: number, s: string) => s.split('').every((c, i) => b[o + i] === c.charCodeAt(0));
  if (b[0] === 0x89 && at(1, 'PNG')) {
    /* acTL 必須在第一個 IDAT 之前，掃前面的 chunk 就夠 */
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let o = 8;
    while (o + 8 <= b.length) {
      const len = dv.getUint32(o);
      if (at(o + 4, 'acTL')) return 'apng';
      if (at(o + 4, 'IDAT')) break;
      o += 12 + len;
    }
    return 'png';
  }
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'webp';
  if (at(0, 'GIF8')) return 'gif';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (at(4, 'ftyp') && (at(8, 'avif') || at(8, 'avis'))) return 'avif';
  if (at(0, 'BM')) return 'bmp';
  return null;
}

/** 影像的原始尺寸 */
export function imageSize(img: DrawableImage): Size {
  if (typeof HTMLImageElement !== 'undefined' && img instanceof HTMLImageElement) {
    return { width: img.naturalWidth, height: img.naturalHeight };
  }
  return { width: img.width, height: img.height };
}

function loadViaElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('無法讀取這張圖片'));
    img.src = url;
  });
}

/**
 * 載入圖片成 ImageBitmap。
 * 來源可以是 File／Blob 或網址；SVG 等 createImageBitmap 不吃的格式會改走 <img> 解碼。
 */
export async function loadImage(src: Blob | string): Promise<ImageBitmap> {
  const blob = typeof src === 'string' ? await (await fetch(src)).blob() : src;
  try {
    return await createImageBitmap(blob);
  } catch {
    const url = URL.createObjectURL(blob);
    try {
      const img = await loadViaElement(url);
      return await createImageBitmap(img);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/** 建立畫布（主執行緒用 <canvas>，Worker 用 OffscreenCanvas） */
export function makeCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  const w = Math.max(1, Math.ceil(width));
  const h = Math.max(1, Math.ceil(height));
  if (typeof document === 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function ctx2d(c: HTMLCanvasElement | OffscreenCanvas, willRead = false) {
  const ctx = c.getContext('2d', { willReadFrequently: willRead }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
}

/** 取整張影像的像素 */
export function getImageData(img: DrawableImage): ImageData {
  const { width, height } = imageSize(img);
  const c = makeCanvas(width, height);
  const ctx = ctx2d(c, true);
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, width, height);
}

export interface PixelBuffer {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * 不透明像素的範圍（alpha > threshold）。整張透明時回傳 null。
 * 用於「去掉透明邊」：cropImage(img, opaqueBounds(getImageData(img)))
 */
export function opaqueBounds({ data, width, height }: PixelBuffer, threshold = 0): Rect | null {
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    let first = -1;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] > threshold) {
        first = x;
        break;
      }
    }
    if (first < 0) continue;
    let last = first;
    for (let x = width - 1; x > first; x--) {
      if (data[row + x * 4 + 3] > threshold) {
        last = x;
        break;
      }
    }
    if (y < y0) y0 = y;
    y1 = y;
    if (first < x0) x0 = first;
    if (last > x1) x1 = last;
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** 一次讀的帶寬：從 16 px 起每次加倍，最多 512 px */
const SCAN_FIRST_BAND = 16;
const SCAN_MAX_BAND = 512;

/**
 * 與 opaqueBounds 相同的結果，但不必一次取整張像素：從上、下往內一條一條讀橫帶，
 * 再在上下範圍內從左、右往內讀直帶，碰到有內容的那一條就停（帶寬從 16 px 起加倍）。
 * read(x, y, w, h) 回傳那一塊的 RGBA（列優先、w × h × 4）。
 * 四周留白不多的大圖只會讀到邊緣的幾條；整張透明時會讀完整張並回傳 null。
 */
export function scanOpaqueBounds(
  width: number,
  height: number,
  read: (x: number, y: number, w: number, h: number) => ArrayLike<number>,
  threshold = 0,
): Rect | null {
  if (width <= 0 || height <= 0) return null;
  const rowHas = (d: ArrayLike<number>, w: number, r: number) => {
    for (let i = r * w * 4 + 3, end = i + w * 4; i < end; i += 4) if (d[i] > threshold) return true;
    return false;
  };
  const colHas = (d: ArrayLike<number>, w: number, h: number, c: number) => {
    for (let i = c * 4 + 3, end = h * w * 4; i < end; i += w * 4) if (d[i] > threshold) return true;
    return false;
  };
  const grow = (band: number) => Math.min(band * 2, SCAN_MAX_BAND);

  let top = -1;
  for (let y = 0, band = SCAN_FIRST_BAND; top < 0 && y < height; band = grow(band)) {
    const h = Math.min(band, height - y);
    const d = read(0, y, width, h);
    for (let r = 0; r < h; r++)
      if (rowHas(d, width, r)) {
        top = y + r;
        break;
      }
    y += h;
  }
  if (top < 0) return null;

  let bottom = -1;
  for (let end = height, band = SCAN_FIRST_BAND; bottom < 0 && end > top; band = grow(band)) {
    const y0 = Math.max(top, end - band);
    const h = end - y0;
    const d = read(0, y0, width, h);
    for (let r = h - 1; r >= 0; r--)
      if (rowHas(d, width, r)) {
        bottom = y0 + r;
        break;
      }
    end = y0;
  }
  if (bottom < 0) return null;

  const rows = bottom - top + 1;
  let left = -1;
  for (let x = 0, band = SCAN_FIRST_BAND; left < 0 && x < width; band = grow(band)) {
    const w = Math.min(band, width - x);
    const d = read(x, top, w, rows);
    for (let c = 0; c < w; c++)
      if (colHas(d, w, rows, c)) {
        left = x + c;
        break;
      }
    x += w;
  }
  if (left < 0) return null;

  let right = -1;
  for (let end = width, band = SCAN_FIRST_BAND; right < 0 && end > left; band = grow(band)) {
    const x0 = Math.max(left, end - band);
    const w = end - x0;
    const d = read(x0, top, w, rows);
    for (let c = w - 1; c >= 0; c--)
      if (colHas(d, w, rows, c)) {
        right = x0 + c;
        break;
      }
    end = x0;
  }
  if (right < 0) return null;
  return { x: left, y: top, width: right - left + 1, height: rows };
}

/**
 * 影像裡透明度大於 threshold 的範圍（結果同 opaqueBounds(getImageData(img), threshold)），
 * 但用 scanOpaqueBounds 只讀四周需要的部分，大圖不必整張轉成 ImageData。整張透明時回傳 null。
 */
export function imageOpaqueBounds(img: DrawableImage, threshold = 0): Rect | null {
  const { width, height } = imageSize(img);
  return scanOpaqueBounds(
    width,
    height,
    (x, y, w, h) => {
      const ctx = ctx2d(makeCanvas(w, h), true);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
      return ctx.getImageData(0, 0, w, h).data;
    },
    threshold,
  );
}

/** 範圍往外加邊距（不超出影像） */
export function padRect(r: Rect, pad: number, bounds: Size): Rect {
  const x = Math.max(0, r.x - pad);
  const y = Math.max(0, r.y - pad);
  return {
    x,
    y,
    width: Math.min(bounds.width, r.x + r.width + pad) - x,
    height: Math.min(bounds.height, r.y + r.height + pad) - y,
  };
}

export type FitMode = 'contain' | 'cover';

/**
 * 等比縮放到框內。contain：整張放得進框；cover：填滿框（超出的部分會被裁掉）。
 * 回傳縮放後的尺寸與置中時的位置。
 */
export function fitSize(
  src: Size,
  box: Size,
  mode: FitMode = 'contain',
  allowUpscale = true,
): Rect & { scale: number } {
  const sx = box.width / src.width;
  const sy = box.height / src.height;
  let scale = mode === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
  if (!allowUpscale) scale = Math.min(1, scale);
  const width = src.width * scale;
  const height = src.height * scale;
  return { x: (box.width - width) / 2, y: (box.height - height) / 2, width, height, scale };
}

export interface ResizeOptions {
  /** 'smooth'（預設，大幅縮小時分段縮，比較不會鋸齒）或 'pixelated'（像素圖用最近鄰） */
  quality?: 'smooth' | 'pixelated';
}

/** 縮放成指定尺寸，回傳畫布 */
export function resizeImage(
  img: DrawableImage,
  width: number,
  height: number,
  { quality = 'smooth' }: ResizeOptions = {},
): HTMLCanvasElement | OffscreenCanvas {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  let src: DrawableImage = img;
  let { width: cw, height: ch } = imageSize(img);
  if (quality === 'smooth') {
    /* 一次縮太多會失真：每次最多縮一半 */
    while (cw / 2 >= W && ch / 2 >= H) {
      cw = Math.round(cw / 2);
      ch = Math.round(ch / 2);
      const step = makeCanvas(cw, ch);
      const sctx = ctx2d(step);
      sctx.imageSmoothingQuality = 'high';
      sctx.drawImage(src, 0, 0, cw, ch);
      src = step;
    }
  }
  const out = makeCanvas(W, H);
  const ctx = ctx2d(out);
  ctx.imageSmoothingEnabled = quality === 'smooth';
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, W, H);
  return out;
}

/** 裁切（超出影像的部分為透明），回傳畫布 */
export function cropImage(img: DrawableImage, rect: Rect): HTMLCanvasElement | OffscreenCanvas {
  const out = makeCanvas(rect.width, rect.height);
  ctx2d(out).drawImage(img, -Math.round(rect.x), -Math.round(rect.y));
  return out;
}

/** 畫布 → Blob */
export async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  type = 'image/png',
  quality?: number,
): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('無法輸出圖片'))), type, quality),
  );
}

/** 鋪上底色的複本（JPG 沒有透明：透明處變成底色，而不是黑色） */
export function flattenCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  background = '#ffffff',
): HTMLCanvasElement | OffscreenCanvas {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(canvas, 0, 0);
  return out;
}

/**
 * 輸出 JPG（品質 0～1，預設 0.95）。畫布有透明處時先鋪上 background（預設白色）；
 * 已經畫好不透明底（例如紙張底色）時傳 background: null 直接輸出。
 */
export function canvasToJpeg(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  { quality = 0.95, background = '#ffffff' }: { quality?: number; background?: string | null } = {},
): Promise<Blob> {
  const src = background ? flattenCanvas(canvas, background) : canvas;
  return canvasToBlob(src, 'image/jpeg', quality);
}

export interface DominantColor {
  /** #rrggbb */
  color: string;
  /** 占不透明像素的比例 0～1 */
  ratio: number;
}

/**
 * 取主色：忽略透明像素，以 k-means 分成 count 群，依面積由大到小排序。
 * sampleStep：每隔幾個像素取一個（大圖時加快）。
 */
export function dominantColors(
  { data, width, height }: PixelBuffer,
  count = 5,
  { alphaThreshold = 128, sampleStep = 0 }: { alphaThreshold?: number; sampleStep?: number } = {},
): DominantColor[] {
  const step =
    sampleStep > 0 ? sampleStep : Math.max(1, Math.floor(Math.sqrt((width * height) / 40000)));
  /* 5 位元分桶，桶內記總和 */
  const B = 1 << 15;
  const cnt = new Float64Array(B);
  const sr = new Float64Array(B);
  const sg = new Float64Array(B);
  const sb = new Float64Array(B);
  let total = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      if (data[i + 3] < alphaThreshold) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      cnt[k]++;
      sr[k] += r;
      sg[k] += g;
      sb[k] += b;
      total++;
    }
  }
  if (!total) return [];
  const buckets: { r: number; g: number; b: number; n: number }[] = [];
  for (let k = 0; k < B; k++)
    if (cnt[k])
      buckets.push({ r: sr[k] / cnt[k], g: sg[k] / cnt[k], b: sb[k] / cnt[k], n: cnt[k] });
  buckets.sort((p, q) => q.n - p.n);
  const K = Math.min(count, buckets.length);
  /* 初始中心：由多到少挑，跳過和已選中心太接近的 */
  const centers: { r: number; g: number; b: number }[] = [];
  const dist = (p: { r: number; g: number; b: number }, q: { r: number; g: number; b: number }) =>
    (p.r - q.r) ** 2 + (p.g - q.g) ** 2 + (p.b - q.b) ** 2;
  for (const bk of buckets) {
    if (centers.length >= K) break;
    if (centers.every((c) => dist(c, bk) > 40 * 40)) centers.push({ r: bk.r, g: bk.g, b: bk.b });
  }
  for (const bk of buckets) {
    if (centers.length >= K) break;
    if (!centers.some((c) => dist(c, bk) === 0)) centers.push({ r: bk.r, g: bk.g, b: bk.b });
  }
  const weight = new Float64Array(centers.length);
  for (let iter = 0; iter < 8; iter++) {
    const acc = centers.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (const bk of buckets) {
      let bi = 0;
      let bd = Number.POSITIVE_INFINITY;
      centers.forEach((c, i) => {
        const d = dist(c, bk);
        if (d < bd) {
          bd = d;
          bi = i;
        }
      });
      const a = acc[bi];
      a.r += bk.r * bk.n;
      a.g += bk.g * bk.n;
      a.b += bk.b * bk.n;
      a.n += bk.n;
    }
    acc.forEach((a, i) => {
      weight[i] = a.n;
      if (a.n) centers[i] = { r: a.r / a.n, g: a.g / a.n, b: a.b / a.n };
    });
  }
  return centers
    .map((c, i) => ({ color: formatHex({ ...c, a: 1 }), ratio: weight[i] / total }))
    .filter((c) => c.ratio > 0)
    .sort((p, q) => q.ratio - p.ratio);
}

/* ---------- 裁切框計算（CropDialog 使用，也可以給工具直接用） ---------- */

export type CropHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** 置中、符合比例（寬／高）的最大裁切框；aspect 為 null 時是整張 */
export function centeredCrop(bounds: Size, aspect: number | null): Rect {
  if (!aspect) return { x: 0, y: 0, width: bounds.width, height: bounds.height };
  let width = bounds.width;
  let height = width / aspect;
  if (height > bounds.height) {
    height = bounds.height;
    width = height * aspect;
  }
  return {
    x: Math.round((bounds.width - width) / 2),
    y: Math.round((bounds.height - height) / 2),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** 把裁切框限制在影像內、不小於 minSize，並（有比例時）維持比例 */
export function clampCrop(r: Rect, bounds: Size, aspect: number | null, minSize = 8): Rect {
  let { width, height } = r;
  width = Math.max(minSize, Math.min(bounds.width, width));
  height = Math.max(minSize, Math.min(bounds.height, height));
  if (aspect) {
    if (width / height > aspect) width = height * aspect;
    else height = width / aspect;
    if (width > bounds.width) {
      width = bounds.width;
      height = width / aspect;
    }
    if (height > bounds.height) {
      height = bounds.height;
      width = height * aspect;
    }
  }
  const x = Math.max(0, Math.min(bounds.width - width, r.x));
  const y = Math.max(0, Math.min(bounds.height - height, r.y));
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  };
}

/** 拖曳控制點：依移動量（影像座標）調整裁切框 */
export function resizeCrop(
  r: Rect,
  handle: CropHandle,
  dx: number,
  dy: number,
  bounds: Size,
  aspect: number | null,
  minSize = 8,
): Rect {
  let x0 = r.x;
  let y0 = r.y;
  let x1 = r.x + r.width;
  let y1 = r.y + r.height;
  if (handle.includes('w')) x0 = Math.min(x1 - minSize, Math.max(0, x0 + dx));
  if (handle.includes('e')) x1 = Math.max(x0 + minSize, Math.min(bounds.width, x1 + dx));
  if (handle.includes('n')) y0 = Math.min(y1 - minSize, Math.max(0, y0 + dy));
  if (handle.includes('s')) y1 = Math.max(y0 + minSize, Math.min(bounds.height, y1 + dy));
  let width = x1 - x0;
  let height = y1 - y0;
  if (aspect) {
    const horizontalOnly = handle === 'e' || handle === 'w';
    const verticalOnly = handle === 'n' || handle === 's';
    if (horizontalOnly) height = width / aspect;
    else if (verticalOnly) width = height * aspect;
    else if (Math.abs(dx) >= Math.abs(dy)) height = width / aspect;
    else width = height * aspect;
    /* 固定在拖曳點的對角 */
    if (handle.includes('w')) x0 = x1 - width;
    if (handle.includes('n')) y0 = y1 - height;
    if (verticalOnly) x0 = r.x + (r.width - width) / 2;
    if (horizontalOnly) y0 = r.y + (r.height - height) / 2;
  }
  return clampCrop({ x: x0, y: y0, width, height }, bounds, aspect, minSize);
}

/* ---------- 嵌入 CSS（data URI）與圖片儲存 ---------- */
export * from './embed';
export * from './store';
