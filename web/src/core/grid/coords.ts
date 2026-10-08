/**
 * 格子上的座標文字（網格產生器）：5 種格式、起點四角、從 0 或 1 開始；六角格另有列的算法（壓縮／以半列計）。
 * 規則與數值照舊版（違法建築的 TRPG 實驗室的網格產生器），主控裁定的兩處改善除外：六角格的流水號改成依畫面連續編號（hexSerialNumbers，D3），
 * 直向（尖頂）六角格的欄號、列號與起點改成以畫面為準（hexCoordIndex 的 orientation，D10）。
 */
import { colParity } from './hex';
import { type HexSheet, hexSheetCells } from './sheet';
import type { HexOrientation } from './types';

/** 1-1、1,1、0101（各補零到 2 位）、A1（欄用英文字母）、流水號 */
export type CoordFormat = 'hyphen' | 'comma' | 'zero' | 'letter' | 'serial';
export const COORD_FORMATS: readonly CoordFormat[] = [
  'hyphen',
  'comma',
  'zero',
  'letter',
  'serial',
];

/** 起點：左上、右上、左下、右下 */
export type CoordOrigin = 'tl' | 'tr' | 'bl' | 'br';
export const COORD_ORIGINS: readonly CoordOrigin[] = ['tl', 'bl', 'tr', 'br'];

/**
 * 六角格的列號：
 * - `compress`（壓縮）：錯開的半列併成同一列，每欄的列號都是連續整數（0、1、2…）。
 * - `half`（以半列計）：直接用半列的編號，同一欄的列號每次加 2（0、2、4… 或 1、3、5…）。
 */
export type HexRowMode = 'compress' | 'half';

/** 起點在右邊時欄號由右往左、在下面時列號由下往上 */
export function originFlips(origin: CoordOrigin): { flipCol: boolean; flipRow: boolean } {
  return {
    flipCol: origin === 'tr' || origin === 'br',
    flipRow: origin === 'bl' || origin === 'br',
  };
}

/** 欄號 → 英文字母：0 → A、25 → Z、26 → AA、27 → AB…（負數是空字串） */
export function columnLetters(index: number): string {
  let s = '';
  let n = index + 1;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

/**
 * 依格式寫出座標。`dc`、`dr` 是已經依起點翻轉過、從 0 起算的欄號與列號；`start` 是 0 或 1。
 * - 1-1：「欄-列」；1,1：「欄,列」（逗號後沒有空白）；0101：欄、列各補零到 2 位（負數當 0，3 位數以上照寫）；
 * - A1：欄用字母（不受 start 影響，第 1 欄一律是 A）＋列號；
 * - 流水號：`serial`（由呼叫端依形狀算好，見 squareSerial／hexSerial）。
 */
export function formatCoord(
  dc: number,
  dr: number,
  format: CoordFormat,
  start: number,
  serial = 0,
): string {
  const c = dc + start;
  const r = dr + start;
  switch (format) {
    case 'comma':
      return `${c},${r}`;
    case 'zero': {
      const pad = (n: number) => String(Math.max(0, n)).padStart(2, '0');
      return `${pad(c)}${pad(r)}`;
    }
    case 'letter':
      return `${columnLetters(dc)}${r}`;
    case 'serial':
      return `${serial}`;
    default:
      return `${c}-${r}`;
  }
}

/* ---------- 方格 ---------- */

/** 方格 (col, row) 依起點翻轉後的欄號、列號（從 0 起算） */
export function squareCoordIndex(
  col: number,
  row: number,
  cols: number,
  rows: number,
  origin: CoordOrigin,
): { dc: number; dr: number } {
  const { flipCol, flipRow } = originFlips(origin);
  return { dc: flipCol ? cols - 1 - col : col, dr: flipRow ? rows - 1 - row : row };
}

/** 方格的流水號：從起點那一列開始，逐列依欄號編號 */
export function squareSerial(dc: number, dr: number, cols: number, start: number): number {
  return dr * cols + dc + start;
}

export interface SquareCoordOptions {
  cols: number;
  rows: number;
  origin: CoordOrigin;
  format: CoordFormat;
  start: number;
}

/** 方格 (col, row) 的座標文字 */
export function squareCoordLabel(col: number, row: number, o: SquareCoordOptions): string {
  const { dc, dr } = squareCoordIndex(col, row, o.cols, o.rows, o.origin);
  return formatCoord(dc, dr, o.format, o.start, squareSerial(dc, dr, o.cols, o.start));
}

/* ---------- 六角格（網格產生器的半列座標，見 sheet.ts） ---------- */

export interface HexCoordIndexOptions {
  /** 平頂座標系的欄數、半列數（尖頂時是設定值對調後的值） */
  cols: number;
  rows: number;
  origin: CoordOrigin;
  rowMode: HexRowMode;
  /** 方向（預設平頂）。尖頂時欄號、列號與起點都以畫面為準（主控裁定 D10） */
  orientation?: HexOrientation;
}

/**
 * 六角格 (col, row)（半列座標）換算出的欄號、列號（從 0 起算）。
 *
 * 平頂（橫向）照舊版的規則：
 * - 欄號＝col（起點在右邊時 cols − 1 − col）。
 * - 壓縮：列號＝⌊row ÷ 2⌋；起點在下面時＝⌈rows ÷ 2⌉ − 1 − ⌊row ÷ 2⌋。
 * - 以半列計：列號＝row；起點在下面時以「這一欄同奇偶的最大半列」往回數，奇數欄再加 2。
 *
 * 尖頂（直向）以畫面為準（主控裁定 D10，取代舊版把平頂的欄列與起點原樣套上去的做法）：
 * 平頂座標系的一欄 col 是畫面上水平的一列，半列 row 是畫面上由左到右錯開半格的位置。
 * - 列號＝col（起點在下面時 cols − 1 − col）。
 * - 壓縮：欄號＝⌊從起點那一邊數的半列 ÷ 2⌋（從左：row；從右：rows − 1 − row），每一列最靠起點的那一格是 0。
 * - 以半列計：欄號＝從起點那一邊數的半列（同一列每次加 2）。
 */
export function hexCoordIndex(
  col: number,
  row: number,
  o: HexCoordIndexOptions,
): { dc: number; dr: number } {
  const { flipCol, flipRow } = originFlips(o.origin);
  if (o.orientation === 'pointy') {
    const fromStart = flipCol ? o.rows - 1 - row : row;
    return {
      dc: o.rowMode === 'compress' ? Math.floor(fromStart / 2) : fromStart,
      dr: flipRow ? o.cols - 1 - col : col,
    };
  }
  const dc = flipCol ? o.cols - 1 - col : col;
  if (o.rowMode === 'compress') {
    const sr = Math.floor(row / 2);
    return { dc, dr: flipRow ? Math.ceil(o.rows / 2) - 1 - sr : sr };
  }
  const parity = colParity(col);
  const candidateMax = o.rows % 2 === 0 ? o.rows - 2 + parity : o.rows - 1;
  const maxR = candidateMax % 2 === parity ? candidateMax : candidateMax - 1;
  return { dc, dr: flipRow ? maxR - row + 2 * parity : row };
}

/**
 * 六角格的流水號（主控裁定 2026-10-08：取代舊版會跳號、重複的公式，屬刻意改善）。
 * 和方格的流水號同樣的走法：從起點的角落開始，在**畫面上先橫向走完一列、再換下一列**，
 * 依實際有畫的格子連續編號（start、start＋1…，不跳號、不重複；外圈的格子不編號）。
 * 畫面上的「列」：
 * - 橫向（平頂）：鋸齒狀的一列——半列 0、1 是第 1 列，2、3 是第 2 列…（同 1-1 格式「壓縮」的列）；同一列依欄號由起點那一邊往另一邊。
 * - 直向（尖頂）：平頂座標系的一欄就是畫面上水平的一列；同一列依半列號由起點那一邊往另一邊。
 * 起點的角落以畫面為準（右上＝畫面右上），直向時也一樣。
 * 回傳「"col,row"（半列座標）→ 號碼」。
 */
export function hexSerialNumbers(
  sheet: HexSheet,
  origin: CoordOrigin,
  start: number,
): Map<string, number> {
  const { flipCol, flipRow } = originFlips(origin);
  const pointy = sheet.metrics.orientation === 'pointy';
  const keyed = hexSheetCells(sheet, false).map(({ col, row }) => {
    const screenRow = pointy ? col : Math.floor(row / 2);
    const screenCol = pointy ? row : col;
    return {
      key: `${col},${row}`,
      rowKey: flipRow ? -screenRow : screenRow,
      colKey: flipCol ? -screenCol : screenCol,
    };
  });
  keyed.sort((a, b) => a.rowKey - b.rowKey || a.colKey - b.colKey);
  return new Map(keyed.map((k, i) => [k.key, i + start]));
}

export interface HexCoordOptions extends HexCoordIndexOptions {
  format: CoordFormat;
  start: number;
  /** 流水號（hexSerialNumbers 的結果；格式是流水號時才需要） */
  serials?: ReadonlyMap<string, number>;
}

/** 六角格 (col, row) 的座標文字 */
export function hexCoordLabel(col: number, row: number, o: HexCoordOptions): string {
  const { dc, dr } = hexCoordIndex(col, row, o);
  const serial = o.format === 'serial' ? (o.serials?.get(`${col},${row}`) ?? 0) : 0;
  return formatCoord(dc, dr, o.format, o.start, serial);
}
