/**
 * 配色（本站自己定，規格 3.2、D5）與字型（D3）。
 */
import type { StoryFont, Theme } from '../model';
import type { FontSpec } from '../text';

export interface Palette {
  bg: string;
  ink: string;
  sec: string;
  line: string;
  link: string;
  btn: string;
  elev: string;
  ph: string;
  accent: string;
  red: string;
}

export const PALETTES: Record<Theme, Palette> = {
  light: {
    bg: '#ffffff',
    ink: '#14171c',
    sec: '#6b7079',
    line: '#e1e4e8',
    link: '#2a5bd7',
    btn: '#eef0f3',
    elev: '#ffffff',
    ph: '#eceef1',
    accent: '#3f63e0',
    red: '#f0435a',
  },
  dark: {
    bg: '#0b0d10',
    ink: '#f1f3f5',
    sec: '#9ca2ab',
    line: '#2f343b',
    link: '#9cbcff',
    btn: '#2a2f36',
    elev: '#1b1e23',
    ph: '#22262c',
    accent: '#3f63e0',
    red: '#f0435a',
  },
};

/** 動態外圈（斜向漸層） */
export const RING_STOPS: readonly (readonly [number, string])[] = [
  [0, '#2bc0b4'],
  [0.5, '#4f63e0'],
  [1, '#a24fd6'],
];

/** 貼紙的漸層（D5） */
export const CHIP_COLORS = {
  mention: ['#5b5bd6', '#a24fd6'],
  hashtag: ['#e5484d', '#f08a3c'],
  location: ['#8e4fd6', '#e0457b'],
  link: ['#2f7bf5', '#2f7bf5'],
} as const;

/** 音樂貼紙沒有封面時的漸層 */
export const MUSIC_ART = ['#5b5bd6', '#e0457b'] as const;

export const UI_FAMILY = 'Noto Sans TC';

export const ui = (size: number, weight = 400): FontSpec => ({ family: UI_FAMILY, weight, size });

/** 限時動態的文字貼紙字型（D3）：字型、字重、字級（cqw）、行高、斜體 */
export const STORY_FONT_SPECS: Record<
  StoryFont,
  { family: string; weight: number; size: number; lh: number; italic?: boolean }
> = {
  classic: { family: 'Noto Sans TC', weight: 700, size: 7.2, lh: 1.38 },
  modern: { family: 'Huninn', weight: 400, size: 7.8, lh: 1.38 },
  neon: { family: 'LXGW WenKai TC', weight: 400, size: 10, lh: 1.15 },
  type: { family: 'LXGW WenKai Mono TC', weight: 700, size: 6.4, lh: 1.38 },
  strong: { family: 'Noto Sans TC', weight: 900, size: 8, lh: 1.38, italic: true },
  serif: { family: 'Noto Serif TC', weight: 900, size: 7.2, lh: 1.38 },
};

const HEX = /^#([0-9a-f]{6})$/i;

/** 亮度（同原作的簡單算法）：> 160 用黑字，否則白字 */
export function contrastText(hex: string): string {
  const m = HEX.exec(hex);
  if (!m) return '#ffffff';
  const n = Number.parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#000000' : '#ffffff';
}

export function rgba(hex: string, a: number): string {
  const m = HEX.exec(hex);
  const n = m ? Number.parseInt(m[1], 16) : 0xffffff;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
