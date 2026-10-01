/**
 * 填色（Paint）：單色、漸層（雙色等）、金屬五段、會流動的彩虹、會捲動的斜紋。
 * 範圍（box）通常是整段文字的外接框（不是墨跡），所以漸層橫跨整段、每個字接得起來。
 * 時間 t 是循環的進度（0～1）：彩虹每循環往左流動一個範圍寬，斜紋每循環沿斜向移動一個紋路寬。
 */
import type { Ctx2D } from './layers';

export interface PaintBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PaintStop {
  /** 0～1 */
  offset: number;
  color: string;
}

export type MetalTone = 'gold' | 'silver';

export type Paint =
  | { kind: 'solid'; color: string }
  /** 由上而下（angle 不給）或指定角度（度，同 CSS：180＝由上而下、90＝由左而右）的漸層 */
  | { kind: 'gradient'; stops: readonly PaintStop[]; angle?: number }
  /** 由上而下「暗—亮—中—最亮—暗」五段的金屬光澤；colors 可自訂五個顏色 */
  | { kind: 'metal'; tone?: MetalTone; colors?: readonly [string, string, string, string, string] }
  /**
   * 由左而右色相繞一整圈的彩虹（紅→黃→綠→青→藍→洋紅→紅）；flow（預設 true）時每循環往左流動一個範圍寬。
   * saturation／lightness 為 HSL 的百分比（預設 100／55；背景用的淡彩虹約 50／80）。
   */
  | { kind: 'rainbow'; saturation?: number; lightness?: number; flow?: boolean }
  /**
   * 斜紋：兩色相間、紋路的方向 angle（度，從水平往上量；預設 45＝由左下往右上「／」），一組紋路（兩色各一條）寬 width px；
   * flow（預設 true）時每循環沿紋路的垂直方向移動一組紋路寬（無縫循環）。
   */
  | {
      kind: 'stripes';
      colors: readonly [string, string];
      width: number;
      angle?: number;
      flow?: boolean;
    };

/** 金屬五段的預設色（暗、亮、中、最亮、暗） */
export const METAL_COLORS: Record<MetalTone, readonly [string, string, string, string, string]> = {
  gold: ['#6e4a0c', '#f6d77e', '#c39232', '#fff5cf', '#5d3d08'],
  silver: ['#4d5560', '#e9eef4', '#9aa4b1', '#ffffff', '#3d444d'],
};
/** 金屬五段的位置 */
export const METAL_OFFSETS = [0, 0.32, 0.52, 0.74, 1] as const;

/** 彩虹在 u（0～1，範圍內由左而右）、時間 t 的色相（度） */
export function rainbowHue(u: number, t = 0): number {
  const h = ((u + t) % 1) * 360;
  return h < 0 ? h + 360 : h;
}

/**
 * 彩虹漸層的色標：範圍內由左而右色相繞一圈，往左流動 t 個範圍寬（t 每增加 1 回到原樣）。
 * 每 30° 一個色標，交界處補上同色的兩端，所以任何 t 都是平滑一圈。
 */
export function rainbowStops(
  t = 0,
  { saturation = 100, lightness = 55 }: { saturation?: number; lightness?: number } = {},
): PaintStop[] {
  const shift = ((t % 1) + 1) % 1;
  const color = (u: number) =>
    `hsl(${rainbowHue(u, shift).toFixed(2)} ${saturation}% ${lightness}%)`;
  const stops: PaintStop[] = [{ offset: 0, color: color(0) }];
  /* 色相正好是 30° 倍數的位置 */
  const first = Math.ceil(shift * 12 + 1e-9) / 12 - shift;
  for (let u = first; u < 1 - 1e-9; u += 1 / 12) stops.push({ offset: u, color: color(u) });
  stops.push({ offset: 1, color: color(1) });
  return stops;
}

const DEG = Math.PI / 180;

/** CSS 角度的線性漸層端點（180°＝由上而下，涵蓋整個框） */
function gradientLine(box: PaintBox, angleDeg: number) {
  const a = angleDeg * DEG;
  const dx = Math.sin(a);
  const dy = -Math.cos(a);
  const half = (Math.abs(box.w * dx) + Math.abs(box.h * dy)) / 2;
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}

let stripeTile: { key: string; canvas: HTMLCanvasElement | OffscreenCanvas } | null = null;

function tileCanvas(size: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    return c;
  }
  return new OffscreenCanvas(size, size);
}

/** 斜紋的圖樣（一格＝一組紋路；以 setTransform 旋轉、縮放與流動） */
function stripePattern(
  ctx: Ctx2D,
  paint: Extract<Paint, { kind: 'stripes' }>,
  box: PaintBox,
  t: number,
): CanvasPattern | string {
  const [a, b] = paint.colors;
  const key = `${a}|${b}`;
  const N = 64;
  if (!stripeTile || stripeTile.key !== key) {
    const canvas = tileCanvas(N);
    const c = canvas.getContext('2d') as Ctx2D | null;
    if (!c) return a;
    c.fillStyle = a;
    c.fillRect(0, 0, N / 2, N);
    c.fillStyle = b;
    c.fillRect(N / 2, 0, N / 2, N);
    stripeTile = { key, canvas };
  }
  const pattern = ctx.createPattern(stripeTile.canvas as CanvasImageSource, 'repeat');
  if (!pattern) return a;
  const k = Math.max(0.01, paint.width) / N;
  const shift = paint.flow === false ? 0 : (((t % 1) + 1) % 1) * N;
  if (typeof DOMMatrix !== 'undefined' && 'setTransform' in pattern) {
    /* 一格 N px 的直條紋：縮放到 width、轉到斜向（直條往右轉 90 − angle 度）、沿垂直於紋路的方向移動 */
    const m = new DOMMatrix()
      .translate(box.x, box.y)
      .rotate(90 - (paint.angle ?? 45))
      .scale(k, k)
      .translate(shift, 0);
    pattern.setTransform(m);
  }
  return pattern;
}

/**
 * 把 Paint 換成 canvas 的 fillStyle／strokeStyle（範圍 box、時間 t）。
 */
export function paintStyle(
  ctx: Ctx2D,
  paint: Paint,
  box: PaintBox,
  t = 0,
): string | CanvasGradient | CanvasPattern {
  switch (paint.kind) {
    case 'solid':
      return paint.color;
    case 'gradient': {
      const stops = paint.stops.filter((s) => !!s.color);
      if (stops.length < 2) return stops[0]?.color ?? '#ffffff';
      const l = gradientLine(box, paint.angle ?? 180);
      const g = ctx.createLinearGradient(l.x0, l.y0, l.x1, l.y1);
      for (const s of [...stops].sort((p, q) => p.offset - q.offset))
        g.addColorStop(Math.min(1, Math.max(0, s.offset)), s.color);
      return g;
    }
    case 'metal': {
      const colors = paint.colors ?? METAL_COLORS[paint.tone ?? 'gold'];
      const g = ctx.createLinearGradient(0, box.y, 0, box.y + Math.max(1, box.h));
      colors.forEach((c, i) => {
        g.addColorStop(METAL_OFFSETS[i], c);
      });
      return g;
    }
    case 'rainbow': {
      const g = ctx.createLinearGradient(box.x, 0, box.x + Math.max(1, box.w), 0);
      for (const s of rainbowStops(paint.flow === false ? 0 : t, paint))
        g.addColorStop(s.offset, s.color);
      return g;
    }
    case 'stripes':
      return stripePattern(ctx, paint, box, t);
  }
}

/** 填色是不是單色（文字顏色的覆寫、選擇器顯示用） */
export const isSolidPaint = (p: Paint): p is Extract<Paint, { kind: 'solid' }> =>
  p.kind === 'solid';

/** 用一個框填滿（例如彩虹背景、挖空用的底板） */
export function fillBox(ctx: Ctx2D, paint: Paint, box: PaintBox, t = 0): void {
  ctx.fillStyle = paintStyle(ctx, paint, box, t);
  ctx.fillRect(box.x, box.y, box.w, box.h);
}
