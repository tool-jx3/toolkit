/**
 * 影片取樣的純計算（不碰 DOM，Node 也能測）：選取區間裡要抽哪些時間點、跳轉時避開兩格交界的誤差。
 */

/**
 * 跳轉時多加的秒數（1 毫秒）。影片的每一格從自己的時間戳開始顯示，取樣時間剛好落在交界（例如 3 × (1/30)＝0.09999…）時，
 * 浮點誤差會讓瀏覽器顯示前一格；加 1 毫秒讓交界一律取後面那一格（每秒 500 格以下的影片都不會跳過一格）。
 */
export const FRAME_SEEK_EPSILON = 0.001;

/** 影格數的捨去容許的浮點誤差（L ÷ s 算成 29.9999999 時當 30） */
const COUNT_EPSILON = 1e-6;

export interface ClipSampleOptions {
  /** 起點（秒） */
  start: number;
  /** 終點（秒，不取） */
  end: number;
  /** 每秒輸出幾格 */
  fps: number;
  /** 播放速度（倍，預設 1）：每格在影片上相隔 speed ÷ fps 秒 */
  speed?: number;
  /** 區間長度的下限（秒，預設 0）；終點 − 起點比這個短時以這個長度計 */
  minLength?: number;
}

export interface ClipSamples {
  /** 每格在影片上相隔的秒數（speed ÷ fps） */
  step: number;
  /** 實際使用的區間長度（秒） */
  length: number;
  /** 第 i 格要取的影片時間（起點 + i × step），i＝0～count − 1 */
  times: number[];
}

/**
 * 選取區間的取樣時間：影格數＝⌊長度 ÷ 每格間隔⌋（終點那一刻不取），第 i 格取起點 + i × 每格間隔。
 *
 * 例：0～3 秒、30 fps → 90 格（0、1/30、2/30…）；24 fps、2 倍速 → 36 格（每格相隔 1/12 秒）。
 */
export function clipSampleTimes({
  start,
  end,
  fps,
  speed = 1,
  minLength = 0,
}: ClipSampleOptions): ClipSamples {
  if (!(fps > 0)) throw new RangeError('fps 必須大於 0');
  if (!(speed > 0)) throw new RangeError('播放速度必須大於 0');
  const length = Math.max(minLength, end - start);
  const step = speed / fps;
  const count = length > 0 ? Math.max(0, Math.floor(length / step + COUNT_EPSILON)) : 0;
  const times = Array.from({ length: count }, (_, i) => start + i * step);
  return { step, length, times };
}

/**
 * 實際跳轉的時間：取樣時間 + FRAME_SEEK_EPSILON，夾在 0～總長（總長未知時不夾上限）。
 */
export function seekTimeFor(time: number, duration: number, epsilon = FRAME_SEEK_EPSILON): number {
  const t = Math.max(0, time + epsilon);
  return Number.isFinite(duration) && duration > 0 ? Math.min(duration, t) : t;
}

/** 在區間裡平均取 n 個時間點（起點 + i × 長度 ÷ n，i＝0～n − 1；不含終點），例如時間軸的樣本縮圖 */
export function evenSampleTimes(start: number, end: number, n: number, minLength = 0): number[] {
  const count = Math.max(0, Math.floor(n));
  const length = Math.max(minLength, end - start);
  return Array.from({ length: count }, (_, i) => start + (i * length) / count);
}

/** 把內容放進 maxWidth × maxHeight 的框裡（等比、不放大）後的尺寸，至少 1 px */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const k = Math.min(1, maxWidth / Math.max(1, width), maxHeight / Math.max(1, height));
  return {
    width: Math.max(1, Math.round(width * k)),
    height: Math.max(1, Math.round(height * k)),
  };
}
