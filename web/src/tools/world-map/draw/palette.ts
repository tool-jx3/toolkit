/**
 * 三種主題的配色（本站自己的配色）與顏色的混合。
 */
import type { Climate } from '../model/climate';
import type { ThemeId } from '../model/types';

export interface ThemeColors {
  sea: string;
  land: string;
  ink: string;
  coast: string;
  paper: string;
  wave: string;
  /** 地表：平原、沙漠、雪原、濕地 */
  surface: Record<1 | 4 | 5 | 6, string>;
  /** 路線的顏色 */
  road: string;
  route: string;
  border: string;
  secret: string;
  secretText: string;
  /** 地圖上的字的外圈（夜航用深色，淺色的字才看得清楚） */
  halo: string;
  /** 外框的標題、羅盤、比例尺 */
  frame: string;
}

export const THEMES: Record<ThemeId, ThemeColors> = {
  parchment: {
    sea: '#4f7488',
    land: '#e9d9ae',
    ink: '#3f3a2c',
    coast: '#6e6142',
    paper: '#f2e6c8',
    wave: '#a9c3cc',
    surface: { 1: '#cbc493', 4: '#ecd6a1', 5: '#ecece2', 6: '#8c7d5a' },
    road: '#4a3f2c',
    route: '#cfe0e4',
    border: '#a8654f',
    secret: '#9a72bb',
    secretText: '#7f4f9c',
    halo: '#e9d9ae',
    frame: '#f2e6c8',
  },
  night: {
    sea: '#13263a',
    land: '#93ad9f',
    ink: '#ecebd6',
    coast: '#c5dccb',
    paper: '#1d3346',
    wave: '#4f7590',
    surface: { 1: '#a1ad86', 4: '#d3c197', 5: '#dce5e3', 6: '#6d6a4f' },
    road: '#26352f',
    route: '#8fb4c6',
    border: '#d58f74',
    secret: '#c29be0',
    secretText: '#e3c8f5',
    halo: '#1d3346',
    frame: '#ecebd6',
  },
  atlas: {
    sea: '#e4ecf0',
    land: '#fbfaf3',
    ink: '#33464d',
    coast: '#7f9798',
    paper: '#f6f8f5',
    wave: '#c7d8de',
    surface: { 1: '#dfdcc0', 4: '#f3e5c4', 5: '#f2f3ec', 6: '#ad9f80' },
    road: '#41545a',
    route: '#7aa1b3',
    border: '#b9705a',
    secret: '#9a72bb',
    secretText: '#7f4f9c',
    halo: '#fbfaf3',
    frame: '#33464d',
  },
};

export interface ReliefColors {
  tree: string;
  treeDark: string;
  treeLight: string;
  line: string;
  rock: string;
  rockDark: string;
  rockLight: string;
  earth: string;
}

const RELIEF: Record<ThemeId, ReliefColors> = {
  parchment: {
    tree: '#6a8a4f',
    treeDark: '#3a5d3e',
    treeLight: '#adbf78',
    line: '#4e5739',
    rock: '#b9a376',
    rockDark: '#82704f',
    rockLight: '#e6d6a6',
    earth: '#a39467',
  },
  night: {
    tree: '#5a8676',
    treeDark: '#2f564f',
    treeLight: '#98b5a0',
    line: '#284541',
    rock: '#93aca4',
    rockDark: '#4f6e6d',
    rockLight: '#cbd6bd',
    earth: '#6f8d83',
  },
  atlas: {
    tree: '#a3b9a0',
    treeDark: '#728d7a',
    treeLight: '#e2e8cc',
    line: '#5d7068',
    rock: '#bec3b3',
    rockDark: '#88978d',
    rockLight: '#f5f1dc',
    earth: '#adb79f',
  },
};

/** 建築的配色（夜航一套、其他一套） */
export interface BuildColors {
  ink: string;
  stone: string;
  shade: string;
  roof: string;
  roofDark: string;
  wood: string;
  light: string;
  glass: string;
  dark: string;
}

export function buildColors(theme: ThemeId, secret = false): BuildColors {
  const night = theme === 'night';
  return {
    ink: secret ? '#6f4a80' : night ? '#2c4644' : '#5b4a35',
    stone: night ? '#b3c3b2' : '#d6c59c',
    shade: night ? '#6f8d86' : '#a48f6b',
    roof: night ? '#6f9a95' : '#b0654a',
    roofDark: night ? '#41665f' : '#7b4a36',
    wood: night ? '#8a7a5c' : '#a77f50',
    light: night ? '#dfe8e0' : '#f3e4b9',
    glass: night ? '#e6dc9a' : '#ecc977',
    dark: night ? '#2b4441' : '#4f3a2b',
  };
}

const hex = (c: string) => [1, 3, 5].map((i) => Number.parseInt(c.slice(i, i + 2), 16));
const toHex = (v: number[]) =>
  `#${v
    .map((x) =>
      Math.max(0, Math.min(255, Math.round(x)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

/** a 與 b 的混色（t＝0 是 a、1 是 b） */
export function mix(a: string, b: string, t: number): string {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const x = hex(a);
  const y = hex(b);
  return toHex(x.map((v, i) => v * (1 - t) + y[i] * t));
}

/** 整體調亮或調暗（每個色版加減） */
export function tint(c: string, amount: number): string {
  return toHex(hex(c).map((v) => v + amount));
}

export function rgba(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r},${g},${b},${a})`;
}

const DESERT_ROCK: Partial<ReliefColors> = {
  rock: '#d2b27a',
  rockDark: '#9a784c',
  rockLight: '#f2dca4',
  earth: '#c4aa77',
};
const WET_ROCK: Partial<ReliefColors> = {
  rock: '#857f64',
  rockDark: '#575a44',
  rockLight: '#bcb79a',
  earth: '#726749',
};
const SNOW_ROCK: Partial<ReliefColors> = {
  rock: '#b9c4be',
  rockDark: '#728583',
  rockLight: '#eef1e3',
  earth: '#b7c2b6',
};

/** 山的顏色跟著附近的地表：沙漠偏黃、濕地偏暗、雪原偏白 */
export function reliefColors(
  theme: ThemeId,
  c: Climate = { snow: 0, desert: 0, wet: 0 },
): ReliefColors {
  const p = { ...RELIEF[theme] };
  for (const k of ['rock', 'rockDark', 'rockLight', 'earth'] as const) {
    p[k] = mix(p[k], DESERT_ROCK[k]!, c.desert * 0.65);
    p[k] = mix(p[k], WET_ROCK[k]!, c.wet * 0.65);
    p[k] = mix(p[k], SNOW_ROCK[k]!, c.snow);
  }
  return p;
}

/** 森林越深樹冠越深綠 */
export function deepForest(p: ReliefColors, density: number): ReliefColors {
  return {
    ...p,
    tree: mix(p.tree, '#305638', density * 0.78),
    treeDark: mix(p.treeDark, '#173c2b', density * 0.88),
    treeLight: mix(p.treeLight, '#78985a', density * 0.56),
  };
}

export const SNOW_WHITE = '#f3f6ef';
export const SNOW_SHADE = '#b4c8c6';
