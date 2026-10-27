/**
 * 行事曆的外觀（規格 3.5）：背景（跟著介面、漸層、花紋、圖片）、文字與框線的顏色、自動配色。
 * 畫面上以 CSS 變數（--cal-*）套在行事曆的區塊上；截圖（shot.ts）用同一份顏色畫在畫布上。
 */
import { parseColor, relativeLuminance, toCss } from '@/core/color';
import type { Look, PatternKind } from './model';

/** 實際用的顏色（截圖用；畫面用 CSS 變數） */
export interface Palette {
  text: string;
  muted: string;
  border: string;
  /** 格子的底色（含不透明度的 rgba） */
  card: string;
  /** 星期日與國定假日 */
  holiday: string;
  /** 星期六 */
  saturday: string;
  /** 今天的框、選取 */
  accent: string;
  /** 整張的底色（介面配色時是頁面的底色） */
  base: string;
}

const mix = (a: string, b: string, t: number): string => {
  const x = parseColor(a) ?? { r: 0, g: 0, b: 0, a: 1 };
  const y = parseColor(b) ?? { r: 0, g: 0, b: 0, a: 1 };
  const h = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(x.r + (y.r - x.r) * t)}${h(x.g + (y.g - x.g) * t)}${h(x.b + (y.b - x.b) * t)}`;
};

/** 背景的代表色（自動配色、判斷深淺用） */
export function backgroundColors(look: Look): string[] {
  if (look.bg === 'gradient') return [...look.gradient.colors];
  if (look.bg === 'pattern') return [look.pattern.base];
  if (look.bg === 'image') return [mix('#808080', '#ffffff', look.image.fade / 100)];
  return [];
}

const avgLuminance = (colors: readonly string[]): number => {
  const list = colors.map((c) => parseColor(c)).filter((c) => c !== null);
  if (!list.length) return 1;
  return list.reduce((s, c) => s + relativeLuminance(c), 0) / list.length;
};

/**
 * 依背景自動配色：亮的背景（平均相對亮度 > 0.4）用背景色加深的文字與白色格子；暗的背景用加亮的文字與半透明黑格子。
 */
export function autoColors(look: Look): Look['colors'] {
  const colors = backgroundColors(look);
  const base = colors[0] ?? '#ffffff';
  if (avgLuminance(colors) > 0.4)
    return {
      text: mix(base, '#000000', 0.78),
      muted: mix(base, '#000000', 0.52),
      border: mix(base, '#000000', 0.16),
      card: '#ffffff',
      cardAlpha: 80,
    };
  return {
    text: mix(base, '#ffffff', 0.9),
    muted: mix(base, '#ffffff', 0.62),
    border: mix(base, '#ffffff', 0.3),
    card: '#000000',
    cardAlpha: 32,
  };
}

/** 自訂背景時，格子底色是亮的嗎（決定假日的紅、星期六的藍用深的還是淺的） */
export function isLightCard(look: Look): boolean {
  const { card, cardAlpha } = look.colors;
  const bgLum = avgLuminance(backgroundColors(look));
  const cardLum = avgLuminance([card]);
  return cardLum * (cardAlpha / 100) + bgLum * (1 - cardAlpha / 100) > 0.35;
}

/** 自訂背景的顏色 */
export function customPalette(look: Look): Palette {
  const light = isLightCard(look);
  const c = look.colors;
  return {
    text: c.text,
    muted: c.muted,
    border: c.border,
    card: toCss({
      ...(parseColor(c.card) ?? { r: 255, g: 255, b: 255, a: 1 }),
      a: c.cardAlpha / 100,
    }),
    holiday: light ? '#c93c3c' : '#ff8f86',
    saturday: light ? '#3c5fc9' : '#93b2ff',
    accent: light ? '#7b5ea7' : '#c9b3ea',
    base: backgroundColors(look)[0] ?? '#ffffff',
  };
}

/** 介面配色：讀頁面上的設計 token */
export function themePalette(): Palette {
  const cs = typeof document !== 'undefined' ? getComputedStyle(document.documentElement) : null;
  const v = (name: string, fallback: string) => cs?.getPropertyValue(name).trim() || fallback;
  return {
    text: v('--text', '#eeebe6'),
    muted: v('--text-muted', '#aba59d'),
    border: v('--border', '#3b3843'),
    card: v('--surface', '#1b1a20'),
    holiday: v('--danger', '#f2877e'),
    saturday: v('--accent', '#b79ce0'),
    accent: v('--accent', '#b79ce0'),
    base: v('--bg', '#121116'),
  };
}

export const paletteOf = (look: Look): Palette =>
  look.bg === 'theme' ? themePalette() : customPalette(look);

/** 畫面上的 CSS 變數（套在行事曆的區塊上） */
export function lookVars(look: Look): Record<string, string> {
  if (look.bg === 'theme')
    return {
      '--cal-text': 'var(--text)',
      '--cal-muted': 'var(--text-muted)',
      '--cal-border': 'var(--border)',
      '--cal-card': 'var(--surface)',
      '--cal-holiday': 'var(--danger)',
      '--cal-saturday': 'var(--accent)',
      '--cal-accent': 'var(--accent)',
    };
  const p = customPalette(look);
  return {
    '--cal-text': p.text,
    '--cal-muted': p.muted,
    '--cal-border': p.border,
    '--cal-card': p.card,
    '--cal-holiday': p.holiday,
    '--cal-saturday': p.saturday,
    '--cal-accent': p.accent,
  };
}

/* ---------- 花紋 ---------- */

/** 一格花紋的 SVG（48 × 48 的座標，畫面與截圖共用） */
export function patternSvg(kind: PatternKind, color: string, alpha: number): string {
  const shape: Record<PatternKind, string> = {
    dots: '<circle cx="24" cy="24" r="7"/>',
    stripes: '<path d="M0 36 36 0h12v12L12 48H0zM0 0h12L0 12z"/>',
    check: '<path d="M0 0h24v24H0zM24 24h24v24H24z"/>',
    grid: '<path d="M0 0h48v1.6H0zM0 0h1.6v48H0z"/>',
    heart: '<path d="M24 37C14 30 9 25 9 19.5a7 7 0 0 1 15-3 7 7 0 0 1 15 3C39 25 34 30 24 37z"/>',
    star: '<path d="m24 9 4.4 9.6 10.5 1.1-7.9 7.1 2.3 10.3L24 31.8l-9.3 5.3 2.3-10.3-7.9-7.1 10.5-1.1z"/>',
  };
  return `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48"><g fill="${color}" fill-opacity="${(alpha / 100).toFixed(2)}">${shape[kind]}</g></svg>`;
}

export const svgDataUrl = (svg: string): string => `data:image/svg+xml,${encodeURIComponent(svg)}`;

/** 花紋一格的大小（px；愛心與星星大一點，排起來比較鬆） */
export const patternTile = (kind: PatternKind, size: number): number =>
  kind === 'heart' || kind === 'star' ? Math.round(size * 1.4) : size;

/** 並排的圖片一張的寬度（px） */
export const IMAGE_TILE_WIDTH = 240;

/** 背景的 CSS（畫面用；圖片是 objectURL，還沒載入時 null） */
export function backgroundCss(look: Look, imageUrl: string | null): Record<string, string> {
  if (look.bg === 'gradient') {
    const [a, b, c] = look.gradient.colors;
    return { backgroundImage: `linear-gradient(${look.gradient.angle}deg, ${a}, ${b}, ${c})` };
  }
  if (look.bg === 'pattern') {
    const p = look.pattern;
    const tile = patternTile(p.kind, p.size);
    return {
      backgroundColor: p.base,
      backgroundImage: `url("${svgDataUrl(patternSvg(p.kind, p.color, p.alpha))}")`,
      backgroundSize: `${tile}px ${tile}px`,
      backgroundRepeat: 'repeat',
    };
  }
  if (look.bg === 'image') {
    const f = `rgba(255, 255, 255, ${look.image.fade / 100})`;
    if (!imageUrl) return { backgroundColor: '#ffffff' };
    const tile = look.image.fit === 'tile';
    return {
      backgroundColor: '#ffffff',
      backgroundImage: `linear-gradient(${f}, ${f}), url("${imageUrl}")`,
      backgroundSize: tile ? `auto, ${IMAGE_TILE_WIDTH}px auto` : 'auto, cover',
      backgroundRepeat: tile ? 'repeat, repeat' : 'repeat, no-repeat',
      backgroundPosition: '0 0, center',
    };
  }
  return {};
}
