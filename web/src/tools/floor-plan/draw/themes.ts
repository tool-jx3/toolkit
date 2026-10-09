/**
 * 地圖的顯示樣式（五種）：只換顏色與字型，結構不變。顏色是本站自己配的。
 */
import type { RoomCategory, ThemeId } from '../model/types';

/** 家具的配色（每個家具的畫法只用這些名字） */
export interface FurnPalette {
  /** 家具本體 */
  paper: string;
  /** 線 */
  ink: string;
  /** 淡的填色（椅墊、抽屜） */
  tint: string;
  /** 深的填色 */
  shade: string;
  /** 淡的線 */
  faint: string;
  water: string;
  leaf: string;
  leafInk: string;
  alert: string;
  blood: string;
  gold: string;
  occult: string;
  occultTint: string;
  fire: string;
  chalk: string;
  cloth: string;
  wood: string;
  screen: string;
}

export interface FloorTheme {
  id: ThemeId;
  bg: string;
  grid: string;
  gridMajor: string;
  wall: string;
  rail: string;
  label: string;
  sub: string;
  halo: string;
  /** 房間種類的底色；沒有列的用 defaultFill（戶外用 outdoorFill） */
  fills: Partial<Record<RoomCategory, string>>;
  defaultFill: string;
  outdoorFill?: string;
  pattern: string;
  furn: FurnPalette;
  door: string;
  arc: string;
  window: string;
  glass: string;
  /** GM 專用的標示色 */
  gm: string;
  /** 隱藏線索的標示色 */
  clue: string;
  font: string;
}

export const SANS =
  '"Noto Sans TC", "PingFang TC", "Microsoft JhengHei", "Heiti TC", system-ui, sans-serif';
export const SERIF = '"Noto Serif TC", "Songti TC", "PMingLiU", "MingLiU", serif';

const clean: FloorTheme = {
  id: 'clean',
  bg: '#ffffff',
  grid: 'rgba(40, 72, 116, 0.07)',
  gridMajor: 'rgba(40, 72, 116, 0.16)',
  wall: '#2b2f37',
  rail: '#79808b',
  label: '#252930',
  sub: '#6e7683',
  halo: 'rgba(255, 255, 255, 0.86)',
  fills: {
    living: '#fbeed6',
    bedroom: '#e2efe0',
    washitsu: '#eef1d2',
    kitchen: '#fde5d2',
    wet: '#d9eaf7',
    hall: '#f0eee9',
    storage: '#e5e0d6',
    public: '#f6ebd2',
    office: '#e6e4f4',
    medical: '#d8f0ec',
    special: '#efe0f5',
    danger: '#f7d9d4',
    garage: '#e4e6ea',
    balcony: '#e9eef3',
    garden: '#d9ecc9',
    porch: '#ebe6dc',
    doma: '#e6d6be',
    tech: '#dde5ee',
    field: '#ece0b6',
    water: '#c6e1f5',
    cave: '#dbd2c4',
  },
  defaultFill: '#ffffff',
  pattern: 'rgba(58, 68, 88, 0.13)',
  furn: {
    paper: '#ffffff',
    ink: '#565d69',
    tint: '#eceef2',
    shade: '#8d939d',
    faint: '#a6acb5',
    water: '#d2e7f7',
    leaf: '#b6d8a3',
    leafInk: '#689857',
    alert: '#d5463f',
    blood: 'rgba(138, 20, 22, 0.76)',
    gold: '#f1c138',
    occult: '#77308c',
    occultTint: '#e7d2f0',
    fire: '#ffac34',
    chalk: '#4a5261',
    cloth: '#f3e4cf',
    wood: '#e7cfaa',
    screen: '#3b7ad6',
  },
  door: '#393e48',
  arc: '#8b929d',
  window: '#58606b',
  glass: '#9ecdf1',
  gm: '#8a3fd2',
  clue: '#d97806',
  font: SANS,
};

const mono: FloorTheme = {
  id: 'mono',
  bg: '#ffffff',
  grid: 'rgba(0, 0, 0, 0.06)',
  gridMajor: 'rgba(0, 0, 0, 0.13)',
  wall: '#141414',
  rail: '#585858',
  label: '#141414',
  sub: '#585858',
  halo: 'rgba(255, 255, 255, 0.9)',
  fills: {},
  defaultFill: '#ffffff',
  outdoorFill: '#ffffff',
  pattern: 'rgba(0, 0, 0, 0.1)',
  furn: {
    paper: '#ffffff',
    ink: '#353535',
    tint: '#efefef',
    shade: '#9b9b9b',
    faint: '#9d9d9d',
    water: '#ffffff',
    leaf: '#ffffff',
    leafInk: '#454545',
    alert: '#454545',
    blood: 'rgba(40, 40, 40, 0.55)',
    gold: '#ffffff',
    occult: '#232323',
    occultTint: '#ededed',
    fire: '#9b9b9b',
    chalk: '#353535',
    cloth: '#f5f5f5',
    wood: '#f1f1f1',
    screen: '#454545',
  },
  door: '#141414',
  arc: '#686868',
  window: '#353535',
  glass: '#ffffff',
  gm: '#7a3bb8',
  clue: '#b45309',
  font: SANS,
};

const blueprint: FloorTheme = {
  id: 'blueprint',
  bg: '#1a4782',
  grid: 'rgba(255, 255, 255, 0.08)',
  gridMajor: 'rgba(255, 255, 255, 0.17)',
  wall: '#f1f6ff',
  rail: '#bad1f3',
  label: '#f1f6ff',
  sub: '#bad1f3',
  halo: 'rgba(26, 71, 130, 0.86)',
  fills: {},
  defaultFill: 'rgba(255, 255, 255, 0.05)',
  outdoorFill: 'rgba(255, 255, 255, 0.02)',
  pattern: 'rgba(255, 255, 255, 0.12)',
  furn: {
    paper: 'rgba(255, 255, 255, 0.06)',
    ink: '#d9e7ff',
    tint: 'rgba(255, 255, 255, 0.14)',
    shade: 'rgba(255, 255, 255, 0.34)',
    faint: '#9dbbe5',
    water: 'rgba(255, 255, 255, 0.12)',
    leaf: 'rgba(255, 255, 255, 0.1)',
    leafInk: '#cde0fa',
    alert: '#ffb6b6',
    blood: 'rgba(255, 160, 160, 0.45)',
    gold: 'rgba(255, 255, 255, 0.2)',
    occult: '#ffd2f1',
    occultTint: 'rgba(255, 255, 255, 0.12)',
    fire: '#ffe7a6',
    chalk: '#ffffff',
    cloth: 'rgba(255, 255, 255, 0.05)',
    wood: 'rgba(255, 255, 255, 0.1)',
    screen: 'rgba(255, 255, 255, 0.26)',
  },
  door: '#f1f6ff',
  arc: '#9dbbe5',
  window: '#d9e7ff',
  glass: 'rgba(255, 255, 255, 0.35)',
  gm: '#ffd36a',
  clue: '#7defc7',
  font: SANS,
};

const paper: FloorTheme = {
  id: 'paper',
  bg: '#efe2c4',
  grid: 'rgba(96, 70, 40, 0.08)',
  gridMajor: 'rgba(96, 70, 40, 0.16)',
  wall: '#493725',
  rail: '#7c6345',
  label: '#3e2e1e',
  sub: '#7c6345',
  halo: 'rgba(239, 226, 196, 0.86)',
  fills: {
    living: '#e8d7b3',
    bedroom: '#e2d9b3',
    washitsu: '#e5dbac',
    kitchen: '#e9d1aa',
    wet: '#dbd6bd',
    hall: '#eadec0',
    storage: '#dccfae',
    public: '#e8d4ad',
    office: '#dfd4b8',
    medical: '#dbdabe',
    special: '#dfccb6',
    danger: '#e1c1aa',
    garage: '#dbd1b9',
    balcony: '#e6dbbe',
    garden: '#d8dbb0',
    porch: '#e2d6b9',
    doma: '#dfcda9',
    tech: '#dbd5c0',
    field: '#ded4a5',
    water: '#d0d7c6',
    cave: '#d4c8ab',
  },
  defaultFill: '#efe2c4',
  pattern: 'rgba(96, 70, 40, 0.14)',
  furn: {
    paper: '#f3e8cf',
    ink: '#5c472f',
    tint: '#e1d1b0',
    shade: '#9b8465',
    faint: '#9b8465',
    water: '#e1dbc2',
    leaf: '#ced2a1',
    leafInk: '#6e6f3f',
    alert: '#8d3a29',
    blood: 'rgba(108, 30, 20, 0.7)',
    gold: '#e8c679',
    occult: '#6a2929',
    occultTint: '#dbc3aa',
    fire: '#d8912b',
    chalk: '#5c472f',
    cloth: '#e5d1aa',
    wood: '#dbc096',
    screen: '#5c6e7f',
  },
  door: '#493725',
  arc: '#897051',
  window: '#5c472f',
  glass: '#d8d5bf',
  gm: '#8d3a89',
  clue: '#b4641c',
  font: SERIF,
};

const horror: FloorTheme = {
  id: 'horror',
  bg: '#16151a',
  grid: 'rgba(255, 255, 255, 0.04)',
  gridMajor: 'rgba(255, 255, 255, 0.085)',
  wall: '#d9d0c1',
  rail: '#8a8378',
  label: '#eae2d4',
  sub: '#a49b8c',
  halo: 'rgba(22, 21, 26, 0.86)',
  fills: {
    living: '#2b2628',
    bedroom: '#252b27',
    washitsu: '#2c2b23',
    kitchen: '#2f2623',
    wet: '#212731',
    hall: '#252427',
    storage: '#201e20',
    public: '#2c2725',
    office: '#26232c',
    medical: '#202b2b',
    special: '#2f2132',
    danger: '#3c1e1e',
    garage: '#212123',
    balcony: '#1f1f23',
    garden: '#1c241b',
    porch: '#211f23',
    doma: '#2b2521',
    tech: '#21262d',
    field: '#26261a',
    water: '#1a2632',
    cave: '#282321',
  },
  defaultFill: '#16151a',
  pattern: 'rgba(255, 255, 255, 0.05)',
  furn: {
    paper: '#35313b',
    ink: '#b3aa9c',
    tint: '#403b44',
    shade: '#5f5862',
    faint: '#7f776c',
    water: '#2e3a46',
    leaf: '#2e3c2b',
    leafInk: '#6d7f63',
    alert: '#a83535',
    blood: 'rgba(152, 18, 18, 0.85)',
    gold: '#caa33a',
    occult: '#c63d3d',
    occultTint: '#4b2a2f',
    fire: '#ffb240',
    chalk: '#eae2d4',
    cloth: '#362f34',
    wood: '#4b3c31',
    screen: '#5371a4',
  },
  door: '#d9d0c1',
  arc: '#8a8378',
  window: '#b3aa9c',
  glass: '#3a4856',
  gm: '#e25d9c',
  clue: '#ffb020',
  font: SERIF,
};

export const THEMES: Record<ThemeId, FloorTheme> = { clean, mono, blueprint, paper, horror };

export function getTheme(id: string | null | undefined): FloorTheme {
  return (id && THEMES[id as ThemeId]) || clean;
}

/** 房間的底色：自訂色 → 種類的底色 → 戶外的底色 → 預設 */
export function roomFill(
  theme: FloorTheme,
  room: { cat: RoomCategory; color?: string },
  outdoor = false,
): string {
  if (room.color) return room.color;
  return (
    theme.fills[room.cat] ?? (outdoor && theme.outdoorFill ? theme.outdoorFill : theme.defaultFill)
  );
}
