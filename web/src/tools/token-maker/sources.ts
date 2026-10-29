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
import { grayMaskCanvas } from './custom';
import { type Mask, maskBoundary, maskSizeFor, type Rgba } from './mask';
import { IMAGE_MAX_SIDE, type ImageRef, type MaskRef } from './model';

export const TOOL_ID = 'token-maker';
export const assets = createAssetStore(TOOL_ID);

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/* ---------- 圖片 ---------- */

/*
 * 記憶體：一張 2048 px 的圖解碼後約 17 MB。名單最多 60 張，全部留著會到 1.6 GB（行動瀏覽器會被殺掉），所以：
 * - 解碼的大圖（ImageWork）只留最近用過的 WORK_MAX 張（LRU）；目前的棋子、正在匯出的不會被放掉，放掉時 close()。
 * - 名單、預設外觀、實際大小的縮圖用小圖（ImageLite：長邊 256 的畫布＋遮罩大小的不透明度），每張約 0.3～1.3 MB。
 * - 資產庫在加入圖片時解碼確認的那一張，加入後馬上放掉（releaseBitmap）。
 */

export interface ImageWork {
  bitmap: ImageBitmap;
  /** 遮罩大小的 RGBA */
  work: Rgba;
}

/** 小圖：縮圖（長邊 ≤ THUMB_SIDE）與遮罩大小的不透明度（完全不透明的圖是 null） */
export interface ImageLite {
  thumb: AnyCanvas;
  alpha: Uint8Array | null;
}

const works = new Map<string, ImageWork>();
const workJobs = new Map<string, Promise<ImageWork | null>>();
export const WORK_MAX = 4;
const THUMB_SIDE = 256;
const lites = new Map<string, ImageLite>();
const liteJobs = new Map<string, Promise<ImageLite | null>>();

/** 不能放掉的圖（目前的棋子、自訂外框、參考圖）：由 store 告訴這裡 */
let keepers: () => Iterable<string> = () => [];
export function setImageKeepers(fn: () => Iterable<string>): void {
  keepers = fn;
}
/** 匯出中、正在用的圖（計數） */
const pins = new Map<string, number>();

/** 用到這張圖的期間不會被放掉；回傳放開的函式 */
export function pinImage(id: string): () => void {
  pins.set(id, (pins.get(id) ?? 0) + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const n = (pins.get(id) ?? 1) - 1;
    if (n > 0) pins.set(id, n);
    else pins.delete(id);
    trimWorks();
  };
}

const kept = (id: string, keep: Set<string>) => keep.has(id) || (pins.get(id) ?? 0) > 0;

function dropWork(id: string): void {
  const w = works.get(id);
  if (!w) return;
  works.delete(id);
  w.bitmap.close?.();
}

/** 超過 WORK_MAX 時從最久沒用的開始放掉（留著的不算） */
function trimWorks(): void {
  if (works.size <= WORK_MAX) return;
  const keep = new Set(keepers());
  for (const id of [...works.keys()]) {
    if (works.size <= WORK_MAX) break;
    if (!kept(id, keep)) dropWork(id);
  }
}

/** 用完放掉（全部打包時一張畫完就放；目前的棋子、正在用的不放） */
export function releaseImageWork(id: string): void {
  if (!kept(id, new Set(keepers()))) dropWork(id);
}

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

function makeLite(bitmap: ImageBitmap, work: Rgba): ImageLite {
  const k = Math.min(1, THUMB_SIDE / Math.max(bitmap.width, bitmap.height, 1));
  const w = Math.max(1, Math.round(bitmap.width * k));
  const h = Math.max(1, Math.round(bitmap.height * k));
  const thumb = makeCanvas(w, h);
  const ctx = thumb.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, w, h);
  let alpha: Uint8Array | null = null;
  const d = work.data;
  for (let i = 3; i < d.length; i += 4)
    if (d[i] < 255) {
      alpha = new Uint8Array(work.width * work.height);
      for (let j = 0; j < alpha.length; j++) alpha[j] = d[j * 4 + 3];
      break;
    }
  return { thumb, alpha };
}

/** 自己解碼（不經過資產庫的快取，才放得掉） */
async function decodeImage(id: string): Promise<ImageBitmap | null> {
  const blob = await assets.get(id);
  return blob ? loadImage(blob) : null;
}

/** 解碼好的大圖（看一次就算「最近用過」） */
export function peekImageWork(id: string): ImageWork | undefined {
  const w = works.get(id);
  if (w) {
    works.delete(id);
    works.set(id, w);
  }
  return w;
}

export function loadImageWork(ref: ImageRef): Promise<ImageWork | null> {
  const hit = peekImageWork(ref.id);
  if (hit) return Promise.resolve(hit);
  const running = workJobs.get(ref.id);
  if (running) return running;
  const job = decodeImage(ref.id)
    .then((bitmap) => {
      workJobs.delete(ref.id);
      if (!bitmap) return null;
      const w: ImageWork = { bitmap, work: makeWork(bitmap, ref) };
      if (!lites.has(ref.id)) lites.set(ref.id, makeLite(bitmap, w.work));
      works.set(ref.id, w);
      trimWorks();
      return w;
    })
    .catch(() => {
      workJobs.delete(ref.id);
      return null;
    });
  workJobs.set(ref.id, job);
  return job;
}

export const peekImageLite = (id: string): ImageLite | undefined => lites.get(id);

/** 小圖（大圖已經解碼時從它做；否則解碼一次、做完就放掉） */
export function loadImageLite(ref: ImageRef): Promise<ImageLite | null> {
  const hit = lites.get(ref.id);
  if (hit) return Promise.resolve(hit);
  const running = liteJobs.get(ref.id);
  if (running) return running;
  const job = (async () => {
    const w = works.get(ref.id);
    if (w) {
      const lite = makeLite(w.bitmap, w.work);
      lites.set(ref.id, lite);
      return lite;
    }
    const bmp = await decodeImage(ref.id);
    if (!bmp) return null;
    try {
      const lite = makeLite(bmp, makeWork(bmp, ref));
      lites.set(ref.id, lite);
      return lite;
    } finally {
      bmp.close?.();
    }
  })()
    .catch(() => null)
    .finally(() => liteJobs.delete(ref.id));
  liteJobs.set(ref.id, job);
  return job;
}

/** 目前解碼著的大圖張數（測試、量記憶體用） */
export const imageWorkCount = (): number => works.size;

/** 讀一張圖放進資產庫（長邊超過 2048 時縮小；讀不了時丟 ImageLoadError） */
export async function storeImage(file: File): Promise<{ ref: ImageRef; persisted: boolean }> {
  const r = await addImageFile(assets, file, { maxSide: IMAGE_MAX_SIDE });
  /* 資產庫為了確認解得開而解碼的那一張：棋子的圖由這裡自己解碼、自己放，資產庫的那份放掉（自訂外框、參考圖留著） */
  if (!new Set(keepers()).has(r.ref.id)) assets.releaseBitmap(r.ref.id);
  return { ref: r.ref, persisted: r.persisted };
}

/* ---------- 遮罩 ---------- */

const masks = new Map<string, Mask>();
const maskJobs = new Map<string, Promise<Mask | null>>();
const MASK_CACHE = 16;

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

/** 圖片的不透明度（遮罩大小）：undefined＝還不知道（小圖還沒做） */
function alphaOf(imageId: string, m: Mask): Uint8Array | null | undefined {
  const lite = lites.get(imageId);
  if (!lite) return undefined;
  return lite.alpha && lite.alpha.length === m.width * m.height ? lite.alpha : null;
}

const boundaryByMask = new WeakMap<Mask, { alpha: boolean; b: Float32Array }>();
const boundaryById = new Map<string, Float32Array>();
const BOUNDARY_CACHE = 240;

/** 出框的邊界點（這個遮罩物件；畫到一半的遮罩、剛存好的遮罩） */
export function boundaryOf(m: Mask, image: ImageRef): Float32Array {
  const alpha = alphaOf(image.id, m);
  const hit = boundaryByMask.get(m);
  if (hit && (hit.alpha || alpha === undefined)) return hit.b;
  const b = maskBoundary(m, alpha ?? null, image);
  boundaryByMask.set(m, { alpha: alpha !== undefined, b });
  return b;
}

/** 出框的邊界點（依遮罩與圖片的 id 快取：遮罩本身被放掉之後也算得出邊距）；遮罩還沒讀時 null */
export function boundaryFor(mask: MaskRef, image: ImageRef): Float32Array | null {
  const key = `${mask.id}|${image.id}`;
  const hit = boundaryById.get(key);
  if (hit) return hit;
  const m = masks.get(mask.id);
  if (!m) return null;
  const b = boundaryOf(m, image);
  if (alphaOf(image.id, m) !== undefined) {
    boundaryById.set(key, b);
    if (boundaryById.size > BOUNDARY_CACHE) {
      const first = boundaryById.keys().next().value;
      if (first !== undefined) boundaryById.delete(first);
    }
  }
  return b;
}

/* ---------- 縮圖用的小遮罩 ---------- */

const thumbMasks = new Map<string, { feather: number; canvas: AnyCanvas }>();
const thumbMaskJobs = new Map<string, Promise<AnyCanvas | null>>();
const THUMB_MASK_CACHE = 120;

/** 縮圖用的柔邊遮罩（長邊 ≤ 256）；柔邊改了、新的還沒做好時先給舊的（不閃） */
export function peekThumbMask(id: string): AnyCanvas | null {
  return thumbMasks.get(id)?.canvas ?? null;
}

export const hasThumbMask = (id: string, feather: number): boolean =>
  thumbMasks.get(id)?.feather === feather;

/** 做縮圖用的小遮罩（順便算好邊界點，之後大的遮罩可以放掉） */
export function loadThumbMask(
  ref: MaskRef,
  image: ImageRef,
  feather: number,
): Promise<AnyCanvas | null> {
  const hit = thumbMasks.get(ref.id);
  if (hit && hit.feather === feather) return Promise.resolve(hit.canvas);
  const key = `${ref.id}|${feather}`;
  const running = thumbMaskJobs.get(key);
  if (running) return running;
  const job = (async () => {
    await loadImageLite(image);
    const m = await loadMask(ref);
    if (!m) return null;
    boundaryFor(ref, image);
    const data = feather > 0 ? featherMask(m.data, m.width, m.height, feather) : m.data;
    const full = maskCanvas(data, m.width, m.height);
    const k = Math.min(1, THUMB_SIDE / Math.max(m.width, m.height));
    const small = makeCanvas(
      Math.max(1, Math.round(m.width * k)),
      Math.max(1, Math.round(m.height * k)),
    );
    const ctx = small.getContext('2d') as CanvasRenderingContext2D;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(full, 0, 0, small.width, small.height);
    thumbMasks.delete(ref.id);
    thumbMasks.set(ref.id, { feather, canvas: small });
    if (thumbMasks.size > THUMB_MASK_CACHE) {
      const first = thumbMasks.keys().next().value;
      if (first !== undefined) thumbMasks.delete(first);
    }
    return small;
  })()
    .catch(() => null)
    .finally(() => thumbMaskJobs.delete(key));
  thumbMaskJobs.set(key, job);
  return job;
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

/* ---------- 自訂外框、自訂遮罩 ---------- */

const grayMasks = new Map<string, HTMLCanvasElement | OffscreenCanvas>();

/** 自訂遮罩的畫布（灰階 → 不透明度；同一個 id 只做一次） */
export async function loadCustomMask(
  id: string,
): Promise<HTMLCanvasElement | OffscreenCanvas | null> {
  const hit = grayMasks.get(id);
  if (hit) return hit;
  const bmp = await assets.bitmap(id).catch(() => undefined);
  if (!bmp) return null;
  const c = grayMaskCanvas(bmp);
  grayMasks.set(id, c);
  return c;
}

export const peekCustomMask = (id: string) => grayMasks.get(id) ?? null;

export interface CustomData {
  frame: ImageBitmap | null;
  mask: HTMLCanvasElement | OffscreenCanvas | null;
}

/** 自訂外框與遮罩（讀好就重畫） */
export function useCustomData(frameId: string | null, maskId: string | null): CustomData {
  const [, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    if (frameId && !assets.peekBitmap(frameId))
      void assets
        .bitmap(frameId)
        .catch(() => undefined)
        .then(() => alive && setTick((t) => t + 1));
    if (maskId && !grayMasks.has(maskId))
      void loadCustomMask(maskId).then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [frameId, maskId]);
  return {
    frame: frameId ? (assets.peekBitmap(frameId) ?? null) : null,
    mask: maskId ? (grayMasks.get(maskId) ?? null) : null,
  };
}

/** 參考圖（自訂；記在偏好裡的資產 id） */
export function useRefImage(id: string | null): ImageBitmap | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    if (id && !assets.peekBitmap(id))
      void assets
        .bitmap(id)
        .catch(() => undefined)
        .then(() => alive && setTick((t) => t + 1));
    return () => {
      alive = false;
    };
  }, [id]);
  return id ? (assets.peekBitmap(id) ?? null) : null;
}
