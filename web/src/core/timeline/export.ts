/**
 * 把 AnimationSource 逐格渲染並交給編碼器：APNG、GIF、WebP、單張 PNG、連番 PNG（ZIP）。
 * 有進度回報與取消；編碼預設在 Web Worker 裡進行。
 *
 * 兩種時間軸：
 * - 一般：總長＋fps 均分影格（frameCount／frameTime）。
 * - 影格表：source.frames 給了每格各自的長度（毫秒），照表逐格輸出（打字機的停留格等），fps 不影響影格。
 */
import { createEncoder, encodePngColorsAsync } from '../encode/client';
import type { EncodedFile } from '../encode/frames';
import { GIF_MAX_FPS } from '../encode/gif';
import type { EncoderSpec } from '../encode/local';
import type { PaletteMethod } from '../encode/palette';
import { encodePngColors } from '../encode/still';
import { fileNameWithExt, sequenceName } from '../files';
import { frameRenderTimes, frameTableDuration, frameTableTicks } from './frames';
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
  /** APNG 減色成 256 色（給了 colors 時以 colors 為準） */
  quantize?: boolean;
  /**
   * 色數（APNG 與單張 PNG）：0＝無損全彩 RGBA；2～256＝最多這麼多色的調色盤（色數在上限內時無損）。
   * 不填時 APNG 依 quantize（256 色）、PNG 一律全彩。GIF 不受影響（一律 256 色）。
   */
  colors?: number;
  /**
   * 減色時調色盤的選法（APNG、單張 PNG、GIF；預設 'median-cut'）。'pca'＝主成分切割
   * （彩虹、半透明的線條分得到顏色，見 core/encode/palette.ts）。
   */
  paletteMethod?: PaletteMethod;
  /** GIF 每格各自減色（每格自己的區域調色盤；預設 false＝整段共用一個全域調色盤） */
  gifLocalPalettes?: boolean;
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
  /**
   * WebP 每格至少顯示幾毫秒（預設不限）。例如 20：60 FPS 的每格 17／16 ms 變成 20 ms，
   * 補上的時間不從別格扣回（總長變長）。只影響 WebP。
   */
  webpMinFrameMs?: number;
  /** WebP：每格比較無損與有損（webpQuality），取較小者 */
  webpPickSmaller?: boolean;
  /** 先塗滿的背景色（在 render 之前）；null／不填 = 透明 */
  background?: string | null;
  /**
   * 底色合成（在 render 之後）：每個像素依透明度合成到這個顏色上，整張不再透明（例如 GIF 的「Discord 暗色」底）。
   * 和 background 的差別：render 裡的挖空（destination-out）、加亮（lighter）是在透明底上算完才合成，
   * 挖空的地方會露出這個顏色。只用在 GIF 時，呼叫端只在 format 是 gif 時傳。
   */
  matte?: string | null;
  /** GIF：alpha 小於這個值當作透明（預設 128：未滿一半透明、一半以上不透明） */
  gifAlphaThreshold?: number;
  /** 影格表：APNG／WebP 的計時單位（每秒幾個 tick，預設 1000＝毫秒）。GIF 一律以 1/100 秒累計。 */
  frameTimeBase?: number;
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

/** 清空、塗背景、套用縮放後呼叫 source.render；給 matte 時最後再合成到底色上 */
export async function drawFrame(
  ctx: Ctx2D,
  source: AnimationSource,
  t: number,
  {
    scale = 1,
    background = null,
    matte = null,
  }: { scale?: number; background?: string | null; matte?: string | null } = {},
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
  if (matte) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-over';
    ctx.fillStyle = matte;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
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
    colors,
    paletteMethod,
    gifLocalPalettes = false,
    mergeIdentical = true,
    still = false,
    stillForPalette = false,
    stillWeightMin,
    webpQuality = 1,
    webpMinFrameMs,
    webpPickSmaller = false,
    background = null,
    matte = null,
    gifAlphaThreshold,
    frameTimeBase = 1000,
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
  const table = source.frames?.length ? source.frames : null;
  if (!table && info.maxFps && fps > info.maxFps)
    throw new RangeError(`${info.label} 的 fps 最多 ${info.maxFps}`);
  if (signal?.aborted) throw abortError();

  const { width: W, height: H } = exportSize(source, scale);
  const { ctx } = createFrameCanvas(W, H);
  let crop: CropRect = { x: 0, y: 0, w: W, h: H };
  const grab = async (t: number) => {
    await drawFrame(ctx, source, t, { scale, background, matte });
    return ctx.getImageData(crop.x, crop.y, crop.w, crop.h).data;
  };
  /* 色數：colors 優先；不填時 APNG 依 quantize */
  const maxColors = colors !== undefined ? Math.max(0, Math.min(256, Math.round(colors))) : null;
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
    const still = await abortable(
      worker === false
        ? encodePngColors(data, crop.w, crop.h, maxColors ?? 0, 'auto', paletteMethod)
        : encodePngColorsAsync(data, crop.w, crop.h, maxColors ?? 0, paletteMethod),
      signal,
    );
    onProgress(1, '完成');
    return finishResult({
      bytes: still.bytes,
      mime: 'image/png',
      ext: 'png',
      width: crop.w,
      height: crop.h,
      frames: 1,
      storedFrames: 1,
      duration: 0,
      ...(still.colors ? { colors: still.colors } : {}),
    });
  }

  /* 影格：影格表照表；一般動畫依總長與 fps 均分 */
  const N = table ? table.length : frameCount(source.duration, fps);
  const tableTimes = table ? frameRenderTimes(table) : null;
  const timeOf = (i: number) =>
    tableTimes ? tableTimes[i] : frameTime(i, N, source.duration, fps, !source.loop);
  /* 影格表的計時單位：GIF 1/100 秒；連番 PNG 依 fps（張數對應時間）；其他依 frameTimeBase */
  const tickRate = !table ? fps : format === 'gif' ? 100 : format === 'zip' ? fps : frameTimeBase;
  const tableTicks = table ? frameTableTicks(table, tickRate) : null;
  if (N > maxFrames)
    throw new RangeError(`影格數 ${N} 超過上限 ${maxFrames}，請縮短時長或降低 fps。`);

  /* 自動裁邊：先畫一輪找出所有影格的不透明範圍 */
  const passShare = autoCrop ? 0.4 : 0;
  if (autoCrop) {
    const box = { x0: W, y0: H, x1: -1, y1: -1 };
    for (let i = 0; i < N; i++) {
      if (signal?.aborted) throw abortError();
      unionOpaque(await grab(timeOf(i)), W, H, box);
      onProgress(((i + 1) / N) * passShare, `計算範圍 ${i + 1}／${N}`);
      if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0));
    }
    if (still && format === 'apng') unionOpaque(await grab(stillTime), W, H, box);
    crop = cropFromBox(box, W, H);
  }
  const CW = crop.w;
  const CH = crop.h;

  const seqBase = fileNameWithExt(sequenceBaseName ?? fileName, '', { fallback: 'frame' });
  /* 連番 PNG 的張數：影格表時每格依長度重複（張數對應時間） */
  const seqCount = tableTicks ? tableTicks.reduce((a, b) => a + b, 0) : N;
  const seqInfo =
    typeof sequenceInfo === 'function'
      ? sequenceInfo({
          fps,
          frames: seqCount,
          width: CW,
          height: CH,
          duration: table ? frameTableDuration(table) : source.duration,
          first: sequenceName(seqBase, 0, seqCount, 'png'),
          last: sequenceName(seqBase, seqCount - 1, seqCount, 'png'),
        })
      : sequenceInfo;

  const apngQuantize = maxColors !== null ? maxColors > 0 : quantize;
  const spec: EncoderSpec =
    format === 'apng'
      ? {
          format: 'apng',
          options: {
            width: CW,
            height: CH,
            fps: tickRate,
            plays,
            quantize: apngQuantize,
            ...(maxColors ? { maxColors: Math.max(2, maxColors) } : {}),
            ...(paletteMethod ? { paletteMethod } : {}),
            mergeIdentical,
            embedStill: still,
            ...(stillWeightMin !== undefined ? { stillWeightMin } : {}),
          },
        }
      : format === 'gif'
        ? {
            format: 'gif',
            options: {
              width: CW,
              height: CH,
              fps: tickRate,
              plays,
              ...(table ? { variableDelay: true } : {}),
              ...(gifAlphaThreshold !== undefined ? { alphaThreshold: gifAlphaThreshold } : {}),
              ...(paletteMethod ? { paletteMethod } : {}),
              ...(gifLocalPalettes ? { localPalettes: true } : {}),
            },
          }
        : format === 'webp'
          ? {
              format: 'webp',
              options: {
                width: CW,
                height: CH,
                fps: tickRate,
                plays,
                quality: webpQuality,
                ...(webpMinFrameMs ? { minFrameMs: webpMinFrameMs } : {}),
                ...(webpPickSmaller ? { pickSmaller: true } : {}),
              },
            }
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
      const data = await grab(timeOf(i));
      await abortable(encoder.addFrame(data, tableTicks ? tableTicks[i] : 1), signal);
      onProgress(passShare + ((i + 1) / N) * (0.9 - passShare), `產生影格 ${i + 1}／${N}`);
      if (i % 2 === 1) await new Promise((r) => setTimeout(r, 0));
    }
    if (format === 'apng' && (still || (apngQuantize && stillForPalette)))
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

export interface BatchExportItem {
  source: AnimationSource;
  /** 這個檔案的檔名主體（不含副檔名） */
  fileName: string;
}

/**
 * 依序匯出多個動畫（例如片尾名單分段，每段一個檔案）。進度合併成一條，標籤前面加「第 i／n 個・」。
 * 其他選項與 exportAnimation 相同（fileName 由各項目指定）。取消時丟出 AbortError，已完成的結果不回傳。
 */
export async function exportAnimationBatch(
  items: readonly BatchExportItem[],
  options: Omit<ExportAnimationOptions, 'fileName'>,
): Promise<ExportResult[]> {
  const out: ExportResult[] = [];
  const n = items.length;
  const report = options.onProgress ?? (() => {});
  for (let i = 0; i < n; i++) {
    if (options.signal?.aborted) throw abortError();
    const it = items[i];
    out.push(
      await exportAnimation(it.source, {
        ...options,
        fileName: it.fileName,
        onProgress: (ratio, label) => report((i + ratio) / n, `第 ${i + 1}／${n} 個・${label}`),
      }),
    );
  }
  report(1, '完成');
  return out;
}
