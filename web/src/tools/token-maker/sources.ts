/**
 * 圖片與遮罩的資料（不在 store 裡的大東西）：
 * - 圖片存在資產庫（IndexedDB），狀態只記 id；解碼後另外做一份「遮罩大小」的 RGBA（魔術棒、自動、邊界用）。
 * - 遮罩存成 PNG（白色＋不透明度＝遮罩值，256 色調色盤），id 依內容產生；記憶體留最近用過的。
 * - 柔邊後的遮罩畫布、出框的邊界點依遮罩快取。
 */
import { useEffect, useState } from 'react';
import { addImageFile, createAssetStore } from '@/core/assets';
import { encodePng } from '@/core/encode';
import { featherMask, getImageData, loadImage, makeCanvas } from '@/core/image';
import { type Mask, maskBoundary, maskSizeFor, type Rgba } from './mask';
import { IMAGE_MAX_SIDE, type ImageRef, type MaskRef } from './model';

export const TOOL_ID = 'token-maker';
export const assets = createAssetStore(TOOL_ID);

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/* ---------- 圖片 ---------- */

export interface ImageWork {
  bitmap: ImageBitmap;
  /** 遮罩大小的 RGBA */
  work: Rgba;
}

const works = new Map<string, ImageWork>();
const workJobs = new Map<string, Promise<ImageWork | null>>();
const WORK_MAX = 12;

function makeWork(bitmap: ImageBitmap, ref: { width: number; height: number }): Rgba {
  const ms = maskSizeFor(ref);
  const c = makeCanvas(ms.width, ms.height);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, ms.width, ms.height);
  const d = ctx.getImageData(0, 0, ms.width, ms.height);
  return { width: ms.width, height: ms.height, data: d.data };
}

export const peekImageWork = (id: string): ImageWork | undefined => works.get(id);

export function loadImageWork(ref: ImageRef): Promise<ImageWork | null> {
  const hit = works.get(ref.id);
  if (hit) return Promise.resolve(hit);
  const running = workJobs.get(ref.id);
  if (running) return running;
  const job = assets
    .bitmap(ref.id)
    .then((bitmap) => {
      workJobs.delete(ref.id);
      if (!bitmap) return null;
      const w: ImageWork = { bitmap, work: makeWork(bitmap, ref) };
      works.set(ref.id, w);
      if (works.size > WORK_MAX) {
        const first = works.keys().next().value;
        if (first !== undefined) works.delete(first);
      }
      return w;
    })
    .catch(() => {
      workJobs.delete(ref.id);
      return null;
    });
  workJobs.set(ref.id, job);
  return job;
}

/** 讀一張圖放進資產庫（長邊超過 2048 時縮小；讀不了時丟 ImageLoadError） */
export async function storeImage(file: File): Promise<{ ref: ImageRef; persisted: boolean }> {
  const r = await addImageFile(assets, file, { maxSide: IMAGE_MAX_SIDE });
  return { ref: r.ref, persisted: r.persisted };
}

/* ---------- 遮罩 ---------- */

const masks = new Map<string, Mask>();
const maskJobs = new Map<string, Promise<Mask | null>>();
const MASK_CACHE = 80;

function rememberMask(id: string, m: Mask): void {
  masks.delete(id);
  masks.set(id, m);
  if (masks.size > MASK_CACHE) {
    const first = masks.keys().next().value;
    if (first !== undefined) masks.delete(first);
  }
}

export const peekMask = (id: string): Mask | undefined => masks.get(id);

/** 256 色的調色盤：第 i 色＝白色、不透明度 i（遮罩值直接當索引） */
const MASK_PALETTE = (() => {
  const p = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    p[i * 4] = p[i * 4 + 1] = p[i * 4 + 2] = 255;
    p[i * 4 + 3] = i;
  }
  return p;
})();

/** 遮罩 → PNG 的位元組（同樣的遮罩每次相同） */
export function encodeMaskPng(m: Mask): Promise<Uint8Array<ArrayBuffer>> {
  return encodePng(m.data, m.width, m.height, MASK_PALETTE);
}

/** PNG（或任何圖）的不透明度 → 遮罩 */
export async function decodeMaskPng(blob: Blob, width?: number, height?: number): Promise<Mask> {
  const bmp = await loadImage(blob);
  try {
    const w = width ?? bmp.width;
    const h = height ?? bmp.height;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.drawImage(bmp, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const data = new Uint8Array(w * h);
    for (let i = 0; i < data.length; i++) data[i] = d[i * 4 + 3];
    return { width: w, height: h, data };
  } finally {
    bmp.close?.();
  }
}

/** 存一個遮罩（空的遮罩回傳 null） */
export async function putMask(m: Mask): Promise<{ ref: MaskRef; persisted: boolean } | null> {
  let any = false;
  for (let i = 0; i < m.data.length; i++)
    if (m.data[i]) {
      any = true;
      break;
    }
  if (!any) return null;
  const bytes = await encodeMaskPng(m);
  const r = await assets.add(new Blob([bytes], { type: 'image/png' }));
  rememberMask(r.id, m);
  return { ref: { id: r.id, width: m.width, height: m.height }, persisted: r.persisted };
}

export function loadMask(ref: MaskRef): Promise<Mask | null> {
  const hit = masks.get(ref.id);
  if (hit) return Promise.resolve(hit);
  const running = maskJobs.get(ref.id);
  if (running) return running;
  const job = assets
    .get(ref.id)
    .then(async (blob) => {
      maskJobs.delete(ref.id);
      if (!blob) return null;
      const m = await decodeMaskPng(blob, ref.width, ref.height);
      rememberMask(ref.id, m);
      return m;
    })
    .catch(() => {
      maskJobs.delete(ref.id);
      return null;
    });
  maskJobs.set(ref.id, job);
  return job;
}

/* ---------- 柔邊、選取顯示、邊界 ---------- */

const softCache = new WeakMap<Mask, { feather: number; canvas: AnyCanvas }>();

/** 柔邊後的遮罩畫布（白色＋不透明度），畫的時候拉伸到圖片的範圍 */
export function softMaskCanvas(m: Mask, feather: number): AnyCanvas {
  const hit = softCache.get(m);
  if (hit && hit.feather === feather) return hit.canvas;
  const data = feather > 0 ? featherMask(m.data, m.width, m.height, feather) : m.data;
  const c = maskCanvas(data, m.width, m.height);
  softCache.set(m, { feather, canvas: c });
  return c;
}

function maskCanvas(data: Uint8Array, w: number, h: number): AnyCanvas {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < data.length; i++) {
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = 255;
    d[i * 4 + 3] = data[i];
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

const hardCache = new WeakMap<Mask, AnyCanvas>();

/** 選取範圍（遮罩 > 0 的地方不透明）：預覽的選取顯示用 */
export function hardMaskCanvas(m: Mask): AnyCanvas {
  const hit = hardCache.get(m);
  if (hit) return hit;
  const bin = new Uint8Array(m.data.length);
  for (let i = 0; i < bin.length; i++) bin[i] = m.data[i] ? 255 : 0;
  const c = maskCanvas(bin, m.width, m.height);
  hardCache.set(m, c);
  return c;
}

const boundaryCache = new WeakMap<Mask, Float32Array>();

export function boundaryOf(
  m: Mask,
  work: Rgba | null,
  image: { width: number; height: number },
): Float32Array {
  const hit = boundaryCache.get(m);
  if (hit) return hit;
  const usable = work && work.width === m.width && work.height === m.height ? work : null;
  const b = maskBoundary(m, usable, image);
  boundaryCache.set(m, b);
  return b;
}

/** 一張任意的圖拉伸到 w × h 後的 RGBA（讀入的遮罩圖用） */
export async function imageRgbaAt(file: Blob, w: number, h: number): Promise<Rgba> {
  const bmp = await loadImage(file);
  try {
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, 0, 0, w, h);
    return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
  } finally {
    bmp.close?.();
  }
}

/** 圖片的代表色（最多 6 色；彩度高的優先、彼此差夠多），給顏色欄當快速色票 */
export function imagePalette(work: Rgba): string[] {
  const N = 48;
  const c = makeCanvas(N, N);
  const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
  const src = makeCanvas(work.width, work.height);
  const sctx = src.getContext('2d') as CanvasRenderingContext2D;
  const img = sctx.createImageData(work.width, work.height);
  img.data.set(work.data);
  sctx.putImageData(img, 0, 0);
  ctx.drawImage(src, 0, 0, N, N);
  const d = getImageData(c).data;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 200) continue;
    const k = ((d[i] >> 4) << 8) | ((d[i + 1] >> 4) << 4) | (d[i + 2] >> 4);
    const e = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    e.n++;
    e.r += d[i];
    e.g += d[i + 1];
    e.b += d[i + 2];
    bins.set(k, e);
  }
  const list = [...bins.values()]
    .map((e) => {
      const r = e.r / e.n;
      const g = e.g / e.n;
      const b = e.b / e.n;
      return { r, g, b, w: e.n * (1 + (Math.max(r, g, b) - Math.min(r, g, b)) / 128) };
    })
    .sort((a, b) => b.w - a.w);
  const out: { r: number; g: number; b: number }[] = [];
  for (const q of list) {
    if (out.every((o) => Math.hypot(o.r - q.r, o.g - q.g, o.b - q.b) > 70)) out.push(q);
    if (out.length >= 6) break;
  }
  return out.map(
    (o) => `#${[o.r, o.g, o.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`,
  );
}

/** 從代表色挑亮暗差最多的兩色當「圖片」漸層（亮的在前） */
export function imageGradient(pal: readonly string[]): [string, string] | null {
  if (pal.length < 2) return null;
  const lum = (h: string) => {
    const n = Number.parseInt(h.slice(1), 16);
    return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11;
  };
  const a = pal[0];
  let b = pal[1];
  let best = 0;
  for (const h of pal.slice(1)) {
    const d = Math.abs(lum(h) - lum(a));
    if (d >= best) {
      best = d;
      b = h;
    }
  }
  return lum(a) >= lum(b) ? [a, b] : [b, a];
}

/* ---------- React ---------- */

export interface TokenData {
  work: ImageWork | null;
  mask: Mask | null;
  /** 'none'：沒有圖片；'loading'；'ready'；'missing'：圖片讀不到 */
  status: 'none' | 'loading' | 'ready' | 'missing';
}

/** 一個棋子的圖片與遮罩（換了就重讀；同一個 id 只讀一次） */
export function useTokenData(image: ImageRef | null, mask: MaskRef | null): TokenData {
  const [, setTick] = useState(0);
  const [missing, setMissing] = useState<string | null>(null);
  const imageId = image?.id ?? null;
  const maskId = mask?.id ?? null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只看 id
  useEffect(() => {
    let alive = true;
    if (image && !peekImageWork(image.id))
      void loadImageWork(image).then((w) => {
        if (!alive) return;
        if (!w) setMissing(image.id);
        setTick((t) => t + 1);
      });
    if (mask && !peekMask(mask.id))
      void loadMask(mask).then(() => {
        if (alive) setTick((t) => t + 1);
      });
    return () => {
      alive = false;
    };
  }, [imageId, maskId]);
  const work = imageId ? (peekImageWork(imageId) ?? null) : null;
  const m = maskId ? (peekMask(maskId) ?? null) : null;
  const status: TokenData['status'] = !image
    ? 'none'
    : work
      ? 'ready'
      : missing === imageId
        ? 'missing'
        : 'loading';
  return { work, mask: m, status };
}
