/**
 * 各個聲音共用的組裝小工具：產生某種雜訊的一個聲道、把單聲道疊到立體聲、把穩定的聲音正規化到固定的均方根。
 */
import {
  type Biquad,
  brownInPlace,
  fillWhite,
  filterPeriodic,
  pinkInPlace,
  rms,
  scale,
} from './dsp';
import type { RenderContext } from './types';

export type NoiseColor = 'white' | 'pink' | 'brown';

/** 一個聲道的雜訊（環狀），可以接著套濾波器 */
export function noise(
  ctx: RenderContext,
  color: NoiseColor,
  filters: readonly Biquad[] = [],
): Float32Array {
  const buf = fillWhite(new Float32Array(ctx.n), ctx.rng);
  if (color === 'pink') pinkInPlace(buf);
  else if (color === 'brown') brownInPlace(buf);
  if (filters.length) filterPeriodic(buf, filters, warmSamples(ctx));
  return buf;
}

/** 濾波器的暖機長度：0.5 秒（最多整段） */
export const warmSamples = (ctx: RenderContext): number =>
  Math.min(ctx.n, Math.round(ctx.sampleRate * 0.5));

/** 把單聲道加到輸出（立體聲時依 pan 分配；pan 用等功率） */
export function addMono(ctx: RenderContext, mono: Float32Array, gain = 1, pan = 0): void {
  const { left, right } = ctx;
  if (!right) {
    for (let i = 0; i < left.length; i++) left[i] += mono[i] * gain;
    return;
  }
  const a = ((Math.max(-1, Math.min(1, pan)) + 1) * Math.PI) / 4;
  const gl = Math.cos(a) * gain;
  const gr = Math.sin(a) * gain;
  for (let i = 0; i < left.length; i++) {
    left[i] += mono[i] * gl;
    right[i] += mono[i] * gr;
  }
}

/**
 * 立體聲的「一層」：左右各自的雜訊（彼此獨立，聽起來寬）；單聲道的聲音只產生一個。
 * make 產生一個聲道（每次呼叫都用新的亂數）。
 */
export function addLayer(ctx: RenderContext, make: () => Float32Array, gain = 1): void {
  if (!ctx.right) {
    const m = make();
    for (let i = 0; i < m.length; i++) ctx.left[i] += m[i] * gain;
    return;
  }
  const l = make();
  for (let i = 0; i < l.length; i++) ctx.left[i] += l[i] * gain;
  const r = make();
  for (let i = 0; i < r.length; i++) ctx.right[i] += r[i] * gain;
}

/** 把一個聲道正規化到均方根 target（穩定的聲音，例如雜訊：音色改了音量不變） */
export function normalizeChannel(buf: Float32Array, target: number): Float32Array {
  const r = rms([buf]);
  return r > 1e-9 ? scale(buf, target / r) : buf;
}

/** 整個輸出正規化到均方根 target */
export function normalizeOutput(ctx: RenderContext, target: number): void {
  const chans = ctx.right ? [ctx.left, ctx.right] : [ctx.left];
  const r = rms(chans);
  if (r > 1e-9) for (const c of chans) scale(c, target / r);
}

/** 0～100 → 0～1 */
export const unit = (v: number | undefined, fallback = 50): number =>
  Math.max(0, Math.min(1, (v ?? fallback) / 100));

/** 對數內插：u＝0 時 a、u＝1 時 b */
export const logLerp = (a: number, b: number, u: number): number => a * (b / a) ** u;

/** 線性內插 */
export const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
