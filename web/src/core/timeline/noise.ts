/**
 * 週期平滑雜訊：無縫循環的抖動、飄動。
 *
 * 由幾個整數頻率的正弦相加而成（相位與振幅由種子決定），所以 t 每增加 1 就回到同一個值，
 * 而且一階導數也連續——循環動畫的最後一格接回第一格時看不出接縫。
 */
import { hashUnit, seedOf } from './random';

export interface LoopNoiseOptions {
  /** 疊幾個頻率（1、2、3…倍頻，預設 3）；越多越不規則 */
  harmonics?: number;
  /** 同一個種子的不同軸（例如 0＝水平、1＝垂直），彼此不相關 */
  channel?: number;
}

const seedNum = (seed: number | string): number =>
  typeof seed === 'string' ? seedOf(seed) : Math.round(seed) | 0;

/**
 * t（循環的進度，週期 1）時的雜訊值，範圍 [−1, 1]（實際峰值約 0.6～0.9）。
 * 同樣的 seed、channel、t 一定得到同樣的值。
 */
export function loopNoise(
  seed: number | string,
  t: number,
  { harmonics = 3, channel = 0 }: LoopNoiseOptions = {},
): number {
  const s = seedNum(seed);
  const H = Math.max(1, Math.floor(harmonics));
  let sum = 0;
  let norm = 0;
  for (let k = 1; k <= H; k++) {
    const amp = (0.6 + 0.8 * hashUnit(s, channel * 131 + k, 7)) / k;
    const phase = hashUnit(s, channel * 131 + k, 11) * Math.PI * 2;
    sum += amp * Math.sin(Math.PI * 2 * k * t + phase);
    norm += amp;
  }
  return norm > 0 ? sum / norm : 0;
}

/** 二維的週期雜訊（水平、垂直兩軸互不相關），例如隨機抖動的位移 */
export function loopNoise2(
  seed: number | string,
  t: number,
  options: Omit<LoopNoiseOptions, 'channel'> = {},
): { x: number; y: number } {
  return {
    x: loopNoise(seed, t, { ...options, channel: 0 }),
    y: loopNoise(seed, t, { ...options, channel: 1 }),
  };
}
