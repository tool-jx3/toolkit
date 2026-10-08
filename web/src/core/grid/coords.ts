/**
 * 格子上的座標文字（網格產生器）：5 種格式、起點四角、從 0 或 1 開始；六角格另有列的算法（壓縮／以半列計）。
 * 規則與數值照舊版（違法建築的 TRPG 實驗室的網格產生器）。
 */
import { colParity } from './hex';

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
}

/**
 * 六角格 (col, row)（半列座標）依起點與列的算法換算出的欄號、列號。舊版的規則：
 * - 壓縮：列號＝⌊row ÷ 2⌋；起點在下面時＝⌈rows ÷ 2⌉ − 1 − ⌊row ÷ 2⌋。
 * - 以半列計：列號＝row；起點在下面時以「這一欄同奇偶的最大半列」往回數，奇數欄再加 2。
 */
export function hexCoordIndex(
  col: number,
  row: number,
  o: HexCoordIndexOptions,
): { dc: number; dr: number } {
  const { flipCol, flipRow } = originFlips(o.origin);
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
 * 六角格的流水號（舊版的公式）：
 * n＝dc × ⌈R ÷ 2⌉ − (R mod 2) × (⌊dc ÷ 2⌋ ＋（起點在下面 ? dc mod 2 : 0）) ＋ dr ＋ start。
 * R 是**設定面板上的「列數」**——舊版在直向時也用這個值（沒有對調），所以直向、或錯開第 1 欄時號碼會跳號或重複；
 * 照舊版保留（規格 grid-maker 第 5 節）。
 */
export function hexSerial(
  dc: number,
  dr: number,
  { rows, origin, start }: { rows: number; origin: CoordOrigin; start: number },
): number {
  const fromBottom = origin === 'bl' || origin === 'br' ? 1 : 0;
  return (
    dc * Math.ceil(rows / 2) -
    (rows % 2) * (Math.floor(dc / 2) + fromBottom * (dc % 2)) +
    dr +
    start
  );
}

export interface HexCoordOptions extends HexCoordIndexOptions {
  format: CoordFormat;
  start: number;
  /** 流水號公式用的列數（設定面板上的值，見 hexSerial） */
  serialRows: number;
}

/** 六角格 (col, row) 的座標文字 */
export function hexCoordLabel(col: number, row: number, o: HexCoordOptions): string {
  const { dc, dr } = hexCoordIndex(col, row, o);
  const serial =
    o.format === 'serial'
      ? hexSerial(dc, dr, { rows: o.serialRows, origin: o.origin, start: o.start })
      : 0;
  return formatCoord(dc, dr, o.format, o.start, serial);
}
