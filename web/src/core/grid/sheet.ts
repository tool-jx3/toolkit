/**
 * 「一整張」六角格圖（網格產生器）的排法。
 *
 * 平頂座標系裡用「半列」座標 (col, row)：row 每加 1 往下半格（size ÷ 2），所以同一欄只有一半的 row 有格子——
 * `shift` 為 false 時 col 與 row 奇偶相同的位置才有格子（第 0 欄從最上面開始），true 時相反（第 0 欄往下錯開半格）。
 * 「列數」就是半列的數量：每加 1，會輪流在偶數欄或奇數欄多出一格。尖頂（直向）時欄數與列數先對調，再整張對調 x、y。
 */
import { colParity, type HexMetrics, hexMetrics, orientPoint } from './hex';
import type { HexOrientation, Point } from './types';

export interface HexSheetOptions {
  /** 欄數（設定值；尖頂時會與列數對調） */
  cols: number;
  /** 列數（半列的數量） */
  rows: number;
  /** 大小（平頂時是格子的高，尖頂時是寬） */
  size: number;
  orientation: HexOrientation;
  /** 網格化（CCFOLIA 用）：欄距等於大小，左右各多留半欄 */
  fit: boolean;
  /** 錯開第 1 欄 */
  shift: boolean;
}

export interface HexSheet {
  metrics: HexMetrics;
  /** 平頂座標系的欄數、半列數（尖頂時是設定值對調） */
  cols: number;
  rows: number;
  shift: boolean;
  /** 未取整的畫布尺寸（畫面上，尖頂時已對調） */
  rawWidth: number;
  rawHeight: number;
  /** 畫布尺寸（四捨五入成整數 px） */
  width: number;
  height: number;
}

export function hexSheet(o: HexSheetOptions): HexSheet {
  const metrics = hexMetrics(o.size, { orientation: o.orientation, fit: o.fit });
  const csx = metrics.step;
  const pointy = o.orientation === 'pointy';
  const cols = pointy ? o.rows : o.cols;
  const rows = pointy ? o.cols : o.rows;
  let cw = o.fit ? csx * cols + csx : csx * (cols + 1 / 3);
  let ch = (o.size * (rows + 1)) / 2;
  if (pointy) [cw, ch] = [ch, cw];
  return {
    metrics,
    cols,
    rows,
    shift: o.shift,
    rawWidth: cw,
    rawHeight: ch,
    width: Math.round(cw),
    height: Math.round(ch),
  };
}

/** 這個位置有沒有格子（只看奇偶；範圍另外判斷） */
export function hexSheetHasCell(col: number, row: number, shift: boolean): boolean {
  return shift !== (colParity(row) === colParity(col));
}

/**
 * 格子的「左上角」（平頂座標系、還沒對調；舊版的 gx、gy）：
 * x＝(col ＋ 1/3) × step（網格化時 (col ＋ 1/6) × step ＋ 半欄），y＝row ÷ 2 × size。
 */
export function hexSheetAnchor(sheet: HexSheet, col: number, row: number): Point {
  const m = sheet.metrics;
  const offL = m.fit ? 1 / 6 : 1 / 3;
  const pad = m.fit ? m.step / 2 : 0;
  return { x: (col + offL) * m.step + pad, y: (row / 2) * m.size };
}

/** 格子中心（平頂座標系、還沒對調）：左上角 ＋ (step ÷ 3, size ÷ 2) */
export function hexSheetFlatCenter(sheet: HexSheet, col: number, row: number): Point {
  const a = hexSheetAnchor(sheet, col, row);
  return { x: a.x + sheet.metrics.step / 3, y: a.y + sheet.metrics.size / 2 };
}

/** 格子中心（畫面座標） */
export function hexSheetCenter(sheet: HexSheet, col: number, row: number): Point {
  return orientPoint(hexSheetFlatCenter(sheet, col, row), sheet.metrics.orientation);
}

export interface HexSheetCell {
  col: number;
  row: number;
  /** 在 cols × rows 的範圍內（外圈的格子是 false） */
  inside: boolean;
}

/**
 * 所有要畫的格子，依舊版的順序：欄由左到右、同一欄由上到下。
 * `outer` 時範圍四周各多一圈（欄 −1～cols、半列 −1～rows），只會畫到一部分。
 */
export function hexSheetCells(sheet: HexSheet, outer: boolean): HexSheetCell[] {
  const c0 = outer ? -1 : 0;
  const c1 = outer ? sheet.cols + 1 : sheet.cols;
  const r0 = outer ? -1 : 0;
  const r1 = outer ? sheet.rows + 1 : sheet.rows;
  const out: HexSheetCell[] = [];
  for (let c = c0; c < c1; c++) {
    for (let r = r0; r < r1; r++) {
      if (!hexSheetHasCell(c, r, sheet.shift)) continue;
      out.push({ col: c, row: r, inside: c >= 0 && r >= 0 && c < sheet.cols && r < sheet.rows });
    }
  }
  return out;
}

/**
 * 「每格只畫 3 條邊」時，這一格要不要自己補畫另外 3 條邊（負責那條邊的鄰格不在要畫的範圍內時才補）：
 * 下邊（鄰格 (col, row＋2)）、右下邊（(col＋1, row＋1)）、右上邊（(col＋1, row−1)）。
 */
export function hexSheetMissingEdges(
  sheet: HexSheet,
  outer: boolean,
  col: number,
  row: number,
): { bottom: boolean; lowerRight: boolean; upperRight: boolean } {
  const c0 = outer ? -1 : 0;
  const c1 = outer ? sheet.cols + 1 : sheet.cols;
  const r0 = outer ? -1 : 0;
  const r1 = outer ? sheet.rows + 1 : sheet.rows;
  const has = (c: number, r: number) =>
    c >= c0 && c < c1 && r >= r0 && r < r1 && hexSheetHasCell(c, r, sheet.shift);
  return {
    bottom: !has(col, row + 2),
    lowerRight: !has(col + 1, row + 1),
    upperRight: !has(col + 1, row - 1),
  };
}

/**
 * 網格化（CCFOLIA 用）圖片在 CCFOLIA 的大小（格數；舊版的檔名 hex_<欄>x<列>.png 用的數字）：
 * 由畫布尺寸扣掉左右（尖頂時上下）多留的一格，再除以「大小」乘 2 後四捨五入。
 */
export function hexSheetCcfoliaCells(sheet: HexSheet): { cols: number; rows: number } {
  const cs = sheet.metrics.size;
  const pointy = sheet.metrics.orientation === 'pointy';
  const w = pointy ? sheet.width : sheet.width - cs;
  const h = pointy ? sheet.height - cs : sheet.height;
  return { cols: Math.round((w / cs) * 2), rows: Math.round((h / cs) * 2) };
}
