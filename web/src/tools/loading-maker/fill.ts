/**
 * 填滿的顏色：漸層色標（F74 的新增規則）、漸層線（F75，0°＝由左到右）、漸層流動（F77）、結尾動作的粒子顏色。純函式。
 */
import { formatHex, parseColor } from '@/core/color';
import type { Bounds } from './geometry';
import { type GradientStopSetting, type LmSettings, MAX_STOPS, MIN_STOPS } from './settings';

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const mod = (v: number, m: number) => ((v % m) + m) % m;

/** 兩個顏色的中間色（t＝0～1），#rrggbb */
export function mixHex(a: string, b: string, t: number): string {
  const ca = parseColor(a) ?? { r: 0, g: 0, b: 0, a: 1 };
  const cb = parseColor(b) ?? { r: 0, g: 0, b: 0, a: 1 };
  const k = clamp(t, 0, 1);
  return formatHex({
    r: Math.round(ca.r + (cb.r - ca.r) * k),
    g: Math.round(ca.g + (cb.g - ca.g) * k),
    b: Math.round(ca.b + (cb.b - ca.b) * k),
    a: 1,
  });
}

/**
 * 新增色標（F74）：插在間隔最大的兩色標正中間（位置取到 0.1）、顏色取兩者的中間色；滿 7 個時不加（回傳原陣列）。
 */
export function insertStop(stops: readonly GradientStopSetting[]): GradientStopSetting[] {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  if (sorted.length >= MAX_STOPS || sorted.length < 2) return [...stops];
  let at = 1;
  for (let i = 2; i < sorted.length; i++)
    if (sorted[i].pos - sorted[i - 1].pos > sorted[at].pos - sorted[at - 1].pos) at = i;
  const a = sorted[at - 1];
  const b = sorted[at];
  const next = {
    pos: Math.round(((a.pos + b.pos) / 2) * 10) / 10,
    color: mixHex(a.color, b.color, 0.5),
  };
  return [...sorted.slice(0, at), next, ...sorted.slice(at)];
}

/** 刪除色標（剩 2 個時不能刪） */
export const removeStop = (
  stops: readonly GradientStopSetting[],
  index: number,
): GradientStopSetting[] =>
  stops.length <= MIN_STOPS ? [...stops] : stops.filter((_, i) => i !== index);

/**
 * 漸層線（F75）：角度 0＝由左到右、90＝由上到下、180＝由右到左；長度剛好跨過整條（寬、高依方向投影）。
 */
export function gradientLine(b: Bounds, angleDeg: number) {
  const r = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(r);
  const dy = Math.sin(r);
  const half = Math.max(1, Math.abs(dx) * (b.width / 2) + Math.abs(dy) * (b.height / 2));
  return {
    x0: b.cx - dx * half,
    y0: b.cy - dy * half,
    x1: b.cx + dx * half,
    y1: b.cy + dy * half,
    length: half * 2,
  };
}

export interface ColorEntry {
  offset: number;
  color: string;
}

/** 靜止的漸層：色標（0～1）；第一個色標不在 0、最後一個不在 1 時補上頭尾 */
export function staticStops(stops: readonly GradientStopSetting[]): ColorEntry[] {
  const sorted = [...stops].sort((a, b) => a.pos - b.pos);
  const out: ColorEntry[] = [];
  if (sorted[0] && sorted[0].pos > 0) out.push({ offset: 0, color: sorted[0].color });
  for (const s of sorted) out.push({ offset: clamp(s.pos / 100, 0, 1), color: s.color });
  const last = sorted[sorted.length - 1];
  if (last && last.pos < 100) out.push({ offset: 1, color: last.color });
  return out;
}

/**
 * 流動的漸層（F77）：色標沿漸層方向循環平移 phase（一輪＝1），首尾色相接處是硬接縫；
 * seamHalf（0～0.24）＞ 0 時接縫兩側各留 seamHalf 的寬度漸變（顏色暈染讓接縫變柔）。
 * 頭尾（0、1）的顏色從展開後的色標取樣。
 */
export function flowStops(
  stops: readonly GradientStopSetting[],
  phase: number,
  seamHalf: number,
): ColorEntry[] {
  const src = stops
    .map((s, order) => ({ pos: clamp(s.pos / 100, 0, 1), color: s.color, order }))
    .sort((a, b) => a.pos - b.pos || a.order - b.order);
  if (!src.length)
    return [
      { offset: 0, color: '#000000' },
      { offset: 1, color: '#000000' },
    ];
  if (src.length === 1)
    return [
      { offset: 0, color: src[0].color },
      { offset: 1, color: src[0].color },
    ];
  const first = src[0].color;
  const last = src[src.length - 1].color;
  const eps = 1e-6;
  const interior = src.filter((s) => s.pos > eps && s.pos < 1 - eps);
  const firstGap = interior.length ? interior[0].pos : 0.5;
  const lastGap = interior.length ? 1 - interior[interior.length - 1].pos : 0.5;
  const half = clamp(seamHalf, 0, Math.max(0, Math.min(0.24, firstGap * 0.45, lastGap * 0.45)));
  const p = mod(phase, 1);
  const expanded: { pos: number; color: string; order: number }[] = [];
  for (let c = -2; c <= 2; c++) {
    const seam = p + c;
    expanded.push({ pos: seam - half, color: last, order: -2 });
    expanded.push({ pos: seam + half, color: first, order: -1 });
    for (const s of interior) expanded.push({ pos: s.pos + p + c, color: s.color, order: s.order });
  }
  expanded.sort((a, b) => a.pos - b.pos || a.order - b.order);
  const sample = (x: number, side: 'left' | 'right'): string => {
    const i = expanded.findIndex((e) => e.pos >= x);
    if (i < 0) return expanded[expanded.length - 1].color;
    if (i === 0) return expanded[0].color;
    if (expanded[i].pos === x) {
      let a = i;
      let b = i;
      while (a > 0 && expanded[a - 1].pos === x) a--;
      while (b + 1 < expanded.length && expanded[b + 1].pos === x) b++;
      return expanded[side === 'right' ? b : a].color;
    }
    const l = expanded[i - 1];
    const r = expanded[i];
    return mixHex(l.color, r.color, (x - l.pos) / Math.max(eps, r.pos - l.pos));
  };
  const out: ColorEntry[] = [{ offset: 0, color: sample(0, 'right') }];
  for (const e of expanded) if (e.pos > 0 && e.pos < 1) out.push({ offset: e.pos, color: e.color });
  out.push({ offset: 1, color: sample(1, 'left') });
  return out;
}

/** 流動的相位：每 1 ÷ 速度 秒一輪，反向時往起點方向 */
export const flowPhase = (s: LmSettings, t: number): number =>
  mod(t * s.bar.flowSpeed * (s.bar.flowReverse ? -1 : 1), 1);

/** 結尾動作的粒子、光線顏色：漸層時用各色標，單色時用填滿色 */
export const vanishColors = (s: LmSettings): string[] =>
  s.bar.fill === 'gradient' && s.bar.stops.length
    ? s.bar.stops.map((x) => x.color)
    : [s.loader.fillColor];
