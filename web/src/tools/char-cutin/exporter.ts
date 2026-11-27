/**
 * 匯出（規格 3.5～3.8）：
 * - WebP／APNG：24 fps（每格 42 ms）逐格畫，交給共用的編碼器（Web Worker）。重複＝無限循環、一次＝播放 1 次（最後一格是空白）。
 *   640 × 360 要放進 CCFOLIA 切入的容量上限（`@/ccfolia` 的 EXPORT_TARGETS，1,000,000 位元組）：超過就降一級重編，
 *   WebP 依序 品質 0.9 → 0.8 → 0.7 → 0.6 → 15 fps 0.6 → 15 fps 0.45 → 12 fps 0.35；
 *   APNG 依序 全彩 → 256 色 → 128 色 → 64 色 → 15 fps 128 色 → 15 fps 64 色 → 12 fps 32 色；全部都超過就算失敗。
 *   1280 × 720 不調整（WebP 品質 0.9、APNG 256 色）。
 * - 影片：30 fps、只播一次、鋪底色；先試 H.264 的 MP4（`@/core/video` 的 findMoviePlan），不行就 VP9／VP8 的 WebM
 *   （findAlphaWebmPlan 的不透明版）。位元率 1280 × 720 800 萬、1920 × 1080 1,200 萬；每 30 格一個關鍵影格。
 * - 全員 ZIP、CCFOLIA 房間 ZIP（每人一個切入）。
 */
import {
  buildRoomZip,
  checkRoomZip,
  createAppendRoomData,
  createEffect,
  EXPORT_TARGETS,
  newRoomEntityId,
  packRoomImage,
} from '@/ccfolia';
import { createEncoder, type EncoderSpec } from '@/core/encode';
import { zipFiles } from '@/core/files';
import { ensureFont } from '@/core/fonts';
import { makeCanvas } from '@/core/image';
import {
  type AlphaWebmPlan,
  encodeAlphaWebm,
  encodeMovie,
  findAlphaWebmPlan,
  findMoviePlan,
  type MoviePlan,
  VideoEncodeError,
} from '@/core/video';
import type { OutSettings } from './model';
import { exportTimes, frameMs } from './motion';
import { BADGE_FONT, paintFrame } from './paint';
import { compose } from './scenes';
import type { Shot } from './shot';
import { S } from './strings';

/** CCFOLIA 切入的容量上限（640 × 360 自動調整的目標） */
export const CUTIN_LIMIT = EXPORT_TARGETS['ccfolia-cutin'].maxBytes;
/** 動圖的 fps */
export const ANIM_FPS = 24;
export const VIDEO_FPS = 30;

export const ANIM_SIZES = {
  small: { width: 640, height: 360 },
  large: { width: 1280, height: 720 },
} as const;
export const VIDEO_SIZES = {
  '720': { width: 1280, height: 720, bitrate: 8_000_000 },
  '1080': { width: 1920, height: 1080, bitrate: 12_000_000 },
} as const;

export interface Attempt {
  fps: number;
  /** WebP 品質（0～1） */
  quality?: number;
  /** APNG 色數（0＝全彩） */
  colors?: number;
}

/** 降一級的順序（第一個是一開始用的設定） */
export function ladder(format: 'webp' | 'apng', capped: boolean): Attempt[] {
  if (format === 'webp')
    return capped
      ? [
          { fps: 24, quality: 0.9 },
          { fps: 24, quality: 0.8 },
          { fps: 24, quality: 0.7 },
          { fps: 24, quality: 0.6 },
          { fps: 15, quality: 0.6 },
          { fps: 15, quality: 0.45 },
          { fps: 12, quality: 0.35 },
        ]
      : [{ fps: 24, quality: 0.9 }];
  return capped
    ? [
        { fps: 24, colors: 0 },
        { fps: 24, colors: 256 },
        { fps: 24, colors: 128 },
        { fps: 24, colors: 64 },
        { fps: 15, colors: 128 },
        { fps: 15, colors: 64 },
        { fps: 12, colors: 32 },
      ]
    : [{ fps: 24, colors: 256 }];
}

/** 匯出時的背景色（透明＝null；影片一律鋪色） */
export const backdropOf = (out: OutSettings): string | null =>
  out.format === 'video' || out.background === 'color' ? out.color : null;

export interface ExportContext {
  signal?: AbortSignal;
  /** 0～1 */
  onProgress?: (ratio: number) => void;
  /** 在 Worker 裡編碼（預設：環境支援就用） */
  worker?: boolean;
  /** 640 × 360 的容量上限（預設 CUTIN_LIMIT；測試用） */
  limit?: number;
}

export interface Rendered {
  blob: Blob;
  ext: 'webp' | 'png' | 'mp4' | 'webm';
  width: number;
  height: number;
  /** 畫了幾格 */
  frames: number;
  fps: number;
  /** 動圖：用到第幾級（0＝沒有降）、那一級的設定 */
  attempt?: Attempt & { step: number };
  /** 640 × 360 降到最後一級還是超過上限 */
  over?: boolean;
}

const abortError = () => new DOMException(S.exp.cancelled, 'AbortError');

/** 這個人會用到的字型都載好（Google 字型只載用到的字）；有載不到的回傳 false（用後備字型畫） */
export async function loadShotFonts(shot: Shot): Promise<boolean> {
  const { fonts } = shot.crew;
  const jobs: Promise<boolean>[] = [];
  const want = (f: { family: string; weight: number }, text: string) => {
    if (text.trim() && f.family) jobs.push(ensureFont(f.family, f.weight, text));
  };
  want(fonts.name, shot.texts.name);
  want(fonts.quote, shot.texts.quote);
  want(fonts.impact, shot.texts.impact);
  want(BADGE_FONT, shot.texts.badge);
  const ok = await Promise.all(jobs);
  return ok.every(Boolean);
}

function frameCanvas(width: number, height: number, readback: boolean) {
  const c = makeCanvas(width, height);
  const c2d = c.getContext('2d', { willReadFrequently: readback }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;
  if (!c2d) throw new Error(S.exp.noCanvas);
  return { c, c2d };
}

/** 畫 t 秒的那一格 */
function drawAt(
  c2d: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  shot: Shot,
  t: number,
  width: number,
  height: number,
  backdrop: string | null,
): void {
  paintFrame(c2d, width, height, compose(shot.kind, { ...shot.input, t }), shot.crew, backdrop);
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** 用一種設定把這些時間點編成一個動圖（每格 1000 ÷ fps 毫秒） */
async function encodeFrames(
  shot: Shot,
  format: 'webp' | 'apng',
  size: { width: number; height: number },
  backdrop: string | null,
  plays: number,
  a: Attempt,
  times: readonly number[],
  ctx: ExportContext,
  progress: (r: number) => void,
): Promise<Uint8Array<ArrayBuffer>> {
  const { width, height } = size;
  const spec: EncoderSpec =
    format === 'webp'
      ? { format: 'webp', options: { width, height, fps: 1000, plays, quality: a.quality ?? 0.9 } }
      : {
          format: 'apng',
          options: {
            width,
            height,
            fps: 1000,
            plays,
            quantize: (a.colors ?? 0) > 0,
            maxColors: a.colors || 256,
            paletteMethod: 'pca',
          },
        };
  const encoder = createEncoder(spec, { worker: ctx.worker });
  const stop = () => encoder.abort();
  ctx.signal?.addEventListener('abort', stop, { once: true });
  try {
    const { c2d } = frameCanvas(width, height, true);
    const ms = frameMs(a.fps);
    for (let i = 0; i < times.length; i++) {
      if (ctx.signal?.aborted) throw abortError();
      drawAt(c2d, shot, times[i], width, height, backdrop);
      await encoder.addFrame(c2d.getImageData(0, 0, width, height).data, ms);
      progress((i + 1) / (times.length + 2));
      if (i % 3 === 2) await tick();
    }
    const file = await encoder.finish();
    if (ctx.signal?.aborted) throw abortError();
    return file.bytes;
  } catch (e) {
    encoder.abort();
    throw e;
  } finally {
    ctx.signal?.removeEventListener('abort', stop);
  }
}

/** WebP／APNG（640 × 360 時自動調整到上限以下） */
export async function renderAnimation(
  shot: Shot,
  out: OutSettings,
  ctx: ExportContext = {},
): Promise<Rendered> {
  const format = out.format === 'apng' ? 'apng' : 'webp';
  const capped = out.size === 'small';
  const size = ANIM_SIZES[out.size];
  const steps = ladder(format, capped);
  const backdrop = backdropOf(out);
  const limit = ctx.limit ?? CUTIN_LIMIT;
  for (let k = 0; k < steps.length; k++) {
    const a = steps[k];
    const times = exportTimes(shot.pace, a.fps, out.once);
    const bytes = await encodeFrames(
      shot,
      format,
      size,
      backdrop,
      out.once ? 1 : 0,
      a,
      times,
      ctx,
      /* 降一級重編時進度條從頭再跑一次 */
      (r) => ctx.onProgress?.(r),
    );
    if (!capped || bytes.byteLength <= limit || k === steps.length - 1) {
      ctx.onProgress?.(1);
      return {
        blob: new Blob([bytes], { type: format === 'webp' ? 'image/webp' : 'image/png' }),
        ext: format === 'webp' ? 'webp' : 'png',
        ...size,
        frames: times.length,
        fps: a.fps,
        attempt: { ...a, step: k },
        over: capped && bytes.byteLength > limit,
      };
    }
  }
  throw new Error(S.exp.failed);
}

/* ---------- 影片 ---------- */

export type VideoRoute =
  | { kind: 'mp4'; plan: MoviePlan }
  | { kind: 'webm'; plan: AlphaWebmPlan }
  | { kind: 'none' };

const routes = new Map<string, Promise<VideoRoute>>();

/** 這個瀏覽器能怎麼編影片（MP4 → WebM → 不能；結果快取） */
export function videoRoute(sizeId: OutSettings['videoSize']): Promise<VideoRoute> {
  let p = routes.get(sizeId);
  if (!p) {
    const { width, height, bitrate } = VIDEO_SIZES[sizeId];
    p = (async (): Promise<VideoRoute> => {
      const mp4 = await findMoviePlan({
        width,
        height,
        fps: VIDEO_FPS,
        bitrate,
        audio: null,
        videoCodecs: ['avc1'],
        profiles: ['high', 'main', 'baseline'],
      }).catch(() => null);
      if (mp4) return { kind: 'mp4', plan: mp4 };
      const webm = await findAlphaWebmPlan({
        width,
        height,
        fps: VIDEO_FPS,
        bitrate,
        opaque: true,
      }).catch(() => null);
      return webm ? { kind: 'webm', plan: webm } : { kind: 'none' };
    })();
    routes.set(sizeId, p);
  }
  return p;
}

/** 影片（MP4，不行時 WebM） */
export async function renderVideo(
  shot: Shot,
  out: OutSettings,
  ctx: ExportContext = {},
): Promise<Rendered> {
  const route = await videoRoute(out.videoSize);
  if (route.kind === 'none') throw new Error(S.exp.noVideo);
  const { width, height } = VIDEO_SIZES[out.videoSize];
  const times = exportTimes(shot.pace, VIDEO_FPS, true);
  const { c, c2d } = frameCanvas(width, height, route.kind === 'webm');
  const backdrop = backdropOf(out) ?? out.color;
  const job = {
    width,
    height,
    fps: VIDEO_FPS,
    frameCount: times.length,
    renderFrame: (i: number) => {
      drawAt(c2d, shot, times[i], width, height, backdrop);
      return c as HTMLCanvasElement;
    },
    signal: ctx.signal,
    keyFrameInterval: VIDEO_FPS,
    audio: null,
    onProgress: (done: number, total: number) => ctx.onProgress?.(done / total),
  };
  try {
    const blob =
      route.kind === 'mp4'
        ? await encodeMovie({ ...job, plan: route.plan })
        : await encodeAlphaWebm({ ...job, plan: route.plan });
    return {
      blob,
      ext: route.kind,
      width,
      height,
      frames: times.length,
      fps: VIDEO_FPS,
    };
  } catch (e) {
    if (e instanceof VideoEncodeError && (e.code === 'encoder' || e.code === 'unsupported'))
      throw new Error(S.exp.videoFailed);
    throw e;
  }
}

/** 依匯出設定做一個人的檔案 */
export function renderShot(
  shot: Shot,
  out: OutSettings,
  ctx: ExportContext = {},
): Promise<Rendered> {
  return out.format === 'video' ? renderVideo(shot, out, ctx) : renderAnimation(shot, out, ctx);
}

/* ---------- 容量的預估 ---------- */

export interface Estimate {
  /** 每人約幾位元組 */
  bytes: number;
  /** 640 × 360 而且估計會超過上限（匯出時會自動調整） */
  capped: boolean;
}

/**
 * 預估一個人的大小：動圖從會動的格裡平均抽 6 格，照第一級的設定編成一個小動圖，再依格數放大
 * （抽出來的格彼此差得多，通常估得偏大）；影片＝位元率 × 秒數。
 */
export async function estimateShot(
  shot: Shot,
  out: OutSettings,
  ctx: ExportContext = {},
): Promise<Estimate> {
  if (out.format === 'video') {
    const n = exportTimes(shot.pace, VIDEO_FPS, true).length;
    return { bytes: (VIDEO_SIZES[out.videoSize].bitrate * n) / VIDEO_FPS / 8, capped: false };
  }
  const format = out.format === 'apng' ? 'apng' : 'webp';
  const capped = out.size === 'small';
  const first = ladder(format, capped)[0];
  const times = exportTimes(shot.pace, first.fps, out.once);
  const moving = times.filter((t, i) => i === 0 || t !== times[i - 1]);
  const k = Math.min(6, moving.length);
  const picks = Array.from(
    { length: k },
    (_, i) => moving[Math.floor(((i + 0.5) * moving.length) / k)],
  );
  const bytes = await encodeFrames(
    shot,
    format,
    ANIM_SIZES[out.size],
    backdropOf(out),
    0,
    first,
    picks,
    ctx,
    () => {},
  );
  const total = Math.round((bytes.byteLength * moving.length) / Math.max(1, k));
  return { bytes: total, capped: capped && total > CUTIN_LIMIT };
}

/* ---------- ZIP ---------- */

export interface ZipItem {
  name: string;
  data: Uint8Array;
}

/** 全員 ZIP（只打包，不再壓縮） */
export const zipOf = (items: readonly ZipItem[]): Uint8Array<ArrayBuffer> =>
  zipFiles(items, { level: 0 });

export interface RoomCut {
  /** 切入的名稱（觸發用） */
  name: string;
  blob: Blob;
}

/**
 * CCFOLIA 房間 ZIP：只追加切入（entities.effects，每人一筆；room 是 {}，讀入不會改到房間的其他設定）。
 * 順序值以秒為基準（之後讀入的排在後面）。寫完用 checkRoomZip 自我檢查。
 */
export async function buildCutinRoom(
  cuts: readonly RoomCut[],
  now = Date.now(),
): Promise<Uint8Array<ArrayBuffer>> {
  const images = [];
  const effects: Record<string, ReturnType<typeof createEffect>> = {};
  const base = Math.floor(now / 1000);
  for (let i = 0; i < cuts.length; i++) {
    const img = await packRoomImage(cuts[i].blob);
    images.push(img);
    effects[newRoomEntityId()] = createEffect({
      name: cuts[i].name,
      order: base + i,
      imageUrl: img.name,
      playTime: now,
    });
  }
  const built = buildRoomZip(createAppendRoomData({ effects }), images);
  const check = await checkRoomZip(built.bytes);
  if (!check.ok) throw new Error(S.exp.roomCheckFailed);
  return built.bytes;
}
