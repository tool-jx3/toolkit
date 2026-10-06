/**
 * 有聲音的影片（逐格離線編碼；music-frame 移植時新增）：畫面用 WebCodecs 的 VideoEncoder（H.264 或 VP9），
 * 聲音用 AudioEncoder（AAC 或 Opus）或直接存 16 位元 PCM，封裝成 MP4／MOV（`mp4.ts` 的 movieLayout）。
 *
 * ```ts
 * const plan = await findMoviePlan({ width: 1920, height: 1080, fps: 30, bitrate: 12e6,
 *   audio: { sampleRate: song.sampleRate }, videoCodecs: ['avc1', 'vp09'], profiles: ['high', 'main', 'baseline'] });
 * if (plan) {
 *   const blob = await encodeMovie({ plan, width: 1920, height: 1080, fps: 30, frameCount, renderFrame,
 *     audio: { pcm: song, start: 10, end: 40 }, keyFrameInterval: 60, signal, onProgress });
 *   // plan.extension：'mp4' 或 'mov'；plan.mimeType：'video/mp4' 或 'video/quicktime'
 * }
 * ```
 *
 * 選擇的順序（findMoviePlan）：
 * 1. H.264：沒有聲音 → MP4；有聲音時 AAC（44.1／48 kHz 照原本，其他取樣率換成 48 kHz；位元率依序試 192k、160k、128k、256k、預設）
 *    → MP4，瀏覽器沒有 AAC 編碼器 → MOV（16 位元 PCM，不壓縮）。
 * 2. 沒有 H.264（而且 videoCodecs 有 'vp09'）：VP9 → MP4；有聲音時要有 Opus（48 kHz）編碼器，沒有時不支援。
 * 3. 都不行：null（工具改用即時錄影或停用）。
 */
import { type PcmAudio, resampleAudio } from '../audio';
import {
  abortError,
  flush,
  frameOf,
  type H264Profile,
  mp4Bitrate,
  mp4ConfigCandidates,
  nextTask,
  VIDEO_MAX_BYTES,
  type VideoEncodeOptions,
  validate,
  videoEncodeError,
} from './encode';
import {
  type MovieAudioCodec,
  type MovieContainer,
  type MovieVideoCodec,
  type MuxAudioTrack,
  movieLayout,
  vp9Level,
  vpcCFor,
} from './mp4';

export interface MovieAudioPlan {
  codec: MovieAudioCodec;
  /** 編碼的取樣率（音樂會先換成這個取樣率） */
  sampleRate: number;
  /** 一律雙聲道（單聲道複製成兩個聲道） */
  channels: 2;
  /** AAC／Opus 的位元率（PCM 時是未壓縮的位元率） */
  bitrate: number;
  /** AudioEncoder 的設定（PCM 時 null） */
  config: AudioEncoderConfig | null;
}

export interface MoviePlan {
  container: MovieContainer;
  /** 副檔名 */
  extension: 'mp4' | 'mov';
  mimeType: 'video/mp4' | 'video/quicktime';
  video: { codec: MovieVideoCodec; config: VideoEncoderConfig };
  audio: MovieAudioPlan | null;
}

export interface MoviePlanRequest {
  width: number;
  height: number;
  fps: number;
  /** 畫面的位元率（bps，預設 mp4Bitrate） */
  bitrate?: number;
  /** 有聲音時給音樂的取樣率 */
  audio?: { sampleRate: number } | null;
  /** 可以用的畫面編碼（依序試；預設只有 H.264） */
  videoCodecs?: readonly MovieVideoCodec[];
  /** H.264 每個等級試的 profile 順序（預設 Baseline、Main、High） */
  profiles?: readonly H264Profile[];
}

const supported = async (fn: () => Promise<{ supported?: boolean }>) => {
  try {
    return !!(await fn()).supported;
  } catch {
    return false;
  }
};

async function findAudio(
  codec: 'aac' | 'opus',
  sourceRate: number,
): Promise<MovieAudioPlan | null> {
  if (typeof AudioEncoder !== 'function' || typeof AudioData !== 'function') return null;
  const sampleRate =
    codec === 'opus' ? 48000 : sourceRate === 44100 || sourceRate === 48000 ? sourceRate : 48000;
  /* Windows 的 AAC 編碼器只接受 96／128／160／192 kbps，所以先試這幾個 */
  const rates = codec === 'aac' ? [192_000, 160_000, 128_000, 256_000, 0] : [192_000, 128_000, 0];
  for (const bitrate of rates) {
    const config: AudioEncoderConfig = {
      codec: codec === 'aac' ? 'mp4a.40.2' : 'opus',
      sampleRate,
      numberOfChannels: 2,
      ...(bitrate ? { bitrate } : {}),
    };
    if (await supported(() => AudioEncoder.isConfigSupported(config)))
      return { codec, sampleRate, channels: 2, bitrate: bitrate || 192_000, config };
  }
  return null;
}

/** 這個瀏覽器能用的編碼與容器（見檔頭的順序；都不行時 null） */
export async function findMoviePlan(req: MoviePlanRequest): Promise<MoviePlan | null> {
  const { width, height, fps } = req;
  if (typeof VideoEncoder !== 'function' || typeof VideoFrame !== 'function') return null;
  if (width % 2 || height % 2) return null;
  const bitrate = Math.round(req.bitrate ?? mp4Bitrate(width, height, fps));
  const codecs = req.videoCodecs ?? ['avc1'];
  for (const codec of codecs) {
    if (codec === 'avc1') {
      let config: VideoEncoderConfig | null = null;
      for (const c of mp4ConfigCandidates({ width, height, fps, bitrate, profiles: req.profiles }))
        if (await supported(() => VideoEncoder.isConfigSupported(c))) {
          config = c;
          break;
        }
      if (!config) continue;
      const video = { codec, config };
      if (!req.audio)
        return { container: 'mp4', extension: 'mp4', mimeType: 'video/mp4', video, audio: null };
      const aac = await findAudio('aac', req.audio.sampleRate);
      if (aac)
        return { container: 'mp4', extension: 'mp4', mimeType: 'video/mp4', video, audio: aac };
      return {
        container: 'mov',
        extension: 'mov',
        mimeType: 'video/quicktime',
        video,
        audio: {
          codec: 'pcm',
          sampleRate: req.audio.sampleRate,
          channels: 2,
          bitrate: req.audio.sampleRate * 32,
          config: null,
        },
      };
    }
    const config: VideoEncoderConfig = {
      codec: `vp09.00.${vp9Level(width, height, fps)}.08`,
      width,
      height,
      framerate: fps,
      bitrate,
      bitrateMode: 'variable',
      latencyMode: 'quality',
    };
    if (!(await supported(() => VideoEncoder.isConfigSupported(config)))) continue;
    const video = { codec, config };
    if (!req.audio)
      return { container: 'mp4', extension: 'mp4', mimeType: 'video/mp4', video, audio: null };
    const opus = await findAudio('opus', req.audio.sampleRate);
    if (opus)
      return { container: 'mp4', extension: 'mp4', mimeType: 'video/mp4', video, audio: opus };
  }
  return null;
}

export interface MovieEncodeOptions extends VideoEncodeOptions {
  /** findMoviePlan 的結果 */
  plan: MoviePlan;
  /** 聲音（plan.audio 不是 null 時必須給）：音樂與要放進去的範圍（秒，預設整首） */
  audio?: { pcm: PcmAudio; start?: number; end?: number } | null;
  /** 關鍵影格的間隔（格數，預設 1＝每格都是） */
  keyFrameInterval?: number;
  /** 進入聲音、畫面的階段時通知（給進度的文字用） */
  onPhase?: (phase: 'audio' | 'video') => void;
}

interface EncodedAudio {
  track: MuxAudioTrack;
  parts: Blob[];
}

/** 範圍內的雙聲道（單聲道複製；多於兩個聲道取前兩個），再換成編碼的取樣率 */
async function prepareAudio(
  input: NonNullable<MovieEncodeOptions['audio']>,
  sampleRate: number,
): Promise<Float32Array[]> {
  const { pcm } = input;
  const len = pcm.channels[0]?.length ?? 0;
  const s0 = Math.max(0, Math.min(len, Math.floor((input.start ?? 0) * pcm.sampleRate)));
  const s1 = Math.max(
    s0,
    Math.min(len, Math.floor((input.end ?? len / pcm.sampleRate) * pcm.sampleRate)),
  );
  const left = (pcm.channels[0] ?? new Float32Array(len)).subarray(s0, s1);
  const right = (pcm.channels[1] ?? pcm.channels[0] ?? new Float32Array(len)).subarray(s0, s1);
  const stereo: PcmAudio = { sampleRate: pcm.sampleRate, channels: [left, right] };
  const out = await resampleAudio(stereo, sampleRate);
  return [out.channels[0], out.channels[1] ?? out.channels[0]];
}

async function encodeAudio(
  o: MovieEncodeOptions,
  plan: MovieAudioPlan,
  input: NonNullable<MovieEncodeOptions['audio']>,
  budget: () => void,
  addBytes: (n: number) => void,
): Promise<EncodedAudio> {
  const [L, R] = await prepareAudio(input, plan.sampleRate);
  const n = L.length;
  const sr = plan.sampleRate;
  if (plan.codec === 'pcm') {
    const parts: Blob[] = [];
    const sizes: number[] = [];
    const durations: number[] = [];
    for (let i = 0; i < n; i += sr) {
      if (o.signal?.aborted) throw abortError();
      const k = Math.min(sr, n - i);
      const b = new Int16Array(k * 2);
      for (let j = 0; j < k; j++) {
        b[2 * j] = Math.max(-32768, Math.min(32767, Math.round(L[i + j] * 32767)));
        b[2 * j + 1] = Math.max(-32768, Math.min(32767, Math.round(R[i + j] * 32767)));
      }
      /* little-endian（Int16Array 是平台的位元組順序，瀏覽器都是 little-endian） */
      parts.push(new Blob([b]));
      sizes.push(b.byteLength);
      durations.push(k);
      addBytes(b.byteLength);
      budget();
    }
    return {
      parts,
      track: { codec: 'pcm', sampleRate: sr, channels: 2, sizes, durations },
    };
  }
  const parts: Blob[] = [];
  const sizes: number[] = [];
  const durations: number[] = [];
  let config: Uint8Array | null = null;
  let failure: Error | null = null;
  const fallbackDuration = plan.codec === 'aac' ? 1024 : 960;
  const encoder = new AudioEncoder({
    output(chunk, meta) {
      if (failure) return;
      try {
        const desc = meta?.decoderConfig?.description;
        if (desc && !config)
          config = ArrayBuffer.isView(desc)
            ? new Uint8Array(desc.buffer, desc.byteOffset, desc.byteLength).slice()
            : new Uint8Array(desc as ArrayBuffer).slice();
        const bytes = new Uint8Array(chunk.byteLength);
        chunk.copyTo(bytes);
        parts.push(new Blob([bytes]));
        sizes.push(bytes.byteLength);
        durations.push(
          chunk.duration ? Math.round((chunk.duration * sr) / 1_000_000) : fallbackDuration,
        );
        addBytes(bytes.byteLength);
        budget();
      } catch (e) {
        failure = e instanceof Error ? e : new Error(String(e));
      }
    },
    error(e) {
      failure = videoEncodeError('encoder', e.message);
    },
  });
  try {
    encoder.configure(plan.config as AudioEncoderConfig);
    const block = 8192;
    for (let i = 0; i < n; i += block) {
      if (o.signal?.aborted) throw abortError();
      if (failure) throw failure;
      const k = Math.min(block, n - i);
      const data = new Float32Array(k * 2);
      data.set(L.subarray(i, i + k), 0);
      data.set(R.subarray(i, i + k), k);
      const ad = new AudioData({
        format: 'f32-planar',
        sampleRate: sr,
        numberOfFrames: k,
        numberOfChannels: 2,
        timestamp: Math.round((i / sr) * 1_000_000),
        data,
      });
      try {
        encoder.encode(ad);
      } finally {
        ad.close();
      }
      if (encoder.encodeQueueSize > 16) await nextTask();
    }
    await flush(encoder, o.signal, () => failure);
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
  if (failure) throw failure;
  return {
    parts,
    track: {
      codec: plan.codec,
      sampleRate: sr,
      channels: 2,
      config,
      sizes,
      durations,
      bitrate: plan.bitrate,
    },
  };
}

const copyBytes = (d: AllowSharedBufferSource): Uint8Array =>
  ArrayBuffer.isView(d)
    ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength).slice()
    : new Uint8Array(d as ArrayBuffer).slice();

/** 逐格編成有聲音（或沒有）的 MP4／MOV（plan 決定編碼與容器） */
export async function encodeMovie(o: MovieEncodeOptions): Promise<Blob> {
  validate(o, true);
  const { width, height, fps, frameCount, signal, plan } = o;
  if (!!plan.audio !== !!o.audio) throw videoEncodeError('bad-options', '聲音的設定不一致');
  const maxBytes = o.maxBytes ?? VIDEO_MAX_BYTES;
  const interval = Math.max(1, Math.round(o.keyFrameInterval ?? 1));
  let media = 0;
  let failure: Error | null = null;
  const addBytes = (n: number) => {
    media += n;
  };
  const budget = () => {
    if (media + frameCount * 16 + 8192 > maxBytes) throw videoEncodeError('too-large');
  };

  /* ---- 聲音 ---- */
  let audio: EncodedAudio | null = null;
  if (plan.audio && o.audio) {
    o.onPhase?.('audio');
    audio = await encodeAudio(o, plan.audio, o.audio, budget, addBytes);
  }

  /* ---- 畫面 ---- */
  o.onPhase?.('video');
  const samples: Blob[] = [];
  const sizes: number[] = [];
  const keys: boolean[] = [];
  const pts: number[] = [];
  let description: Uint8Array | null = null;
  let colorSpace: VideoColorSpaceInit | null = null;
  let encoder: VideoEncoder | null = null;
  try {
    encoder = new VideoEncoder({
      output(chunk, meta) {
        if (failure) return;
        try {
          const desc = meta?.decoderConfig?.description;
          if (desc) {
            const next = copyBytes(desc);
            if (plan.video.codec === 'avc1' && (next.length < 7 || next[0] !== 1))
              throw videoEncodeError('encoder', '讀不到編碼器的設定');
            if (
              description &&
              (description.length !== next.length || description.some((b, k) => b !== next[k]))
            )
              throw videoEncodeError('encoder', '編碼器的設定中途改變');
            description = next;
          }
          if (meta?.decoderConfig?.colorSpace && !colorSpace)
            colorSpace = meta.decoderConfig.colorSpace;
          if (!chunk.byteLength) throw videoEncodeError('encoder', '空的影格');
          if (!samples.length && chunk.type !== 'key')
            throw videoEncodeError('encoder', '第一格不是關鍵影格');
          const bytes = new Uint8Array(chunk.byteLength);
          chunk.copyTo(bytes);
          samples.push(new Blob([bytes]));
          sizes.push(bytes.byteLength);
          keys.push(chunk.type === 'key');
          pts.push(Math.round((chunk.timestamp * fps) / 1_000_000));
          addBytes(bytes.byteLength);
          budget();
        } catch (e) {
          failure = e instanceof Error ? e : new Error(String(e));
        }
      },
      error(e) {
        failure = videoEncodeError('encoder', e.message);
      },
    });
    encoder.configure(plan.video.config);
    for (let i = 0; i < frameCount; i++) {
      if (failure) throw failure;
      const canvas = await frameOf(o, i);
      const timestamp = Math.round((i * 1_000_000) / fps);
      const duration = Math.round(((i + 1) * 1_000_000) / fps) - timestamp;
      const frame = new VideoFrame(canvas, { timestamp, duration, alpha: 'discard' });
      try {
        encoder.encode(frame, { keyFrame: i % interval === 0 });
      } finally {
        frame.close();
      }
      while (encoder.encodeQueueSize > 3) {
        if (failure) throw failure;
        await nextTask();
      }
      if ((i + 1) % 4 === 0 || i + 1 === frameCount) {
        o.onProgress?.(i + 1, frameCount);
        await nextTask();
      }
    }
    await flush(encoder, signal, () => failure);
    if (failure) throw failure;
    if (signal?.aborted) throw abortError();
    if (samples.length !== frameCount)
      throw videoEncodeError('encoder', `影格不完整 ${samples.length}／${frameCount}`);
    let config: Uint8Array;
    if (plan.video.codec === 'avc1') {
      if (!description) throw videoEncodeError('encoder', '讀不到編碼器的設定');
      config = description;
    } else config = vpcCFor(String(plan.video.config.codec), colorSpace);
    const layout = movieLayout(
      {
        codec: plan.video.codec,
        config,
        width,
        height,
        fps,
        sizes,
        keyFrames: keys,
        compositionOffsets: pts.map((p, i) => p - i),
      },
      audio?.track ?? null,
      { container: plan.container },
    );
    if (layout.size > maxBytes) throw videoEncodeError('too-large');
    const body: BlobPart[] = [layout.head as Uint8Array<ArrayBuffer>];
    for (const c of layout.chunks) {
      const src = c.track === 'video' ? samples : (audio?.parts ?? []);
      for (let j = 0; j < c.count; j++) body.push(src[c.first + j]);
    }
    return new Blob(body, { type: plan.mimeType });
  } catch (e) {
    if (e instanceof DOMException && (e.name === 'NotSupportedError' || e.name === 'SecurityError'))
      throw videoEncodeError('unsupported');
    throw e;
  } finally {
    if (encoder && encoder.state !== 'closed') encoder.close();
  }
}
