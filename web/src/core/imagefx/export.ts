/**
 * 匯出：
 * - PNG：結尾那一格（完成的樣子）；複製圖片也是這一張。
 * - APNG：依時間軸的影格率逐格畫（最後一格是完成的樣子），交給共用的 APNG 編碼器（Web Worker；相同的影格合併、
 *   只存變化的範圍；可以減成 256／128／64 色）。
 * - 影片：背景不透明時 MP4（core/video 的 findMoviePlan＋encodeMovie：H.264，沒有時 VP9），
 *   背景透明時透明的 WebM（findAlphaWebmPlan＋encodeAlphaWebm）；瀏覽器不能逐格編碼時改用即時錄影。
 * - 運鏡（APNG、影片、連番 PNG）、段階公開 PNG、圖層 4 張、連番 PNG（三種都是 ZIP，fflate，只打包不壓縮）。
 * 先等出處的字型載好再畫。工具用 createFxExporter(kit, 檔名前綴, 文字) 拿到這些函式。
 */
import { createEncoder } from '@/core/encode';
import { formatBytes, zipFiles } from '@/core/files';
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
import { computeLayout, evenSize } from './layout';
import {
  type AnyCanvas,
  CREDIT_FONT_FAMILY,
  CREDIT_FONT_WEIGHT,
  type Ctx,
  type ImageSource,
  RenderCache,
  type RenderKit,
  type RenderOptions,
  renderFrame,
} from './render';
import { buildTimeline, cameraView, stepFrames, stepProgress } from './timeline';
import type { FrameBase, FxDoc, Size } from './types';
import {
  apngTimes,
  type FileKind,
  frameFileName,
  fxFileName,
  LAYERS,
  type LayerId,
  layerFileName,
  SEQUENCE_MAX_FRAMES,
  stepFileName,
  videoTimes,
} from './view';

/** 匯出的進度與取消（與共用 ExportPanel 的 ExportContext 相同的形狀） */
export interface FxExportContext {
  signal: AbortSignal;
  onProgress: (ratio: number, label?: string) => void;
}

/** 匯出的結果（與共用 ExportPanel 的 ExportOutput 相同的形狀） */
export interface FxExportOutput {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  frames?: number;
  storedFrames?: number;
  duration?: number;
  details?: readonly { label: string; value: string }[];
}

/** 匯出用到的文字（工具的 strings.ts 提供） */
export interface FxExportText {
  rendering: (i: number, n: number) => string;
  encoding: string;
  detailColors: string;
  lossless: (n: number) => string;
  colorCount: (n: number) => string;
  fullColor: string;
  detailFps: string;
  detailLoop: string;
  loopInfinite: string;
  loopTimes: (n: number) => string;
  tooLarge: string;
  encoderFailed: string;
  webmUnsupported: string;
  videoUnsupported: string;
  detailCodec: string;
  detailFiles: string;
  stepsValue: (n: number) => string;
  layerNames: Record<LayerId, string>;
  sequenceTooMany: (n: number, max: number) => string;
  zipping: string;
  estimateBadge: { light: string; mid: string; heavy: string };
}

export const aborted = (): DOMException => new DOMException('已取消', 'AbortError');

export const ctx2d = (c: AnyCanvas, willRead = false): Ctx => {
  const g = c.getContext('2d', willRead ? { willReadFrequently: true } : undefined) as Ctx | null;
  if (!g) throw new Error('無法建立畫布');
  return g;
};

/** 出處的字型（沒有出處時不等） */
export async function ensureCreditFont(s: Pick<FxDoc, 'credit'>): Promise<void> {
  const text = s.credit.text.trim();
  if (text) await ensureFont(CREDIT_FONT_FAMILY, CREDIT_FONT_WEIGHT, text).catch(() => false);
}

/** 取消時立刻結束等待（編碼器的 Worker 被結束後，還在等的呼叫不會自己結束） */
export function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
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

/** MP4 用哪些編碼（依序試）；預設 H.264，沒有時 VP9 */
export type MovieCodecs = readonly ('avc1' | 'vp09')[];

/** 這個瀏覽器能怎麼編影片（依尺寸、FPS、透明；結果快取） */
export function detectVideoMode(
  size: Size,
  fps: number,
  alpha: boolean,
  codecs: MovieCodecs = ['avc1', 'vp09'],
): Promise<VideoMode> {
  const even = evenSize(size);
  const key = `${even.width}x${even.height}|${fps}|${alpha}|${forceRealtime}|${codecs.join(',')}`;
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
            videoCodecs: [...codecs],
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

export function friendlyVideoError(e: unknown, text: FxExportText): unknown {
  if (e instanceof VideoEncodeError) {
    if (e.code === 'too-large') return new Error(text.tooLarge);
    if (e.code === 'encoder' || e.code === 'unsupported') return new Error(text.encoderFailed);
  }
  return e;
}

/** 一段畫好的動畫怎麼編成影片（MP4／透明 WebM／即時錄影）；draw 把第 t 秒畫到 g 上（g 的大小＝size） */
export async function encodeFxVideo(
  mode: VideoMode,
  job: {
    size: Size;
    fps: number;
    total: number;
    draw: (g: Ctx, t: number) => void;
    /** MP4 透明的地方鋪的顏色 */
    matte?: string;
    fileName: (kind: FileKind) => string;
  },
  text: FxExportText,
  { signal, onProgress }: FxExportContext,
): Promise<FxExportOutput> {
  if (mode.kind === 'none')
    throw new Error(mode.alpha ? text.webmUnsupported : text.videoUnsupported);
  const { size, fps, total } = job;
  const times = videoTimes(total, fps);
  const c = makeCanvas(size.width, size.height);
  const g = ctx2d(c, mode.kind === 'webm');
  const draw = (t: number) => {
    job.draw(g, t);
    if (mode.kind === 'mp4') {
      /* MP4 沒有透明度：透明的地方鋪底色（背景是模糊或單色時本來就不透明） */
      g.save();
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = job.matte ?? '#000';
      g.fillRect(0, 0, size.width, size.height);
      g.restore();
    }
    return c as HTMLCanvasElement;
  };
  const progress = (done: number, n: number) => onProgress(done / n, text.rendering(done, n));
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
        fileName: job.fileName(mode.plan.extension),
        ...size,
        frames: times.length,
        duration: times.length / fps,
        details: [
          { label: text.detailCodec, value: mode.plan.video.codec === 'vp09' ? 'VP9' : 'H.264' },
          { label: text.detailFps, value: `${fps} fps` },
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
        fileName: job.fileName('webm'),
        ...size,
        frames: times.length,
        duration: times.length / fps,
        details: [
          {
            label: text.detailCodec,
            value: `${mode.plan.codec === 'vp09' ? 'VP9' : 'VP8'}＋透明度`,
          },
          { label: text.detailFps, value: `${fps} fps` },
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
        job.draw(ctx, Math.min(total, t));
        if (job.matte && !mode.alpha) {
          ctx.save();
          ctx.globalCompositeOperation = 'destination-over';
          ctx.fillStyle = job.matte;
          ctx.fillRect(0, 0, size.width, size.height);
          ctx.restore();
        }
        onProgress(
          Math.min(1, t / Math.max(0.001, total)),
          text.rendering(Math.round(t * fps), times.length),
        );
      },
    });
    const ext = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm';
    return {
      blob,
      fileName: job.fileName(ext),
      ...size,
      duration: total,
      details: [
        { label: text.detailCodec, value: mode.mimeType },
        { label: text.detailFps, value: `${fps} fps` },
      ],
    };
  } catch (e) {
    throw friendlyVideoError(e, text);
  }
}

/* ---------- ZIP ---------- */

export async function pngBytes(c: AnyCanvas): Promise<Uint8Array> {
  return new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer());
}

export function zipOutput(
  entries: { name: string; data: Uint8Array }[],
  fileName: string,
  size: Size,
  details: { label: string; value: string }[],
  frames?: number,
): FxExportOutput {
  /* PNG 已經壓過：只打包不壓縮 */
  const zip = zipFiles(entries, { level: 0 });
  return {
    blob: new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }),
    fileName,
    ...size,
    frames,
    details,
  };
}

/** 試算大小的徽章 */
export function sizeBadge(
  bytes: number,
  text: Pick<FxExportText, 'estimateBadge'>,
): { tone: 'success' | 'info' | 'warning'; text: string } {
  if (bytes <= 1_000_000) return { tone: 'success', text: text.estimateBadge.light };
  if (bytes <= 5_000_000) return { tone: 'info', text: text.estimateBadge.mid };
  return { tone: 'warning', text: text.estimateBadge.heavy };
}

export const formatSize = (bytes: number): string => formatBytes(bytes);

/* ---------- 工具的匯出函式 ---------- */

export interface FxExporter<S extends FxDoc> {
  /** 檔名（<前綴>-年月日-時分秒…） */
  fileName: (kind: FileKind, now?: Date) => string;
  /** 畫一格（綁好工具的 kit） */
  render: (
    g: Ctx,
    s: S,
    image: ImageSource | null,
    t: number,
    cache: RenderCache,
    opts?: RenderOptions,
  ) => void;
  /** 動畫的一格（運鏡打開時只畫看到的那一塊；APNG、影片、連番 PNG 共用） */
  animFrameDrawer: (
    s: S,
    image: ImageSource,
  ) => { total: number; draw: (g: Ctx, t: number) => void };
  finalPng: (s: S, image: ImageSource) => Promise<Blob>;
  exportPng: (s: S, image: ImageSource) => Promise<FxExportOutput>;
  exportApng: (
    s: S,
    image: ImageSource,
    job: ApngJob,
    ctx: FxExportContext,
  ) => Promise<FxExportOutput>;
  exportVideo: (
    s: S,
    image: ImageSource,
    mode: VideoMode,
    fps: number,
    ctx: FxExportContext,
  ) => Promise<FxExportOutput>;
  exportSteps: (s: S, image: ImageSource, ctx: FxExportContext) => Promise<FxExportOutput>;
  exportLayers: (s: S, image: ImageSource, ctx: FxExportContext) => Promise<FxExportOutput>;
  exportSequence: (s: S, image: ImageSource, ctx: FxExportContext) => Promise<FxExportOutput>;
}

export function createFxExporter<F extends FrameBase, S extends FxDoc<F>>(
  kit: RenderKit<F>,
  prefix: string,
  text: FxExportText,
): FxExporter<S> {
  const fileName = (kind: FileKind, now = new Date()) => fxFileName(prefix, kind, now);
  const layoutOf = (s: S, image: ImageSource) =>
    computeLayout(s, { width: image.width, height: image.height });
  const sizeOf = (s: S, image: ImageSource) => layoutOf(s, image).canvas;
  const timelineOf = (s: S) => buildTimeline(s.timing, s.frames, kit, s.camera);
  const isAction = (f: F) => kit.isAction(f);
  const render = (
    g: Ctx,
    s: S,
    image: ImageSource | null,
    t: number,
    cache: RenderCache,
    opts: RenderOptions = {},
  ) => renderFrame(g, { state: s, image }, t, cache, kit, opts);

  const animFrameDrawer = (s: S, image: ImageSource) => {
    const layout = layoutOf(s, image);
    const tl = timelineOf(s);
    const cache = new RenderCache();
    return {
      total: tl.total,
      draw: (g: Ctx, t: number) =>
        render(g, s, image, t, cache, { view: cameraView(s, layout, tl, t) }),
    };
  };

  const finalPng = async (s: S, image: ImageSource): Promise<Blob> => {
    await ensureCreditFont(s);
    const size = sizeOf(s, image);
    const c = makeCanvas(size.width, size.height);
    render(ctx2d(c), s, image, timelineOf(s).total, new RenderCache());
    return canvasToBlob(c, 'image/png');
  };

  const exportPng = async (s: S, image: ImageSource): Promise<FxExportOutput> => {
    const blob = await finalPng(s, image);
    const size = sizeOf(s, image);
    return { blob, fileName: fileName('png'), ...size };
  };

  const exportApng = async (
    s: S,
    image: ImageSource,
    job: ApngJob,
    { signal, onProgress }: FxExportContext,
  ): Promise<FxExportOutput> => {
    await ensureCreditFont(s);
    if (signal.aborted) throw aborted();
    const size = sizeOf(s, image);
    const fps = s.timing.fps;
    const anim = animFrameDrawer(s, image);
    const total = anim.total;
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
    try {
      /* 完成的樣子當代表畫面（減色時的調色盤多照顧它） */
      if (quantize) {
        anim.draw(g, total);
        await abortable(enc.setStill(g.getImageData(0, 0, size.width, size.height).data), signal);
      }
      for (let i = 0; i < times.length; i++) {
        if (signal.aborted) throw aborted();
        anim.draw(g, times[i]);
        await abortable(
          enc.addFrame(g.getImageData(0, 0, size.width, size.height).data, 1),
          signal,
        );
        onProgress(((i + 1) / times.length) * 0.7, text.rendering(i + 1, times.length));
      }
      onProgress(0.72, text.encoding);
      const file = await abortable(enc.finish(), signal);
      if (signal.aborted) throw aborted();
      return {
        blob: new Blob([file.bytes], { type: file.mime }),
        fileName: fileName('apng'),
        width: size.width,
        height: size.height,
        frames: file.frames,
        storedFrames: file.storedFrames,
        duration: file.duration,
        details: [
          {
            label: text.detailColors,
            value: file.colors
              ? file.colors.lossless
                ? text.lossless(file.colors.count)
                : text.colorCount(file.colors.count)
              : text.fullColor,
          },
          { label: text.detailFps, value: `${fps} fps` },
          {
            label: text.detailLoop,
            value: job.plays === 0 ? text.loopInfinite : text.loopTimes(job.plays),
          },
        ],
      };
    } catch (e) {
      enc.abort();
      throw e;
    } finally {
      signal.removeEventListener('abort', stop);
    }
  };

  const exportVideo = async (
    s: S,
    image: ImageSource,
    mode: VideoMode,
    fps: number,
    ctx: FxExportContext,
  ): Promise<FxExportOutput> => {
    if (mode.kind === 'none')
      throw new Error(mode.alpha ? text.webmUnsupported : text.videoUnsupported);
    await ensureCreditFont(s);
    if (ctx.signal.aborted) throw aborted();
    const anim = animFrameDrawer(s, image);
    return encodeFxVideo(
      mode,
      {
        size: evenSize(sizeOf(s, image)),
        fps,
        total: anim.total,
        draw: anim.draw,
        fileName: (kind) => fileName(kind),
      },
      text,
      ctx,
    );
  };

  /** 段階公開：演出前（step_00）→ 放大框與會動的框照清單順序一個一個做完（全圖，沒有運鏡） */
  const exportSteps = async (
    s: S,
    image: ImageSource,
    { signal, onProgress }: FxExportContext,
  ): Promise<FxExportOutput> => {
    await ensureCreditFont(s);
    const size = sizeOf(s, image);
    const n = stepFrames(s.frames, isAction).length + 1;
    const c = makeCanvas(size.width, size.height);
    const g = ctx2d(c);
    const cache = new RenderCache();
    const entries: { name: string; data: Uint8Array }[] = [];
    for (let k = 0; k < n; k++) {
      if (signal.aborted) throw aborted();
      render(g, s, image, 0, cache, { progress: stepProgress(s.frames, k, isAction) });
      entries.push({ name: stepFileName(k), data: await pngBytes(c) });
      onProgress((k + 1) / (n + 1), text.rendering(k + 1, n));
    }
    return zipOutput(entries, fileName('steps'), size, [
      { label: text.detailFiles, value: text.stepsValue(n) },
    ]);
  };

  /** 圖層：背景、放大框、標記、完成（結尾那一格、全圖；背景與放大框不含會動的塗黑） */
  const exportLayers = async (
    s: S,
    image: ImageSource,
    { signal, onProgress }: FxExportContext,
  ): Promise<FxExportOutput> => {
    await ensureCreditFont(s);
    const size = sizeOf(s, image);
    const total = timelineOf(s).total;
    const c = makeCanvas(size.width, size.height);
    const g = ctx2d(c);
    const cache = new RenderCache();
    const entries: { name: string; data: Uint8Array }[] = [];
    for (const [i, layer] of LAYERS.entries()) {
      if (signal.aborted) throw aborted();
      render(g, s, image, total, cache, { layer });
      entries.push({ name: layerFileName(layer), data: await pngBytes(c) });
      onProgress((i + 1) / (LAYERS.length + 1), text.layerNames[layer]);
    }
    return zipOutput(entries, fileName('layers'), size, [
      { label: text.detailFiles, value: LAYERS.map((l) => text.layerNames[l]).join('、') },
    ]);
  };

  /** 連番 PNG：時間軸的影格率逐格（含運鏡），frame_0001.png… */
  const exportSequence = async (
    s: S,
    image: ImageSource,
    { signal, onProgress }: FxExportContext,
  ): Promise<FxExportOutput> => {
    await ensureCreditFont(s);
    const size = sizeOf(s, image);
    const fps = s.timing.fps;
    const anim = animFrameDrawer(s, image);
    const times = apngTimes(anim.total, fps);
    if (times.length > SEQUENCE_MAX_FRAMES)
      throw new Error(text.sequenceTooMany(times.length, SEQUENCE_MAX_FRAMES));
    const c = makeCanvas(size.width, size.height);
    const g = ctx2d(c);
    const entries: { name: string; data: Uint8Array }[] = [];
    for (let i = 0; i < times.length; i++) {
      if (signal.aborted) throw aborted();
      anim.draw(g, times[i]);
      entries.push({ name: frameFileName(i, times.length), data: await pngBytes(c) });
      onProgress((i + 1) / (times.length + 1), text.rendering(i + 1, times.length));
    }
    onProgress(times.length / (times.length + 1), text.zipping);
    return zipOutput(
      entries,
      fileName('frames'),
      size,
      [{ label: text.detailFps, value: `${fps} fps` }],
      times.length,
    );
  };

  return {
    fileName,
    render,
    animFrameDrawer,
    finalPng,
    exportPng,
    exportApng,
    exportVideo,
    exportSteps,
    exportLayers,
    exportSequence,
  };
}
