/**
 * 房間種類、門窗種類、牆的種類、房間的預設尺寸（名稱在 strings.ts）。
 */
import type { OpeningKind, RoomCategory, SizeMode, ThemeId, WallKind } from './types';

/** 1 格的邊長（m） */
export const CELL_M = 0.5;
/** 1 坪（㎡）＝ 400 ÷ 121 */
export const PING_M2 = 400 / 121;

/** 地板花紋 */
export type FloorPattern =
  | 'tile'
  | 'deck'
  | 'tatami'
  | 'grass'
  | 'speckle'
  | 'water'
  | 'rows'
  | 'panel'
  | 'stone';

export interface CategoryInfo {
  id: RoomCategory;
  /** 戶外：不產生外牆；兩個戶外房間之間沒有牆 */
  outdoor?: boolean;
  /** 戶外房間的外圍：欄杆、岩壁或不畫 */
  edge?: 'rail' | 'rock' | 'none';
  pattern?: FloorPattern;
}

export const CATEGORIES: readonly CategoryInfo[] = [
  { id: 'living' },
  { id: 'bedroom' },
  { id: 'washitsu', pattern: 'tatami' },
  { id: 'kitchen' },
  { id: 'wet', pattern: 'tile' },
  { id: 'hall' },
  { id: 'storage' },
  { id: 'public' },
  { id: 'office' },
  { id: 'medical' },
  { id: 'special' },
  { id: 'danger' },
  { id: 'garage' },
  { id: 'balcony', outdoor: true, edge: 'rail', pattern: 'deck' },
  { id: 'garden', outdoor: true, edge: 'none', pattern: 'grass' },
  { id: 'porch', outdoor: true, edge: 'none', pattern: 'stone' },
  { id: 'doma', pattern: 'speckle' },
  { id: 'tech', pattern: 'panel' },
  { id: 'field', outdoor: true, edge: 'none', pattern: 'rows' },
  { id: 'water', outdoor: true, edge: 'none', pattern: 'water' },
  { id: 'cave', outdoor: true, edge: 'rock', pattern: 'speckle' },
];

export const CAT: Record<RoomCategory, CategoryInfo> = Object.fromEntries(
  CATEGORIES.map((c) => [c.id, c]),
) as Record<RoomCategory, CategoryInfo>;

export const isCategory = (v: unknown): v is RoomCategory =>
  typeof v === 'string' && Object.hasOwn(CAT, v);

export interface OpeningInfo {
  id: OpeningKind;
  group: 'door' | 'window';
  /** 預設寬度（格） */
  len: number;
  /** 只有 GM 看得到（PL 檢視畫成一般的牆） */
  gmOnly?: boolean;
}

export const OPENINGS: readonly OpeningInfo[] = [
  { id: 'door', group: 'door', len: 1.5 },
  { id: 'door2', group: 'door', len: 3 },
  { id: 'sliding', group: 'door', len: 1.5 },
  { id: 'sliding2', group: 'door', len: 3 },
  { id: 'folding', group: 'door', len: 2 },
  { id: 'auto', group: 'door', len: 3 },
  { id: 'shutter', group: 'door', len: 5 },
  { id: 'open', group: 'door', len: 2 },
  { id: 'locked', group: 'door', len: 1.5 },
  { id: 'secret', group: 'door', len: 1.5, gmOnly: true },
  { id: 'broken', group: 'door', len: 1.5 },
  { id: 'hole', group: 'door', len: 2 },
  { id: 'window', group: 'window', len: 2 },
  { id: 'window2', group: 'window', len: 3.5 },
  { id: 'barred', group: 'window', len: 2 },
  { id: 'boarded', group: 'window', len: 2 },
  { id: 'brokenwin', group: 'window', len: 2 },
];

export const OPEN: Record<OpeningKind, OpeningInfo> = Object.fromEntries(
  OPENINGS.map((o) => [o.id, o]),
) as Record<OpeningKind, OpeningInfo>;

export const isOpeningKind = (v: unknown): v is OpeningKind =>
  typeof v === 'string' && Object.hasOwn(OPEN, v);

/** 會畫開門弧線的門（可以換開的方向與鉸鍊） */
export const SWING_DOORS: ReadonlySet<OpeningKind> = new Set([
  'door',
  'door2',
  'locked',
  'secret',
  'broken',
]);

export interface WallInfo {
  id: WallKind;
  /** 厚度（格） */
  t: number;
}

export const WALL_KINDS: readonly WallInfo[] = [
  { id: 'ext', t: 0.34 },
  { id: 'int', t: 0.2 },
  { id: 'thin', t: 0.12 },
  { id: 'glass', t: 0.14 },
  { id: 'rail', t: 0.1 },
  { id: 'fence', t: 0.1 },
  { id: 'bars', t: 0.14 },
  { id: 'broken', t: 0.3 },
  { id: 'rock', t: 0.7 },
];

export const WALL: Record<WallKind, WallInfo> = Object.fromEntries(
  WALL_KINDS.map((w) => [w.id, w]),
) as Record<WallKind, WallInfo>;

export const isWallKind = (v: unknown): v is WallKind =>
  typeof v === 'string' && Object.hasOwn(WALL, v);

export const wallThickness = (kind: string | null | undefined): number =>
  (kind && isWallKind(kind) ? WALL[kind] : WALL.int).t;

/* ---------- 房間的預設尺寸（房間分頁的卡片） ---------- */

export type RoomPresetId =
  | 'ldk'
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'master'
  | 'bedroom'
  | 'washitsu'
  | 'kids'
  | 'study'
  | 'bath'
  | 'laundry'
  | 'toilet'
  | 'entrance'
  | 'hall'
  | 'stairs'
  | 'closet'
  | 'storage'
  | 'office'
  | 'meeting'
  | 'lobby'
  | 'guest'
  | 'ward'
  | 'exam'
  | 'surgery'
  | 'lab'
  | 'ritual'
  | 'sealed'
  | 'cell'
  | 'garage'
  | 'balcony'
  | 'garden'
  | 'porch'
  | 'doma'
  | 'deck'
  | 'cave'
  | 'water'
  | 'field';

export interface RoomPreset {
  id: RoomPresetId;
  cat: RoomCategory;
  w: number;
  h: number;
}

export type RoomPresetGroupId = 'home' | 'service' | 'facility' | 'special' | 'world';

const P = (id: RoomPresetId, cat: RoomCategory, w: number, h: number): RoomPreset => ({
  id,
  cat,
  w,
  h,
});

export const ROOM_PRESET_GROUPS: readonly { id: RoomPresetGroupId; items: RoomPreset[] }[] = [
  {
    id: 'home',
    items: [
      P('ldk', 'living', 12, 8),
      P('living', 'living', 9, 7),
      P('dining', 'kitchen', 6, 6),
      P('kitchen', 'kitchen', 5, 4),
      P('master', 'bedroom', 8, 7),
      P('bedroom', 'bedroom', 6, 6),
      P('washitsu', 'washitsu', 7, 7),
      P('kids', 'bedroom', 6, 5),
      P('study', 'office', 5, 6),
    ],
  },
  {
    id: 'service',
    items: [
      P('bath', 'wet', 4, 4),
      P('laundry', 'wet', 4, 3),
      P('toilet', 'wet', 2, 3),
      P('entrance', 'hall', 3, 4),
      P('hall', 'hall', 2, 8),
      P('stairs', 'hall', 3, 6),
      P('closet', 'storage', 2, 4),
      P('storage', 'storage', 6, 5),
    ],
  },
  {
    id: 'facility',
    items: [
      P('office', 'office', 12, 8),
      P('meeting', 'office', 8, 6),
      P('lobby', 'public', 14, 10),
      P('guest', 'bedroom', 7, 11),
      P('ward', 'medical', 8, 10),
      P('exam', 'medical', 6, 6),
      P('surgery', 'medical', 8, 8),
      P('lab', 'medical', 8, 7),
    ],
  },
  {
    id: 'special',
    items: [
      P('ritual', 'special', 10, 10),
      P('sealed', 'danger', 6, 6),
      P('cell', 'danger', 4, 5),
      P('garage', 'garage', 7, 11),
      P('balcony', 'balcony', 12, 3),
      P('garden', 'garden', 12, 8),
      P('porch', 'porch', 6, 3),
    ],
  },
  {
    id: 'world',
    items: [
      P('doma', 'doma', 8, 8),
      P('deck', 'tech', 8, 6),
      P('cave', 'cave', 12, 10),
      P('water', 'water', 8, 6),
      P('field', 'field', 12, 8),
    ],
  },
];

export const ROOM_PRESETS: Record<RoomPresetId, RoomPreset> = Object.fromEntries(
  ROOM_PRESET_GROUPS.flatMap((g) => g.items.map((p) => [p.id, p])),
) as Record<RoomPresetId, RoomPreset>;

export const isRoomPresetId = (v: unknown): v is RoomPresetId =>
  typeof v === 'string' && Object.hasOwn(ROOM_PRESETS, v);

export const THEME_IDS: readonly ThemeId[] = ['clean', 'mono', 'blueprint', 'paper', 'horror'];
export const isThemeId = (v: unknown): v is ThemeId =>
  typeof v === 'string' && (THEME_IDS as readonly string[]).includes(v);

export const SIZE_MODES: readonly SizeMode[] = ['none', 'ping', 'm2', 'm'];
export const isSizeMode = (v: unknown): v is SizeMode =>
  typeof v === 'string' && (SIZE_MODES as readonly string[]).includes(v);

/** 匯出時 1 格的像素數 */
export const EXPORT_PX = [24, 32, 48, 64, 96] as const;
export type ExportPx = (typeof EXPORT_PX)[number];
