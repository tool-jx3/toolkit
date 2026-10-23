/**
 * 訊息視窗的 12 種配色（規格 3.4；色值照原作，名稱自己取）。
 * fill：底色（上 → 下）；border：框色；inner：內線；text：文字；nameBox：名字底色；accent：名字顏色（也是「強調」與演出文字行首符號的顏色）。
 */
export type ThemeId =
  | 'classic'
  | 'dark'
  | 'parchment'
  | 'rose'
  | 'mono'
  | 'galge'
  | 'sky'
  | 'mint'
  | 'neon'
  | 'royal'
  | 'gameboy'
  | 'horror';

export interface WindowTheme {
  fill: readonly [string, string];
  border: string;
  inner: string;
  text: string;
  nameBox: string;
  accent: string;
}

export const THEMES: Record<ThemeId, WindowTheme> = {
  classic: {
    fill: ['#1b3a8f', '#0c1c4d'],
    border: '#cfe0ff',
    inner: '#7fa8ff',
    text: '#ffffff',
    nameBox: '#10204f',
    accent: '#ffcb47',
  },
  dark: {
    fill: ['#10131c', '#05070d'],
    border: '#3a4360',
    inner: '#6b7798',
    text: '#e8ecf7',
    nameBox: '#0a0d15',
    accent: '#ffcb47',
  },
  parchment: {
    fill: ['#e8d6a8', '#caa86a'],
    border: '#5a3d1c',
    inner: '#a07a3c',
    text: '#3a2a12',
    nameBox: '#b89a5c',
    accent: '#8a4a1c',
  },
  rose: {
    fill: ['#7a2046', '#3d0f24'],
    border: '#ffd0e0',
    inner: '#ff7fb0',
    text: '#fff0f5',
    nameBox: '#4d1430',
    accent: '#ffd0e0',
  },
  mono: {
    fill: ['#202020', '#000000'],
    border: '#ffffff',
    inner: '#888888',
    text: '#ffffff',
    nameBox: '#111111',
    accent: '#ffffff',
  },
  galge: {
    fill: ['#fff2f8', '#ffd9ea'],
    border: '#ff8fc0',
    inner: '#ffb3d4',
    text: '#5a2742',
    nameBox: '#ff9ec8',
    accent: '#e0508f',
  },
  sky: {
    fill: ['#e3f3ff', '#bfe2ff'],
    border: '#5aa8e6',
    inner: '#9cd0f2',
    text: '#163a59',
    nameBox: '#a9d8f7',
    accent: '#2f7fc8',
  },
  mint: {
    fill: ['#e9fff6', '#c4f4e2'],
    border: '#3fc79a',
    inner: '#8fe3c5',
    text: '#0f4435',
    nameBox: '#aaf0d8',
    accent: '#1f9a74',
  },
  neon: {
    fill: ['#1a0036', '#06010f'],
    border: '#ff2bd6',
    inner: '#22e0ff',
    text: '#eafcff',
    nameBox: '#2a0552',
    accent: '#22e0ff',
  },
  royal: {
    fill: ['#3a1f6b', '#190b38'],
    border: '#ffd86b',
    inner: '#b89cff',
    text: '#fff4d6',
    nameBox: '#26145a',
    accent: '#ffd86b',
  },
  gameboy: {
    fill: ['#306230', '#0f380f'],
    border: '#9bbc0f',
    inner: '#8bac0f',
    text: '#cfe89b',
    nameBox: '#0f380f',
    accent: '#cfe89b',
  },
  horror: {
    fill: ['#1a0606', '#000000'],
    border: '#c41d1d',
    inner: '#5a1414',
    text: '#f0d2d2',
    nameBox: '#160404',
    accent: '#ff6a6a',
  },
};

/** 選單的順序（同原作） */
export const THEME_IDS: readonly ThemeId[] = [
  'classic',
  'dark',
  'parchment',
  'rose',
  'mono',
  'galge',
  'sky',
  'mint',
  'neon',
  'royal',
  'gameboy',
  'horror',
];
