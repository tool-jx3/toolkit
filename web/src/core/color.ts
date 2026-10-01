/**
 * 顏色：解析與格式化（#rgb、#rgba、#rrggbb、#rrggbbaa、rgb()/rgba()）、HSV 換算、對比度。
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** 0～1 */
  a: number;
}

export interface Hsv {
  /** 0～360 */
  h: number;
  /** 0～1 */
  s: number;
  /** 0～1 */
  v: number;
}

const clampByte = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** 解析顏色字串；看不懂時回傳 null */
export function parseColor(input: string): Rgba | null {
  const s = String(input ?? '')
    .trim()
    .toLowerCase();
  let m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4)
      h = h
        .split('')
        .map((c) => c + c)
        .join('');
    const n = (i: number) => Number.parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const a =
      m[4] === undefined
        ? 1
        : m[4].endsWith('%')
          ? Number.parseFloat(m[4]) / 100
          : Number.parseFloat(m[4]);
    return { r: clampByte(+m[1]), g: clampByte(+m[2]), b: clampByte(+m[3]), a: clamp01(a) };
  }
  if (s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  return null;
}

const hex2 = (v: number) => clampByte(v).toString(16).padStart(2, '0');

/** → #rrggbb，或 alpha 不是 1（且 withAlpha）時 #rrggbbaa */
export function formatHex(c: Rgba, withAlpha = true): string {
  const base = `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
  return withAlpha && c.a < 1 ? base + hex2(c.a * 255) : base;
}

/** 正規化成小寫 #rrggbb／#rrggbbaa；看不懂時回傳 fallback */
export function normalizeHex(input: string, fallback = '#000000', withAlpha = true): string {
  const c = parseColor(input);
  return c ? formatHex(c, withAlpha) : fallback;
}

/** → rgba(r, g, b, a)（給 canvas 與 CSS） */
export function toCss(c: Rgba | string): string {
  const v = typeof c === 'string' ? parseColor(c) : c;
  if (!v) return 'transparent';
  return `rgba(${clampByte(v.r)}, ${clampByte(v.g)}, ${clampByte(v.b)}, ${+clamp01(v.a).toFixed(3)})`;
}

/** 換掉透明度 */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  return formatHex({ ...c, a: clamp01(alpha) });
}

export function rgbToHsv({ r, g, b }: Rgba): Hsv {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToRgb({ h, s, v }: Hsv, a = 1): Rgba {
  const c = v * s;
  const hh = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hh % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 1) [r, g, b] = [c, x, 0];
  else if (hh < 2) [r, g, b] = [x, c, 0];
  else if (hh < 3) [r, g, b] = [0, c, x];
  else if (hh < 4) [r, g, b] = [0, x, c];
  else if (hh < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255, a };
}

/** WCAG 相對亮度 */
export function relativeLuminance({ r, g, b }: Rgba): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** WCAG 對比度（1～21）；半透明的前景先疊在背景上計算 */
export function contrastRatio(fg: Rgba | string, bg: Rgba | string): number {
  const b = typeof bg === 'string' ? parseColor(bg) : bg;
  const f0 = typeof fg === 'string' ? parseColor(fg) : fg;
  if (!b || !f0) return 1;
  const f = {
    r: f0.r * f0.a + b.r * (1 - f0.a),
    g: f0.g * f0.a + b.g * (1 - f0.a),
    b: f0.b * f0.a + b.b * (1 - f0.a),
    a: 1,
  };
  const l1 = relativeLuminance(f);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/** 在指定背景上，黑字和白字哪個比較清楚 */
export function readableTextColor(bg: Rgba | string): '#000000' | '#ffffff' {
  return contrastRatio('#000000', bg) >= contrastRatio('#ffffff', bg) ? '#000000' : '#ffffff';
}
