/**
 * 匯出（規格 3.8、F40～F47）：
 * - PNG：結尾那一格（完成的樣子）；複製圖片也是這一張。
 * - APNG：依時間軸的影格率逐格畫（最後一格是完成的樣子），交給共用的 APNG 編碼器（Web Worker；相同的影格合併、
 *   只存變化的範圍；可以減成 256／128／64 色）。
 * - 影片：背景不透明時 MP4（core/video 的 findMoviePlan＋encodeMovie：H.264，沒有時 VP9），
 *   背景透明時透明的 WebM（findAlphaWebmPlan＋encodeAlphaWebm）；瀏覽器不能逐格編碼時改用即時錄影。
 * 先等出處的字型載好再畫。
 */
import { createEncoder } from '@/core/encode';
import { formatBytes } from '@/core/files';
import { ensureFont } from '@/core/fonts';
import { canvasToBlob, makeCanvas } from '@/core/image';
import {
  type AlphaWebmPlan,
  canRecordCanvas,
  encodeAlphaWebm,
  encodeMovie,
  findAlphaWebmPlan,
  findMoviePlan,
  type MoviePlan,
  pickRecordingType,
  recordCanvas,
  recordingFormats,
  VideoEncodeError,
} from '@/core/video';
import type { ExportContext, ExportOutput } from '@/ui';
import {
  apngTimes,
  buildTimeline,
  computeLayout,
  evenSize,
  exportFileName,
  type FxState,
  type Size,
  videoTimes,
} from './model';
import {
  type AnyCanvas,
  CREDIT_FONT_FAMILY,
  CREDIT_FONT_WEIGHT,
  type Ctx,
  type ImageSource,
  RenderCache,
  renderFrame,
} from './render';
import { S } from './strings';

const aborted = () => new DOMException('已取消', 'AbortError');

const ctx2d = (c: AnyCanvas, willRead = false): Ctx => {
  const g = c.getContext('2d', willRead ? { willReadFrequently: true } : undefined) as Ctx | null;
  if (!g) throw new Error('無法建立畫布');
  return g;
};

/** 出處的字型（沒有出處時不等） */
export async function ensureCreditFont(s: FxState): Promise<void> {
  const text = s.credit.text.trim();
  if (text) await ensureFont(CREDIT_FONT_FAMILY, CREDIT_FONT_WEIGHT, text).catch(() => false);
}

const sizeOf = (s: FxState, image: ImageSource) =>
  computeLayout(s, { width: image.width, height: image.height }).canvas;

/** 完成圖（結尾那一格） */
export async function finalPng(s: FxState, image: ImageSource): Promise<Blob> {
  await ensureCreditFont(s);
  const size = sizeOf(s, image);
  const c = makeCanvas(size.width, size.height);
  renderFrame(
    ctx2d(c),
    { state: s, image },
    buildTimeline(s.timing, s.frames).total,
    new RenderCache(),
  );
  return canvasToBlob(c, 'image/png');
}

export async function exportPng(s: FxState, image: ImageSource): Promise<ExportOutput> {
  const blob = await finalPng(s, image);
  const size = sizeOf(s, image);
  return { blob, fileName: exportFileName('png', new Date()), ...size };
}

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

export interface ApngJob {
  /** 色數（0＝全彩） */
  colors: number;
  /** 播放次數（0＝無限循環） */
  plays: number;
}

/** APNG（也給「試算大小」用） */
export async function exportApng(
  s: FxState,
  image: ImageSource,
  job: ApngJob,
  { signal, onProgress }: ExportContext,
): Promise<ExportOutput> {
  await ensureCreditFont(s);
  if (signal.aborted) throw aborted();
  const size = sizeOf(s, image);
  const fps = s.timing.fps;
  const total = buildTimeline(s.timing, s.frames).total;
  const times = apngTimes(total, fps);
  const quantize = job.colors > 0;
  const enc = createEncoder({
    format: 'apng',
    options: {
      width: size.width,
      height: size.height,
      fps,
      plays: job.plays,
      quantize,
      maxColors: quantize ? job.colors : 256,
      embedStill: false,
    },
  });
  const stop = () => enc.abort();
  signal.addEventListener('abort', stop);
  const c = makeCanvas(size.width, size.height);
  const g = ctx2d(c, true);
  const cache = new RenderCache();
  const input = { state: s, image };
  try {
    /* 完成的樣子當代表畫面（減色時的調色盤多照顧它） */
    if (quantize) {
      renderFrame(g, input, total, cache);
      await abortable(enc.setStill(g.getImageData(0, 0, size.width, size.height).data), signal);
    }
    for (let i = 0; i < times.length; i++) {
      if (signal.aborted) throw aborted();
      renderFrame(g, input, times[i], cache);
      await abortable(enc.addFrame(g.getImageData(0, 0, size.width, size.height).data, 1), signal);
      onProgress(((i + 1) / times.length) * 0.7, S.rendering(i + 1, times.length));
    }
    onProgress(0.72, S.encoding);
    const file = await abortable(enc.finish(), signal);
    if (signal.aborted) throw aborted();
    return {
      blob: new Blob([file.bytes], { type: file.mime }),
      fileName: exportFileName('apng', new Date()),
      width: size.width,
      height: size.height,
      frames: file.frames,
      storedFrames: file.storedFrames,
      duration: file.duration,
      details: [
        {
          label: S.detailColors,
          value: file.colors
            ? file.colors.lossless
              ? S.lossless(file.colors.count)
              : S.colorCount(file.colors.count)
            : S.fullColor,
        },
        { label: S.detailFps, value: `${fps} fps` },
        { label: S.detailLoop, value: job.plays === 0 ? S.loopInfinite : S.loopTimes(job.plays) },
      ],
    };
  } catch (e) {
    enc.abort();
    throw e;
  } finally {
    signal.removeEventListener('abort', stop);
  }
}

/* ---------- 影片 ---------- */

export type VideoMode =
  | { kind: 'mp4'; plan: MoviePlan }
  | { kind: 'webm'; plan: AlphaWebmPlan }
  | { kind: 'realtime'; mimeType: string; alpha: boolean }
  | { kind: 'none'; alpha: boolean };

/** 位元率：30 fps 1,200 萬、60 fps 1,800 萬（同 lyric-fx） */
export const videoBitrate = (fps: number): number => (fps === 60 ? 18_000_000 : 12_000_000);

const modeCache = new Map<string, Promise<VideoMode>>();
let forceRealtime = false;
/** 測試用：強制用即時錄影 */
export function setForceRealtime(v: boolean): void {
  forceRealtime = v;
  modeCache.clear();
}

/** 這個瀏覽器能怎麼編影片（依尺寸、FPS、透明；結果快取） */
export function detectVideoMode(size: Size, fps: number, alpha: boolean): Promise<VideoMode> {
  const even = evenSize(size);
  const key = `${even.width}x${even.height}|${fps}|${alpha}|${forceRealtime}`;
  let p = modeCache.get(key);
  if (!p) {
    p = (async (): Promise<VideoMode> => {
      if (!forceRealtime && typeof VideoEncoder !== 'undefined') {
        if (alpha) {
          const plan = await findAlphaWebmPlan({ ...even, fps }).catch(() => null);
          if (plan) return { kind: 'webm', plan };
        } else {
          const plan = await findMoviePlan({
            ...even,
            fps,
            bitrate: videoBitrate(fps),
            audio: null,
            videoCodecs: ['avc1', 'vp09'],
            profiles: ['high', 'main', 'baseline'],
          }).catch(() => null);
          if (plan) return { kind: 'mp4', plan };
        }
      }
      if (!canRecordCanvas()) return { kind: 'none', alpha };
      if (alpha) {
        const f = recordingFormats().find((x) => x.alpha && x.extension === 'webm');
        return f ? { kind: 'realtime', mimeType: f.mimeType, alpha } : { kind: 'none', alpha };
      }
      const mimeType = pickRecordingType({ preferMp4: true });
      return mimeType ? { kind: 'realtime', mimeType, alpha } : { kind: 'none', alpha };
    })();
    modeCache.set(key, p);
  }
  return p;
}

function friendly(e: unknown): unknown {
  if (e instanceof VideoEncodeError) {
    if (e.code === 'too-large') return new Error(S.tooLarge);
    if (e.code === 'encoder' || e.code === 'unsupported') return new Error(S.encoderFailed);
  }
  return e;
}

export async function exportVideo(
  s: FxState,
  image: ImageSource,
  mode: VideoMode,
  fps: number,
  { signal, onProgress }: ExportContext,
): Promise<ExportOutput> {
  if (mode.kind === 'none') throw new Error(mode.alpha ? S.webmUnsupported : S.videoUnsupported);
  await ensureCreditFont(s);
  if (signal.aborted) throw aborted();
  const size = evenSize(sizeOf(s, image));
  const total = buildTimeline(s.timing, s.frames).total;
  const times = videoTimes(total, fps);
  const cache = new RenderCache();
  const input = { state: s, image };
  const c = makeCanvas(size.width, size.height);
  const g = ctx2d(c, mode.kind === 'webm');
  const draw = (t: number) => {
    renderFrame(g, input, t, cache);
    if (mode.kind === 'mp4') {
      /* MP4 沒有透明度：透明的地方鋪黑（背景是模糊或單色時本來就不透明） */
      g.save();
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = '#000';
      g.fillRect(0, 0, size.width, size.height);
      g.restore();
    }
    return c as HTMLCanvasElement;
  };
  const progress = (done: number, n: number) => onProgress(done / n, S.rendering(done, n));
  try {
    if (mode.kind === 'mp4') {
      const blob = await encodeMovie({
        plan: mode.plan,
        width: size.width,
        height: size.height,
        fps,
        frameCount: times.length,
        renderFrame: (i) => draw(times[i]),
        signal,
        keyFrameInterval: fps * 2,
        audio: null,
        onProgress: progress,
      });
      return {
        blob,
        fileName: exportFileName(mode.plan.extension, new Date()),
        ...size,
        frames: times.length,
        duration: times.length / fps,
        details: [
          { label: S.detailCodec, value: mode.plan.video.codec === 'vp09' ? 'VP9' : 'H.264' },
          { label: S.detailFps, value: `${fps} fps` },
        ],
      };
    }
    if (mode.kind === 'webm') {
      const blob = await encodeAlphaWebm({
        plan: mode.plan,
        width: size.width,
        height: size.height,
        fps,
        frameCount: times.length,
        renderFrame: (i) => draw(times[i]),
        signal,
        keyFrameInterval: fps * 2,
        audio: null,
        onProgress: progress,
      });
      return {
        blob,
        fileName: exportFileName('webm', new Date()),
        ...size,
        frames: times.length,
        duration: times.length / fps,
        details: [
          { label: S.detailCodec, value: `${mode.plan.codec === 'vp09' ? 'VP9' : 'VP8'}＋透明度` },
          { label: S.detailFps, value: `${fps} fps` },
        ],
      };
    }
    /* 即時錄影：依實際經過的時間畫 */
    const blob = await recordCanvas({
      width: size.width,
      height: size.height,
      seconds: total,
      fps,
      mimeType: mode.mimeType,
      bitsPerSecond: videoBitrate(fps),
      signal,
      draw: (ctx, t) => {
        renderFrame(ctx, input, Math.min(total, t), cache);
        onProgress(
          Math.min(1, t / Math.max(0.001, total)),
          S.rendering(Math.round(t * fps), times.length),
        );
      },
    });
    const ext = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
    return {
      blob,
      fileName: exportFileName(ext, new Date()),
      ...size,
      duration: total,
      details: [
        { label: S.detailCodec, value: mode.mimeType },
        { label: S.detailFps, value: `${fps} fps` },
      ],
    };
  } catch (e) {
    throw friendly(e);
  }
}

/** 試算大小的徽章 */
export function sizeBadge(bytes: number): { tone: 'success' | 'info' | 'warning'; text: string } {
  if (bytes <= 1_000_000) return { tone: 'success', text: S.estimateBadge.light };
  if (bytes <= 5_000_000) return { tone: 'info', text: S.estimateBadge.mid };
  return { tone: 'warning', text: S.estimateBadge.heavy };
}

export const formatSize = (bytes: number): string => formatBytes(bytes);
