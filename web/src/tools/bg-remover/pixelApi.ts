/**
 * 像素處理的函式集（加圖時的檢查與縮圖、讀圖、色鍵、AI 的前後處理、邊緣調整、筆刷重播、預覽合成、匯出）：
 * Worker（pixels.worker.ts）與主執行緒的退路共用。這個檔案不建立 Worker（Worker 也 import 它）。
 */
import { applyMask, detectImageType, type Mask, maskToRgba } from '@/core/image';
import { transfer } from '@/core/worker';
import type { Letterbox } from './animeSeg';
import type { Mode, StoredStroke, ViewMode } from './model';
import {
  aiInput,
  aiMask,
  applyStrokes,
  type ColorBase,
  colorBase,
  composeOutput,
  cutoutColors,
  decodeMaskPng,
  decodeSource,
  encodeImage,
  encodeMaskPng,
  type KeyParams,
  type OutputSpec,
  refineMask,
  type SourceImage,
} from './pipeline';

export interface RenderJob {
  /** 這次匯出的編號（給了就可以用 cancelRender 取消） */
  id?: number;
  /** 原圖的快取鍵（資產 id） */
  key: string;
  blob: Blob;
  mode: Mode;
  keyParams: KeyParams;
  /** AI 的遮罩（PNG）；AI 模式還沒去背時 null */
  aiMask: Blob | null;
  grow: number;
  feather: number;
  despill: boolean;
  strokes: readonly StoredStroke[];
  output: OutputSpec;
}

export interface RenderResult {
  bytes: Uint8Array;
  width: number;
  height: number;
}

/** 匯出時 AI 模式的圖還沒去背 */
export class NeedsAiError extends Error {
  constructor() {
    super('needs-ai');
    this.name = 'NeedsAiError';
  }
}

/** 匯出被取消（cancelRender）；經過 Worker 只剩 name，主執行緒看 name === 'AbortError' */
class RenderCancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AbortError';
  }
}

/** 加圖時的檢查結果 */
export type InspectResult =
  | { kind: 'image'; width: number; height: number; thumb: Blob | null }
  | { kind: 'not-image' }
  | { kind: 'failed' };

/** 預覽要畫的一張：ImageBitmap（主執行緒直接 drawImage）；環境不能做 ImageBitmap 時是像素 */
export type PreviewImage =
  | { bitmap: ImageBitmap; width: number; height: number }
  | { rgba: Uint8ClampedArray<ArrayBuffer>; width: number; height: number };

export interface PreviewJob {
  key: string;
  blob: Blob;
  view: ViewMode;
  /** 最終遮罩（原圖檢視、還沒有遮罩時 null） */
  mask: Mask | null;
  /** 去色邊後的顏色：colorsKey 對得上 despill 上次算的就直接用（不必再傳一次）；都沒有時用原圖的顏色 */
  colorsKey: string | null;
  colors: Uint8ClampedArray | null;
}

/** 縮圖的長邊（px；清單的縮圖約 100 px 寬，高解析度螢幕要兩倍） */
export const THUMB_SIZE = 256;

/** 讓出一下（Worker 裡：讓排在後面的訊息——例如取消——先處理） */
const yieldToEvents = () => new Promise<void>((r) => setTimeout(r, 0));

/** 縮圖：等比縮到長邊 max px 的 PNG（不能用 OffscreenCanvas 時 null） */
async function thumbnailOf(bmp: ImageBitmap, max: number): Promise<Blob | null> {
  if (typeof OffscreenCanvas === 'undefined') return null;
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext('2d');
  if (!g) return null;
  g.imageSmoothingQuality = 'high';
  g.drawImage(bmp, 0, 0, w, h);
  return c.convertToBlob({ type: 'image/png' });
}

/** 像素做成 ImageBitmap（主執行緒 drawImage 不必再轉）；做不到時原樣回傳像素 */
async function previewImage(
  rgba: Uint8ClampedArray<ArrayBuffer>,
  width: number,
  height: number,
): Promise<PreviewImage> {
  if (typeof createImageBitmap === 'function' && typeof ImageData !== 'undefined') {
    try {
      const bitmap = await createImageBitmap(new ImageData(rgba, width, height), {
        premultiplyAlpha: 'premultiply',
        colorSpaceConversion: 'none',
      });
      return transfer({ bitmap, width, height }, [bitmap]);
    } catch {
      /* 改傳像素 */
    }
  }
  const copy = rgba.slice();
  return transfer({ rgba: copy, width, height }, [copy.buffer]);
}

/** 解碼過的原圖留最近 3 張（同一張圖反覆調整時不必重新解碼） */
const CACHE_SIZE = 3;

export function createPixelApi() {
  const cache = new Map<string, Promise<SourceImage>>();
  /** 進行中的匯出、被取消的匯出（編號） */
  const rendering = new Set<number>();
  const cancelled = new Set<number>();
  /** despill 上次算出的顏色（預覽合成直接用） */
  let lastColors: { key: string; colors: Uint8ClampedArray<ArrayBuffer> } | null = null;
  const checkpoint = async (id: number | undefined) => {
    if (id === undefined) return;
    await yieldToEvents();
    if (cancelled.has(id)) throw new RenderCancelledError();
  };
  const source = (key: string, blob: Blob): Promise<SourceImage> => {
    const hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    const p = decodeSource(blob);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
    while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
    return p;
  };

  const baseOf = async (job: RenderJob, src: SourceImage): Promise<ColorBase | { mask: Mask }> => {
    if (job.mode === 'color') return colorBase(src, job.keyParams);
    if (!job.aiMask) throw new NeedsAiError();
    const m = decodeMaskPng(new Uint8Array(await job.aiMask.arrayBuffer()));
    if (m.width !== src.width || m.height !== src.height) throw new NeedsAiError();
    return { mask: m.mask };
  };

  return {
    /** 加圖時檢查一個檔案：看檔頭是不是圖片、解碼量尺寸、做縮圖（都在 Worker 裡，畫面不卡） */
    async inspect(blob: Blob, thumbSize = THUMB_SIZE): Promise<InspectResult> {
      const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
      if (!detectImageType(head)) return { kind: 'not-image' };
      let bmp: ImageBitmap;
      try {
        bmp = await createImageBitmap(blob);
      } catch {
        return { kind: 'failed' };
      }
      try {
        const thumb = await thumbnailOf(bmp, thumbSize).catch(() => null);
        return { kind: 'image', width: bmp.width, height: bmp.height, thumb };
      } finally {
        bmp.close();
      }
    },
    /** 清單的縮圖（重新整理後、或加圖時沒做成的） */
    async thumb(blob: Blob, thumbSize = THUMB_SIZE): Promise<Blob | null> {
      const bmp = await createImageBitmap(blob);
      try {
        return await thumbnailOf(bmp, thumbSize);
      } finally {
        bmp.close();
      }
    },
    /** 解碼（回傳一份複本給主執行緒預覽用） */
    async load(key: string, blob: Blob): Promise<SourceImage> {
      const src = await source(key, blob);
      const rgba = src.rgba.slice();
      return transfer({ width: src.width, height: src.height, rgba }, [rgba.buffer]);
    },
    async colorBase(key: string, blob: Blob, p: KeyParams): Promise<ColorBase> {
      const r = colorBase(await source(key, blob), p);
      return transfer(r, [r.mask.buffer]);
    },
    async aiInput(key: string, blob: Blob): Promise<{ tensor: Float32Array; box: Letterbox }> {
      const r = aiInput(await source(key, blob));
      return transfer(r, [r.tensor.buffer as ArrayBuffer]);
    },
    /** 模型輸出 → 遮罩（＋存檔用的 PNG） */
    async aiMask(pred: Float32Array, box: Letterbox): Promise<{ mask: Mask; png: Uint8Array }> {
      const mask = aiMask(pred, box);
      const png = await encodeMaskPng(mask, box.w0, box.h0);
      return transfer({ mask, png }, [mask.buffer, png.buffer as ArrayBuffer]);
    },
    async decodeMask(png: Blob): Promise<{ mask: Mask; width: number; height: number }> {
      const r = decodeMaskPng(new Uint8Array(await png.arrayBuffer()));
      return transfer(r, [r.mask.buffer]);
    },
    async refine(mask: Mask, w: number, h: number, grow: number, feather: number): Promise<Mask> {
      const r = refineMask(mask, w, h, grow, feather);
      return transfer(r, [r.buffer]);
    },
    /** 去色邊後的顏色（純色模式預覽用）；colorsKey 給了就記住，預覽合成時不必再傳回來 */
    async despill(
      key: string,
      blob: Blob,
      base: Mask,
      bg: [number, number, number],
      colorsKey: string | null = null,
    ): Promise<Uint8ClampedArray<ArrayBuffer>> {
      const src = await source(key, blob);
      const colors = cutoutColors(src, { base, bg });
      lastColors = colorsKey ? { key: colorsKey, colors } : null;
      const r = colors.slice();
      return transfer(r, [r.buffer]);
    },
    /** 最終遮罩：邊緣調整後的遮罩畫上存起來的筆刷（依序） */
    async finalMask(
      refined: Mask,
      w: number,
      h: number,
      strokes: readonly StoredStroke[],
    ): Promise<Mask> {
      applyStrokes(refined, w, h, strokes);
      return transfer(refined, [refined.buffer]);
    },
    /**
     * 預覽要畫的整張（結果／原圖／遮罩）：在這裡合成，主執行緒只要 drawImage。
     * colorsKey 對不上 despill 記住的顏色、又沒有給 colors 時回傳 null（請主執行緒附上 colors 再叫一次）。
     */
    async preview(job: PreviewJob): Promise<PreviewImage | null> {
      const src = await source(job.key, job.blob);
      const { width: w, height: h } = src;
      const fits = (a: { length: number } | null, k: number): a is NonNullable<typeof a> =>
        !!a && a.length === w * h * k;
      if (job.view === 'original' || !fits(job.mask, 1)) return previewImage(src.rgba, w, h);
      if (job.view === 'mask') return previewImage(maskToRgba(job.mask), w, h);
      let colors: Uint8ClampedArray = src.rgba;
      if (job.colorsKey) {
        if (lastColors?.key === job.colorsKey && fits(lastColors.colors, 4))
          colors = lastColors.colors;
        else if (fits(job.colors, 4)) colors = job.colors;
        else return null;
      }
      return previewImage(applyMask(colors, job.mask), w, h);
    },
    /** 匯出一張（id 給了就可以用 cancelRender 中途取消：每一步之間檢查） */
    async render(job: RenderJob): Promise<RenderResult> {
      const id = job.id;
      if (id !== undefined) rendering.add(id);
      try {
        const src = await source(job.key, job.blob);
        await checkpoint(id);
        const base = await baseOf(job, src);
        await checkpoint(id);
        const final = refineMask(base.mask, src.width, src.height, job.grow, job.feather);
        await checkpoint(id);
        applyStrokes(final, src.width, src.height, job.strokes);
        const colors = cutoutColors(
          src,
          job.mode === 'color' && job.despill && 'bg' in base
            ? { base: base.mask, bg: base.bg }
            : null,
        );
        await checkpoint(id);
        const img = composeOutput(src, colors, final, job.output);
        await checkpoint(id);
        const bytes = await encodeImage(img, job.output.format);
        await checkpoint(id);
        return transfer({ bytes, width: img.width, height: img.height }, [
          bytes.buffer as ArrayBuffer,
        ]);
      } finally {
        if (id !== undefined) {
          rendering.delete(id);
          cancelled.delete(id);
        }
      }
    },
    /** 取消進行中的匯出（下一個檢查點就停下來，render 以 name 為 AbortError 的錯誤結束） */
    cancelRender(id: number): void {
      if (rendering.has(id)) cancelled.add(id);
    },
    forget(key: string): void {
      cache.delete(key);
    },
  };
}

export type PixelApi = ReturnType<typeof createPixelApi>;
