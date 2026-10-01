/**
 * 轉場與動態用的速度曲線（G2 共用層）。與 EASE（文字演出的 8 條可選曲線）分開命名：
 * EASE 的名稱是介面上的選項，CURVES 的名稱是數學上的形狀，兩組可以混用（輸入 u ∈ [0, 1]）。
 *
 * 取樣值以規格附件為準（有單元測試）：
 * - scene-transition 3.4：慢進慢出＝smoothstep、加速＝quadIn、減速＝quadOut、彈跳＝bounceOut、
 *   明滅後蓋上＝flicker、雷閃＝lightning、心跳＝heartbeat。
 * - loading-maker「進度曲線」：平滑＝smoothstep、漸快＝cubicIn、漸慢＝cubicOut、慢快慢＝cubicInOut、
 *   階梯＝steps10、彈跳＝bounceOut、不規則＝irregularCurve(種子)。
 * - bg-motion 3.5／3.6：S 形加速＝quadInOut、淡化與轉場的平緩 S 形＝smootherstep。
 */
import { EASE, type EasingFn } from './easing';
import { createRandom } from './random';

const c01 = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u);

/** 3u² − 2u³ */
export const smoothstep: EasingFn = (u) => {
  const x = c01(u);
  return x * x * (3 - 2 * x);
};

/** 6u⁵ − 15u⁴ + 10u³（比 smoothstep 更平緩的 S 形） */
export const smootherstep: EasingFn = (u) => {
  const x = c01(u);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/**
 * n 階的階梯：每 1/n 的時間跳一階（u ∈ [k/n, (k+1)/n) → k/n），u ≥ 1 時才到 1。
 * 例：stepsCurve(10)(0.1) = 0.1、(0.99) = 0.9、(1) = 1。
 */
export function stepsCurve(n: number): EasingFn {
  const k = Math.max(1, Math.round(n));
  return (u) => (u >= 1 ? 1 : u <= 0 ? 0 : Math.floor(u * k + 1e-9) / k);
}

/** 明滅後蓋上（階梯）的平台：[起點, 終點) → 值 */
const FLICKER_STEPS: readonly (readonly [number, number, number])[] = [
  [0, 0.07, 0],
  [0.07, 0.11, 0.85],
  [0.11, 0.19, 0.05],
  [0.19, 0.22, 0.9],
  [0.22, 0.3, 0],
  [0.3, 0.33, 0.7],
  [0.33, 0.44, 0.15],
  [0.44, 0.49, 1],
  [0.49, 0.56, 0.25],
];

/** 明滅後蓋上：前 56% 忽明忽暗的平台（每段至少 3%），之後從 0.25 以 smoothstep 升到 1 */
export const flicker: EasingFn = (u) => {
  const x = c01(u);
  for (const [a, b, v] of FLICKER_STEPS) if (x >= a && x < b) return v;
  return 0.25 + 0.75 * smoothstep((x - 0.56) / 0.44);
};

/** 跳起、停留，再以二次曲線衰減到 0 */
const flash = (x: number, on: number, hold: number, off: number, peak: number): number => {
  if (x < on || x >= off) return 0;
  if (x <= hold) return peak;
  const d = (x - hold) / (off - hold);
  return peak * (1 - d) * (1 - d);
};

/**
 * 雷閃（非單調）：2% 跳到 1 停到 6%、18% 前衰減為 0；20% 跳到 0.6 停到 24%、34% 前衰減為 0；
 * 36% 跳到 1 停到 40%、80% 前慢慢衰減為 0；之後一直是 0。每次跳起至少停 4%（任何 fps 都看得到）。
 */
export const lightning: EasingFn = (u) => {
  const x = c01(u);
  return Math.max(
    flash(x, 0.02, 0.06, 0.18, 1),
    flash(x, 0.2, 0.24, 0.34, 0.6),
    flash(x, 0.36, 0.4, 0.8, 1),
  );
};

/** 以 c 為中心、半寬 w、高 peak 的平滑鼓包：peak × (1 − d²)²，d＝距離 ÷ 半寬 */
const bump = (x: number, c: number, w: number, peak: number): number => {
  const d = (x - c) / w;
  if (d <= -1 || d >= 1) return 0;
  const k = 1 - d * d;
  return peak * k * k;
};

/** 心跳（非單調）：14%（2%～26%）最高 1、40%（28%～52%）最高 0.7，52% 之後是 0 */
export const heartbeat: EasingFn = (u) => {
  const x = c01(u);
  return bump(x, 0.14, 0.12, 1) + bump(x, 0.4, 0.12, 0.7);
};

export interface IrregularCurveOptions {
  /** 時間等分幾段（預設 8） */
  segments?: number;
  /** 每段前進量相對平均的最小、最大倍率（正規化之前；預設 0.55、1.45） */
  min?: number;
  max?: number;
}

/**
 * 依種子產生、永不倒退的不規則曲線：時間等分 segments 段，每段以 smoothstep 前進一段長短不一的量
 * （正規化前為平均的 min～max 倍），總和剛好 1。同一個種子每次相同。
 */
export function irregularCurve(
  seed: number | string,
  { segments = 8, min = 0.55, max = 1.45 }: IrregularCurveOptions = {},
): EasingFn {
  const n = Math.max(1, Math.round(segments));
  const rnd = createRandom(typeof seed === 'string' ? seed : `irregular:${seed}`);
  const steps = Array.from({ length: n }, () => rnd.range(min, max));
  const total = steps.reduce((a, b) => a + b, 0);
  const edges = [0];
  for (const s of steps) edges.push(edges[edges.length - 1] + s / total);
  edges[n] = 1;
  return (u) => {
    const x = c01(u);
    if (x >= 1) return 1;
    const i = Math.min(n - 1, Math.floor(x * n));
    const local = x * n - i;
    return edges[i] + (edges[i + 1] - edges[i]) * smoothstep(local);
  };
}

/** 有名稱的曲線（數學形狀；工具自己決定介面上叫什麼） */
export const CURVES = {
  linear: EASE.linear,
  quadIn: (u: number) => c01(u) ** 2,
  quadOut: (u: number) => 1 - (1 - c01(u)) ** 2,
  /** 二次 S 形（t＝0.25 時 0.125） */
  quadInOut: (u: number) => {
    const x = c01(u);
    return x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2;
  },
  cubicIn: EASE.in,
  cubicOut: EASE.out,
  /** 三次 S 形（t＝0.25 時 0.0625；與 EASE.smooth 相同） */
  cubicInOut: EASE.smooth,
  smoothstep,
  smootherstep,
  bounceOut: EASE.bounce,
  steps10: stepsCurve(10),
  flicker,
  lightning,
  heartbeat,
} satisfies Record<string, EasingFn>;

export type CurveName = keyof typeof CURVES;

export const CURVE_NAMES = Object.keys(CURVES) as CurveName[];

/** 會倒退的曲線（彈跳、明滅、雷閃、心跳）：不能拿來算「幾 % 時到達」 */
export const NON_MONOTONIC_CURVES: readonly CurveName[] = [
  'bounceOut',
  'flicker',
  'lightning',
  'heartbeat',
];

/** 依名稱取曲線；不認得時等速 */
export function getCurve(name: string): EasingFn {
  return (CURVES as Record<string, EasingFn>)[name] ?? CURVES.linear;
}
