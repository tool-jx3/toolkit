/**
 * 六種圖面樣式的配色（本站自己配，從室內平面圖產生器的配色與本站的設計 token 出發）：
 * 彩色、藍曬圖、古紙・墨水、白地圖面、黑曜、監視終端。
 * 設備是「線稿＋淡的填色」（和室內平面圖產生器的家具一樣）：本體用 fill／tint，線用 ink。
 * 彩色每一種東西各有自己的顏色；其他五種先由「紙」與「墨」兩個顏色依比例調出來
 * （內牆＝紙往白或往墨 9%、結構＝紙往暗 30%…），再加幾個點綴色，最後逐色微調成定值寫在下面。
 */
import type { SkyId, StyleId, WallTone } from '../model/types';

export interface Palette {
  id: StyleId;
  dark: boolean;
  paper: string;
  ink: string;
  muted: string;
  /** 結構（樓板、牆、地面）的底色與斜線 */
  slab: string;
  hatch: string;
  /** 內牆的顏色與紋路 */
  walls: Record<WallTone, string>;
  grain: string;
  /** 設備的本體、淡的填色、深的填色、淡的線 */
  fill: string;
  tint: string;
  shade: string;
  faint: string;
  /** 金屬（深、亮） */
  iron: string;
  ironLit: string;
  /** 木頭（深、亮） */
  timber: string;
  timberLit: string;
  /** 玻璃、布、金色的點綴 */
  pane: string;
  fabric: string;
  gilt: string;
  blood: string;
  flame: string;
  /** 電的火花、螢幕、出口標示的綠 */
  arc: string;
  screen: string;
  signal: string;
  /** 地層：表土、中層、深層 */
  strata: readonly [string, string, string];
  /** PL 用的偽裝（和結構一樣的砌石） */
  disguise: string;
  roofing: string;
  /** 光：暖色、冷色、警示（緊急照明） */
  amber: string;
  frost: string;
  alarm: string;
  /** 淹水 */
  flood: string;
  /** 天空（上、下）；彩色每種天候各一組，其他樣式只分晴／雨 */
  sky: Record<SkyId | 'blackout', readonly [string, string]>;
  /** 選取的顏色 */
  select: string;
  /** GM 專用的標示 */
  gm: string;
}

const hex = (s: string): [number, number, number] => {
  const n = Number.parseInt(s.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** 兩個顏色之間（t＝0 是 a，1 是 b） */
export function mix(a: string, b: string, t: number): string {
  const x = hex(a);
  const y = hex(b);
  return `#${x
    .map((v, i) =>
      Math.round(v + (y[i] - v) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

/** 顏色加透明度 */
export function alpha(c: string, a: number): string {
  const [r, g, b] = hex(c);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(a * 1000) / 1000})`;
}

/* 彩色：白紙、靛藍的線、淡彩的內牆（線稿＋淡的填色，和室內平面圖產生器的家具一樣） */
const tinted: Palette = {
  id: 'color',
  dark: false,
  paper: '#ffffff',
  ink: '#262646',
  muted: '#7d7da0',
  slab: '#b4b4cc',
  walls: {
    plaster: '#ffffff',
    concrete: '#dedef6',
    tile: '#d8f6e4',
    wood: '#fcd2b4',
    stone: '#ead8e4',
    brick: '#fcd8d2',
    metal: '#d8e4fc',
  },
  fill: '#ffffff',
  tint: '#e4e4fc',
  shade: '#9a9ac0',
  faint: '#c4c4e0',
  iron: '#7e869c',
  ironLit: '#d9daec',
  timber: '#d6a56e',
  timberLit: '#fdd2ad',
  pane: '#c2defd',
  fabric: '#7b9bd0',
  gilt: '#f4c542',
  blood: '#a8102c',
  flame: '#ff8a1a',
  arc: '#45c1ff',
  screen: '#3d84e3',
  signal: '#43c186',
  strata: ['#fad1a4', '#d1a281', '#ad8872'],
  disguise: '#cbb4b3',
  roofing: '#80859b',
  amber: '#f0b85e',
  frost: '#b7e9ff',
  alarm: '#bc0b10',
  flood: '#3a8de0',
  sky: {
    clear: ['#7fbaf0', '#dde1f4'],
    dusk: ['#5b4a90', '#f7ab83'],
    rain: ['#616e8a', '#afb8cf'],
    storm: ['#202541', '#4d5678'],
    blackout: ['#03031f', '#202540'],
  },
  select: '#7c4dff',
  gm: '#b0459e',
  hatch: alpha('#262646', 0.34),
  grain: alpha('#262646', 0.11),
};

/* 藍曬圖：鈷藍的紙、白線 */
const blueprint: Palette = {
  id: 'blueprint',
  dark: true,
  paper: '#1f4d8c',
  ink: '#ffffff',
  muted: '#899dbd',
  slab: '#163662',
  walls: {
    plaster: '#335d96',
    concrete: '#3d659b',
    tile: '#426ea6',
    wood: '#50729a',
    stone: '#294a78',
    brick: '#436297',
    metal: '#4b78b0',
  },
  fill: '#2c5893',
  tint: '#43699e',
  shade: '#7994ba',
  faint: '#6282af',
  iron: '#5e7fac',
  ironLit: '#829bbf',
  timber: '#5578a8',
  timberLit: '#708db5',
  pane: '#7fb0e8',
  fabric: '#6b8ab3',
  gilt: '#fff2b4',
  blood: '#ff9f9f',
  flame: '#e7b767',
  arc: '#b5e8ff',
  screen: '#b5e8ff',
  signal: '#fff2b4',
  strata: ['#1a4176', '#163662', '#0b2749'],
  disguise: '#183c6d',
  roofing: '#1b447b',
  amber: '#fffcc5',
  frost: '#b5e8ff',
  alarm: '#ff8a7a',
  flood: '#4aa3ff',
  sky: {
    clear: ['#14335c', '#335d96'],
    dusk: ['#14335c', '#335d96'],
    rain: ['#142e51', '#2a5692'],
    storm: ['#142e51', '#2a5692'],
    blackout: ['#142e51', '#2a5692'],
  },
  select: '#ffe77d',
  gm: '#f08fd8',
  hatch: alpha('#ffffff', 0.3),
  grain: alpha('#ffffff', 0.1),
};

/* 古紙・墨水：橙黃的舊紙、深褐的墨 */
const parchment: Palette = {
  id: 'parchment',
  dark: false,
  paper: '#f6cc9c',
  ink: '#4e2a18',
  muted: '#cfa284',
  slab: '#ecbd94',
  walls: {
    plaster: '#fcd5bc',
    concrete: '#f4cdb2',
    tile: '#f7d1b9',
    wood: '#fbd2a4',
    stone: '#f5d0ba',
    brick: '#f7d0b6',
    metal: '#f7fed5',
  },
  fill: '#fedccb',
  tint: '#efc294',
  shade: '#cfa484',
  faint: '#ebbd95',
  iron: '#cfa484',
  ironLit: '#f1c598',
  timber: '#d3a483',
  timberLit: '#f0c496',
  pane: '#e1f6de',
  fabric: '#d3a483',
  gilt: '#b5872b',
  blood: '#9a3324',
  flame: '#e0952f',
  arc: '#e3f8e2',
  screen: '#e3f8e2',
  signal: '#b5872b',
  strata: ['#d3a483', '#d1a382', '#cfa284'],
  disguise: '#ebbd95',
  roofing: '#d1a382',
  amber: '#e4b86e',
  frost: '#e3f8e2',
  alarm: '#962b16',
  flood: '#639391',
  sky: {
    clear: ['#f0c396', '#f6cc9c'],
    dusk: ['#f0c396', '#f6cc9c'],
    rain: ['#ecbd94', '#f7cd9e'],
    storm: ['#ecbd94', '#f7cd9e'],
    blackout: ['#ecbd94', '#f7cd9e'],
  },
  select: '#8b46ff',
  gm: '#b0459e',
  hatch: alpha('#4e2a18', 0.34),
  grain: alpha('#4e2a18', 0.11),
};

/* 白地圖面：白紙、靛灰的線 */
const draft: Palette = {
  id: 'draft',
  dark: false,
  paper: '#ffffff',
  ink: '#30305a',
  muted: '#928fa4',
  slab: '#cbc8d8',
  walls: {
    plaster: '#ffffff',
    concrete: '#ebdfec',
    tile: '#ddd9e9',
    wood: '#f3e1ea',
    stone: '#d3c4cd',
    brick: '#fbe3e9',
    metal: '#e7dfee',
  },
  fill: '#ffffff',
  tint: '#ebdfec',
  shade: '#b7b4c7',
  faint: '#ccc6d4',
  iron: '#c5c2d3',
  ironLit: '#e3dae8',
  timber: '#c7c4d4',
  timberLit: '#dedbeb',
  pane: '#dbe6fa',
  fabric: '#c7c4d4',
  gilt: '#a9acc1',
  blood: '#a4323b',
  flame: '#f39a3d',
  arc: '#d7e8ff',
  screen: '#d7e8ff',
  signal: '#a9acc1',
  strata: ['#c7c4d4', '#aca9ba', '#928fa4'],
  disguise: '#ccc6d4',
  roofing: '#aca9ba',
  amber: '#fff2b5',
  frost: '#d7e8ff',
  alarm: '#b71114',
  flood: '#7fb3e6',
  sky: {
    clear: ['#e6dae7', '#ffffff'],
    dusk: ['#e6dae7', '#ffffff'],
    rain: ['#cbc8d8', '#e3dae8'],
    storm: ['#cbc8d8', '#e3dae8'],
    blackout: ['#cbc8d8', '#e3dae8'],
  },
  select: '#8b46ff',
  gm: '#b0459e',
  hatch: alpha('#30305a', 0.34),
  grain: alpha('#30305a', 0.11),
};

/* 黑曜：帶紫的黑、淡紫的線 */
const noir: Palette = {
  id: 'noir',
  dark: true,
  paper: '#12061e',
  ink: '#efe0f5',
  muted: '#81738a',
  slab: '#231631',
  walls: {
    plaster: '#291a31',
    concrete: '#271b35',
    tile: '#211b35',
    wood: '#554248',
    stone: '#15061e',
    brick: '#29162a',
    metal: '#5e5b78',
  },
  fill: '#22162e',
  tint: '#291a31',
  shade: '#6a5d74',
  faint: '#695971',
  iron: '#685b72',
  ironLit: '#73667d',
  timber: '#685873',
  timberLit: '#6b5d74',
  pane: '#77869d',
  fabric: '#695c73',
  gilt: '#e2b76d',
  blood: '#e2786d',
  flame: '#f3a95d',
  arc: '#b5e8ff',
  screen: '#b5e8ff',
  signal: '#e2b76d',
  strata: ['#180825', '#231631', '#2c1e3b'],
  disguise: '#1e112c',
  roofing: '#160622',
  amber: '#ffd4a0',
  frost: '#b5e8ff',
  alarm: '#ff7154',
  flood: '#3e7498',
  sky: {
    clear: ['#281b36', '#291a31'],
    dusk: ['#281b36', '#291a31'],
    rain: ['#2b1d39', '#170823'],
    storm: ['#2b1d39', '#170823'],
    blackout: ['#2b1d39', '#170823'],
  },
  select: '#ffe77d',
  gm: '#f08fd8',
  hatch: alpha('#efe0f5', 0.3),
  grain: alpha('#efe0f5', 0.1),
};

/* 監視終端：琥珀色的螢光 */
const terminal: Palette = {
  id: 'terminal',
  dark: true,
  paper: '#241806',
  ink: '#ffb43a',
  muted: '#8f631d',
  slab: '#1f1401',
  walls: {
    plaster: '#322002',
    concrete: '#3f2a0a',
    tile: '#432d0c',
    wood: '#4a3411',
    stone: '#2a1b03',
    brick: '#482c11',
    metal: '#49320d',
  },
  fill: '#2e1e03',
  tint: '#47310e',
  shade: '#765015',
  faint: '#664716',
  iron: '#614415',
  ironLit: '#7b5414',
  timber: '#593d12',
  timberLit: '#735019',
  pane: '#6e4a12',
  fabric: '#6e4d18',
  gilt: '#e4b45f',
  blood: '#ff6d51',
  flame: '#f0b85e',
  arc: '#fcffce',
  screen: '#fcffce',
  signal: '#e4b45f',
  strata: ['#211402', '#1f1401', '#1c1300'],
  disguise: '#221605',
  roofing: '#201502',
  amber: '#ffd6a3',
  frost: '#fcffce',
  alarm: '#ff4f6d',
  flood: '#8a5a12',
  sky: {
    clear: ['#211604', '#322002'],
    dusk: ['#211604', '#322002'],
    rain: ['#1d1300', '#2c1d03'],
    storm: ['#1d1300', '#2c1d03'],
    blackout: ['#1d1300', '#2c1d03'],
  },
  select: '#ffe77d',
  gm: '#f08fd8',
  hatch: alpha('#ffb43a', 0.3),
  grain: alpha('#ffb43a', 0.1),
};

export const PALETTES: Record<StyleId, Palette> = {
  color: tinted,
  blueprint,
  parchment,
  draft,
  noir,
  terminal,
};

export const paletteOf = (id: StyleId): Palette => PALETTES[id] ?? tinted;
