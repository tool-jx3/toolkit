/**
 * 影格表：每一格各有自己的長度（毫秒）的動畫。
 *
 * 一般動畫用「總長＋fps」均分影格；打字機這類「每格 1/FPS 秒、最後一格停留任意毫秒」的動畫，
 * 時間軸本身就是一張影格表。AnimationSource 給了 `frames` 時，exportAnimation 逐格照表輸出
 * （延遲以累計時間四捨五入，總長不會越積越多誤差），預覽則用 frameIndexAt 找出目前顯示哪一格。
 */

export interface FrameSpec {
  /** 這一格顯示多久（毫秒，必須 > 0） */
  ms: number;
  /** 畫這一格時傳給 render 的時間（秒）；不填＝這一格開始的時間 */
  t?: number;
}

/** 由每格的毫秒數組成影格表 */
export function frameTable(ms: readonly number[]): FrameSpec[] {
  return ms.map((v) => ({ ms: v }));
}

/**
 * 每格 1000 ÷ fps 毫秒的影格表；給 holdMs 時最後一格改成停留這麼久（打字機的停留格）。
 * count ≤ 0 時回傳空表。
 */
export function uniformFrames(
  count: number,
  fps: number,
  { holdMs }: { holdMs?: number } = {},
): FrameSpec[] {
  const n = Math.max(0, Math.floor(count));
  const each = 1000 / fps;
  return Array.from({ length: n }, (_, i) => ({
    ms: i === n - 1 && holdMs !== undefined ? holdMs : each,
  }));
}

/** 影格表的總長（秒） */
export function frameTableDuration(frames: readonly FrameSpec[]): number {
  let ms = 0;
  for (const f of frames) ms += Math.max(0, f.ms);
  return ms / 1000;
}

/** 每一格開始的時間（秒） */
export function frameStartTimes(frames: readonly FrameSpec[]): number[] {
  const out: number[] = [];
  let ms = 0;
  for (const f of frames) {
    out.push(ms / 1000);
    ms += Math.max(0, f.ms);
  }
  return out;
}

/** 匯出時第 i 格傳給 render 的時間（FrameSpec.t，或這一格開始的時間） */
export function frameRenderTimes(frames: readonly FrameSpec[]): number[] {
  const starts = frameStartTimes(frames);
  return frames.map((f, i) => f.t ?? starts[i]);
}

/**
 * t 秒時正在顯示的影格（預覽用）。t 在交界上時取後面那一格；超出總長時取最後一格、小於 0 取第一格。
 * 空表回傳 −1。
 */
export function frameIndexAt(frames: readonly FrameSpec[], t: number): number {
  if (!frames.length) return -1;
  const ms = t * 1000 + 1e-6;
  let acc = 0;
  for (let i = 0; i < frames.length; i++) {
    acc += Math.max(0, frames[i].ms);
    if (ms < acc) return i;
  }
  return frames.length - 1;
}

/**
 * 把影格表換成編碼器的整數 ticks（每秒 ticksPerSecond 個）：以累計時間四捨五入取每格的邊界，
 * 所以總長最準；每格至少 1 tick，太短的格借用的時間從後面的格扣回。
 * 例：12 FPS（83.33 ms）、毫秒計 → 83、84、83、83、84…
 */
export function frameTableTicks(frames: readonly FrameSpec[], ticksPerSecond: number): number[] {
  const out: number[] = [];
  let accMs = 0;
  let last = 0;
  for (const f of frames) {
    accMs += Math.max(0, f.ms);
    const edge = Math.max(last + 1, Math.round((accMs * ticksPerSecond) / 1000));
    out.push(edge - last);
    last = edge;
  }
  return out;
}

/**
 * GIF 的延遲（1/100 秒）：以累計時間四捨五入，每格至少 2/100 秒（瀏覽器把更短的延遲當成 1/10 秒），
 * 補上的時間從後面的格扣回。與 core/encode 的 GifEncoder 的算法相同（給預覽、檢查用）。
 */
export function gifDelaysCs(frames: readonly FrameSpec[]): number[] {
  const out: number[] = [];
  let accMs = 0;
  let last = 0;
  for (const f of frames) {
    accMs += Math.max(0, f.ms);
    const edge = Math.max(last + 2, Math.round(accMs / 10));
    out.push(edge - last);
    last = edge;
  }
  return out;
}
