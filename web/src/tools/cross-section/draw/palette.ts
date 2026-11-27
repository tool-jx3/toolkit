/**
 * 六種圖面樣式的配色（本站自己配）：彩色、藍曬圖、古紙・墨水、白地圖面、黑曜、監視終端。
 * 彩色每一種東西各有自己的顏色；其他五種由「紙」與「墨」兩個顏色調出來（同一種樣式裡只有深淺的差別）。
 */
import type { SkyId, StyleId, WallTone } from '../model/types';

export interface Palette {
  id: StyleId;
  dark: boolean;
  paper: string;
  ink: string;
  muted: string;
  /** 結構（樓板、牆）的底色 */
  structure: string;
  /** 結構的斜線 */
  hatch: string;
  /** 內牆的顏色 */
  walls: Record<WallTone, string>;
  /** 內牆的紋路 */
  grain: string;
  /** 設備：主體、副色、亮面 */
  body: string;
  sub: string;
  pale: string;
  steel: string;
  steelHi: string;
  wood: string;
  woodHi: string;
  glass: string;
  cloth: string;
  brass: string;
  blood: string;
  fire: string;
  spark: string;
  sign: string;
  /** 地層：表土、中層、深層 */
  earth: readonly [string, string, string];
  /** PL 用的偽裝（砌石） */
  camo: string;
  roof: string;
  emergency: string;
  water: string;
  warm: string;
  cold: string;
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

const color: Palette = {
  id: 'color',
  dark: false,
  paper: '#e9e2cc',
  ink: '#30352e',
  muted: '#7b7864',
  structure: '#8b8c82',
  hatch: 'rgba(48, 53, 46, 0.42)',
  walls: {
    plaster: '#e6dec7',
    concrete: '#c3c5bc',
    tile: '#cfdcd7',
    wood: '#c9b28f',
    stone: '#a9a89d',
    brick: '#c9ad97',
    metal: '#afbbbd',
  },
  grain: 'rgba(48, 53, 46, 0.13)',
  body: '#776a51',
  sub: '#9e9174',
  pale: '#dad0b5',
  steel: '#66777b',
  steelHi: '#9cadb0',
  wood: '#835d3b',
  woodHi: '#b0885c',
  glass: '#83b8c1',
  cloth: '#94473f',
  brass: '#c79d4c',
  blood: '#86191d',
  fire: '#df7429',
  spark: '#6fd6f0',
  sign: '#2c9a63',
  earth: ['#554c3e', '#423b31', '#2c2824'],
  camo: '#3a4240',
  roof: '#3c4543',
  emergency: '#dc3a2f',
  water: '#2c6c7e',
  warm: '#f4d17a',
  cold: '#a7e3df',
  sky: {
    clear: ['#9fbac2', '#d9dbcd'],
    dusk: ['#4a4761', '#cd8f66'],
    rain: ['#25323b', '#41535b'],
    storm: ['#161f28', '#2d3a45'],
    blackout: ['#10171e', '#1d2831'],
  },
  select: '#f0c34f',
  gm: '#d8864f',
};

interface Base {
  id: StyleId;
  paper: string;
  ink: string;
  dark: boolean;
  glass: string;
  brass: string;
  water: string;
  warm: string;
  cold: string;
  emergency: string;
  blood: string;
  fire: string;
}

/** 紙與墨調出來的配色 */
function derived(b: Base): Palette {
  const m = (t: number) => mix(b.paper, b.ink, t);
  const d = b.dark;
  const structure = d ? mix(b.paper, '#000000', 0.25) : m(0.24);
  const wall = d ? m(0.07) : mix(b.paper, '#ffffff', 0.25);
  const sky = d
    ? ([mix(b.paper, '#000000', 0.3), m(0.07)] as const)
    : ([m(0.07), b.paper] as const);
  const wet = d
    ? ([mix(b.paper, '#000000', 0.38), m(0.04)] as const)
    : ([m(0.2), m(0.04)] as const);
  return {
    id: b.id,
    dark: d,
    paper: b.paper,
    ink: b.ink,
    muted: m(0.55),
    structure,
    hatch: alpha(b.ink, d ? 0.34 : 0.4),
    walls: {
      plaster: wall,
      concrete: mix(wall, b.ink, d ? 0.04 : 0.07),
      tile: mix(wall, b.glass, 0.16),
      wood: mix(wall, b.ink, d ? 0.08 : 0.12),
      stone: mix(wall, '#000000', d ? 0.18 : 0.1),
      brick: mix(wall, b.ink, d ? 0.06 : 0.1),
      metal: mix(wall, b.glass, 0.28),
    },
    grain: alpha(b.ink, d ? 0.12 : 0.14),
    body: m(d ? 0.18 : 0.24),
    sub: m(d ? 0.3 : 0.12),
    pale: m(d ? 0.1 : 0.04),
    steel: m(d ? 0.26 : 0.3),
    steelHi: m(d ? 0.38 : 0.14),
    wood: m(d ? 0.22 : 0.28),
    woodHi: m(d ? 0.32 : 0.15),
    glass: b.glass,
    cloth: m(d ? 0.34 : 0.32),
    brass: b.brass,
    blood: b.blood,
    fire: b.fire,
    spark: b.cold,
    sign: b.brass,
    earth: d
      ? [mix(b.paper, '#000000', 0.12), mix(b.paper, '#000000', 0.25), mix(b.paper, '#000000', 0.4)]
      : [m(0.34), m(0.44), m(0.54)],
    camo: d ? mix(b.paper, '#000000', 0.18) : m(0.3),
    roof: d ? mix(b.paper, '#000000', 0.15) : m(0.34),
    emergency: b.emergency,
    water: b.water,
    warm: b.warm,
    cold: b.cold,
    sky: { clear: sky, dusk: sky, rain: wet, storm: wet, blackout: wet },
    select: d ? '#ffd45e' : '#e0a800',
    gm: '#e0874e',
  };
}

const blueprint = derived({
  id: 'blueprint',
  paper: '#19384f',
  ink: '#ebe3c5',
  dark: true,
  glass: '#5d97ad',
  brass: '#e6c47c',
  water: '#256884',
  warm: '#f6e2b2',
  cold: '#a4e3ec',
  emergency: '#ee6150',
  blood: '#d36a5d',
  fire: '#e9a05a',
});

const parchment = derived({
  id: 'parchment',
  paper: '#dfca98',
  ink: '#49381f',
  dark: false,
  glass: '#b7c5b0',
  brass: '#8d6a2f',
  water: '#577a79',
  warm: '#f6d788',
  cold: '#c8d8c0',
  emergency: '#b53b29',
  blood: '#7c2420',
  fire: '#d38a3f',
});

const draft = derived({
  id: 'draft',
  paper: '#f5f4ee',
  ink: '#2d3e37',
  dark: false,
  glass: '#d3e3e1',
  brass: '#8f9988',
  water: '#6ea0ad',
  warm: '#f3d98e',
  cold: '#b2dadd',
  emergency: '#c3402f',
  blood: '#7d2725',
  fire: '#d9873e',
});

const noir = derived({
  id: 'noir',
  paper: '#111315',
  ink: '#e2d7bb',
  dark: true,
  glass: '#3c5059',
  brass: '#ccad67',
  water: '#1d4756',
  warm: '#ecd08c',
  cold: '#7ab9c6',
  emergency: '#dc4a3c',
  blood: '#c65650',
  fire: '#dc8d44',
});

const terminal = derived({
  id: 'terminal',
  paper: '#05130f',
  ink: '#66eabb',
  dark: true,
  glass: '#1d5a4a',
  brass: '#5fe8b6',
  water: '#0e4e54',
  warm: '#76f4c9',
  cold: '#66eabb',
  emergency: '#ff5648',
  blood: '#ff5648',
  fire: '#74f4c9',
});

export const PALETTES: Record<StyleId, Palette> = {
  color,
  blueprint,
  parchment,
  draft,
  noir,
  terminal,
};

export const paletteOf = (id: StyleId): Palette => PALETTES[id] ?? color;
