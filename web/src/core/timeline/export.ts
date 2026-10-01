/**
 * 把 AnimationSource 逐格渲染並交給編碼器：APNG、GIF、WebP、單張 PNG、連番 PNG（ZIP）。
 * 有進度回報與取消；編碼預設在 Web Worker 裡進行。
 */
import { createEncoder, encodePngAsync } from '../encode/client';
import type { EncodedFile } from '../encode/frames';
import { GIF_MAX_FPS } from '../encode/gif';
import type { EncoderSpec } from '../encode/local';
import { encodePng } from '../encode/png';
import { fileNameWithExt } from '../files';
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
}

export interface ExportResult extends EncodedFile {
  blob: Blob;
  fileName: string;
  format: AnimationExportFormat;
  fps: number;
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
    webpQuality = 1,
    background = null,
    fileName = 'export',
    maxFrames = DEFAULT_MAX_FRAMES,
    signal,
    onProgress = () => {},
    worker,
  } = options;
  const info = EXPORT_FORMATS[format];
  if (!info) throw new Error(`不支援的格式：${format}`);
  if (info.maxFps && fps > info.maxFps)
    throw new RangeError(`${info.label} 的 fps 最多 ${info.maxFps}`);
  if (signal?.aborted) throw abortError();

  const { width: W, height: H } = exportSize(source, scale);
  const { ctx } = createFrameCanvas(W, H);
  const grab = async (t: number) => {
    await drawFrame(ctx, source, t, { scale, background });
    return ctx.getImageData(0, 0, W, H).data;
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
  });

  if (format === 'png') {
    const data = await grab(stillTime);
    onProgress(0.5, '編碼中');
    const bytes = await abortable(
      worker === false ? encodePng(data, W, H) : encodePngAsync(data, W, H),
      signal,
    );
    onProgress(1, '完成');
    return finishResult({
      bytes,
      mime: 'image/png',
      ext: 'png',
      width: W,
      height: H,
      frames: 1,
      storedFrames: 1,
      duration: 0,
    });
  }

  const N = frameCount(source.duration, fps);
  if (N > maxFrames)
    throw new RangeError(`影格數 ${N} 超過上限 ${maxFrames}，請縮短時長或降低 fps。`);

  const spec: EncoderSpec =
    format === 'apng'
      ? { format: 'apng', options: { width: W, height: H, fps, plays, quantize, mergeIdentical } }
      : format === 'gif'
        ? { format: 'gif', options: { width: W, height: H, fps, plays } }
        : format === 'webp'
          ? { format: 'webp', options: { width: W, height: H, fps, plays, quality: webpQuality } }
          : {
              format: 'png-sequence',
              options: {
                width: W,
                height: H,
                fps,
                baseName: fileNameWithExt(fileName, '', { fallback: 'frame' }),
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
      onProgress(((i + 1) / N) * 0.9, `產生影格 ${i + 1}／${N}`);
      if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
    }
    if (still && format === 'apng') await encoder.setStill(await grab(stillTime));
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
