/**
 * 視覺化的數值（規格 3.5）：長條（對數頻帶的平均、曲線、往高頻加權、往下掉的速度）、低頻能量（節拍）、
 * 波形的點、整首波形的段數，以及沒有音樂時的示意動畫。純函式（畫圖在 render.ts）。
 */
import { bandAverage, logFrequencyBands } from '@/core/audio';

/** 長條最多幾根（版面用到的根數不超過這個） */
export const MAX_BARS = 96;

/** 每秒 60 次為 1 的「經過的畫面數」：長條往下掉、低頻能量衰減都以這個換算 */
export interface VizState {
  bars: Float32Array;
  /** 低頻能量（0～1，有衰減） */
  bass: number;
  /** 目前的頻帶表（根數、取樣率、FFT 大小相同時沿用） */
  bands: [number, number][];
  bandsKey: string;
}

export function createVizState(): VizState {
  return { bars: new Float32Array(MAX_BARS), bass: 0, bands: [], bandsKey: '' };
}

export function resetViz(v: VizState): void {
  v.bars.fill(0);
  v.bass = 0;
}

/**
 * 依一格的頻譜更新長條與低頻能量：
 * - 每根長條＝對應頻帶（35 Hz～16 kHz 對數分段）的平均 ÷ 255，^1.7，× (1 + 0.7 × 第幾根 ÷ 根數) × 1.12，最多 1；
 *   比上一格低時每 1/60 秒最多掉 0.03。
 * - 低頻能量＝第 1～7 個頻率桶的平均 ÷ 255；比上一格低時每 1/60 秒乘 0.9。
 * frames＝距離上一格經過幾個 1/60 秒（30 FPS 匯出時是 2）。
 */
export function updateViz(
  v: VizState,
  freq: ArrayLike<number>,
  count: number,
  {
    sampleRate,
    fftSize = 2048,
    frames = 1,
  }: { sampleRate: number; fftSize?: number; frames?: number },
): void {
  const key = `${count}|${sampleRate}|${fftSize}`;
  if (v.bandsKey !== key) {
    v.bands = logFrequencyBands(count, { sampleRate, fftSize, binCount: freq.length });
    v.bandsKey = key;
  }
  for (let i = 0; i < count; i++) {
    const [lo, hi] = v.bands[i];
    let x = bandAverage(freq, lo, hi);
    x = Math.min(1, x ** 1.7 * (1 + (i / count) * 0.7) * 1.12);
    v.bars[i] = Math.max(x, v.bars[i] - 0.03 * frames);
  }
  v.bass = Math.max(bandAverage(freq, 1, 8), v.bass * 0.9 ** frames);
}

/** 還在往下掉（預覽暫停時要繼續重畫） */
export const vizSettling = (v: VizState, count: number) =>
  v.bass > 0.001 || v.bars.subarray(0, count).some((x) => x > 0.001);

/** 隨節拍的封面放大倍率：1 + 低頻能量^2.5 × 0.03 */
export const beatScale = (bass: number) => 1 + bass ** 2.5 * 0.03;

/** 沒有音樂時長條的示意動畫（ph＝循環的相位 0～2π） */
export const fakeBar = (i: number, ph: number) =>
  0.14 +
  0.34 * (0.5 + 0.5 * Math.sin(ph * 2 + i * 0.55)) * (0.6 + 0.4 * Math.sin(ph * 3 - i * 0.21)) +
  0.28 * (0.5 + 0.5 * Math.sin(ph + i * 0.13)) ** 3;

/** 沒有音樂時波形的示意動畫（u＝0～1 的位置） */
export const fakeWave = (u: number, ph: number) =>
  0.55 * Math.sin(u * Math.PI * 6 + ph * 2) * Math.sin(u * Math.PI * 2 + ph) +
  0.22 * Math.sin(u * Math.PI * 17 - ph * 3);

/** 波形的點數（N＋1 個點） */
export const WAVE_POINTS = 140;

/**
 * 波形上的 N＋1 個點（相對中線，−1～1）：兩端以 sin(πu)^0.7 收尖；
 * 有音樂時取時域資料前半段的對應位置、4 個取樣平均，(值 − 128) ÷ 128 × 2.2。
 */
export function wavePoints(
  timeDomain: ArrayLike<number> | null,
  ph: number,
  n = WAVE_POINTS,
): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const taper = Math.sin(Math.PI * u) ** 0.7;
    let v: number;
    if (timeDomain) {
      const base = Math.floor(u * (timeDomain.length / 2 - 4));
      let s = 0;
      for (let k = 0; k < 4; k++) s += timeDomain[base + k];
      v = ((s / 4 - 128) / 128) * 2.2;
    } else v = fakeWave(u, ph);
    out.push(Math.max(-1, Math.min(1, v)) * taper);
  }
  return out;
}

/**
 * 沒有音樂時「整首波形」的示意資料（220 段，固定）：決定性亂數、前後各 3 段平均、
 * 中間高兩端低（0.55 + 0.45 × sin(π × i ÷ 220)）× 1.3，夾在 0.08～1。
 */
export const FAKE_PEAKS: Float32Array = (() => {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const n = 220;
  const raw: number[] = [];
  for (let i = 0; i < n; i++) raw.push(rnd());
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    let c = 0;
    for (let k = -3; k <= 3; k++) {
      const j = i + k;
      if (j >= 0 && j < n) {
        s += raw[j];
        c++;
      }
    }
    const env = 0.55 + 0.45 * Math.sin((Math.PI * i) / n);
    out[i] = Math.min(1, Math.max(0.08, (s / c) * 1.3 * env));
  }
  return out;
})();

/** 整首波形的段數：寬 ÷ 9 四捨五入 */
export const peakCount = (w: number) => Math.round(w / 9);

/** 第 i 段（共 n 段）取哪一個峰值 */
export const peakAt = (peaks: ArrayLike<number>, i: number, n: number) =>
  peaks[Math.floor((i / n) * peaks.length)];

/** 科技風右側音量表的格數（14 格）亮幾格 */
export function meterLevel({
  live,
  bass,
  motion,
  ph,
}: {
  live: boolean;
  bass: number;
  motion: boolean;
  ph: number;
}): number {
  const lvl = live
    ? Math.min(1, Math.max(0, bass * 1.25))
    : motion
      ? 0.3 + 0.45 * (0.5 + 0.5 * Math.sin(ph * 3)) * (0.6 + 0.4 * Math.sin(ph * 5))
      : 0.55;
  return Math.round(lvl * 14);
}
