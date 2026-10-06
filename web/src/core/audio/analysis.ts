/**
 * 聲音分析（純函式，Node 也能跑；music-frame 移植時新增）：
 *
 * - 頻譜：`createOfflineAnalyser(pcm, { fps })` 在任一時間點算出和瀏覽器 AnalyserNode 相同格式的資料
 *   （`getByteFrequencyData`、`getByteTimeDomainData`）：取 t 之前的 fftSize 個取樣（立體聲平均成單聲道）、
 *   Blackman 窗、FFT、振幅 ÷ N、逐格的指數平滑（時間常數以每秒 60 次換算成 fps）、轉成 dB，
 *   −100～−30 dB 對應 0～255。離線逐格匯出時用（預覽用真的 AnalyserNode）。
 * - 整首的波形峰值：`waveformPeaks(pcm, n)`，每段的均方根（左右聲道的絕對值相加）÷ 最大值，再 ^0.85、夾在 0.06～1。
 * - 對數頻帶：`logFrequencyBands(n, …)` 把 35 Hz～16 kHz 依對數平均分成 n 段，回傳每段的頻率桶範圍。
 * - 低頻能量（節拍強度）：`bandAverage(freq, 1, 8)`（第 1～7 個頻率桶的平均 ÷ 255）。
 * - 檔頭判斷：`detectAudioType(bytes)`（MP3、WAV、OGG、FLAC、M4A／AAC、WebM）。
 */
import type { PcmAudio } from './pcm';

/** 原地的基 2 FFT（re、im 長度相同，必須是 2 的次方） */
export function fftInPlace(re: Float64Array | Float32Array, im: Float64Array | Float32Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci;
        const xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr;
        im[b] = im[a] - xi;
        re[a] += xr;
        im[a] += xi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/** Blackman 窗（AnalyserNode 用的係數：0.42、0.5、0.08，分母是 N） */
export function blackmanWindow(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++)
    w[i] = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / n) + 0.08 * Math.cos((4 * Math.PI * i) / n);
  return w;
}

export interface OfflineAnalyserOptions {
  /** FFT 大小（2 的次方，預設 2048） */
  fftSize?: number;
  /** 平滑（每 1/60 秒的時間常數，預設 0.75＝AnalyserNode 的預設值） */
  smoothingTimeConstant?: number;
  /** 每秒算幾次（平滑依此換算，預設 60） */
  fps?: number;
  /** dB 範圍（預設 −100～−30，同 AnalyserNode） */
  minDecibels?: number;
  maxDecibels?: number;
}

export interface OfflineAnalyser {
  readonly fftSize: number;
  readonly frequencyBinCount: number;
  /** 最近一次 at() 的頻譜（0～255） */
  readonly frequency: Uint8Array;
  /** 最近一次 at() 的波形（128＝0） */
  readonly timeDomain: Uint8Array;
  /** 算 t 秒（t 之前的 fftSize 個取樣）；要依時間順序呼叫，平滑才正確 */
  at(t: number): void;
  /** 清掉平滑的狀態 */
  reset(): void;
}

/**
 * 離線的頻譜分析：每次 at(t) 依序算一格（平滑接續上一格）。
 * 結果放在 `frequency`、`timeDomain`（每次重複使用同一塊記憶體）。
 */
export function createOfflineAnalyser(
  pcm: PcmAudio,
  {
    fftSize = 2048,
    smoothingTimeConstant = 0.75,
    fps = 60,
    minDecibels = -100,
    maxDecibels = -30,
  }: OfflineAnalyserOptions = {},
): OfflineAnalyser {
  const N = fftSize;
  const half = N >> 1;
  const sr = pcm.sampleRate;
  const A = pcm.channels[0] ?? new Float32Array(0);
  const B = pcm.channels.length > 1 ? pcm.channels[1] : null;
  const win = blackmanWindow(N);
  const re = new Float64Array(N);
  const im = new Float64Array(N);
  const td = new Float32Array(N);
  const sm = new Float32Array(half);
  const frequency = new Uint8Array(half);
  const timeDomain = new Uint8Array(N);
  const tau = smoothingTimeConstant ** (60 / Math.max(1, fps));
  const range = maxDecibels - minDecibels;
  return {
    fftSize: N,
    frequencyBinCount: half,
    frequency,
    timeDomain,
    at(t) {
      const s0 = Math.floor(t * sr) - N;
      for (let i = 0; i < N; i++) {
        const j = s0 + i;
        let x = 0;
        if (j >= 0 && j < A.length) x = B ? (A[j] + B[j]) * 0.5 : A[j];
        td[i] = x;
        re[i] = x * win[i];
        im[i] = 0;
      }
      fftInPlace(re, im);
      for (let k = 0; k < half; k++) {
        const mag = Math.hypot(re[k], im[k]) / N;
        sm[k] = tau * sm[k] + (1 - tau) * mag;
        const db = 20 * Math.log10(sm[k] + 1e-12);
        frequency[k] = Math.max(0, Math.min(255, Math.round(((db - minDecibels) / range) * 255)));
      }
      for (let i = 0; i < N; i++)
        timeDomain[i] = Math.max(0, Math.min(255, Math.round(128 * (1 + td[i]))));
    },
    reset() {
      sm.fill(0);
    },
  };
}

/**
 * 整首的波形峰值（n 段，0.06～1）：每段每 16 個取樣取一個（左右聲道的絕對值相加）算均方根，
 * 除以最大的一段後 ^0.85。
 */
export function waveformPeaks(pcm: PcmAudio, n = 220): Float32Array {
  const a = pcm.channels[0] ?? new Float32Array(0);
  const b = pcm.channels.length > 1 ? pcm.channels[1] : null;
  const len = a.length;
  const step = Math.floor(len / n);
  const out = new Float32Array(n);
  let mx = 0;
  for (let i = 0; i < n; i++) {
    let s = 0;
    let k = 0;
    for (let j = 0; j < step; j += 16) {
      const idx = i * step + j;
      const v = Math.abs(a[idx]) + (b ? Math.abs(b[idx]) : 0);
      s += v * v;
      k++;
    }
    out[i] = Math.sqrt(s / Math.max(1, k));
    mx = Math.max(mx, out[i]);
  }
  for (let i = 0; i < n; i++) out[i] = Math.min(1, Math.max(0.06, (out[i] / (mx || 1)) ** 0.85));
  return out;
}

/**
 * 對數頻帶：f0～f1 依對數平均分成 count 段，每段對應的頻率桶 [lo, hi)（至少一個桶，不超過 binCount）。
 * 桶寬＝sampleRate ÷ fftSize。
 */
export function logFrequencyBands(
  count: number,
  {
    sampleRate,
    fftSize = 2048,
    binCount = fftSize / 2,
    f0 = 35,
    f1 = 16000,
  }: { sampleRate: number; fftSize?: number; binCount?: number; f0?: number; f1?: number },
): [number, number][] {
  const bin = sampleRate / fftSize;
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const a = f0 * (f1 / f0) ** (i / count);
    const b = f0 * (f1 / f0) ** ((i + 1) / count);
    const lo = Math.floor(a / bin);
    const hi = Math.max(lo + 1, Math.ceil(b / bin));
    out.push([lo, Math.min(hi, binCount)]);
  }
  return out;
}

/** 頻率桶 [lo, hi) 的平均 ÷ 255（0～1） */
export function bandAverage(freq: ArrayLike<number>, lo: number, hi: number): number {
  let s = 0;
  const n = Math.max(0, hi - lo);
  for (let i = lo; i < hi; i++) s += freq[i] ?? 0;
  return n ? s / n / 255 : 0;
}

export type AudioFileType = 'mp3' | 'wav' | 'ogg' | 'flac' | 'm4a' | 'aac' | 'webm';

export const AUDIO_FILE_INFO: Record<AudioFileType, { ext: string; mime: string }> = {
  mp3: { ext: 'mp3', mime: 'audio/mpeg' },
  wav: { ext: 'wav', mime: 'audio/wav' },
  ogg: { ext: 'ogg', mime: 'audio/ogg' },
  flac: { ext: 'flac', mime: 'audio/flac' },
  m4a: { ext: 'm4a', mime: 'audio/mp4' },
  aac: { ext: 'aac', mime: 'audio/aac' },
  webm: { ext: 'webm', mime: 'audio/webm' },
};

/** 依檔頭判斷常見的音訊格式（認不得時 null） */
export function detectAudioType(bytes: Uint8Array): AudioFileType | null {
  const at = (o: number, s: string) =>
    bytes.length >= o + s.length && [...s].every((c, i) => bytes[o + i] === c.charCodeAt(0));
  if (at(0, 'RIFF') && at(8, 'WAVE')) return 'wav';
  if (at(0, 'OggS')) return 'ogg';
  if (at(0, 'fLaC')) return 'flac';
  if (at(0, 'ID3')) return 'mp3';
  if (at(4, 'ftyp')) return 'm4a';
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x1a &&
    bytes[1] === 0x45 &&
    bytes[2] === 0xdf &&
    bytes[3] === 0xa3
  )
    return 'webm';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0) return 'aac';
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return 'mp3';
  return null;
}
