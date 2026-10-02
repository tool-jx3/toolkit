/**
 * psd-studio 的處理 Worker：解碼、縮圖、PSD、畫布尺寸、單圖檢視器的全解析度畫面、匯出。
 * 函式本體在 process.ts（主執行緒也能直接呼叫）；這裡負責快取解碼結果與以 transfer 回傳大塊資料。
 */
import { exposeApi, transfer } from '@/core/worker';
import {
  type AdjustInput,
  type DecodedImage,
  decodeSource,
  type ExportJob,
  type ExportProgress,
  exportZip,
  loadPsd,
  type OutputOptions,
  type ProcessProgress,
  prepare,
  processImage,
  resizeCanvas,
} from './process';
import { renderFrames } from './render-frames';

/** 單圖檢視器最近用過的解碼結果（鍵由主執行緒給：素材 id＋版本） */
const cache = new Map<string, Promise<DecodedImage>>();
const CACHE_SIZE = 2;

function decoded(key: string, bytes: Uint8Array | null): Promise<DecodedImage> | null {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  if (!bytes) return null;
  const p = decodeSource(bytes);
  p.catch(() => cache.delete(key));
  cache.set(key, p);
  while (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value as string);
  return p;
}

const api = {
  async prepare(bytes: Uint8Array) {
    const info = await prepare(bytes);
    return transfer(info, [info.thumb.rgba.buffer]);
  },
  async loadPsd(bytes: Uint8Array, onProgress?: (i: number, n: number, name: string) => void) {
    const out = await loadPsd(bytes, onProgress);
    const buffers: ArrayBuffer[] = [];
    for (const l of out.layers) {
      buffers.push(l.png.buffer, l.thumb.rgba.buffer);
      if (l.maskedThumb) buffers.push(l.maskedThumb.rgba.buffer);
    }
    return transfer(out, buffers);
  },
  async resizeCanvas(bytes: Uint8Array, width: number, height: number, dx: number, dy: number) {
    const out = await resizeCanvas(bytes, width, height, dx, dy);
    return transfer(out, [out.bytes.buffer, out.info.thumb.rgba.buffer]);
  },
  /** 全解析度的影格（調色後；adjust 為 null＝原圖）。快取裡沒有、也沒給 bytes 時回傳 null（主執行緒再給一次） */
  async render(
    key: string,
    bytes: Uint8Array | null,
    adjust: AdjustInput | null,
    frames: number[],
  ) {
    const p = decoded(key, bytes);
    if (!p) return null;
    const out = await renderFrames(await p, adjust, frames);
    return transfer(out, out.bitmaps);
  },
  async processImage(
    bytes: Uint8Array,
    adjust: AdjustInput,
    out: OutputOptions,
    onProgress?: (p: ProcessProgress) => void,
  ) {
    const r = await processImage(bytes, adjust, out, onProgress);
    return transfer(r, [r.data.buffer]);
  },
  async exportZip(job: ExportJob, onProgress?: (p: ExportProgress) => void) {
    const r = await exportZip(job, onProgress);
    return transfer(r, [r.bytes.buffer]);
  },
};

export type StudioWorkerApi = typeof api;

exposeApi(api);
