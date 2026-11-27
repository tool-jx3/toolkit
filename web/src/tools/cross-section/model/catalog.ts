/**
 * 側面的設備與家具（第一批 30 種：設施・研究 16、門・窗・梯子 5、事件・異變 9；列車專用 6 種是第二批）。
 * 大小（格）、掛的位置、光的範圍參考原作的數值；圖形與名字是本站自己的（draw/fixtures、strings.ts）。
 */
import type { Moment, RoomUse, WallTone } from './types';

export type FixtureCategory = 'facility' | 'opening' | 'incident';
export const FIXTURE_CATEGORIES: readonly FixtureCategory[] = ['facility', 'opening', 'incident'];

/** 掛的位置：地板上、牆上（可以調高度）、天花板下 */
export type Hang = 'floor' | 'wall' | 'ceiling';

export type LightColor = 'warm' | 'cold' | 'emergency';

export interface FixtureDef {
  kind: string;
  group: FixtureCategory;
  /** 寬、高（格） */
  width: number;
  height: number;
  hang: Hang;
  /** 光：半徑（格）、顏色、光的中心離底部多高（往上是負的） */
  glow?: { radius: number; tone: LightColor; lift: number };
  /** 停電時也亮著（緊急照明、自己有電源的設備、火與火花） */
  backup?: boolean;
  /** 從地板一路接到天花板（手術燈的吊臂、鍋爐的煙道、梯子） */
  reach?: boolean;
  /** 貼在地上的（不畫落影） */
  flat?: boolean;
  /** 預設的出現時機 */
  only?: Moment;
  /** 可以選的樣式（第一個是預設） */
  styles?: readonly string[];
}

type Extra = {
  glow?: readonly [number, LightColor, number];
  backup?: true;
  reach?: true;
  flat?: true;
  after?: true;
  styles?: readonly string[];
};
type Row = readonly [kind: string, width: number, height: number, hang: Hang, extra?: Extra];

/* 一列一種：種類、寬、高、掛的位置、其他（光〔半徑、顏色、高度〕…） */
const TABLE: Record<FixtureCategory, readonly Row[]> = {
  facility: [
    ['tank', 2, 4.1, 'floor', { glow: [2.4, 'cold', -2.2], backup: true }],
    ['console', 3.1, 2.35, 'floor', { glow: [2.1, 'cold', -1.5], backup: true }],
    ['surgery', 3.4, 4.5, 'floor', { glow: [2.8, 'cold', -3.5], reach: true }],
    ['bench', 3.4, 2.3, 'floor', { styles: ['lab', 'kitchen'] }],
    ['bed', 3.1, 1.75, 'floor'],
    ['shelf', 2.7, 3.85, 'floor'],
    ['desk', 3, 2.05, 'floor', { glow: [1.8, 'warm', -1.5] }],
    ['counter', 3.4, 2.2, 'floor', { glow: [1.9, 'warm', -1.6] }],
    ['locker', 2.5, 3.1, 'floor'],
    [
      'boiler',
      3.6,
      3.5,
      'floor',
      { glow: [2, 'warm', -1.2], reach: true, styles: ['steam', 'electric'] },
    ],
    ['pipes', 4.4, 1.15, 'ceiling'],
    ['crates', 2.8, 2.1, 'floor'],
    ['altar', 3.6, 3.3, 'floor', { glow: [2.7, 'warm', -2] }],
    ['lamp', 1.7, 1.05, 'ceiling', { glow: [3.2, 'warm', -0.6] }],
    ['camera', 1.3, 0.9, 'ceiling'],
    ['exit', 1.5, 0.85, 'ceiling', { glow: [2, 'emergency', -0.4], backup: true }],
  ],
  opening: [
    ['door', 1.85, 3.45, 'floor'],
    ['blastdoor', 2.05, 3.55, 'floor'],
    ['bars', 2.1, 3.6, 'floor'],
    ['window', 2.5, 2, 'wall'],
    ['hatch', 1.5, 4.8, 'floor', { reach: true }],
  ],
  /* 事件・異變：預設只在事件後 */
  incident: [
    ['bloodwall', 2.5, 2.6, 'wall'],
    ['bloodpool', 2.6, 0.75, 'floor', { flat: true }],
    ['chalk', 3, 1.55, 'floor', { flat: true }],
    ['upset', 2.8, 1.65, 'floor'],
    ['boards', 2.6, 2.9, 'floor'],
    ['glass', 2.3, 0.9, 'floor', { flat: true }],
    ['spark', 1.8, 2.2, 'ceiling', { glow: [2.2, 'cold', -1.4], backup: true }],
    ['talisman', 2.1, 2.4, 'wall'],
    ['rubble', 3.1, 2.5, 'floor', { glow: [3, 'warm', -1.1], backup: true }],
  ],
};

export const FIXTURES: readonly FixtureDef[] = FIXTURE_CATEGORIES.flatMap((group) =>
  TABLE[group].map(([kind, width, height, hang, x]): FixtureDef => {
    const d: FixtureDef = { kind, group, width, height, hang };
    if (x?.glow) d.glow = { radius: x.glow[0], tone: x.glow[1], lift: x.glow[2] };
    if (x?.backup) d.backup = true;
    if (x?.reach) d.reach = true;
    if (x?.flat) d.flat = true;
    if (x?.styles) d.styles = x.styles;
    if (group === 'incident') d.only = 'after';
    return d;
  }),
);

const BY_KIND = new Map(FIXTURES.map((d) => [d.kind, d]));
export const fixtureDef = (kind: string): FixtureDef | undefined => BY_KIND.get(kind);
export const isFixtureKind = (kind: unknown): kind is string =>
  typeof kind === 'string' && BY_KIND.has(kind);

/** 變電設備（鍋爐的另一種樣式）的光是冷色 */
export const lightColorOf = (d: FixtureDef, variant?: string): LightColor | null =>
  d.glow ? (d.kind === 'boiler' && variant === 'electric' ? 'cold' : d.glow.tone) : null;

/* ---------- 區域的用途：選了就換內牆與一組設備（本站自己的配置） ---------- */

export interface UsePreset {
  wall: WallTone;
  /** [種類, 左右位置, 牆上的高度?, 反轉?, 樣式?] */
  items: readonly (readonly [string, number, number?, boolean?, string?])[];
}

export const ROOM_USES: readonly RoomUse[] = [
  'lobby',
  'office',
  'lab',
  'surgery',
  'control',
  'cell',
  'ward',
  'library',
  'kitchen',
  'machine',
  'storage',
  'ritual',
  'empty',
];

export const USE_PRESETS: Record<RoomUse, UsePreset> = {
  lobby: {
    wall: 'plaster',
    items: [
      ['lamp', 0.3],
      ['lamp', 0.7],
      ['exit', 0.1],
      ['door', 0.08],
      ['counter', 0.52],
      ['window', 0.88, 0.42],
    ],
  },
  office: {
    wall: 'plaster',
    items: [
      ['lamp', 0.45],
      ['shelf', 0.15],
      ['desk', 0.58],
      ['window', 0.88, 0.4],
    ],
  },
  lab: {
    wall: 'tile',
    items: [
      ['pipes', 0.46],
      ['camera', 0.9, undefined, true],
      ['tank', 0.16],
      ['tank', 0.42],
      ['bench', 0.78],
    ],
  },
  surgery: {
    wall: 'tile',
    items: [
      ['exit', 0.88],
      ['surgery', 0.5],
      ['locker', 0.12],
    ],
  },
  control: {
    wall: 'metal',
    items: [
      ['lamp', 0.52],
      ['camera', 0.08],
      ['console', 0.28],
      ['console', 0.74],
    ],
  },
  cell: {
    wall: 'concrete',
    items: [
      ['camera', 0.9, undefined, true],
      ['bars', 0.14],
      ['bed', 0.62],
    ],
  },
  ward: {
    wall: 'plaster',
    items: [
      ['lamp', 0.48],
      ['bed', 0.28],
      ['desk', 0.8],
    ],
  },
  library: {
    wall: 'wood',
    items: [
      ['lamp', 0.55],
      ['shelf', 0.14],
      ['shelf', 0.4],
      ['desk', 0.78],
    ],
  },
  kitchen: {
    wall: 'tile',
    items: [
      ['lamp', 0.4],
      ['bench', 0.36, undefined, false, 'kitchen'],
      ['crates', 0.82],
    ],
  },
  machine: {
    wall: 'concrete',
    items: [
      ['pipes', 0.55],
      ['boiler', 0.38],
      ['blastdoor', 0.9],
    ],
  },
  storage: {
    wall: 'brick',
    items: [
      ['lamp', 0.5],
      ['crates', 0.25],
      ['locker', 0.78],
    ],
  },
  ritual: {
    wall: 'stone',
    items: [
      ['blastdoor', 0.1],
      ['altar', 0.5],
      ['talisman', 0.86, 0.44, false],
    ],
  },
  empty: { wall: 'concrete', items: [['lamp', 0.5]] },
};

export const isRoomUse = (v: unknown): v is RoomUse => ROOM_USES.includes(v as RoomUse);
