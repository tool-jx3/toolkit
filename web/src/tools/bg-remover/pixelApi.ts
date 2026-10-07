/**
 * 像素處理的函式集（讀圖、色鍵、AI 的前後處理、邊緣調整、匯出）：Worker（pixels.worker.ts）與主執行緒的退路共用。
 * 這個檔案不建立 Worker（Worker 也 import 它）。
 */
import type { Mask } from '@/core/image';
import { transfer } from '@/core/worker';
import type { Letterbox } from './animeSeg';
import type { Mode, StoredStroke } from './model';
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

/** 解碼過的原圖留最近 3 張（同一張圖反覆調整時不必重新解碼） */
const CACHE_SIZE = 3;

export function createPixelApi() {
  const cache = new Map<string, Promise<SourceImage>>();
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
    /** 去色邊後的顏色（純色模式預覽用） */
    async despill(
      key: string,
      blob: Blob,
      base: Mask,
      bg: [number, number, number],
    ): Promise<Uint8ClampedArray<ArrayBuffer>> {
      const r = cutoutColors(await source(key, blob), { base, bg }).slice();
      return transfer(r, [r.buffer]);
    },
    /** 匯出一張 */
    async render(job: RenderJob): Promise<RenderResult> {
      const src = await source(job.key, job.blob);
      const base = await baseOf(job, src);
      const final = refineMask(base.mask, src.width, src.height, job.grow, job.feather);
      applyStrokes(final, src.width, src.height, job.strokes);
      const colors = cutoutColors(
        src,
        job.mode === 'color' && job.despill && 'bg' in base
          ? { base: base.mask, bg: base.bg }
          : null,
      );
      const img = composeOutput(src, colors, final, job.output);
      const bytes = await encodeImage(img, job.output.format);
      return transfer({ bytes, width: img.width, height: img.height }, [
        bytes.buffer as ArrayBuffer,
      ]);
    },
    forget(key: string): void {
      cache.delete(key);
    },
  };
}

export type PixelApi = ReturnType<typeof createPixelApi>;
