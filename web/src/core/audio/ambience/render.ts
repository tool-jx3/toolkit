/**
 * 合成一個環境音：照定義算出一整段首尾相接的取樣，去掉直流與極低頻、乘上校準的音量，回傳 PcmAudio。
 * 同樣的聲音、參數、長度、取樣率與種子，每次（每台電腦、Node 或瀏覽器、Worker 或主執行緒）結果都一樣。
 */
import { createRandom, seedOf } from '@/core/timeline/random';
import type { PcmAudio } from '../pcm';
import { ambienceSound, sanitizeParams } from './catalog';
import { biquad, filterPeriodic, peak } from './dsp';
import { softClip } from './loop';
import type { AmbienceParams, RenderContext } from './types';

/** 最短 10 秒（雷、海浪、鐘聲一次就要好幾秒） */
export const AMBIENCE_MIN_SECONDS = 10;
/** 最長 10 分鐘 */
export const AMBIENCE_MAX_SECONDS = 600;

export interface AmbienceRenderOptions {
  /** 秒數（整數秒，夾在 10～600） */
  duration: number;
  sampleRate: number;
  /** 種子（同一個種子同一個結果；換種子＝同樣的聲音、不同的變化） */
  seed: number;
}

/** 整數秒、夾在範圍內 */
export const ambienceSeconds = (s: number): number =>
  Math.max(
    AMBIENCE_MIN_SECONDS,
    Math.min(AMBIENCE_MAX_SECONDS, Math.round(Number.isFinite(s) ? s : 0)),
  );

/**
 * 合成一個環境音。回傳的聲道數：立體聲的聲音 2 個、單聲道 1 個。不認識的 id 丟錯。
 * 結果的長度剛好是 duration × sampleRate 個取樣，最後一個取樣接回第一個是連續的（無縫循環）。
 */
export function renderAmbience(
  id: string,
  params: AmbienceParams | Record<string, unknown>,
  o: AmbienceRenderOptions,
): PcmAudio {
  const def = ambienceSound(id);
  if (!def) throw new Error(`沒有這個環境音：${id}`);
  const seconds = ambienceSeconds(o.duration);
  const sampleRate = Math.round(o.sampleRate);
  const n = seconds * sampleRate;
  const ctx: RenderContext = {
    sampleRate,
    n,
    seconds,
    rng: createRandom((seedOf(id) ^ Math.imul(o.seed | 0, 0x9e3779b1)) | 0),
    left: new Float32Array(n),
    right: def.stereo ? new Float32Array(n) : null,
  };
  def.render(ctx, sanitizeParams(def, params));
  const channels = ctx.right ? [ctx.left, ctx.right] : [ctx.left];
  const hp = biquad('highpass', 22, Math.SQRT1_2, sampleRate);
  for (const ch of channels) {
    filterPeriodic(ch, hp, Math.min(n, sampleRate));
    let mean = 0;
    for (let i = 0; i < n; i++) mean += ch[i];
    mean /= n;
    const g = def.gain;
    for (let i = 0; i < n; i++) ch[i] = (ch[i] - mean) * g;
  }
  /* 偶爾特別大的瞬間（很大的雨滴、劈啪聲）柔和地壓下來：0.6（約 −4.4 dBFS）以下不變 */
  for (const ch of channels) {
    for (let i = 0; i < n; i++) {
      const v = ch[i];
      if (v > 0.6 || v < -0.6) ch[i] = softClip(v, 0.6);
    }
  }
  /* 保險：超過 −0.1 dBFS 時整段壓下來（柔和限幅之後不會發生） */
  const pk = peak(channels);
  if (pk > 0.99) for (const ch of channels) for (let i = 0; i < n; i++) ch[i] *= 0.99 / pk;
  return { sampleRate, channels };
}

/** 快取用的鍵：聲音、整理過的參數、長度、取樣率、種子都一樣時結果一樣 */
export function ambienceKey(
  id: string,
  params: AmbienceParams | Record<string, unknown>,
  o: AmbienceRenderOptions,
): string {
  const def = ambienceSound(id);
  const p = def ? sanitizeParams(def, params) : {};
  const ps = Object.keys(p)
    .sort()
    .map((k) => `${k}=${p[k]}`)
    .join(',');
  return `${id}|${ps}|${ambienceSeconds(o.duration)}|${Math.round(o.sampleRate)}|${o.seed | 0}`;
}
