/**
 * 世界地圖的資料結構（本站自己的格式；原作的作業檔另外轉換，見 normalize.ts）。
 *
 * - 地圖是 cols × rows 個 12 px 的格子（第一批固定 128 × 80＝1536 × 960 px；資料帶著格數，之後可以開放別的尺寸）。
 * - 地形分兩層：`terrain`＝畫出來的地形（海、平原、森林、山地、沙漠、雪原、濕地），
 *   `ground`＝地表（森林與山地底下的平原／沙漠／雪原／濕地；其他格子和 terrain 相同、海是 0）。
 *   兩層都存成一格一個字元的字串（'0'～'6'），存檔小、復原紀錄不必複製陣列。
 * - 座標一律是地圖的 px（左上角原點）。
 */

/** 一格的邊長（px） */
export const CELL = 12;
/** 方格筆刷的一格＝2 × 2 個格子（24 px） */
export const GRID_STEP = 2;
export const GRID_PX = CELL * GRID_STEP;
export const DEFAULT_COLS = 128;
export const DEFAULT_ROWS = 80;

/** 地圖的尺寸（第二批；格數都是偶數，方格筆刷的 2 × 2 對得齊） */
export type MapSizeId = 'wide' | 'hd' | 'square' | 'portrait';
export const MAP_SIZES: Record<MapSizeId, { cols: number; rows: number }> = {
  wide: { cols: 128, rows: 80 },
  hd: { cols: 128, rows: 72 },
  square: { cols: 96, rows: 96 },
  portrait: { cols: 80, rows: 128 },
};
export const MAP_SIZE_IDS = Object.keys(MAP_SIZES) as MapSizeId[];
export const mapSizeOf = (cols: number, rows: number): MapSizeId | null =>
  MAP_SIZE_IDS.find((k) => MAP_SIZES[k].cols === cols && MAP_SIZES[k].rows === rows) ?? null;

/** 地形代碼 */
export const SEA = 0;
export const PLAIN = 1;
export const FOREST = 2;
export const MOUNTAIN = 3;
export const DESERT = 4;
export const SNOW = 5;
export const MARSH = 6;
export type Terrain = 0 | 1 | 2 | 3 | 4 | 5 | 6;
/** 地表（森林與山地底下）只會是這幾種 */
export type Ground = 0 | 1 | 4 | 5 | 6;
export const SURFACES = [PLAIN, DESERT, SNOW, MARSH] as const;
/** 筆刷能畫的地形（按鈕的順序） */
export const PAINTS = [PLAIN, FOREST, MOUNTAIN, DESERT, SNOW, MARSH] as const;
export type Paint = (typeof PAINTS)[number];
/** 筆刷的動作：畫地形、回到海、只擦掉山與森林 */
export type BrushAction = Paint | 'sea' | 'relief';

export type DrawMode = 'grid' | 'free';
export type ThemeId = 'parchment' | 'night' | 'atlas';
export const THEME_IDS: readonly ThemeId[] = ['parchment', 'night', 'atlas'];
export type FontStyle = 'serif' | 'sans' | 'rounded';
export const FONT_STYLES: readonly FontStyle[] = ['serif', 'sans', 'rounded'];
/** 國名、地名的個別字型：auto＝跟著整張地圖 */
export type LabelFont = 'auto' | FontStyle;
export const LABEL_FONTS: readonly LabelFont[] = ['auto', 'serif', 'sans', 'rounded'];
export type GridType = 'square' | 'hex';

export interface Pt {
  x: number;
  y: number;
}

export interface Region {
  id: string;
  name: string;
  color: string;
  points: Pt[];
  /** 塗色的不透明度（0＝不塗） */
  opacity: number;
  /** 四周圍上城牆 */
  wall: boolean;
  font: LabelFont;
  /** 國名的弧度（−100～100，0＝直線） */
  curve: number;
  labelSize: number;
  /** 國名離面積重心的位移 */
  labelDx: number;
  labelDy: number;
}

export type PathKind = 'river' | 'road' | 'sea' | 'border' | 'wall';
export const PATH_KINDS: readonly PathKind[] = ['river', 'road', 'sea', 'border', 'wall'];

export type TravelMode = 'walk' | 'horse' | 'ship';
export const TRAVEL_MODES: readonly TravelMode[] = ['walk', 'horse', 'ship'];
export type TravelDifficulty = 'easy' | 'normal' | 'hard' | 'extreme';
export const TRAVEL_DIFFICULTIES: readonly TravelDifficulty[] = [
  'easy',
  'normal',
  'hard',
  'extreme',
];
export type TravelAccess = 'auto' | 'passable' | 'blocked';
export const TRAVEL_ACCESS: readonly TravelAccess[] = ['auto', 'passable', 'blocked'];

export interface MapPath {
  id: string;
  kind: PathKind;
  /** 管理用的名字（不畫在地圖上） */
  name: string;
  points: Pt[];
  width: number;
  /** 平滑的曲線（城牆一律是折線） */
  smooth: boolean;
  secret: boolean;
  /* ---- 旅程概算（第二批；資料版本 2） ---- */
  /** 移動方式（沒有時：航路是船、其他是徒步） */
  travelMode?: TravelMode;
  /** 平地・平靜水面上一天走幾 km（沒有時照移動方式：徒步 30、騎乘 65、船 140） */
  dailyKm?: number;
  difficulty: TravelDifficulty;
  access: TravelAccess;
  /** 光看距離換算（不看地形、素材、川與「不能通行」） */
  simpleCalc: boolean;
}

export type DockSide = 'auto' | 'left' | 'right' | 'up' | 'down';
export const DOCK_SIDES: readonly DockSide[] = ['auto', 'left', 'right', 'up', 'down'];

export interface MapObject {
  id: string;
  /** 素材的種類（assets.ts） */
  kind: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  flip: boolean;
  /** 港口的棧橋方向 */
  dock: DockSide;
  name: string;
  secret: boolean;
  labelDx: number;
  labelDy: number;
}

export interface Note {
  id: string;
  text: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  font: LabelFont;
  curve: number;
  secret: boolean;
}

export interface MapSettings {
  /** 標題、羅盤、外框與比例尺 */
  frame: boolean;
  /** 國名與據點的名字 */
  names: boolean;
  /** 山與森林的圖案（關掉時只有地表的顏色） */
  details: boolean;
  /** 國界的虛線 */
  borders: boolean;
  /** 顯示用的格線 */
  grid: boolean;
  gridType: GridType;
  font: FontStyle;
  /** 比例尺：地圖上 100 px 是幾 km */
  kmPer100: number;
  /** 外框標題下的小字 */
  subtitle: string;
}

export interface WorldDoc {
  title: string;
  /** 地表花紋、山與森林的排法的種子 */
  seed: number;
  theme: ThemeId;
  drawMode: DrawMode;
  cols: number;
  rows: number;
  terrain: string;
  ground: string;
  regions: Region[];
  objects: MapObject[];
  paths: MapPath[];
  notes: Note[];
  settings: MapSettings;
}

/** 選取的對象 */
export type SelKind = 'region' | 'object' | 'path' | 'note';
export interface SelRef {
  kind: SelKind;
  id: string;
}

/** 數量上限（和原作相同） */
export const LIMITS = {
  regions: 80,
  paths: 200,
  objects: 1000,
  notes: 300,
  points: 256,
  title: 80,
  name: 80,
  note: 160,
} as const;

/** 各欄位的範圍與預設值 */
export const RANGES = {
  brush: { min: 2, max: 22, def: 7 },
  objectSize: { min: 12, max: 130, def: 38 },
  rotation: { min: -180, max: 180, def: 0 },
  labelOffset: 300,
  labelDy: 34,
  noteSize: { min: 12, max: 90, def: 26 },
  regionLabel: { min: 12, max: 90, def: 30 },
  opacity: { min: 0, max: 0.7, def: 0.23 },
  curve: { min: -100, max: 100, def: 0 },
  width: { min: 1, max: 16 },
  dailyKm: { min: 1, max: 1000 },
  kmPer100: { min: 0.01, max: 100000, def: 50 },
} as const;

export const pathWidthDefault = (kind: PathKind): number =>
  kind === 'river' || kind === 'wall' ? 5 : 3;
