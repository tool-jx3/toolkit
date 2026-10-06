/**
 * 配色（規格 3.3）：從封面的縮圖抽出主色、鮮豔色、第二色與平均亮度，再依明暗設定算出畫面用的一組顏色。
 * 純函式（Node 可測）；HSL 一律是 [色相 0～1, 飽和 0～1, 亮度 0～1]。
 */
import type { MoodId } from './model';

export type Hsl = [number, number, number];

export interface PaletteColor {
  h: number;
  s: number;
  l: number;
  /** 佔畫面的比例（0～1） */
  n: number;
}

export interface Palette {
  /** 面積最大的顏色 */
  dominant: PaletteColor;
  /** 鮮豔、亮度適中、面積不太小的顏色 */
  vibrant: PaletteColor;
  /** 和鮮豔色色相不同的第二個顏色（找不到時同鮮豔色） */
  secondary: PaletteColor;
  /** 平均亮度（0～1） */
  avgL: number;
  /** 幾乎沒有彩度（黑白封面） */
  mono: boolean;
}

export interface Theme {
  dark: boolean;
  /** 底色 */
  base: Hsl;
  /** 背景的第二、三個顏色（漸層的色塊） */
  b2: Hsl;
  b3: Hsl;
  /** 重點色 */
  acc: Hsl;
  /** 文字色 */
  ink: Hsl;
}

/** 縮圖的邊長（抽色前先縮成這麼大） */
export const PALETTE_SAMPLE = 56;

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  r /= 255;
  g /= 255;
  b /= 255;
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h /= 6;
  }
  return [h, s, l];
}

export function hslToHex([h, s, l]: Hsl): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const v = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function hexToHsl(hex: string): Hsl {
  const m = hex.replace('#', '');
  return rgbToHsl(
    Number.parseInt(m.slice(0, 2), 16),
    Number.parseInt(m.slice(2, 4), 16),
    Number.parseInt(m.slice(4, 6), 16),
  );
}

/** 色相的距離（環狀，0～0.5） */
export const hueDistance = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
};

/** canvas／CSS 用的 hsla() */
export const hsla = (c: Hsl, a = 1) =>
  `hsla(${(c[0] * 360).toFixed(1)},${(c[1] * 100).toFixed(1)}%,${(c[2] * 100).toFixed(1)}%,${a})`;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * 從 RGBA 像素抽色（透明度不看）：RGB 各取高 4 位元分成 4096 格，每格的平均色換成 HSL，依面積排序；
 * 主色＝面積最大的；鮮豔色＝面積至少 0.4% 的格子裡「彩度 ×（1 − |亮度 − 0.52| × 1.6）× 面積^0.25」最高的；
 * 黑白＝鮮豔色的彩度 < 0.14；第二色＝面積超過 1%、彩度超過 0.15、色相和鮮豔色差超過 0.08 的第一個（依面積）；
 * 平均亮度＝(0.2126R + 0.7152G + 0.0722B) ÷ 255 的平均。
 */
export function extractPalette(rgba: Uint8Array | Uint8ClampedArray): Palette {
  const map = new Map<number, { r: number; g: number; b: number; n: number }>();
  let L = 0;
  let cnt = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i];
    const g = rgba[i + 1];
    const b = rgba[i + 2];
    L += (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    cnt++;
    const k = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let e = map.get(k);
    if (!e) {
      e = { r: 0, g: 0, b: 0, n: 0 };
      map.set(k, e);
    }
    e.r += r;
    e.g += g;
    e.b += b;
    e.n++;
  }
  if (!cnt) {
    const black = { h: 0, s: 0, l: 0, n: 1 };
    return { dominant: black, vibrant: black, secondary: black, avgL: 0, mono: true };
  }
  const list = [...map.values()]
    .map((e) => {
      const [h, s, l] = rgbToHsl(e.r / e.n, e.g / e.n, e.b / e.n);
      return { h, s, l, n: e.n / cnt };
    })
    .sort((a, b) => b.n - a.n);
  const dominant = list[0];
  let vibrant: PaletteColor | null = null;
  let best = -1;
  for (const x of list) {
    if (x.n < 0.004) continue;
    const score = x.s * (1 - Math.abs(x.l - 0.52) * 1.6) * x.n ** 0.25;
    if (score > best) {
      best = score;
      vibrant = x;
    }
  }
  const vib = vibrant ?? dominant;
  const secondary =
    list.find((x) => x.n > 0.01 && x.s > 0.15 && hueDistance(x.h, vib.h) > 0.08) ?? vib;
  return { dominant, vibrant: vib, secondary, avgL: L / cnt, mono: vib.s < 0.14 };
}

/**
 * 畫面的配色：深色＝明暗設定是深色，或自動而且平均亮度 < 0.58。
 * 重點色：手動時就是那個顏色；自動時用鮮豔色的色相，彩度夾在 0.45～0.85（黑白封面最多 0.1），
 * 亮度深色時夾在 0.62～0.74、淺色時 0.36～0.46。
 */
export function computeTheme(
  p: Palette,
  { mood, accentAuto, accent }: { mood: MoodId; accentAuto: boolean; accent: string },
): Theme {
  const d = p.dominant;
  const v = p.vibrant;
  const s2 = p.secondary;
  const dark = mood === 'dark' || (mood === 'auto' && p.avgL < 0.58);
  let acc: Hsl;
  if (!accentAuto) acc = hexToHsl(accent);
  else {
    const sat = p.mono ? Math.min(v.s, 0.1) : clamp(v.s, 0.45, 0.85);
    acc = dark ? [v.h, sat, clamp(v.l, 0.62, 0.74)] : [v.h, sat, clamp(v.l, 0.36, 0.46)];
  }
  return {
    dark,
    base: dark ? [d.h, Math.min(d.s, 0.5) * 0.8, 0.11] : [d.h, Math.min(d.s, 0.35) * 0.7, 0.93],
    b2: dark ? [v.h, Math.min(v.s, 0.65), 0.3] : [v.h, Math.min(v.s, 0.6), 0.8],
    b3: dark ? [s2.h, Math.min(s2.s, 0.55), 0.22] : [s2.h, Math.min(s2.s, 0.5), 0.86],
    acc,
    ink: dark ? [d.h, 0.12, 0.96] : [d.h, 0.22, 0.11],
  };
}
