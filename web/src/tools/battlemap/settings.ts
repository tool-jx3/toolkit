/**
 * 戰鬥地圖的格局設定（2026-10-30 新增：生成法、各生成法的參數、地圖尺寸、每格 px）。
 * 這些設定記在這個瀏覽器（localStorage `trpg-toolkit:battlemap`）；地形、格線、火光照舊不記（規格 F26）。
 * 讀進來的值一律經過 normalizeSettings（存檔可能被手改或來自更新的版本）。
 */

export const GENERATOR_IDS = ['rooms', 'digger', 'uniform', 'rogue', 'cave', 'maze'] as const;
export type GeneratorId = (typeof GENERATOR_IDS)[number];

/** 有房間的生成法（地圖資訊顯示房間數、火光一間一團） */
export const ROOM_GENERATORS: readonly GeneratorId[] = ['rooms', 'digger', 'uniform', 'rogue'];

export const DENSITY_IDS = ['low', 'normal', 'high'] as const;
export type Density = (typeof DENSITY_IDS)[number];

export const MAZE_STYLES = ['divided', 'eller', 'icey'] as const;
export type MazeStyle = (typeof MAZE_STYLES)[number];

/** 迷宮走道的寬度（格）；牆一律 1 格 */
export const MAZE_WIDTHS = [1, 2, 3] as const;
export type MazeWidth = (typeof MAZE_WIDTHS)[number];

/** 每格 px（VTT 常用的 50／70／100；floor-plan 的 VTT 匯出同一組） */
export const CELL_PX_OPTIONS = [50, 70, 100] as const;
export type CellPx = (typeof CELL_PX_OPTIONS)[number];

/** 欄數、列數的範圍 */
export const MIN_CELLS = 10;
export const MAX_CELLS = 60;
/**
 * 整張圖每邊最多 4096 px：手機瀏覽器（iOS Safari 的畫布上限約 1,677 萬像素＝4096²）與不少 VTT 的貼圖上限。
 * 所以每格 100 px 時最多 40 格、70 px 時 58 格、50 px 時 60 格。
 */
export const MAX_SIDE_PX = 4096;

/** 洞窟：填充率（一開始是岩石的比例，%）與平滑次數 */
export const CAVE_FILL_MIN = 30;
export const CAVE_FILL_MAX = 60;
export const CAVE_SMOOTH_MIN = 0;
export const CAVE_SMOOTH_MAX = 8;

export interface LayoutSettings {
  generator: GeneratorId;
  /** 欄數、列數（格） */
  cols: number;
  rows: number;
  /** 每格 px */
  cellPx: CellPx;
  /** 房間密度（房間＋走道、挖掘式、均勻房間、格狀房間） */
  density: Density;
  /** 洞窟的填充率（%） */
  caveFill: number;
  /** 洞窟的平滑次數 */
  caveSmooth: number;
  /** 迷宮的演算法 */
  mazeStyle: MazeStyle;
  /** 迷宮的走道寬度（格） */
  mazeWidth: MazeWidth;
}

/** 預設＝改版前的固定值：房間＋走道、22 × 16 格、每格 70 px */
export const DEFAULT_SETTINGS: LayoutSettings = {
  generator: 'rooms',
  cols: 22,
  rows: 16,
  cellPx: 70,
  density: 'normal',
  caveFill: 45,
  caveSmooth: 4,
  mazeStyle: 'divided',
  mazeWidth: 2,
};

/** 這個每格 px 下，欄數（列數）最多幾格 */
export const maxCellsFor = (cellPx: number): number =>
  Math.min(MAX_CELLS, Math.floor(MAX_SIDE_PX / cellPx));

const clampInt = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
};

const oneOf = <T>(values: readonly T[], v: unknown, fallback: T): T =>
  values.includes(v as T) ? (v as T) : fallback;

/** 把任何輸入整理成合法的設定（不認得的值換成預設；尺寸夾在範圍內，並配合每格 px 的上限） */
export function normalizeSettings(raw: unknown): LayoutSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<
    Record<keyof LayoutSettings, unknown>
  >;
  const d = DEFAULT_SETTINGS;
  const cellPx = oneOf(CELL_PX_OPTIONS, r.cellPx, d.cellPx);
  const max = maxCellsFor(cellPx);
  return {
    generator: oneOf(GENERATOR_IDS, r.generator, d.generator),
    cols: clampInt(r.cols, MIN_CELLS, max, d.cols),
    rows: clampInt(r.rows, MIN_CELLS, max, d.rows),
    cellPx,
    density: oneOf(DENSITY_IDS, r.density, d.density),
    caveFill: clampInt(r.caveFill, CAVE_FILL_MIN, CAVE_FILL_MAX, d.caveFill),
    caveSmooth: clampInt(r.caveSmooth, CAVE_SMOOTH_MIN, CAVE_SMOOTH_MAX, d.caveSmooth),
    mazeStyle: oneOf(MAZE_STYLES, r.mazeStyle, d.mazeStyle),
    mazeWidth: oneOf(MAZE_WIDTHS, r.mazeWidth, d.mazeWidth),
  };
}

/** 尺寸是不是改版前的 22 × 16、70 px（檔名只在不同時加上尺寸） */
export const isDefaultSize = (s: Pick<LayoutSettings, 'cols' | 'rows' | 'cellPx'>): boolean =>
  s.cols === DEFAULT_SETTINGS.cols &&
  s.rows === DEFAULT_SETTINGS.rows &&
  s.cellPx === DEFAULT_SETTINGS.cellPx;
