/**
 * 匯出（規格 3.6～3.8）：PNG（預覽「錄影帶」目前的那一格；寬 640／1280〔預設〕／1920）；
 * GIF、APNG、WebP（每格 90 ms；預設 24 格，2026-11-05 起依長度、場景、開場、收尾決定，字幕逐字打出）。
 * 先等字型載好再畫；動畫逐格畫好交給共用的編碼器（Web Worker）。GIF 鋪黑底（四角黑色，同原作）、64 色（可以選 128、256）、不抖色。
 */
import { createEncoder, type EncoderSpec } from '@/core/encode';
import { canvasToBlob, makeCanvas } from '@/core/image';
import type { ExportOutput } from '@/ui';
import { waitFonts } from './fonts';
import {
  type AnimFrameInfo,
  type AnimPlan,
  animFrameInfo,
  animPlan,
  animSize,
  animText,
  DEFAULT_PNG_SIZE,
  type ExportFormat,
  exportFileName,
  frameText,
  GIF_COLORS,
  GIF_DELAY_CS,
  GIF_STEP,
  gifFrameTime,
  masterWidthFor,
  pngSize,
  type Size,
  stampLines,
  type VhsState,
} from './model';
import {
  type AnyCanvas,
  type ComposeLook,
  type Ctx,
  type FrameParams,
  type Master,
  VhsRenderer,
} from './render';
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
  /** PNG 的大小（PNG_WIDTHS 的第幾個；不給＝1280） */
  pngSize?: number;
  /** GIF 的色數（不給＝64） */
  gifColors?: number;
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
  job: Pick<ExportJob, 'format' | 'animSize' | 'pngSize'>,
): Size {
  return job.format === 'png'
    ? pngSize(s.aspect, job.pngSize ?? DEFAULT_PNG_SIZE)
    : animSize(s.aspect, job.animSize);
}

/** 照片層的調色與反轉 */
export const composeLook = (s: VhsState): ComposeLook => ({
  tone: s.picture.tone,
  brightness: s.picture.brightness,
  saturation: s.picture.saturation,
  flip: s.flip,
});

/** 照片層（沒有照片時 null）；res＝合成寬度 */
export function masterFor(
  r: VhsRenderer,
  s: VhsState,
  photo: CanvasImageSource | null,
  res: number,
): Master | null {
  if (!photo || !s.photo) return null;
  return r.compose(photo, s.photo, s.view, s.aspect, res, composeLook(s));
}

/** 一格的畫法裡不隨時間變的設定（字幕的樣子、效果、弧面、暗角、圓角、日期戳記…） */
function lookParams(s: VhsState) {
  return {
    font: s.osdFont,
    captionStyle: s.captionStyle,
    osdMotion: s.osdMotion,
    stamp: s.stamp.on
      ? {
          lines: stampLines(s.stamp.value, s.stamp.format),
          color: s.stamp.color,
          side: s.stamp.side,
        }
      : null,
    effects: s.effects,
    curve: s.picture.curve / 1000,
    vignette: s.picture.vignette / 100,
    corners: s.picture.corners,
  } satisfies Partial<FrameParams>;
}

/** 畫一格到 out（測試入口與匯出共用）；gifFrame 給了就是動畫的第幾格（場景、字幕逐字打出、開場、收尾） */
export function renderInto(
  r: VhsRenderer,
  out: AnyCanvas,
  s: VhsState,
  master: Master | null,
  t: number,
  gifFrame?: number,
): void {
  if (gifFrame !== undefined) {
    renderAnimFrame(r, out, s, master, animPlan(s), gifFrame);
    return;
  }
  r.frame(out, { t, wear: s.wear / 100, master, ...frameText(s, t), ...lookParams(s) });
}

/** 動畫的第 f 格（t＝f × 0.09） */
export function renderAnimFrame(
  r: VhsRenderer,
  out: AnyCanvas,
  s: VhsState,
  master: Master | null,
  plan: AnimPlan,
  f: number,
  info: AnimFrameInfo = animFrameInfo(s, plan, f),
): void {
  const t = gifFrameTime(f);
  r.frame(out, {
    t,
    wear: s.wear / 100,
    master,
    ...animText(s, info, t),
    ...lookParams(s),
    intro: info.intro,
    off: info.off,
  });
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
      options: {
        ...base,
        variableDelay: true,
        maxColors: job.gifColors ?? GIF_COLORS,
        dither: 'none',
      },
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
    /* 照片層以 PNG 的寬合成 */
    const master = masterFor(r, s, photo, size.width);
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
  const master = masterFor(r, s, photo, masterWidthFor(size.width));
  const ctx = ctx2d(out);
  const plan = animPlan(s);
  const enc = createEncoder(encoderSpec(job.format, size, job));
  const stop = () => enc.abort();
  signal.addEventListener('abort', stop);
  try {
    for (let f = 0; f < plan.total; f++) {
      if (signal.aborted) throw aborted();
      renderAnimFrame(r, out, s, master, plan, f);
      if (job.format === 'gif') fillBlack(out);
      const px = ctx.getImageData(0, 0, size.width, size.height).data;
      await abortable(enc.addFrame(px, GIF_DELAY_CS), signal);
      onProgress(((f + 1) / plan.total) * 0.9, S.rendering(f + 1, plan.total));
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
      duration: plan.total * GIF_STEP,
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
