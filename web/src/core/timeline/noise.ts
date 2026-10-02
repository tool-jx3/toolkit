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

/* ---------- 二維值雜訊與 fBm（G2：暈染邊界、霧、雲狀花紋） ---------- */

/** 整數格點上的值 [0, 1)（由種子與座標雜湊） */
const lattice = (s: number, ix: number, iy: number): number => hashUnit(s, ix, iy);

const fade = (t: number) => t * t * (3 - 2 * t);

/**
 * 二維值雜訊：整數格點各有一個決定性的亂數，格點之間以 smoothstep 權重雙線性內插。
 * 範圍 [0, 1)，連續、在格點上剛好等於格點值；同樣的 seed、x、y 一定得到同樣的值。
 * 1 個單位＝1 格（要一格 40 px 時傳 x ÷ 40）。
 */
export function valueNoise2(seed: number | string, x: number, y: number): number {
  const s = seedNum(seed);
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const a = lattice(s, ix, iy);
  const b = lattice(s, ix + 1, iy);
  const c = lattice(s, ix, iy + 1);
  const d = lattice(s, ix + 1, iy + 1);
  const top = a + (b - a) * fx;
  const bottom = c + (d - c) * fx;
  return top + (bottom - top) * fy;
}

export interface FbmOptions {
  /** 疊幾層（預設 5） */
  octaves?: number;
  /** 每層頻率倍率（預設 2） */
  lacunarity?: number;
  /** 每層振幅倍率（預設 0.5） */
  gain?: number;
}

/**
 * 分形雜訊（fBm）：valueNoise2 疊 octaves 層（頻率 ×lacunarity、振幅 ×gain），正規化到 [0, 1)。
 * 預設 5 層：最大的團塊約 1 個單位、細節約 1/16 個單位（雲狀、墨跡的不規則邊界）。各層用不同的種子，不會對齊格線。
 */
export function fbm2(
  seed: number | string,
  x: number,
  y: number,
  { octaves = 5, lacunarity = 2, gain = 0.5 }: FbmOptions = {},
): number {
  const s = seedNum(seed);
  let sum = 0;
  let norm = 0;
  let amp = 1;
  let f = 1;
  const n = Math.max(1, Math.floor(octaves));
  for (let o = 0; o < n; o++) {
    /* 每層錯開一點，避免各層的格點疊在一起 */
    sum += amp * valueNoise2(s + o * 7919, x * f + o * 17.31, y * f + o * 9.73);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}
