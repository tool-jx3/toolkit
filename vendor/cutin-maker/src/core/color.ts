import type { Box, ColorRamp, ColorSpec } from './types';

export type RGB = [number, number, number];

/** '#rgb' / '#rrggbb' / 'rgb(r,g,b)' を受ける */
export function parseColor(c: string): RGB {
  const s = c.trim();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return [parseInt(hex[0] + hex[0], 16), parseInt(hex[1] + hex[1], 16), parseInt(hex[2] + hex[2], 16)];
    }
    return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = m[1].split(',').map((v) => parseFloat(v));
    return [p[0], p[1], p[2]];
  }
  return [0, 0, 0];
}

export function rgbToCss([r, g, b]: RGB): string {
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

export function toHex([r, g, b]: RGB): string {
  const h = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function lerpRGB(a: RGB, b: RGB, k: number): RGB {
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/** h∈[0,360) s,l∈[0,1] */
export function hslToRgb(h: number, s: number, l: number): RGB {
  const hh = ((h % 360) + 360) % 360 / 60;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}

type Stop = { at: number; rgb: RGB };

/** at 昇順の stop 列から u∈[0,1] の色を取る。範囲外はクランプ */
function sampleStops(stops: Stop[], u: number): RGB {
  const x = Math.max(0, Math.min(1, u));
  if (x <= stops[0].at) return stops[0].rgb;
  const last = stops[stops.length - 1];
  if (x >= last.at) return last.rgb;
  for (let i = 1; i < stops.length; i++) {
    if (x <= stops[i].at) {
      const a = stops[i - 1];
      const b = stops[i];
      const k = b.at === a.at ? 0 : (x - a.at) / (b.at - a.at);
      return lerpRGB(a.rgb, b.rgb, k);
    }
  }
  return last.rgb;
}

/**
 * angle（度）方向のグラデーション線を box に対して求める。
 * 0=左→右, 90=上→下。box は「変形後のキャンバス座標」で渡すこと。
 */
export function gradientLine(box: Box, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  // 矩形を方向ベクトルへ射影した半幅
  const half = (Math.abs(dx) * box.w + Math.abs(dy) * box.h) / 2;
  return { x0: cx - dx * half, y0: cy - dy * half, x1: cx + dx * half, y1: cy + dy * half };
}

const GRADIENT_STOPS = 25;

/** sample() を等間隔にサンプリングして CanvasGradient を組む共通実装 */
function buildGradient(ramp: ColorRamp, angle: number, ctx: CanvasRenderingContext2D, box: Box, t: number): CanvasGradient {
  const { x0, y0, x1, y1 } = gradientLine(box, angle);
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < GRADIENT_STOPS; i++) {
    const u = i / (GRADIENT_STOPS - 1);
    g.addColorStop(u, ramp.sample(u, t));
  }
  return g;
}

export const METAL_STOPS: Record<'gold' | 'silver', Array<{ at: number; color: string }>> = {
  gold: [
    { at: 0.0, color: '#6b4410' },
    { at: 0.35, color: '#ffe9a0' },
    { at: 0.5, color: '#c98a1e' },
    { at: 0.62, color: '#fffdf0' },
    { at: 1.0, color: '#7a5210' },
  ],
  silver: [
    { at: 0.0, color: '#6a6a6a' },
    { at: 0.35, color: '#f2f2f2' },
    { at: 0.5, color: '#9a9a9a' },
    { at: 0.62, color: '#ffffff' },
    { at: 1.0, color: '#707070' },
  ],
};

export function createRamp(spec: ColorSpec): ColorRamp {
  switch (spec.kind) {
    case 'solid': {
      const ramp: ColorRamp = {
        kind: 'solid',
        sample: () => spec.color,
        toGradient: () => spec.color,
      };
      return ramp;
    }
    case 'rainbow': {
      // speed は整数のみ許可（t=0 と t=1 が一致する条件）
      const speed = Math.round(spec.speed);
      const cycles = spec.cycles;
      const ramp: ColorRamp = {
        kind: 'rainbow',
        sample: (u, t) => rgbToCss(hslToRgb((u * cycles + t * speed) * 360, spec.saturation, spec.lightness)),
        toGradient: (ctx, box, t) => buildGradient(ramp, spec.angle, ctx, box, t),
      };
      return ramp;
    }
    case 'linear': {
      const stops: Stop[] = [...spec.stops]
        .sort((a, b) => a.at - b.at)
        .map((s) => ({ at: s.at, rgb: parseColor(s.color) }));
      const scroll = Math.round(spec.scrollSpeed);
      const ramp: ColorRamp = {
        kind: 'linear',
        sample: (u, t) => {
          if (scroll === 0) return rgbToCss(sampleStops(stops, u));
          // スクロールする場合は端の不連続を避けるため 0..1 を巡回させる
          const x = (((u - t * scroll) % 1) + 1) % 1;
          return rgbToCss(sampleStops(stops, x));
        },
        toGradient: (ctx, box, t) => buildGradient(ramp, spec.angle, ctx, box, t),
      };
      return ramp;
    }
    case 'metal': {
      const stops: Stop[] = METAL_STOPS[spec.base].map((s) => ({ at: s.at, rgb: parseColor(s.color) }));
      const ramp: ColorRamp = {
        kind: 'metal',
        // 金属感は静止しているほうが自然なので時間変化させない
        sample: (u) => rgbToCss(sampleStops(stops, u)),
        toGradient: (ctx, box, t) => buildGradient(ramp, spec.angle, ctx, box, t),
      };
      return ramp;
    }
  }
}

/** 塗りを Canvas の fillStyle/strokeStyle 用に解決する */
export function resolvePaint(
  spec: ColorSpec,
  ctx: CanvasRenderingContext2D,
  box: Box,
  t: number,
): string | CanvasGradient {
  return createRamp(spec).toGradient(ctx, box, t);
}
