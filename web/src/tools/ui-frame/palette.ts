/**
 * 自動調色（規格 3.2，自訂）：從一個主色與深色／淺色，算出框底的漸層、框線、內框線、裝飾、文字、文字外框、光暈、質感的顏色；
 * 按鈕的四種狀態（一般、滑過、按下、停用）各自調整亮度與彩度。
 *
 * 在 OKLCH（感知均勻的明度、彩度、色相）裡定明度與彩度，再換回 sRGB（超出色域時降低彩度）；
 * 所以同樣的設定換不同色相時，框底的明暗、文字的對比都差不多。
 */
import { formatHex, parseColor, type Rgba, toCss } from '@/core/color';
import type { ButtonState, Design } from './model';

/* ---------- OKLab ---------- */

export interface Oklch {
  /** 明度 0～1 */
  l: number;
  /** 彩度（0～約 0.37） */
  c: number;
  /** 色相（度） */
  h: number;
}

const toLinear = (v: number) => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number) => {
  const c = v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
  return c * 255;
};

export function rgbToOklch({ r, g, b }: Pick<Rgba, 'r' | 'g' | 'b'>): Oklch {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l_ = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m_ = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s_ = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.hypot(A, B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h };
}

/** OKLCH → 線性 sRGB（不夾範圍） */
function oklchToLinear({ l, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l_ = l + 0.3963377774 * A + 0.2158037573 * B;
  const m_ = l - 0.1055613458 * A - 0.0638541728 * B;
  const s_ = l - 0.0894841775 * A - 1.291485548 * B;
  const L3 = l_ ** 3;
  const M3 = m_ ** 3;
  const S3 = s_ ** 3;
  return [
    4.0767416621 * L3 - 3.3077115913 * M3 + 0.2309699292 * S3,
    -1.2684380046 * L3 + 2.6097574011 * M3 - 0.3413193965 * S3,
    -0.0041960863 * L3 - 0.7034186147 * M3 + 1.707614701 * S3,
  ];
}

const inGamut = (rgb: [number, number, number]) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** OKLCH → sRGB；超出色域時保留明度與色相、降低彩度 */
export function oklchToRgb(color: Oklch, alpha = 1): Rgba {
  const l = Math.max(0, Math.min(1, color.l));
  let c = Math.max(0, color.c);
  let lin = oklchToLinear({ l, c, h: color.h });
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 18; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ l, c: mid, h: color.h }))) lo = mid;
      else hi = mid;
    }
    c = lo;
    lin = oklchToLinear({ l, c, h: color.h });
  }
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(fromLinear(Math.max(0, v)))));
  return { r: to(lin[0]), g: to(lin[1]), b: to(lin[2]), a: Math.max(0, Math.min(1, alpha)) };
}

/* ---------- 配色 ---------- */

export interface Palette {
  /** 框底的漸層（上、中、下；含框底的不透明度） */
  panelTop: string;
  panelMid: string;
  panelBottom: string;
  border: string;
  inner: string;
  ornament: string;
  text: string;
  textEdge: string;
  glow: string;
  sheen: string;
  /** 質感的顏色（含濃度） */
  tint: string;
  shadow: string;
}

/** 數值版（測試與 TyranoScript 的文字顏色用） */
export interface PaletteRgba {
  panelTop: Rgba;
  panelMid: Rgba;
  panelBottom: Rgba;
  border: Rgba;
  inner: Rgba;
  ornament: Rgba;
  text: Rgba;
  textEdge: Rgba;
  glow: Rgba;
  sheen: Rgba;
  tint: Rgba;
  shadow: Rgba;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type PaletteInput = Pick<Design, 'keyColor' | 'polarity' | 'bgOpacity' | 'textureAlpha'>;

export function paletteRgba(d: PaletteInput, state: ButtonState = 'normal'): PaletteRgba {
  const key = rgbToOklch(parseColor(d.keyColor) ?? { r: 200, g: 160, b: 100, a: 1 });
  const { l: L0, h } = key;
  const C0 = key.c;
  const alpha = clamp(d.bgOpacity / 100, 0, 1);
  const tex = clamp(d.textureAlpha / 100, 0, 1);
  /* 停用：彩度幾乎拿掉 */
  const sat = state === 'disabled' ? 0.12 : 1;
  const c = (v: number) => v * sat;
  if (d.polarity === 'dark') {
    const lift = state === 'hover' ? 0.05 : state === 'active' ? -0.035 : 0;
    const pc = Math.min(C0, 0.14) * 0.42;
    return {
      panelTop: oklchToRgb({ l: 0.27 + lift, c: c(pc), h }, alpha),
      panelMid: oklchToRgb({ l: 0.215 + lift, c: c(pc * 1.1), h }, alpha),
      panelBottom: oklchToRgb(
        { l: 0.165 + lift, c: c(pc * 1.25), h: h + 8 },
        Math.min(1, alpha + 0.05),
      ),
      border: oklchToRgb({
        l: clamp(L0 + 0.06 + (state === 'hover' ? 0.06 : 0), 0.7, 0.95),
        c: c(Math.max(C0, 0.06)),
        h,
      }),
      inner: oklchToRgb({ l: clamp(L0 - 0.08, 0.5, 0.72), c: c(C0 * 0.7), h }, 0.55),
      ornament: oklchToRgb({ l: clamp(L0 + 0.12, 0.76, 0.95), c: c(Math.max(C0 * 0.95, 0.05)), h }),
      text:
        state === 'disabled'
          ? { r: 196, g: 198, b: 206, a: 0.5 }
          : oklchToRgb({ l: 0.975, c: Math.min(C0, 0.02), h }),
      textEdge: oklchToRgb({ l: 0.12, c: Math.min(C0, 0.08) * 0.6, h }, 0.9),
      glow: oklchToRgb({ l: clamp(L0 + 0.1, 0.72, 0.9), c: Math.max(C0, 0.12), h }, 0.9),
      sheen: { r: 255, g: 255, b: 255, a: 0.08 },
      tint: oklchToRgb({ l: 0.8, c: c(C0 * 0.6), h }, tex * 0.6),
      shadow: { r: 0, g: 0, b: 0, a: 0.55 },
    };
  }
  const lift = state === 'hover' ? 0.012 : state === 'active' ? -0.03 : 0;
  const pc = Math.min(C0, 0.12);
  return {
    panelTop: oklchToRgb({ l: Math.min(0.995, 0.99 + lift), c: c(pc * 0.22), h }, alpha),
    panelMid: oklchToRgb({ l: 0.965 + lift, c: c(pc * 0.3), h }, alpha),
    panelBottom: oklchToRgb({ l: 0.925 + lift, c: c(pc * 0.42), h }, Math.min(1, alpha + 0.04)),
    border: oklchToRgb({
      l: clamp(L0 - 0.12 - (state === 'hover' ? 0.04 : 0), 0.38, 0.58),
      c: c(Math.max(C0, 0.08)),
      h,
    }),
    inner: oklchToRgb({ l: 0.78, c: c(C0 * 0.6), h }, 0.65),
    ornament: oklchToRgb({ l: clamp(L0 - 0.06, 0.45, 0.62), c: c(Math.max(C0, 0.09)), h }),
    text:
      state === 'disabled'
        ? { r: 96, g: 98, b: 108, a: 0.5 }
        : oklchToRgb({ l: 0.25, c: Math.min(C0, 0.07), h }),
    textEdge: { r: 255, g: 255, b: 255, a: 0.95 },
    glow: oklchToRgb({ l: clamp(L0, 0.6, 0.78), c: Math.max(C0, 0.14), h }, 0.8),
    sheen: { r: 255, g: 255, b: 255, a: 0.5 },
    tint: oklchToRgb({ l: 0.5, c: c(C0 * 0.8), h }, tex * 0.5),
    shadow: { r: 0, g: 0, b: 0, a: 0.35 },
  };
}

export function palette(d: PaletteInput, state: ButtonState = 'normal'): Palette {
  const p = paletteRgba(d, state);
  const out = {} as Palette;
  for (const k of Object.keys(p) as (keyof PaletteRgba)[]) out[k] = toCss(p[k]);
  return out;
}

/** TyranoScript 的顏色寫法：0xRRGGBB（大寫） */
export function tyranoColor(c: Rgba): string {
  return `0x${formatHex(c, false).slice(1).toUpperCase()}`;
}
