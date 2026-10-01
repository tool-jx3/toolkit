/**
 * G2（轉場與動態）的影格取樣與延遲：
 * - 影格數「四捨五入、至少 2」；進度型含頭尾（k ÷ (n − 1)）、循環型 k ÷ n；
 * - 延遲：每格相同（小數毫秒）或「總長拆成整數毫秒、餘數給前面的格」；
 * - 轉場：停留加在某一格、蓋上再揭開共 2n − 1 格、倒著播放時停留移到第一格。
 *
 * 結果都是 FrameSpec（AnimationSource.frames），exportAnimation 照表匯出、預覽用 frameIndexAt 找目前的格。
 * core/timeline 原本的 frameCount／frameTime（無條件進位、i ÷ fps）給一般動畫用，兩者不要混用。
 */
import { type FrameSpec, frameIndexAt, frameTableDuration } from './frames';
import type { AnimationSource, Ctx2D } from './source';
import type { TimelineSegment } from './timeline';

/**
 * 一段動作的影格數：秒數 × fps 四捨五入、至少 min（預設 2）。
 * 例：0.7 秒 × 24 → 17；0.55 × 24 → 13；0.35 × 24 → 8；0.1 × 12 → 2；2.5 × 24 → 60；1.3 × 24 → 31。
 */
export function actionFrameCount(seconds: number, fps: number, min = 2): number {
  return Math.max(min, Math.round(seconds * fps + 1e-9));
}

/**
 * 第 k 格（共 n 格）的進度。
 * - 'ends'（進度型，含頭尾）：k ÷ (n − 1)，第一格 0、最後一格 1；
 * - 'loop'（循環型，無縫）：k ÷ n，最後一格是 1 的前一步，接回第一格不重複。
 */
export function sampleProgress(k: number, n: number, sampling: 'ends' | 'loop' = 'ends'): number {
  if (sampling === 'loop') return n > 0 ? k / n : 0;
  return n > 1 ? k / (n - 1) : 0;
}

/**
 * 總長拆成 n 格的整數毫秒：平均分配、除不盡的餘數由前面的格各多 1 ms；每格至少 minMs（預設 10）。
 * 例：2500 ms、60 格 → 前 40 格 42、後 20 格 41；2000 ms、120 格 → 前 80 格 17、後 40 格 16。
 */
export function splitDurationMs(totalMs: number, n: number, minMs = 10): number[] {
  const count = Math.max(0, Math.floor(n));
  if (!count) return [];
  const total = Math.max(0, Math.round(totalMs));
  const base = Math.floor(total / count);
  const extra = total - base * count;
  return Array.from({ length: count }, (_, i) => Math.max(minMs, base + (i < extra ? 1 : 0)));
}

/** 均勻取樣的一格：FrameSpec（ms＝延遲、t＝render 的時間）＋進度 */
export interface SampledFrame extends FrameSpec {
  ms: number;
  /** 傳給 render 的時間（秒）＝ progress × duration */
  t: number;
  /** 0～1 */
  progress: number;
}

export interface SampledFramesOptions {
  /** 總長（秒） */
  duration: number;
  fps: number;
  /** 'ends'（預設，含頭尾）或 'loop'（無縫循環） */
  sampling?: 'ends' | 'loop';
  /**
   * 延遲：'even'（預設）每格 duration ÷ n（小數毫秒，編碼器以累計時間四捨五入，總長不漂移）；
   * 'integer'：總長四捨五入成整數毫秒，拆成整數、餘數給前面的格（splitDurationMs）。
   */
  delays?: 'even' | 'integer';
  /** 'integer' 時每格至少幾毫秒（預設 10） */
  minMs?: number;
}

/**
 * 均勻取樣的影格表：影格數＝actionFrameCount(duration, fps)。
 * 例：讀取動畫的進度型 4.05 秒 12 fps → 49 格、每格約 82.65 ms、第 k 格畫 k ÷ 48 × 4.05 秒；
 * 動態背景 2.5 秒 24 fps、整數延遲 → 60 格（前 40 格 42 ms、後 20 格 41 ms）。
 */
export function sampledFrames({
  duration,
  fps,
  sampling = 'ends',
  delays = 'even',
  minMs = 10,
}: SampledFramesOptions): SampledFrame[] {
  const n = actionFrameCount(duration, fps);
  const ms =
    delays === 'integer'
      ? splitDurationMs(duration * 1000, n, minMs)
      : Array.from({ length: n }, () => (duration * 1000) / n);
  return ms.map((v, k) => {
    const progress = sampleProgress(k, n, sampling);
    return { ms: v, t: progress * duration, progress };
  });
}

/** 轉場影格（去程或回程的一格） */
export interface TransitionFrame extends FrameSpec {
  ms: number;
  /** 時間進度 0～1（去程第 k 格＝k ÷ (n − 1)；回程由 (n − 2)/(n − 1) 遞減到 0）。畫面要再套速度曲線 */
  progress: number;
  /** 'go'＝去程、'back'＝回程（蓋上再揭開的後半） */
  leg: 'go' | 'back';
  /** 在這一程裡是第幾格（0 起） */
  step: number;
}

export interface TransitionFramesOptions {
  /** 一段動作的秒數 */
  duration: number;
  fps: number;
  /** 停留（毫秒）：加在去程最後一格（來回時就是完全蓋上的那一格） */
  holdMs?: number;
  /** 來回（蓋上再揭開）：去程 n 格＋回程 n − 1 格（不重複終點），共 2n − 1 格 */
  roundTrip?: boolean;
  /** 倒著播放：整個序列（含每格延遲）前後顛倒，停留跑到第一格 */
  reverse?: boolean;
}

/**
 * 轉場的影格表：n＝actionFrameCount(duration, fps)，每格 1000 ÷ fps 毫秒，去程第 k 格的時間進度＝k ÷ (n − 1)。
 * 例：0.7 秒 24 fps 停 600 ms → 17 格，最後一格 641.67 ms；來回 → 33 格，第 17 格停留。
 * 每格的 t 不填（＝這一格開始的時間）；用 sequenceSource 包成 AnimationSource 時，render 會拿到這一格的資料。
 */
export function transitionFrames({
  duration,
  fps,
  holdMs = 0,
  roundTrip = false,
  reverse = false,
}: TransitionFramesOptions): TransitionFrame[] {
  const n = actionFrameCount(duration, fps);
  const each = 1000 / fps;
  const out: TransitionFrame[] = [];
  for (let k = 0; k < n; k++) {
    out.push({
      ms: each + (k === n - 1 ? Math.max(0, holdMs) : 0),
      progress: sampleProgress(k, n),
      leg: 'go',
      step: k,
    });
  }
  if (roundTrip) {
    for (let k = n - 2, step = 0; k >= 0; k--, step++) {
      out.push({ ms: each, progress: sampleProgress(k, n), leg: 'back', step });
    }
  }
  return reverse ? out.reverse() : out;
}

export interface ExportEstimate {
  frames: number;
  /** 總長（秒） */
  duration: number;
  /** 每格平均幾毫秒 */
  msPerFrame: number;
  /** 寬 × 高 × 影格數 */
  pixels: number;
  /** 未壓縮的影格資料量（寬 × 高 × 4 × 影格數，位元組） */
  rawBytes: number;
}

/** 匯出前的預估（給預估列與處理量上限用） */
export function estimateExport({
  width,
  height,
  frames,
  duration,
}: {
  width: number;
  height: number;
  frames: number;
  duration: number;
}): ExportEstimate {
  const n = Math.max(0, Math.round(frames));
  const pixels = Math.max(0, width) * Math.max(0, height) * n;
  return {
    frames: n,
    duration,
    msPerFrame: n > 0 ? (duration * 1000) / n : 0,
    pixels,
    rawBytes: pixels * 4,
  };
}

export interface SequenceSourceOptions<F extends FrameSpec> {
  width: number;
  height: number;
  frames: readonly F[];
  /** 畫第 index 格（預覽與匯出共用） */
  renderFrame(ctx: Ctx2D, frame: F, index: number): void | Promise<void>;
  prepare?: () => Promise<void>;
  /** 代表畫面（單張 PNG、APNG 預設圖）是第幾格（預設最後一格） */
  stillIndex?: number;
  segments?: TimelineSegment[];
}

/**
 * 把影格表包成 AnimationSource：duration＝各格延遲的總和，render(ctx, t) 畫「t 秒時正在顯示的那一格」。
 * 預覽直接 drawFrame(ctx, source, playback.time)；匯出照表逐格輸出（每格的 t＝開始時間）。
 */
export function sequenceSource<F extends FrameSpec>({
  width,
  height,
  frames,
  renderFrame,
  prepare,
  stillIndex,
  segments,
}: SequenceSourceOptions<F>): AnimationSource {
  const starts: number[] = [];
  let acc = 0;
  for (const f of frames) {
    starts.push(acc / 1000);
    acc += Math.max(0, f.ms);
  }
  const still = Math.max(0, Math.min(frames.length - 1, stillIndex ?? frames.length - 1));
  /* 影格表的 t 一律用開始時間（render 以時間找回格子） */
  const table = frames.map((f, i) => ({ ms: f.ms, t: starts[i] }));
  return {
    width,
    height,
    duration: frameTableDuration(frames),
    frames: table,
    stillTime: starts[still] ?? 0,
    segments,
    prepare,
    render(ctx, t) {
      const i = frameIndexAt(frames, t);
      if (i < 0) return;
      return renderFrame(ctx, frames[i], i);
    },
  };
}
