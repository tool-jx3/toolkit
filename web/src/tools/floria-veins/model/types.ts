/**
 * 魔法脈繪製工具的資料型別與常數（規格 docs/refactor/specs/floria-veins.md 第 3 節）。
 *
 * 座標的單位和原作相同：1 格＝1200 單位（`UNIT`）。線的端點一定在格點上（1200 的倍數）；
 * 塗色的頂點是線的交點，四捨五入到整數單位。傷害格用格子的索引（0 起算）。
 */

export const TOOL_ID = 'floria-veins';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

/** 1 格的單位數（和原作的格子大小相同，讀寫原作的資料時不必換算） */
export const UNIT = 1200;

/** 角色（PC、BOSS）的畫布：11×11，座標標 2～12 */
export const SIZE_CHARACTER = 11;
/** 隨從（原作的「お供」）的畫布：6×6，座標標 1～6 */
export const SIZE_MINION = 6;
/** 讀入的資料接受的格數範圍（介面只建 11 與 6） */
export const SIZE_MIN = 2;
export const SIZE_MAX = 24;

/** 畫布名字的長度上限 */
export const NAME_MAX = 40;
/** 畫布數的上限 */
export const CANVAS_MAX = 30;
/** 圖形庫的上限 */
export const STAMP_MAX = 60;

/** 一點 = [x, y]（單位） */
export type Pt = [number, number];
/** 一格 = [欄, 列]（0 起算） */
export type Cell = [number, number];

/** 畫法：直線、多角形（折線）、塗色、傷害格 */
export type Kind = 'line' | 'shape' | 'fill' | 'damage';
export const KINDS: readonly Kind[] = ['line', 'shape', 'fill', 'damage'];

export interface VeinLine {
  a: Pt;
  b: Pt;
  /** #rrggbb */
  color: string;
}

export interface VeinFill {
  /** 多邊形的頂點（隱含封閉，不重複起點） */
  pts: Pt[];
  color: string;
}

export interface VeinCanvas {
  id: string;
  name: string;
  /** 格數（正方形，一邊幾格） */
  size: number;
  lines: VeinLine[];
  fills: VeinFill[];
  /** 傷害格（不重複） */
  damage: Cell[];
}

/** 草稿裡完成的一筆：直線是 2 點，多角形是折線（closed＝回到起點） */
export interface Figure {
  pts: Pt[];
  closed: boolean;
}

/** 還沒「決定」的草稿（畫在哪張畫布、用哪種畫法） */
export interface Draft {
  canvasId: string;
  kind: Kind;
  erase: boolean;
  /** 已經完成的幾筆（直線、多角形、塗色的範圍） */
  figures: Figure[];
  /** 正在畫的這一筆的點 */
  current: Pt[];
  /** 傷害格的選取 */
  cells: Cell[];
}

/** 圖形庫：自己存的線（例如常用的形狀） */
export interface Stamp {
  id: string;
  name: string;
  /** 存的時候的位置（單位座標）；放到畫布上時超出的部分整個移進來 */
  figures: Figure[];
}

export interface Doc {
  canvases: VeinCanvas[];
  stamps: Stamp[];
  draft: Draft | null;
}

/** 調色盤（和原作相同的 8 色）：線與塗色共用目前選的顏色 */
export const PALETTE = [
  '#0000ff',
  '#00c0c0',
  '#00a000',
  '#00e000',
  '#c00000',
  '#e000e0',
  '#a0a000',
  '#e0e000',
] as const;

/** 畫布上的顏色（和原作相同；不跟介面的深淺色主題） */
export const COLORS = {
  paper: '#ffffff',
  name: '#000000',
  label: '#a0a0a0',
  grid: '#a0a0a0',
  /** 讀入原作的資料時沒有顏色的線 */
  line: '#0000ff',
  /** 讀入原作的資料時沒有顏色的塗色 */
  fill: '#00c0ff',
  damage: '#ff8080',
  draft: '#ff0000',
  /** 刪除時標出會刪掉的東西 */
  doomed: '#ff0000',
  /** 塗色時可以吸附的交點 */
  snap: '#7a7a7a',
} as const;

/** 塗色與傷害格的不透明度 */
export const FILL_ALPHA = 0.7;

/** 座標的標示：大於 6 格時從 2 開始（2d6），否則從 1 開始（1d6） */
export const labelOf = (size: number, i: number): number => (size > 6 ? i + 2 : i + 1);
