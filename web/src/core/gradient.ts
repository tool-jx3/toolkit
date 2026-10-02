/**
 * 漸層：GradientField 的值、轉成 CSS、套到 canvas、取樣。
 */
import { formatHex, parseColor, type Rgba, toCss } from './color';

export interface GradientStop {
  /** 0～1 */
  offset: number;
  /** #rrggbb 或 #rrggbbaa */
  color: string;
}

export interface Gradient {
  kind: 'linear' | 'radial';
  /** 線性漸層的角度（度，0 = 由下往上，90 = 由左往右，同 CSS） */
  angle: number;
  stops: GradientStop[];
}

export const DEFAULT_GRADIENT: Gradient = {
  kind: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: '#7b5ea7' },
    { offset: 1, color: '#f0c36d' },
  ],
};

export const sortStops = <S extends GradientStop>(stops: readonly S[]): S[] =>
  [...stops].sort((a, b) => a.offset - b.offset);

/** CSS 的 background-image 值 */
export function gradientToCss(g: Gradient, forceLinearAngle?: number): string {
  const stops = sortStops(g.stops)
    .map((s) => `${toCss(s.color)} ${+(s.offset * 100).toFixed(2)}%`)
    .join(', ');
  if (g.kind === 'radial' && forceLinearAngle === undefined)
    return `radial-gradient(circle at center, ${stops})`;
  return `linear-gradient(${forceLinearAngle ?? g.angle}deg, ${stops})`;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 建立對應矩形範圍的 CanvasGradient（角度規則與 CSS 相同） */
export function canvasGradient(
  ctx: Ctx,
  g: Gradient,
  x: number,
  y: number,
  w: number,
  h: number,
): CanvasGradient {
  const cx = x + w / 2;
  const cy = y + h / 2;
  let grad: CanvasGradient;
  if (g.kind === 'radial') {
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) / 2);
  } else {
    const rad = (g.angle * Math.PI) / 180;
    const dx = Math.sin(rad);
    const dy = -Math.cos(rad);
    /* CSS 的漸層線長度：讓角落剛好落在 0% 與 100% */
    const half = (Math.abs(w * dx) + Math.abs(h * dy)) / 2;
    grad = ctx.createLinearGradient(cx - dx * half, cy - dy * half, cx + dx * half, cy + dy * half);
  }
  for (const s of sortStops(g.stops))
    grad.addColorStop(Math.min(1, Math.max(0, s.offset)), toCss(s.color));
  return grad;
}

/* ---------- G2：角度換算、漸層流動 ---------- */

/**
 * 「0° 由左到右、90° 由上到下、180° 由右到左」的角度（例如讀取動畫的漸層角度）→ Gradient.angle（CSS：0° 由下往上、90° 由左到右）。
 * 兩種規則差 90°：rightward 0 → CSS 90；rightward 90 → CSS 180。結果在 0～360。
 */
export const cssAngleFromRightward = (deg: number): number => (((deg + 90) % 360) + 360) % 360;

/** CSS 角度 → 「0° 由左到右」的角度（−180～180） */
export function rightwardAngleFromCss(css: number): number {
  const a = ((((css - 90) % 360) + 540) % 360) - 180;
  return a === -180 ? 180 : a;
}

/**
 * 漸層流動：所有色標往終點方向移動 shift（一輪＝1），超出終點的部分從起點接回來；
 * 首尾相接處是硬接縫（最後一色直接換成第一色）。shift 為負時往起點方向。
 */
export function shiftStops(stops: readonly GradientStop[], shift: number): GradientStop[] {
  const sorted = sortStops(stops);
  if (sorted.length < 2) return sorted.map((s) => ({ ...s }));
  const d = ((shift % 1) + 1) % 1;
  if (d === 0) return sorted.map((s) => ({ ...s }));
  const g: Gradient = { kind: 'linear', angle: 0, stops: sorted };
  const at = (o: number) => sampleGradient(g, o);
  const out: GradientStop[] = [{ offset: 0, color: at(1 - d) }];
  for (const s of sorted)
    if (s.offset > 1 - d && s.offset < 1) out.push({ offset: s.offset + d - 1, color: s.color });
  out.push({ offset: d, color: at(1) });
  out.push({ offset: d, color: at(0) });
  for (const s of sorted)
    if (s.offset > 0 && s.offset < 1 - d) out.push({ offset: s.offset + d, color: s.color });
  out.push({ offset: 1, color: at(1 - d) });
  return out;
}

/** t（0～1）位置的顏色 */
export function sampleGradient(g: Gradient, t: number): string {
  const stops = sortStops(g.stops);
  if (!stops.length) return '#000000';
  if (t <= stops[0].offset) return stops[0].color;
  const last = stops[stops.length - 1];
  if (t >= last.offset) return last.color;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1];
    const b = stops[i];
    if (t <= b.offset) {
      const k = b.offset === a.offset ? 0 : (t - a.offset) / (b.offset - a.offset);
      const ca = parseColor(a.color) as Rgba;
      const cb = parseColor(b.color) as Rgba;
      return formatHex({
        r: ca.r + (cb.r - ca.r) * k,
        g: ca.g + (cb.g - ca.g) * k,
        b: ca.b + (cb.b - ca.b) * k,
        a: ca.a + (cb.a - ca.a) * k,
      });
    }
  }
  return last.color;
}
