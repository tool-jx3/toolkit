/**
 * core/audio：解碼使用者上傳的音效、依時間點離線混音（可疊加或不疊音、淡出）、產生靜音、編碼 PCM 16-bit WAV。
 *
 * 音訊一律以 PcmAudio（每個聲道一條 Float32Array，−1～1）表示；混音、淡出、WAV 編碼都是純函式（Node 也能跑）。
 * 只有 decodeAudio 需要瀏覽器的 Web Audio（解碼後的取樣率＝瀏覽器音訊系統的取樣率，常見 44.1 或 48 kHz）。
 *
 * ```ts
 * const clip = await decodeAudio(file);
 * const times = steps.map((_, k) => k / fps);
 * const mixed = mixAtTimes(clip, skipOverlapping(times, pcmDuration(clip)), { duration: 2.5, fade: { start: 2.3, end: 2.5 } });
 * downloadBlob(wavBlob(mixed), 'sound.wav');
 * ```
 */

export interface PcmAudio {
  sampleRate: number;
  /** 每個聲道一條（長度相同），值為 −1～1 */
  channels: Float32Array[];
}

/** 取樣數 */
export const pcmLength = (a: PcmAudio): number => a.channels[0]?.length ?? 0;
/** 長度（秒） */
export const pcmDuration = (a: PcmAudio): number =>
  a.sampleRate > 0 ? pcmLength(a) / a.sampleRate : 0;

export class AudioDecodeError extends Error {
  constructor(message = '無法解碼這個音訊檔，請換成 MP3、WAV 或 OGG 等常見格式。') {
    super(message);
    this.name = 'AudioDecodeError';
  }
}

type AudioCtxCtor = new () => AudioContext;

/** 這個瀏覽器能不能解碼音訊（有沒有 Web Audio） */
export function canDecodeAudio(): boolean {
  const g = globalThis as unknown as {
    AudioContext?: AudioCtxCtor;
    webkitAudioContext?: AudioCtxCtor;
  };
  return !!(g.AudioContext ?? g.webkitAudioContext);
}

/**
 * 解碼音訊檔（MP3、WAV、OGG… 瀏覽器能解的都可以）。取樣率是瀏覽器音訊系統的取樣率，聲道數照原檔。
 * 失敗時丟出 AudioDecodeError（訊息可直接顯示）。
 */
export async function decodeAudio(data: Blob | ArrayBuffer): Promise<PcmAudio> {
  const g = globalThis as unknown as {
    AudioContext?: AudioCtxCtor;
    webkitAudioContext?: AudioCtxCtor;
  };
  const Ctor = g.AudioContext ?? g.webkitAudioContext;
  if (!Ctor) throw new AudioDecodeError('這個瀏覽器不支援音訊處理。');
  const buf = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const ctx = new Ctor();
  try {
    const decoded = await new Promise<AudioBuffer>((resolve, reject) => {
      /* 舊版 Safari 只有回呼形式 */
      const p = ctx.decodeAudioData(buf.slice(0), resolve, reject);
      if (p && typeof (p as Promise<AudioBuffer>).then === 'function')
        (p as Promise<AudioBuffer>).then(resolve, reject);
    });
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++)
      channels.push(new Float32Array(decoded.getChannelData(c)));
    return { sampleRate: decoded.sampleRate, channels };
  } catch (e) {
    if (e instanceof AudioDecodeError) throw e;
    throw new AudioDecodeError();
  } finally {
    void ctx.close?.();
  }
}

/** 靜音（預設 44,100 Hz、單聲道） */
export function createSilence(
  seconds: number,
  { sampleRate = 44100, channels = 1 }: { sampleRate?: number; channels?: number } = {},
): PcmAudio {
  const n = Math.max(0, Math.round(seconds * sampleRate));
  return {
    sampleRate,
    channels: Array.from({ length: Math.max(1, channels) }, () => new Float32Array(n)),
  };
}

/** 線性重新取樣（取樣率不同的音效混在一起時用） */
export function resample(a: PcmAudio, sampleRate: number): PcmAudio {
  if (a.sampleRate === sampleRate) return a;
  const n = Math.round((pcmLength(a) * sampleRate) / a.sampleRate);
  const k = a.sampleRate / sampleRate;
  return {
    sampleRate,
    channels: a.channels.map((src) => {
      const out = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = i * k;
        const i0 = Math.floor(x);
        const f = x - i0;
        const v0 = src[i0] ?? 0;
        const v1 = src[i0 + 1] ?? v0;
        out[i] = v0 + (v1 - v0) * f;
      }
      return out;
    }),
  };
}

/**
 * 「不疊音」：上一次音效還沒放完（start ≥ 上一次開始＋音效長度）時跳過這個時間點。
 */
export function skipOverlapping(times: readonly number[], clipDuration: number): number[] {
  const out: number[] = [];
  let busyUntil = Number.NEGATIVE_INFINITY;
  for (const t of [...times].sort((a, b) => a - b)) {
    if (t >= busyUntil - 1e-9) {
      out.push(t);
      busyUntil = t + clipDuration;
    }
  }
  return out;
}

export interface MixOptions {
  /** 輸出長度（秒） */
  duration: number;
  /** 輸出取樣率（預設同音效） */
  sampleRate?: number;
  /** 輸出聲道數（預設同音效；音效聲道較少時重複最後一個聲道） */
  channels?: number;
  /** 線性淡出：start 秒開始、end 秒降到 0（之後全部靜音） */
  fade?: { start: number; end: number } | null;
  /** 音量（預設 1） */
  gain?: number;
}

/**
 * 在每個時間點放一次音效（可以疊加），混成一段音訊。超出 −1～1 的部分夾住。
 * 時間點換算成取樣位置時四捨五入。
 */
export function mixAtTimes(clip: PcmAudio, times: readonly number[], o: MixOptions): PcmAudio {
  const rate = o.sampleRate ?? clip.sampleRate;
  const src = resample(clip, rate);
  const nch = Math.max(1, o.channels ?? src.channels.length);
  const out = createSilence(o.duration, { sampleRate: rate, channels: nch });
  const N = pcmLength(out);
  const gain = o.gain ?? 1;
  for (let c = 0; c < nch; c++) {
    const dst = out.channels[c];
    const s = src.channels[Math.min(c, src.channels.length - 1)];
    if (!s) continue;
    for (const t of times) {
      const start = Math.round(t * rate);
      const end = Math.min(N, start + s.length);
      for (let i = Math.max(0, start); i < end; i++) dst[i] += s[i - start] * gain;
    }
    for (let i = 0; i < N; i++) dst[i] = dst[i] > 1 ? 1 : dst[i] < -1 ? -1 : dst[i];
  }
  if (o.fade) applyFadeOut(out, o.fade.start, o.fade.end);
  return out;
}

/** 線性淡出（直接改 a）：start 秒以前不變、end 秒降到 0、之後靜音 */
export function applyFadeOut(a: PcmAudio, start: number, end: number): PcmAudio {
  const r = a.sampleRate;
  const s0 = Math.round(start * r);
  const s1 = Math.max(s0, Math.round(end * r));
  for (const ch of a.channels) {
    for (let i = Math.max(0, s0); i < ch.length; i++) {
      const k = i >= s1 ? 0 : 1 - (i - s0) / Math.max(1, s1 - s0);
      ch[i] *= k;
    }
  }
  return a;
}

/** PCM 16-bit little-endian WAV（RIFF） */
export function encodeWav(a: PcmAudio): Uint8Array<ArrayBuffer> {
  const nch = Math.max(1, a.channels.length);
  const n = pcmLength(a);
  const dataBytes = n * nch * 2;
  const buf = new ArrayBuffer(44 + dataBytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, nch, true);
  v.setUint32(24, a.sampleRate, true);
  v.setUint32(28, a.sampleRate * nch * 2, true);
  v.setUint16(32, nch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, dataBytes, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const s = a.channels[c]?.[i] ?? 0;
      const x = s <= -1 ? -32768 : s >= 1 ? 32767 : Math.round(s < 0 ? s * 32768 : s * 32767);
      v.setInt16(o, x, true);
      o += 2;
    }
  }
  return new Uint8Array(buf);
}

/** WAV 的 Blob（audio/wav） */
export function wavBlob(a: PcmAudio): Blob {
  return new Blob([encodeWav(a)], { type: 'audio/wav' });
}

/** 讀 PCM 16-bit WAV（測試與驗證用）；不是這種格式時丟錯 */
export function parseWav(bytes: Uint8Array): PcmAudio {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(...bytes.subarray(o, o + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('不是 WAV 檔');
  let o = 12;
  let rate = 0;
  let nch = 0;
  let bits = 0;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const size = v.getUint32(o + 4, true);
    if (id === 'fmt ') {
      if (v.getUint16(o + 8, true) !== 1) throw new Error('只支援 PCM');
      nch = v.getUint16(o + 10, true);
      rate = v.getUint32(o + 12, true);
      bits = v.getUint16(o + 22, true);
    } else if (id === 'data') {
      if (bits !== 16) throw new Error('只支援 16-bit');
      const n = Math.floor(size / (2 * nch));
      const channels = Array.from({ length: nch }, () => new Float32Array(n));
      let p = o + 8;
      for (let i = 0; i < n; i++) {
        for (let c = 0; c < nch; c++) {
          const x = v.getInt16(p, true);
          channels[c][i] = x < 0 ? x / 32768 : x / 32767;
          p += 2;
        }
      }
      return { sampleRate: rate, channels };
    }
    o += 8 + size + (size % 2);
  }
  throw new Error('WAV 檔沒有資料');
}
