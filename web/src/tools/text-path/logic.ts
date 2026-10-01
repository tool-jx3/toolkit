/**
 * 文字軌跡產生器的純邏輯（不依賴 React，Node 可測）。規格：docs/refactor/specs/text-path.md 第 3 節。
 *
 * - 繪製區固定邏輯尺寸 634 × 300（規格第 7 節裁定），結果不隨螢幕寬度改變。
 * - 文字以碼位為單位（表情符號、擴充 B 漢字各算一個字、各佔一格；規格第 7 節裁定）。
 * - 流程：拿掉空白 → 沿軌跡等距取 N 點 → 對應到格子 → 依序放字（撞格時往外一圈一圈找最近的空格）
 *   → 每列串成一行（空格子＝填空字元）→ 修剪四周全空的列與欄 → （選用）行首第一個填空字元換成點字空白。
 */
import {
  type Path,
  type Point,
  pathBounds,
  pathLength,
  presetPath,
  sampleEvenly,
  scalePath,
} from '@/core/path';

/* ---------- 常數 ---------- */

/** 繪製區的邏輯尺寸（px） */
export const PAD_WIDTH = 634;
export const PAD_HEIGHT = 300;

/** 欄數（F09） */
export const COLS = { min: 15, max: 50, step: 1, default: 25 } as const;
/** 間距倍數（F10） */
export const SPACING = { min: 0.5, max: 3, step: 0.1, default: 1.2 } as const;
/** 列數的下限（3.4） */
export const MIN_ROWS = 10;
/** 依字數縮放時，外接框不超過繪製區的這個比例（3.5） */
export const SCALE_LIMIT = 0.9;

/** 填空字元（F12） */
export type FillKind = 'ideographic' | 'space' | 'middot';
export const FILL_CHARS: Record<FillKind, string> = {
  ideographic: '　',
  space: ' ',
  middot: 'ㆍ',
};
export const FILL_KINDS: readonly FillKind[] = ['ideographic', 'space', 'middot'];

/** 行首替換用的點字空白（F13） */
export const LINE_HEAD_BLANK = '⠀';

/** 形狀（F03～F06） */
export type Shape = 'circle' | 'spiral' | 'heart' | 'free';
export type PresetShapeId = Exclude<Shape, 'free'>;
export const SHAPES: readonly Shape[] = ['circle', 'spiral', 'heart', 'free'];

/* ---------- 文字 ---------- */

/** 拿掉所有空白字元（半形與全形空白、Tab、換行、不換行空白…），以碼位切成一個個字（F01、2.） */
export function splitChars(text: string): string[] {
  return Array.from(text.replace(/\s/gu, ''));
}

/** 不含空白的字數（F02） */
export function charCount(text: string): number {
  return splitChars(text).length;
}

/** 結果字數（F27）：含換行，以碼位計 */
export function resultCount(result: string): number {
  return Array.from(result).length;
}

/* ---------- 間距倍數的描述詞（F10） ---------- */

export type SpacingLevel = 0 | 1 | 2 | 3 | 4;

/** 五級由密到疏：≤ 0.8、≤ 1.1、≤ 1.3、≤ 1.8、其餘（先四捨五入到一位小數，避開浮點誤差） */
export function spacingLevel(value: number): SpacingLevel {
  const v = Math.round(value * 10) / 10;
  if (v <= 0.8) return 0;
  if (v <= 1.1) return 1;
  if (v <= 1.3) return 2;
  if (v <= 1.8) return 3;
  return 4;
}

/* ---------- 軌跡 ---------- */

/** 預設形狀的軌跡（3.2；依 S 與中心換算，634 × 300 時與附件逐點相符） */
export function shapePath(shape: PresetShapeId, width = PAD_WIDTH, height = PAD_HEIGHT): Point[] {
  return presetPath(shape, width, height);
}

/** 可以產生、對調、縮放的軌跡：至少 2 點 */
export function isUsablePath(path: Path): boolean {
  return path.length >= 2;
}

/* ---------- 格子（3.4） ---------- */

export interface GridSize {
  cols: number;
  rows: number;
  /** 格子寬、高（px） */
  cellW: number;
  cellH: number;
}

/** 欄數 C＝設定值、列數 R＝max(10, ⌊C × H ÷ W⌋) */
export function gridSize(cols: number, width = PAD_WIDTH, height = PAD_HEIGHT): GridSize {
  const rows = Math.max(MIN_ROWS, Math.floor((cols * height) / width));
  return { cols, rows, cellW: width / cols, cellH: height / rows };
}

/** 格邊＝min(格寬, 格高)（3.5） */
export function cellSide(cols: number, width = PAD_WIDTH, height = PAD_HEIGHT): number {
  const g = gridSize(cols, width, height);
  return Math.min(g.cellW, g.cellH);
}

const clampInt = (v: number, max: number) => Math.min(max, Math.max(0, v));

/** 點落在哪一格：欄＝⌊x ÷ W × C⌋、列＝⌊y ÷ H × R⌋，超出範圍夾在最近的邊界格 */
export function cellOf(
  p: Point,
  grid: GridSize,
  width = PAD_WIDTH,
  height = PAD_HEIGHT,
): { row: number; col: number } {
  return {
    col: clampInt(Math.floor((p.x / width) * grid.cols), grid.cols - 1),
    row: clampInt(Math.floor((p.y / height) * grid.rows), grid.rows - 1),
  };
}

/**
 * 從 (row, col) 往外一圈一圈找空格（3.4 第 4 步）：距離 1 的 8 格、距離 2 的 16 格…；
 * 同一圈從左上角開始、由上而下逐列、每列由左而右，超出範圍的跳過。原格是空的就是原格；找不到時 null。
 */
export function nearestEmpty(
  cells: readonly (readonly (string | null)[])[],
  row: number,
  col: number,
): { row: number; col: number } | null {
  const rows = cells.length;
  const cols = rows ? cells[0].length : 0;
  if (cells[row]?.[col] === null) return { row, col };
  const maxRing = Math.max(rows, cols);
  for (let d = 1; d <= maxRing; d++) {
    for (let r = row - d; r <= row + d; r++) {
      if (r < 0 || r >= rows) continue;
      const edgeRow = r === row - d || r === row + d;
      for (let c = col - d; c <= col + d; c++) {
        if (c < 0 || c >= cols) continue;
        /* 只看這一圈上的格子（上下兩列整列、中間的列只看左右兩端） */
        if (!edgeRow && c !== col - d && c !== col + d) continue;
        if (cells[r][c] === null) return { row: r, col: c };
      }
    }
  }
  return null;
}

export interface PlacedChar {
  row: number;
  col: number;
  text: string;
}

export interface Placement {
  grid: GridSize;
  /** 未修剪的格子：null＝空格 */
  cells: (string | null)[][];
  /** 依文字順序實際放進去的字（找不到空格而丟掉的不在裡面） */
  placed: PlacedChar[];
}

/** 沿軌跡等距取 N 點、對應到格子並依序放字（F21～F23） */
export function placeChars(
  chars: readonly string[],
  path: Path,
  cols: number,
  width = PAD_WIDTH,
  height = PAD_HEIGHT,
): Placement {
  const grid = gridSize(cols, width, height);
  const cells: (string | null)[][] = Array.from({ length: grid.rows }, () =>
    new Array<string | null>(grid.cols).fill(null),
  );
  const placed: PlacedChar[] = [];
  const points = sampleEvenly(path, chars.length);
  chars.forEach((ch, i) => {
    const p = points[i];
    if (!p) return;
    const home = cellOf(p, grid, width, height);
    const at = nearestEmpty(cells, home.row, home.col);
    if (!at) return;
    cells[at.row][at.col] = ch;
    placed.push({ row: at.row, col: at.col, text: ch });
  });
  return { grid, cells, placed };
}

/**
 * 組合成文字（F24、F25、F13）：每列由左到右串起來（空格子＝填空字元），
 * 修剪上下左右「只有填空字元」的列與欄，再（選用）把行首的第一個填空字元換成點字空白；行以 LF 分隔，最後沒有換行。
 */
export function composeCells(
  cells: readonly (readonly (string | null)[])[],
  fill: string,
  lineHead: boolean,
): string {
  const rows = cells.map((row) => row.map((c) => c ?? fill));
  const isBlank = (s: string) => s === fill;
  let top = 0;
  let bottom = rows.length - 1;
  while (top <= bottom && rows[top].every(isBlank)) top++;
  while (bottom >= top && rows[bottom].every(isBlank)) bottom--;
  if (top > bottom) return '';
  const kept = rows.slice(top, bottom + 1);
  const width = kept[0].length;
  const colBlank = (c: number) => kept.every((row) => isBlank(row[c]));
  let left = 0;
  let right = width - 1;
  while (left <= right && colBlank(left)) left++;
  while (right >= left && colBlank(right)) right--;
  return kept
    .map((row) => {
      const cellsInRow = row.slice(left, right + 1);
      if (lineHead && cellsInRow.length && isBlank(cellsInRow[0])) cellsInRow[0] = LINE_HEAD_BLANK;
      return cellsInRow.join('');
    })
    .join('\n');
}

/* ---------- 產生（F14） ---------- */

export interface GenerateInput {
  text: string;
  path: Path;
  cols: number;
  fill: string;
  lineHead: boolean;
  width?: number;
  height?: number;
}

export interface OverlayLabel {
  x: number;
  y: number;
  text: string;
}

export type GenerateResult =
  | {
      ok: true;
      /** 結果文字 */
      text: string;
      /** 疊字：每個字在未修剪格子的中心（F19、3.6） */
      labels: OverlayLabel[];
      /** 疊字字級＝格子較短邊 × 0.8 */
      labelSize: number;
      grid: GridSize;
    }
  | { ok: false; reason: 'no-text' | 'no-path' };

export function generate(input: GenerateInput): GenerateResult {
  const width = input.width ?? PAD_WIDTH;
  const height = input.height ?? PAD_HEIGHT;
  const chars = splitChars(input.text);
  if (!chars.length) return { ok: false, reason: 'no-text' };
  if (!isUsablePath(input.path)) return { ok: false, reason: 'no-path' };
  const { grid, cells, placed } = placeChars(chars, input.path, input.cols, width, height);
  return {
    ok: true,
    text: composeCells(cells, input.fill, input.lineHead),
    labels: placed.map((p) => ({
      x: (p.col + 0.5) * grid.cellW,
      y: (p.row + 0.5) * grid.cellH,
      text: p.text,
    })),
    labelSize: Math.min(grid.cellW, grid.cellH) * 0.8,
    grid,
  };
}

/* ---------- 依字數縮放軌跡（F15、3.5） ---------- */

export interface FitInput {
  path: Path;
  /** 字數（不含空白） */
  count: number;
  cols: number;
  spacing: number;
  width?: number;
  height?: number;
}

export type FitResult =
  | { ok: true; path: Point[] }
  | { ok: false; reason: 'few-chars' | 'no-path' };

/**
 * 目標總長＝（N − 1）× 格邊 × 間距倍數；以外接框中心等比縮放到目標總長，
 * 但縮放後外接框的寬不超過 0.9 W、高不超過 0.9 H（只限制大小，不保證留在繪製區內）。
 */
export function fitPathToText(input: FitInput): FitResult {
  const width = input.width ?? PAD_WIDTH;
  const height = input.height ?? PAD_HEIGHT;
  if (input.count < 2) return { ok: false, reason: 'few-chars' };
  if (!isUsablePath(input.path)) return { ok: false, reason: 'no-path' };
  const length = pathLength(input.path);
  if (!(length > 0)) return { ok: false, reason: 'no-path' };
  const target = (input.count - 1) * cellSide(input.cols, width, height) * input.spacing;
  let k = target / length;
  const b = pathBounds(input.path);
  if (b.w > 0 && b.w * k > SCALE_LIMIT * width) k = (SCALE_LIMIT * width) / b.w;
  if (b.h > 0 && b.h * k > SCALE_LIMIT * height) k = (SCALE_LIMIT * height) / b.h;
  return { ok: true, path: scalePath(input.path, k) };
}
