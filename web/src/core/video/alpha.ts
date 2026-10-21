/**
 * 透明背景的 WebM（逐格編碼；lyric-fx 移植時新增，規格 docs/refactor/specs/lyric-fx.md 3.9.2、D16）。
 *
 * Chromium 的 WebCodecs VideoEncoder 不支援 `alpha: 'keep'`（實測 Chromium 141：VP8、VP9 都是 NotSupportedError），
 * 所以用 WebM 存透明度的標準寫法自己做：兩個 VP9（或 VP8）編碼器，一路編顏色、一路把透明度當成灰階畫面的亮度編，
 * 透明度那一路放進每一格的 BlockAdditional（BlockAddID 1、AlphaMode 1；`webmMux.ts`）。Chromium、Firefox、ffmpeg（OBS 的媒體來源）都讀得到。
 *
 * ```ts
 * const plan = await findAlphaWebmPlan({ width: 1920, height: 1080, fps: 30, audio: true });
 * if (plan) {
 *   const blob = await encodeAlphaWebm({ plan, width: 1920, height: 1080, fps: 30, frameCount, renderFrame,
 *     audio: { pcm: song, start: 0, end: 30 }, keyFrameInterval: 60, signal, onProgress });
 * }
 * ```
 *
 * 每一格讀出未預乘的 RGBA（getImageData），自己換成 I420：顏色＝BT.709 有限範圍，色差以 2 × 2 的透明度加權平均
 * （透明的像素不把半透明的邊緣染黑；幾乎透明的像素的亮度用同一格的平均色）；透明度＝Y 直接是 A、U＝V＝128。
 */
import type { PcmAudio } from '../audio';
import {
  abortError,
  flush,
  frameOf,
  nextTask,
  VIDEO_MAX_BYTES,
  type VideoEncodeOptions,
  validate,
  videoEncodeError,
} from './encode';
import { type MovieAudioPlan, encodeAudio, findAudio } from './movie';
import { parseOpusHead, vp9Level } from './mp4';
import { muxWebm, opusHead, type WebmAudioFrame, type WebmVideoFrame } from './webmMux';

export interface AlphaWebmPlan {
  codec: 'vp09' | 'vp8';
  /** 顏色那一路 */
  video: VideoEncoderConfig;
  /** 透明度那一路 */
  alpha: VideoEncoderConfig;
  audio: MovieAudioPlan | null;
}

export interface AlphaWebmPlanRequest {
  width: number;
  height: number;
  fps: number;
  /** 顏色那一路的位元率（預設 alphaWebmBitrate） */
  bitrate?: number;
  /** 要放聲音（Opus 48 kHz） */
  audio?: boolean;
}

/** 顏色那一路的位元率：min(4,000 萬, max(200 萬, 寬 × 高 × FPS × 0.15))；透明度那一路一半 */
export const alphaWebmBitrate = (width: number, height: number, fps: number): number =>
  Math.round(Math.min(40_000_000, Math.max(2_000_000, width * height * fps * 0.15)));

const supported = async (c: VideoEncoderConfig) => {
  try {
    return !!(await VideoEncoder.isConfigSupported(c)).supported;
  } catch {
    return false;
  }
};

/** 這個瀏覽器能不能逐格做透明 WebM（VP9，沒有時 VP8；要聲音時還要有 Opus 編碼器）；不能＝null */
export async function findAlphaWebmPlan(req: AlphaWebmPlanRequest): Promise<AlphaWebmPlan | null> {
  const { width, height, fps } = req;
  if (typeof VideoEncoder !== 'function' || typeof VideoFrame !== 'function') return null;
  if (width % 2 || height % 2) return null;
  const bitrate = Math.round(req.bitrate ?? alphaWebmBitrate(width, height, fps));
  const audio = req.audio ? await findAudio('opus', 48000) : null;
  if (req.audio && !audio) return null;
  for (const codec of ['vp09', 'vp8'] as const) {
    const base: VideoEncoderConfig = {
      codec: codec === 'vp09' ? `vp09.00.${vp9Level(width, height, fps)}.08` : 'vp8',
      width,
      height,
      framerate: fps,
      bitrate,
      bitrateMode: 'variable',
      latencyMode: 'quality',
    };
    const alpha = { ...base, bitrate: Math.max(500_000, Math.round(bitrate / 2)) };
    if ((await supported(base)) && (await supported(alpha))) return { codec, video: base, alpha, audio };
  }
  return null;
}

/**
 * RGBA（未預乘）→ 顏色與透明度兩張 I420（寬高必須是偶數）。color、alpha 的長度＝w × h × 1.5。
 */
export function rgbaToI420Alpha(
  rgba: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
  color: Uint8Array,
  alpha: Uint8Array,
): void {
  const ySize = w * h;
  const cw = w >> 1;
  const uOff = ySize;
  const vOff = ySize + (ySize >> 2);
  const lum = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const toY = (yp: number) => Math.round(16 + (yp * 219) / 255);
  alpha.fill(128, ySize);
  for (let by = 0; by < h; by += 2) {
    for (let bx = 0; bx < w; bx += 2) {
      let sa = 0;
      let sr = 0;
      let sg = 0;
      let sb = 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const i = ((by + dy) * w + bx + dx) * 4;
          const a = rgba[i + 3];
          sa += a;
          sr += rgba[i] * a;
          sg += rgba[i + 1] * a;
          sb += rgba[i + 2] * a;
        }
      const ar = sa ? sr / sa : 0;
      const ag = sa ? sg / sa : 0;
      const ab = sa ? sb / sa : 0;
      for (let dy = 0; dy < 2; dy++)
        for (let dx = 0; dx < 2; dx++) {
          const p = (by + dy) * w + bx + dx;
          const i = p * 4;
          const a = rgba[i + 3];
          alpha[p] = a;
          color[p] =
            a < 8 && sa ? toY(lum(ar, ag, ab)) : toY(lum(rgba[i], rgba[i + 1], rgba[i + 2]));
        }
      const yp = lum(ar, ag, ab);
      const c = (by >> 1) * cw + (bx >> 1);
      color[uOff + c] = Math.max(0, Math.min(255, Math.round(128 + (((ab - yp) / 1.8556) * 224) / 255)));
      color[vOff + c] = Math.max(0, Math.min(255, Math.round(128 + (((ar - yp) / 1.5748) * 224) / 255)));
    }
  }
}

export interface AlphaWebmOptions extends VideoEncodeOptions {
  plan: AlphaWebmPlan;
  /** 聲音（plan.audio 不是 null 時必須給） */
  audio?: { pcm: PcmAudio; start?: number; end?: number } | null;
  /** 關鍵影格的間隔（格數，預設 FPS × 2） */
  keyFrameInterval?: number;
  onPhase?: (phase: 'audio' | 'video') => void;
}

const COLOR_SPACE: VideoColorSpaceInit = {
  primaries: 'bt709',
  transfer: 'bt709',
  matrix: 'bt709',
  fullRange: false,
};

interface Chunk {
  data: Uint8Array;
  key: boolean;
  ts: number;
}

/** 逐格編成透明的 WebM（Blob，type video/webm） */
export async function encodeAlphaWebm(o: AlphaWebmOptions): Promise<Blob> {
  validate(o, true);
  const { width, height, fps, frameCount, signal, plan } = o;
  if (!!plan.audio !== !!o.audio) throw videoEncodeError('bad-options', '聲音的設定不一致');
  const maxBytes = o.maxBytes ?? VIDEO_MAX_BYTES;
  const interval = Math.max(1, Math.round(o.keyFrameInterval ?? fps * 2));
  let media = 0;
  const addBytes = (n: number) => {
    media += n;
  };
  const budget = () => {
    if (media + frameCount * 64 + 8192 > maxBytes) throw videoEncodeError('too-large');
  };

  /* ---- 聲音（Opus） ---- */
  let audioFrames: WebmAudioFrame[] = [];
  let head: Uint8Array | null = null;
  let preSkip = 0;
  if (plan.audio && o.audio) {
    o.onPhase?.('audio');
    const enc = await encodeAudio({ signal }, plan.audio, o.audio, budget, addBytes);
    head = enc.track.config ?? null;
    const parsed = parseOpusHead(head);
    preSkip = parsed?.preSkip ?? 312;
    if (!parsed) head = opusHead(2, preSkip, plan.audio.sampleRate);
    let at = 0;
    audioFrames = enc.parts.map((data, i) => {
      const f = { data, timestampMs: (at / plan.audio!.sampleRate) * 1000 };
      at += enc.track.durations[i] ?? 960;
      return f;
    });
  }

  /* ---- 畫面：兩路 ---- */
  o.onPhase?.('video');
  const colorChunks: Chunk[] = [];
  const alphaChunks: Chunk[] = [];
  let failure: Error | null = null;
  const output = (list: Chunk[]) => (chunk: EncodedVideoChunk) => {
    if (failure) return;
    try {
      if (!chunk.byteLength) throw videoEncodeError('encoder', '空的影格');
      if (!list.length && chunk.type !== 'key') throw videoEncodeError('encoder', '第一格不是關鍵影格');
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      list.push({ data: bytes, key: chunk.type === 'key', ts: chunk.timestamp });
      addBytes(bytes.byteLength);
      budget();
    } catch (e) {
      failure = e instanceof Error ? e : new Error(String(e));
    }
  };
  const onError = (e: DOMException) => {
    failure = videoEncodeError('encoder', e.message);
  };
  let colorEnc: VideoEncoder | null = null;
  let alphaEnc: VideoEncoder | null = null;
  const yuv = new Uint8Array(width * height * 1.5);
  const ayuv = new Uint8Array(width * height * 1.5);
  try {
    colorEnc = new VideoEncoder({ output: output(colorChunks), error: onError });
    alphaEnc = new VideoEncoder({ output: output(alphaChunks), error: onError });
    colorEnc.configure(plan.video);
    alphaEnc.configure(plan.alpha);
    for (let i = 0; i < frameCount; i++) {
      if (failure) throw failure;
      const canvas = await frameOf(o, i);
      const g = (canvas as HTMLCanvasElement).getContext?.('2d', {
        willReadFrequently: true,
      }) as CanvasRenderingContext2D | null;
      if (!g) throw videoEncodeError('frame-size', '讀不到畫面');
      const rgba = g.getImageData(0, 0, width, height).data;
      rgbaToI420Alpha(rgba, width, height, yuv, ayuv);
      const timestamp = Math.round((i * 1_000_000) / fps);
      const duration = Math.round(((i + 1) * 1_000_000) / fps) - timestamp;
      const keyFrame = i % interval === 0;
      const init = {
        format: 'I420' as const,
        codedWidth: width,
        codedHeight: height,
        timestamp,
        duration,
        colorSpace: COLOR_SPACE,
      };
      const cf = new VideoFrame(yuv, init);
      const af = new VideoFrame(ayuv, init);
      try {
        colorEnc.encode(cf, { keyFrame });
        alphaEnc.encode(af, { keyFrame });
      } finally {
        cf.close();
        af.close();
      }
      while (colorEnc.encodeQueueSize > 3 || alphaEnc.encodeQueueSize > 3) {
        if (failure) throw failure;
        await nextTask();
      }
      if ((i + 1) % 4 === 0 || i + 1 === frameCount) {
        o.onProgress?.(i + 1, frameCount);
        await nextTask();
      }
    }
    await flush(colorEnc, signal, () => failure);
    await flush(alphaEnc, signal, () => failure);
    if (failure) throw failure;
    if (signal?.aborted) throw abortError();
    if (colorChunks.length !== frameCount || alphaChunks.length !== frameCount)
      throw videoEncodeError(
        'encoder',
        `影格不完整 ${Math.min(colorChunks.length, alphaChunks.length)}／${frameCount}`,
      );
    const video: WebmVideoFrame[] = colorChunks.map((c, i) => ({
      data: c.data,
      alpha: alphaChunks[i].data,
      /* 兩路都是關鍵影格才算（從這一格開始兩路都能解） */
      key: c.key && alphaChunks[i].key,
      timestampMs: Math.round((i * 1000) / fps),
    }));
    const parts = muxWebm({
      width,
      height,
      fps,
      codec: plan.codec === 'vp09' ? 'V_VP9' : 'V_VP8',
      alpha: true,
      durationMs: (frameCount * 1000) / fps,
      video,
      audio:
        plan.audio && head
          ? { codecPrivate: head, sampleRate: 48000, channels: 2, preSkip, frames: audioFrames }
          : null,
      app: 'TRPG Toolkit',
    });
    const blob = new Blob(parts as BlobPart[], { type: 'video/webm' });
    if (blob.size > maxBytes) throw videoEncodeError('too-large');
    return blob;
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'NotSupportedError' || e.name === 'SecurityError'))
      throw videoEncodeError('unsupported');
    throw e;
  } finally {
    if (colorEnc && colorEnc.state !== 'closed') colorEnc.close();
    if (alphaEnc && alphaEnc.state !== 'closed') alphaEnc.close();
  }
}
