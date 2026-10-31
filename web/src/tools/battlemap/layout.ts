/**
 * 戰鬥地圖的格局：地板、牆與空無（純資料，不依賴 DOM，方便單元測試）。
 *
 * - 生成法（gen/）決定哪些格子是地板；不是地板、但八方向上與地板相鄰的格子是牆，其餘是空無（規格 F15）。
 * - 每種生成法的地板都不碰到地圖最外一圈，所以牆一定把地板包住；所有地板四方向連成一塊。
 * - 預設（房間＋走道、22 × 16 格）與改版前取亂數的順序完全相同：同一個種子得到同一張圖（規格 F40）。
 */
import { createRandom } from '@/core/timeline';
import { generateCave } from './gen/cellular';
import { generateChain } from './gen/chain';
import { generateDigger } from './gen/digger';
import type { GridPoint } from './gen/lights';
import { generateMaze } from './gen/maze';
import { generateRogue } from './gen/rogue';
import type { Corridor, Generated, Room } from './gen/types';
import { generateUniform } from './gen/uniform';
import {
  DEFAULT_SETTINGS,
  type GeneratorId,
  type LayoutSettings,
  normalizeSettings,
  ROOM_GENERATORS,
} from './settings';

export { MAX_ROOM_SIDE, MIN_ROOM_SIDE, roomCenter } from './gen/chain';
export type { GridPoint } from './gen/lights';
export type { Corridor, Room } from './gen/types';

/** 預設尺寸（改版前固定的 22 × 16 格、每格 70 px） */
export const COLS = DEFAULT_SETTINGS.cols;
export const ROWS = DEFAULT_SETTINGS.rows;
export const CELL = DEFAULT_SETTINGS.cellPx;
export const MAP_WIDTH = COLS * CELL;
export const MAP_HEIGHT = ROWS * CELL;

/** 預設尺寸時「房間＋走道」的地板可以出現的範圍（含） */
export const FLOOR_MIN_COL = 1;
export const FLOOR_MAX_COL = COLS - 3;
export const FLOOR_MIN_ROW = 1;
export const FLOOR_MAX_ROW = ROWS - 3;

/** 預設尺寸、預設密度時「房間＋走道」的房間數 */
export const MIN_ROOMS = 5;
export const MAX_ROOMS = 8;

/** 種子範圍：0～999,999,999 */
export const MAX_SEED = 999_999_999;

export const VOID = 0;
export const WALL = 1;
export const FLOOR = 2;
export type CellKind = typeof VOID | typeof WALL | typeof FLOOR;

export interface Layout {
  seed: number;
  generator: GeneratorId;
  cols: number;
  rows: number;
  /** 房間（洞窟、迷宮沒有房間：空陣列） */
  rooms: Room[];
  /** 「房間＋走道」的走道（其他生成法：空陣列） */
  corridors: Corridor[];
  /** 火光的中心（格線交點，格為單位）；有房間的生成法是每間房間左上角往內一格 */
  lights: GridPoint[];
  /** cols × rows，逐列排列（VOID／WALL／FLOOR） */
  cells: Uint8Array;
}

/** 這個生成法有沒有房間（地圖資訊顯示房間數） */
export const hasRooms = (generator: GeneratorId): boolean => ROOM_GENERATORS.includes(generator);

function generate(seed: number, s: LayoutSettings): Generated {
  const rng = createRandom(seed);
  switch (s.generator) {
    case 'digger':
      return generateDigger(rng, s.cols, s.rows, s.density);
    case 'uniform':
      return generateUniform(rng, s.cols, s.rows, s.density);
    case 'rogue':
      return generateRogue(rng, s.cols, s.rows, s.density);
    case 'cave':
      return generateCave(rng, s.cols, s.rows, s.caveFill, s.caveSmooth);
    case 'maze':
      return generateMaze(rng, s.cols, s.rows, s.mazeStyle, s.mazeWidth);
    default:
      return generateChain(rng, s.cols, s.rows, s.density);
  }
}

/** 由種子與設定產生格局（不給設定＝預設）。同一個種子、同一組設定永遠得到同一個格局。 */
export function generateLayout(seed: number, settings?: Partial<LayoutSettings>): Layout {
  const s = normalizeSettings({ ...DEFAULT_SETTINGS, ...settings });
  const { cols, rows } = s;
  const g = generate(seed, s);
  const cells = new Uint8Array(cols * rows);
  for (let i = 0; i < cells.length; i++) if (g.mask.open[i]) cells[i] = FLOOR;
  /* 牆：八方向上與地板相鄰的非地板格 */
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (cells[y * cols + x] === FLOOR) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          if (cells[ny * cols + nx] === FLOOR) {
            near = true;
            break;
          }
        }
      }
      if (near) cells[y * cols + x] = WALL;
    }
  }
  return {
    seed,
    generator: s.generator,
    cols,
    rows,
    rooms: g.rooms ?? [],
    corridors: g.corridors,
    lights: g.lights,
    cells,
  };
}

export const cellAt = (layout: Layout, x: number, y: number): CellKind =>
  layout.cells[y * layout.cols + x] as CellKind;

/** 新的隨機種子（0～999,999,999）。只有「取新種子」用 Math.random；畫圖一律用決定性亂數。 */
export function randomSeed(): number {
  return Math.floor(Math.random() * (MAX_SEED + 1));
}

/** 解析網址參數 ?seed=<整數>（測試用）；不合法時回傳 null */
export function parseSeedParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('seed');
  if (raw === null || !/^\d{1,9}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 0 && n <= MAX_SEED ? n : null;
}

/** 統計格子種類 */
export function countCells(layout: Layout): { void: number; wall: number; floor: number } {
  const out = { void: 0, wall: 0, floor: 0 };
  for (const c of layout.cells) {
    if (c === FLOOR) out.floor++;
    else if (c === WALL) out.wall++;
    else out.void++;
  }
  return out;
}
