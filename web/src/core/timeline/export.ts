/**
 * 把 AnimationSource 逐格渲染並交給編碼器：APNG、GIF、WebP、單張 PNG、連番 PNG（ZIP）。
 * 有進度回報與取消；編碼預設在 Web Worker 裡進行。
 */
import { createEncoder, encodePngAsync } from '../encode/client';
import type { EncodedFile } from '../encode/frames';
import { GIF_MAX_FPS } from '../encode/gif';
import type { EncoderSpec } from '../encode/local';
import { encodePng } from '../encode/png';
import { fileNameWithExt, sequenceName } from '../files';
import type { AnimationSource, Ctx2D } from './source';
import { frameCount, frameTime } from './timeline';

export type AnimationExportFormat = 'apng' | 'gif' | 'webp' | 'png' | 'zip';

export interface ExportFormatInfo {
  id: AnimationExportFormat;
  label: string;
  ext: string;
  mime: string;
  animated: boolean;
  /** 支援減色開關 */
  quantize: boolean;
  /** 支援循環次數 */
  loop: boolean;
  maxFps?: number;
  description: string;
}

/** 各格式的基本資料（ExportPanel 的選項可以直接從這裡組） */
export const EXPORT_FORMATS: Record<AnimationExportFormat, ExportFormatInfo> = {
  apng: {
    id: 'apng',
    label: 'APNG',
    ext: 'png',
    mime: 'image/png',
    animated: true,
    quantize: true,
    loop: true,
    description: '全彩、半透明都保留，CCFOLIA 可直接使用。',
  },
  gif: {
    id: 'gif',
    label: 'GIF',
    ext: 'gif',
    mime: 'image/gif',
    animated: true,
    quantize: false,
    loop: true,
    maxFps: GIF_MAX_FPS,
    description: '相容性最好；最多 256 色，透明只有全透明或不透明。',
  },
  webp: {
    id: 'webp',
    label: 'WebP',
    ext: 'webp',
    mime: 'image/webp',
    animated: true,
    quantize: false,
    loop: true,
    description: '檔案較小；Safari 無法匯出。',
  },
  png: {
    id: 'png',
    label: 'PNG',
    ext: 'png',
    mime: 'image/png',
    animated: false,
    quantize: false,
    loop: false,
    description: '單張靜態圖（取代表畫面）。',
  },
  zip: {
    id: 'zip',
    label: '連番 PNG',
    ext: 'zip',
    mime: 'application/zip',
    animated: true,
    quantize: false,
    loop: false,
    description: '每一格一張 PNG，打包成 ZIP，方便影片軟體使用。',
  },
};

export interface ExportAnimationOptions {
  format: AnimationExportFormat;
  /** 每秒格數（預設 30；GIF 最多 50） */
  fps?: number;
  /** 播放次數，0 = 無限循環（預設） */
  plays?: number;
  /** 輸出尺寸＝原始尺寸×scale（預設 1） */
  scale?: number;
  /** APNG 減色成 256 色 */
  quantize?: boolean;
  /** APNG 合併連續相同的影格（預設 true） */
  mergeIdentical?: boolean;
  /** APNG 加上預設圖（不支援 APNG 的看圖程式顯示代表畫面） */
  still?: boolean;
  /** APNG 減色時，不放預設圖也把代表畫面（stillTime）加權列入色彩統計 */
  stillForPalette?: boolean;
  /** APNG 減色時代表畫面的份量下限（份量＝影格數×0.35；預設 1） */
  stillWeightMin?: number;
  /** WebP 品質 0～1（1 = 無損，預設） */
  webpQuality?: number;
  /** 先塗滿的背景色；null／不填 = 透明 */
  background?: string | null;
  /** 檔名主體（不含副檔名），會自動清理 */
  fileName?: string;
  /** 影格數上限（預設 1800） */
  maxFrames?: number;
  signal?: AbortSignal;
  /** ratio：0～1；label：目前在做什麼 */
  onProgress?: (ratio: number, label: string) => void;
  /** 在 Worker 裡編碼（預設：環境支援就用） */
  worker?: boolean;
  /**
   * 自動裁掉透明邊：所有影格（APNG 加預設圖；PNG 只看那一格）都完全透明的邊裁掉，四周留 2 px。
   * 動畫會多畫一輪來找範圍。
   */
  autoCrop?: boolean;
  /** 連番 PNG：ZIP 內的檔名主體（預設同 fileName） */
  sequenceBaseName?: string;
  /** 連番 PNG：ZIP 內說明檔的內容（null＝不放；不填＝預設內容） */
  sequenceInfo?: string | null | ((meta: SequenceInfoMeta) => string | null);
}

/** 連番 PNG 說明檔可用的資料 */
export interface SequenceInfoMeta {
  fps: number;
  frames: number;
  width: number;
  height: number;
  /** 動畫總長（秒） */
  duration: number;
  /** 第一張、最後一張的檔名 */
  first: string;
  last: string;
}

/** 裁切範圍（輸出影像在原畫面中的位置） */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ExportResult extends EncodedFile {
  blob: Blob;
  fileName: string;
  format: AnimationExportFormat;
  fps: number;
  /** 輸出影像在（縮放後）畫面中的範圍；沒有裁切時為整張 */
  crop: CropRect;
  /** 匯出花費的毫秒數 */
  ms: number;
}

export const DEFAULT_MAX_FRAMES = 1800;

const abortError = () => new DOMException('已取消', 'AbortError');

function abortable<T>(p: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return p;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** 建立一個供逐格讀取像素的畫布（主執行緒，才能用頁面上載入的字型） */
export function createFrameCanvas(
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('無法建立畫布');
  return { canvas, ctx };
}

/** 清空、塗背景、套用縮放後呼叫 source.render */
export async function drawFrame(
  ctx: Ctx2D,
  source: AnimationSource,
  t: number,
  { scale = 1, background = null }: { scale?: number; background?: string | null } = {},
): Promise<void> {
  const { width, height } = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, width, height);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.save();
  await source.render(ctx, t);
  ctx.restore();
}

/** 不透明像素（alpha > 0）的範圍，併進 box（x1、y1 為含） */
function unionOpaque(
  data: Uint8ClampedArray,
  W: number,
  H: number,
  box: { x0: number; y0: number; x1: number; y1: number },
): void {
  for (let y = 0; y < H; y++) {
    const row = y * W * 4;
    let first = -1;
    for (let x = 0; x < W; x++) {
      if (data[row + x * 4 + 3]) {
        first = x;
        break;
      }
    }
    if (first < 0) continue;
    let last = first;
    for (let x = W - 1; x > first; x--) {
      if (data[row + x * 4 + 3]) {
        last = x;
        break;
      }
    }
    if (first < box.x0) box.x0 = first;
    if (last > box.x1) box.x1 = last;
    if (y < box.y0) box.y0 = y;
    if (y > box.y1) box.y1 = y;
  }
}

/** 不透明範圍外擴 2 px（夾在畫面內）；完全透明時為整張 */
function cropFromBox(
  box: { x0: number; y0: number; x1: number; y1: number },
  W: number,
  H: number,
): CropRect {
  if (box.x1 < box.x0) return { x: 0, y: 0, w: W, h: H };
  const x = Math.max(0, box.x0 - 2);
  const y = Math.max(0, box.y0 - 2);
  const x1 = Math.min(W, box.x1 + 3);
  const y1 = Math.min(H, box.y1 + 3);
  return { x, y, w: x1 - x, h: y1 - y };
}

/** 輸出尺寸 */
export function exportSize(
  source: Pick<AnimationSource, 'width' | 'height'>,
  scale = 1,
): { width: number; height: number } {
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  };
}

/**
 * 匯出動畫。
 *
 * ```ts
 * const result = await exportAnimation(source, { format: 'apng', fps: 30, signal, onProgress });
 * downloadBlob(result.blob, result.fileName);
 * ```
 */
export async function exportAnimation(
  source: AnimationSource,
  options: ExportAnimationOptions,
): Promise<ExportResult> {
  const {
    format,
    fps = 30,
    plays = 0,
    scale = 1,
    quantize = false,
    mergeIdentical = true,
    still = false,
    stillForPalette = false,
    stillWeightMin,
    webpQuality = 1,
    background = null,
    fileName = 'export',
    maxFrames = DEFAULT_MAX_FRAMES,
    signal,
    onProgress = () => {},
    worker,
    autoCrop = false,
    sequenceBaseName,
    sequenceInfo,
  } = options;
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const elapsed = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  const info = EXPORT_FORMATS[format];
  if (!info) throw new Error(`不支援的格式：${format}`);
  if (info.maxFps && fps > info.maxFps)
    throw new RangeError(`${info.label} 的 fps 最多 ${info.maxFps}`);
  if (signal?.aborted) throw abortError();

  const { width: W, height: H } = exportSize(source, scale);
  const { ctx } = createFrameCanvas(W, H);
  let crop: CropRect = { x: 0, y: 0, w: W, h: H };
  const grab = async (t: number) => {
    await drawFrame(ctx, source, t, { scale, background });
    return ctx.getImageData(crop.x, crop.y, crop.w, crop.h).data;
  };
  const stillTime = source.stillTime ?? source.duration;

  onProgress(0, '準備中');
  if (source.prepare) await abortable(source.prepare(), signal);

  const finishResult = (file: EncodedFile): ExportResult => ({
    ...file,
    blob: new Blob([file.bytes], { type: file.mime }),
    fileName: fileNameWithExt(fileName, info.ext, { fallback: 'export' }),
    format,
    fps,
    crop,
    ms: elapsed(),
  });

  if (format === 'png') {
    if (autoCrop) {
      const box = { x0: W, y0: H, x1: -1, y1: -1 };
      unionOpaque(await grab(stillTime), W, H, box);
      crop = cropFromBox(box, W, H);
    }
    const data = await grab(stillTime);
    onProgress(0.5, '編碼中');
    const bytes = await abortable(
      worker === false ? encodePng(data, crop.w, crop.h) : encodePngAsync(data, crop.w, crop.h),
      signal,
    );
    onProgress(1, '完成');
    return finishResult({
      bytes,
      mime: 'image/png',
      ext: 'png',
      width: crop.w,
      height: crop.h,
      frames: 1,
      storedFrames: 1,
      duration: 0,
    });
  }

  const N = frameCount(source.duration, fps);
  if (N > maxFrames)
    throw new RangeError(`影格數 ${N} 超過上限 ${maxFrames}，請縮短時長或降低 fps。`);

  /* 自動裁邊：先畫一輪找出所有影格的不透明範圍 */
  const passShare = autoCrop ? 0.4 : 0;
  if (autoCrop) {
    const box = { x0: W, y0: H, x1: -1, y1: -1 };
    for (let i = 0; i < N; i++) {
      if (signal?.aborted) throw abortError();
      unionOpaque(await grab(frameTime(i, N, source.duration, fps, !source.loop)), W, H, box);
      onProgress(((i + 1) / N) * passShare, `計算範圍 ${i + 1}／${N}`);
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    if (still && format === 'apng') unionOpaque(await grab(stillTime), W, H, box);
    crop = cropFromBox(box, W, H);
  }
  const CW = crop.w;
  const CH = crop.h;

  const seqBase = fileNameWithExt(sequenceBaseName ?? fileName, '', { fallback: 'frame' });
  const seqInfo =
    typeof sequenceInfo === 'function'
      ? sequenceInfo({
          fps,
          frames: N,
          width: CW,
          height: CH,
          duration: source.duration,
          first: sequenceName(seqBase, 0, N, 'png'),
          last: sequenceName(seqBase, N - 1, N, 'png'),
        })
      : sequenceInfo;

  const spec: EncoderSpec =
    format === 'apng'
      ? {
          format: 'apng',
          options: {
            width: CW,
            height: CH,
            fps,
            plays,
            quantize,
            mergeIdentical,
            embedStill: still,
            ...(stillWeightMin !== undefined ? { stillWeightMin } : {}),
          },
        }
      : format === 'gif'
        ? { format: 'gif', options: { width: CW, height: CH, fps, plays } }
        : format === 'webp'
          ? { format: 'webp', options: { width: CW, height: CH, fps, plays, quality: webpQuality } }
          : {
              format: 'png-sequence',
              options: {
                width: CW,
                height: CH,
                fps,
                baseName: seqBase,
                ...(seqInfo !== undefined ? { info: seqInfo } : {}),
              },
            };

  const encoder = createEncoder(spec, { worker });
  const onAbort = () => encoder.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for (let i = 0; i < N; i++) {
      if (signal?.aborted) throw abortError();
      const t = frameTime(i, N, source.duration, fps, !source.loop);
      const data = await grab(t);
      await abortable(encoder.addFrame(data), signal);
      onProgress(passShare + ((i + 1) / N) * (0.9 - passShare), `產生影格 ${i + 1}／${N}`);
      if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
    }
    if (format === 'apng' && (still || (quantize && stillForPalette)))
      await encoder.setStill(await grab(stillTime));
    onProgress(0.92, '封裝檔案');
    const file = await abortable(encoder.finish(), signal);
    onProgress(1, '完成');
    return finishResult(file);
  } catch (e) {
    encoder.abort();
    throw e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
