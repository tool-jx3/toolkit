/**
 * 抖動的時間函式（lyric-fx 規格 3.3、3.7）。原作每隔 P 毫秒替每個字換一個 −I～I 的整數目標，
 * 位置往目標靠近 30%（s ← s ＋ (目標 − s) × 0.3，從 0 開始）。展開後第 K 次更新後的位置是
 * Σ 0.3 × 0.7^(K − k) × 目標(k)；新版取最近 24 次（截掉的部分 < 0.0002 × I），
 * 目標由「這一句的雜湊、第幾個字、第幾次更新、哪一軸」決定，所以任何時間都能直接算出來（逐格匯出與預覽相同）。
 */
import { mix32, randintOf } from './random';

/** 取最近幾次更新 */
export const JITTER_WINDOW = 24;
/** 每次往目標靠近的比例 */
export const JITTER_EASE = 0.3;

const WEIGHTS = Array.from(
  { length: JITTER_WINDOW },
  (_, d) => JITTER_EASE * (1 - JITTER_EASE) ** d,
);

export interface JitterSpec {
  /** 開始（秒）：更新在 start ＋ k × period（k ≥ 1） */
  start: number;
  /** 更新間隔（秒） */
  period: number;
  /** 第一次算數的更新（之前的更新不動：原作還沒有字時不更新） */
  firstTick: number;
  /** 目標的範圍 −I～I（整數；0＝不抖） */
  intensity: number;
  /** 這一句的雜湊（hash32(種子, 鍵, 重抽次數)） */
  lineHash: number;
}

/** 第 k 次更新、第 m 個字、axis（0＝x、1＝y）的目標 */
export const jitterTarget = (
  lineHash: number,
  m: number,
  k: number,
  axis: 0 | 1,
  intensity: number,
): number => randintOf(mix32(lineHash, m, k, axis), -intensity, intensity);

/** 時間 t 已經做了幾次更新（浮點誤差：剛好在更新的時間點時算已經更新） */
export const jitterTicks = (spec: Pick<JitterSpec, 'start' | 'period'>, t: number): number =>
  spec.period > 0 ? Math.floor((t - spec.start) / spec.period + 1e-9) : 0;

/** 時間 t 第 m 個字的抖動（px） */
export function jitterAt(
  spec: JitterSpec,
  m: number,
  t: number,
  out: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  out.x = 0;
  out.y = 0;
  const I = Math.max(0, Math.round(spec.intensity));
  if (!I) return out;
  const K = jitterTicks(spec, t);
  const k0 = Math.max(Math.max(1, spec.firstTick), K - JITTER_WINDOW + 1);
  for (let k = k0; k <= K; k++) {
    const w = WEIGHTS[K - k];
    out.x += w * jitterTarget(spec.lineHash, m, k, 0, I);
    out.y += w * jitterTarget(spec.lineHash, m, k, 1, I);
  }
  return out;
}
