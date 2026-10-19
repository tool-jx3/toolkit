/**
 * 匯出（規格 3.6～3.8）：PNG（預覽「錄影帶」目前的那一格，1280 寬）；GIF、APNG、WebP（24 格、每格 90 ms，字幕逐字打出）。
 * 先等字型載好再畫；動畫逐格畫好交給共用的編碼器（Web Worker）。GIF 鋪黑底（四角黑色，同原作）、64 色、不抖色。
 */
import { createEncoder, type EncoderSpec } from '@/core/encode';
import { canvasToBlob, makeCanvas } from '@/core/image';
import type { ExportOutput } from '@/ui';
import { waitFonts } from './fonts';
import {
  animSize,
  type ExportFormat,
  exportFileName,
  frameText,
  GIF_COLORS,
  GIF_DELAY_CS,
  GIF_DURATION,
  GIF_FRAMES,
  gifFrameTime,
  masterWidthFor,
  SCREEN_W,
  type Size,
  screenSize,
  type VhsState,
} from './model';
import { type AnyCanvas, type Ctx, type Master, VhsRenderer } from './render';
import { S } from './strings';

export interface ExportJob {
  format: ExportFormat;
  /** 動畫大小：0 小、1 中、2 大 */
  animSize: number;
  /** 播放次數（0＝無限循環） */
  plays: number;
  /** APNG 減色 */
  quantize: boolean;
  /** PNG：預覽「錄影帶」的時間（這一格的 t） */
  tapeTime: number;
}

/** WebP 的品質（有損） */
export const WEBP_QUALITY = 0.9;

const ctx2d = (c: AnyCanvas): Ctx => {
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

const aborted = () => new DOMException('已取消', 'AbortError');

/** 取消時立刻結束等待（編碼器的 Worker 被結束後，還在等的呼叫不會自己結束） */
function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted());
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

/** 輸出的大小 */
export function outputSize(
  s: Pick<VhsState, 'aspect'>,
  job: Pick<ExportJob, 'format' | 'animSize'>,
): Size {
  return job.format === 'png' ? screenSize(s.aspect) : animSize(s.aspect, job.animSize);
}

/** 照片層（沒有照片時 null） */
function masterFor(
  r: VhsRenderer,
  s: VhsState,
  photo: CanvasImageSource | null,
  width: number,
): Master | null {
  if (!photo || !s.photo) return null;
  return r.compose(photo, s.photo, s.view, s.aspect, masterWidthFor(width));
}

/** 畫一格到 out（測試入口與匯出共用）；gifFrame 給了就是動畫的第幾格（字幕逐字打出） */
export function renderInto(
  r: VhsRenderer,
  out: AnyCanvas,
  s: VhsState,
  master: Master | null,
  t: number,
  gifFrame?: number,
): void {
  r.frame(out, { t, wear: s.wear / 100, master, ...frameText(s, t, gifFrame), font: s.osdFont });
}

/** GIF：鋪黑底（四角的透明變成黑色，同原作） */
function fillBlack(c: AnyCanvas): void {
  const ctx = ctx2d(c);
  ctx.save();
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.restore();
}

function encoderSpec(
  format: Exclude<ExportFormat, 'png'>,
  size: Size,
  job: ExportJob,
): EncoderSpec {
  const base = { width: size.width, height: size.height, fps: 100, plays: job.plays };
  if (format === 'gif')
    return {
      format: 'gif',
      options: { ...base, variableDelay: true, maxColors: GIF_COLORS, dither: 'none' },
    };
  if (format === 'apng') return { format: 'apng', options: { ...base, quantize: job.quantize } };
  return { format: 'webp', options: { ...base, quality: WEBP_QUALITY } };
}

export async function runExport(
  s: VhsState,
  photo: CanvasImageSource | null,
  job: ExportJob,
  {
    signal,
    onProgress,
  }: { signal: AbortSignal; onProgress: (ratio: number, label?: string) => void },
): Promise<ExportOutput> {
  await waitFonts(s);
  if (signal.aborted) throw aborted();
  const r = new VhsRenderer();
  const size = outputSize(s, job);
  const fileName = exportFileName(s.photo?.name, job.format);
  const out = makeCanvas(size.width, size.height);
  if (job.format === 'png') {
    const master = masterFor(r, s, photo, SCREEN_W);
    renderInto(r, out, s, master, job.tapeTime);
    const blob = await canvasToBlob(out, 'image/png');
    return {
      blob,
      fileName,
      width: size.width,
      height: size.height,
      details: [{ label: S.frameDetail, value: S.frameAt(S.seconds(job.tapeTime)) }],
    };
  }
  const master = masterFor(r, s, photo, size.width);
  const ctx = ctx2d(out);
  const enc = createEncoder(encoderSpec(job.format, size, job));
  const stop = () => enc.abort();
  signal.addEventListener('abort', stop);
  try {
    for (let f = 0; f < GIF_FRAMES; f++) {
      if (signal.aborted) throw aborted();
      renderInto(r, out, s, master, gifFrameTime(f), f);
      if (job.format === 'gif') fillBlack(out);
      const px = ctx.getImageData(0, 0, size.width, size.height).data;
      await abortable(enc.addFrame(px, GIF_DELAY_CS), signal);
      onProgress(((f + 1) / GIF_FRAMES) * 0.9, S.rendering(f + 1, GIF_FRAMES));
    }
    if (signal.aborted) throw aborted();
    onProgress(0.92, S.encoding);
    const file = await abortable(enc.finish(), signal);
    if (signal.aborted) throw aborted();
    return {
      blob: new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.mime }),
      fileName,
      width: size.width,
      height: size.height,
      frames: file.frames,
      storedFrames: file.storedFrames,
      duration: GIF_DURATION,
      details: file.colors
        ? [
            {
              label: S.colorsDetail,
              value: file.colors.lossless
                ? S.lossless(file.colors.count)
                : S.colorCount(file.colors.count),
            },
          ]
        : undefined,
    };
  } catch (e) {
    enc.abort();
    throw e;
  } finally {
    signal.removeEventListener('abort', stop);
  }
}
