/**
 * 顏色的小工具（範本的配色都由主題色算出來）：混色、變淺、變深、加透明度、亮度、主題色上的文字色。
 */
import { parseColor } from '@/core/color';

type Rgb = readonly [number, number, number];

export function rgbOf(color: string): Rgb {
  const c = parseColor(color);
  return c ? [c.r, c.g, c.b] : [0, 0, 0];
}

const hex2 = (v: number) =>
  Math.round(Math.max(0, Math.min(255, v)))
    .toString(16)
    .padStart(2, '0');

export const hexOf = ([r, g, b]: Rgb): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

/** a 往 b 混 t（0＝a、1＝b） */
export function mix(a: string, b: string, t: number): string {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return hexOf([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]);
}

/** 變淺（往白色混 t） */
export const tint = (c: string, t: number): string => mix(c, '#ffffff', t);
/** 變深（往黑色混 t） */
export const shade = (c: string, t: number): string => mix(c, '#000000', t);

/** 加上不透明度：rgba(...) */
export function alpha(c: string, a: number): string {
  const [r, g, b] = rgbOf(c);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}

/** 相對亮度（WCAG） */
export function luminance(c: string): number {
  const [r, g, b] = rgbOf(c).map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** 主題色上的文字色：亮的顏色（亮度 > 0.42）用深色字，其他用白字（同原作） */
export const onColor = (c: string): string => (luminance(c) > 0.42 ? '#16171b' : '#ffffff');

/** 字串 → 32 位元雜湊（裝飾的隨機數種子） */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** 固定種子的亂數（同一個種子每次相同；mulberry32） */
export function seededRandom(seed: number | string): () => number {
  let a = (typeof seed === 'string' ? hashString(seed) : seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
