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
  prepareDecoded,
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

/**
 * 載入時解碼過的原檔（最近幾個，合計不超過 SOURCE_CACHE_BYTES）：匯出、容量壓縮試算、單張下載時
 * 同一個原檔（位元組完全相同才算）直接沿用，不必再解碼一次。
 */
const sources: { bytes: Uint8Array; decoded: DecodedImage; size: number }[] = [];
const SOURCE_CACHE_BYTES = 64 * 1024 * 1024;
const SOURCE_CACHE_COUNT = 4;

function remember(bytes: Uint8Array, decoded: DecodedImage): void {
  const size = decoded.frames.reduce((s, f) => s + f.length, 0);
  if (size > SOURCE_CACHE_BYTES) return;
  sources.unshift({ bytes, decoded, size });
  let total = 0;
  for (let i = 0; i < sources.length; i++) {
    total += sources[i].size;
    if (i >= SOURCE_CACHE_COUNT || total > SOURCE_CACHE_BYTES) {
      sources.length = i;
      break;
    }
  }
}

/** 位元組完全相同（對齊時一次比 4 位元組） */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let i = 0;
  if (a.byteOffset % 4 === 0 && b.byteOffset % 4 === 0) {
    const n = a.length >> 2;
    const a32 = new Uint32Array(a.buffer, a.byteOffset, n);
    const b32 = new Uint32Array(b.buffer, b.byteOffset, n);
    for (; i < n; i++) if (a32[i] !== b32[i]) return false;
    i = n << 2;
  }
  for (; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

function recall(bytes: Uint8Array): DecodedImage | null {
  const i = sources.findIndex((s) => sameBytes(s.bytes, bytes));
  if (i < 0) return null;
  const [hit] = sources.splice(i, 1);
  sources.unshift(hit);
  return hit.decoded;
}

const api = {
  async prepare(bytes: Uint8Array) {
    const { info, decoded } = await prepareDecoded(bytes);
    remember(bytes, decoded);
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
    const r = await processImage(bytes, adjust, out, onProgress, recall(bytes));
    return transfer(r, [r.data.buffer]);
  },
  async exportZip(job: ExportJob, onProgress?: (p: ExportProgress) => void) {
    const r = await exportZip(job, onProgress, recall);
    return transfer(r, [r.bytes.buffer]);
  },
};

export type StudioWorkerApi = typeof api;

exposeApi(api);
