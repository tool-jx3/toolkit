/**
 * 循環的整理（純函式，Node 可測）：
 * - 使用者的音檔做成首尾相接的循環（最後一段交叉淡化到開頭）、或「只播一次」放在一段循環的開頭；
 * - 匯出時把一段循環鋪滿指定的長度，接縫交叉淡化；
 * - 主輸出的柔和限幅（WaveShaper 的曲線；預覽與匯出用同一條，結果一樣）；
 * - WAV 的大小估計、音量（0～100）換成增益。
 */
import { type PcmAudio, pcmLength } from '../pcm';

/** 等功率交叉淡化的兩條曲線在 x（0～1）的值：[淡入, 淡出] */
const fadePair = (x: number): [number, number] => [
  Math.sin((x * Math.PI) / 2),
  Math.cos((x * Math.PI) / 2),
];

/**
 * 首尾相接的循環：長度 F 的音訊 → 長度 F − X（X＝交叉淡化的取樣數，最多 F 的一半）。
 * 開頭 X 個取樣＝原本的開頭（淡入）＋原本最後 X 個取樣（淡出），所以循環時最後一個取樣（原本的第 F−X−1 個）
 * 接到第一個（幾乎就是原本的第 F−X 個）是連續的。X＝0 時原樣回傳（複製）。
 */
export function crossfadeLoop(pcm: PcmAudio, fadeSeconds: number): PcmAudio {
  const n = pcmLength(pcm);
  const x = Math.max(0, Math.min(Math.floor(n / 2), Math.round(fadeSeconds * pcm.sampleRate)));
  const len = n - x;
  return {
    sampleRate: pcm.sampleRate,
    channels: pcm.channels.map((src) => {
      const out = new Float32Array(len);
      out.set(src.subarray(0, len));
      for (let i = 0; i < x; i++) {
        const [fi, fo] = fadePair((i + 0.5) / x);
        out[i] = src[i] * fi + src[len + i] * fo;
      }
      return out;
    }),
  };
}

/**
 * 把一段循環（loop：長度任意，本身首尾相接）鋪滿 seconds 秒，在接縫交叉淡化 fadeSeconds：
 * 先鋪 seconds ＋ X 的長度，再把多出來的 X 疊回開頭（等功率）。結果長度＝seconds × 取樣率，首尾相接。
 * 循環的長度剛好整除 seconds 時直接鋪（本來就首尾相接，不必淡化）。
 */
export function tileLoop(loop: PcmAudio, seconds: number, fadeSeconds: number): PcmAudio {
  const rate = loop.sampleRate;
  const total = Math.round(seconds * rate);
  const m = pcmLength(loop);
  if (!m || !total)
    return { sampleRate: rate, channels: loop.channels.map(() => new Float32Array(total)) };
  const exact = total % m === 0;
  const x = exact ? 0 : Math.max(1, Math.min(total, Math.round(fadeSeconds * rate)));
  return {
    sampleRate: rate,
    channels: loop.channels.map((src) => {
      const out = new Float32Array(total);
      for (let i = 0; i < total; i++) out[i] = src[i % m];
      for (let i = 0; i < x; i++) {
        const [fi, fo] = fadePair((i + 0.5) / x);
        out[i] = out[i] * fi + src[(total + i) % m] * fo;
      }
      return out;
    }),
  };
}

/**
 * 「只播一次」：音檔放在 seconds 秒的開頭，淡入 fadeIn、結尾淡出 fadeOut，之後是靜音（首尾相接：每一輪播一次）。
 * 音檔比 seconds 長時截斷，在截斷處淡出（至少 0.5 秒）。
 */
export function placeOnce(
  pcm: PcmAudio,
  seconds: number,
  fadeIn: number,
  fadeOut: number,
): PcmAudio {
  const rate = pcm.sampleRate;
  const total = Math.round(seconds * rate);
  const n = Math.min(pcmLength(pcm), total);
  const cut = pcmLength(pcm) > total;
  const fin = Math.min(n, Math.round(Math.max(0, fadeIn) * rate));
  const fout = Math.min(n, Math.round(Math.max(cut ? 0.5 : 0, fadeOut) * rate));
  return {
    sampleRate: rate,
    channels: pcm.channels.map((src) => {
      const out = new Float32Array(total);
      for (let i = 0; i < n; i++) {
        let g = 1;
        if (i < fin) g *= i / fin;
        if (i >= n - fout) g *= (n - i) / fout;
        out[i] = src[i] * g;
      }
      return out;
    }),
  };
}

/** 一段音訊（例如只播一次的音檔）頭尾加淡入淡出（複製） */
export function withFades(pcm: PcmAudio, fadeIn: number, fadeOut: number): PcmAudio {
  return placeOnce(pcm, pcmLength(pcm) / pcm.sampleRate, fadeIn, fadeOut);
}

/* ---------- 主輸出的柔和限幅 ---------- */

/** 限幅的門檻：這以下原封不動（線性），以上柔和地壓到 ±1 以內 */
export const SOFT_CLIP_THRESHOLD = 0.7;
/** WaveShaper 前先乘上這個（曲線的輸入範圍 ±1 代表實際的 ±2），之後不必再乘回來（曲線本身已換算） */
export const SOFT_CLIP_INPUT_SCALE = 0.5;

/** 柔和限幅：|u| ≤ T 不變；以上 T ＋ (1 − T) × tanh((|u| − T) ÷ (1 − T)) */
export function softClip(u: number, t = SOFT_CLIP_THRESHOLD): number {
  const a = Math.abs(u);
  if (a <= t) return u;
  return Math.sign(u) * (t + (1 - t) * Math.tanh((a - t) / (1 - t)));
}

/**
 * WaveShaperNode 的曲線（點數 n）：輸入先乘 SOFT_CLIP_INPUT_SCALE，曲線在 x 處的值＝softClip(x ÷ SOFT_CLIP_INPUT_SCALE)。
 * 預覽與匯出都用這條，主音量很大時不會硬切成刺耳的破音。
 */
export function softClipCurve(n = 4097): Float32Array<ArrayBuffer> {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    out[i] = softClip(x / SOFT_CLIP_INPUT_SCALE);
  }
  return out;
}

/* ---------- 音量與大小 ---------- */

/** 音量（0～100）→ 增益：平方（聽感比較平均；50 ≒ −12 dB） */
export const volumeGain = (v: number): number => {
  const x = Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0)) / 100;
  return x * x;
};

/** PCM 16-bit WAV 的位元組數 */
export const wavBytes = (seconds: number, sampleRate: number, channels: number): number =>
  44 + Math.round(seconds * sampleRate) * Math.max(1, channels) * 2;

/** 峰值（dBFS） */
export function peakDb(pcm: PcmAudio): number {
  let m = 0;
  for (const ch of pcm.channels)
    for (let i = 0; i < ch.length; i++) m = Math.max(m, Math.abs(ch[i]));
  return m > 0 ? 20 * Math.log10(m) : -Infinity;
}
