/**
 * 列印用 PDF 的版面：每格固定的實際大小（英寸），A4 或 Letter、直式或橫式，四邊留 0.5 英寸，
 * 下方再留 0.25 英寸寫頁尾；一頁放得下幾欄幾列就放幾格，放不下的分到下一頁（最多 100 頁）。
 * PDF 的座標單位是 pt（1 英寸 = 72 pt）。A4 的大小與 mm／英寸換算用共用的 core/paged。
 */
import { MM_PER_INCH, PAPER_SIZES } from '@/core/paged/units';

export type Paper = 'a4' | 'letter';
export type Orientation = 'portrait' | 'landscape';

export interface PrintSettings {
  /** 每格幾英寸（0.25～2） */
  cellInches: number;
  /** 點陣的解析度 */
  dpi: 100 | 150 | 300;
  paper: Paper;
  orientation: Orientation;
  /** 畫格線（向量線） */
  grid: boolean;
  /** 印地圖的背景色（預設不印，省墨水） */
  background: boolean;
}

export const PT_PER_INCH = 72;
export { MM_PER_INCH };
/** 四邊的留白、頁尾的高度（英寸） */
export const PRINT_MARGIN_IN = 0.5;
export const PRINT_FOOTER_IN = 0.25;
export const MAX_PRINT_PAGES = 100;
export const CELL_INCHES_MIN = 0.25;
export const CELL_INCHES_MAX = 2;
export const PRINT_DPIS = [100, 150, 300] as const;

/** 直式的紙張大小（英寸） */
export const PAPER_INCHES: Record<Paper, readonly [number, number]> = {
  a4: [PAPER_SIZES.A4.w / MM_PER_INCH, PAPER_SIZES.A4.h / MM_PER_INCH],
  letter: [8.5, 11],
};

export class PrintError extends Error {
  constructor(
    readonly code: 'cell' | 'pages',
    readonly pages = 0,
  ) {
    super(code);
    this.name = 'PrintError';
  }
}

export interface PrintLayout {
  /** 紙張（pt） */
  pageW: number;
  pageH: number;
  /** 留白、頁尾（pt） */
  margin: number;
  footer: number;
  /** 一格（pt） */
  cell: number;
  /** 一頁放幾欄、幾列 */
  cols: number;
  rows: number;
  /** 橫向、縱向各幾頁 */
  pagesX: number;
  pagesY: number;
  pages: number;
  /** 點陣每格幾 px */
  pixels: number;
}

/** 版面；格子比紙還大時丟 PrintError('cell') */
export function printLayout(s: PrintSettings, mapW: number, mapH: number): PrintLayout {
  if (!(s.cellInches >= CELL_INCHES_MIN && s.cellInches <= CELL_INCHES_MAX))
    throw new PrintError('cell');
  const [pw, ph] = PAPER_INCHES[s.paper];
  const [wIn, hIn] = s.orientation === 'landscape' ? [ph, pw] : [pw, ph];
  const cols = Math.floor((wIn - 2 * PRINT_MARGIN_IN) / s.cellInches + 1e-9);
  const rows = Math.floor((hIn - 2 * PRINT_MARGIN_IN - PRINT_FOOTER_IN) / s.cellInches + 1e-9);
  if (cols < 1 || rows < 1) throw new PrintError('cell');
  const pagesX = Math.ceil(mapW / cols);
  const pagesY = Math.ceil(mapH / rows);
  return {
    pageW: wIn * PT_PER_INCH,
    pageH: hIn * PT_PER_INCH,
    margin: PRINT_MARGIN_IN * PT_PER_INCH,
    footer: PRINT_FOOTER_IN * PT_PER_INCH,
    cell: s.cellInches * PT_PER_INCH,
    cols,
    rows,
    pagesX,
    pagesY,
    pages: pagesX * pagesY,
    pixels: Math.round(s.cellInches * s.dpi),
  };
}

export interface PrintPage {
  /** 第幾頁（1 起） */
  number: number;
  /** 第幾欄、第幾列的頁（1 起） */
  col: number;
  row: number;
  /** 這一頁印地圖的哪一塊（格） */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 每一頁的範圍（先由左到右、再由上到下）；超過 100 頁丟 PrintError('pages', 頁數) */
export function printPages(layout: PrintLayout, mapW: number, mapH: number): PrintPage[] {
  if (layout.pages > MAX_PRINT_PAGES) throw new PrintError('pages', layout.pages);
  const out: PrintPage[] = [];
  let n = 0;
  for (let row = 0; row < layout.pagesY; row++)
    for (let col = 0; col < layout.pagesX; col++) {
      const x = col * layout.cols;
      const y = row * layout.rows;
      out.push({
        number: ++n,
        col: col + 1,
        row: row + 1,
        x,
        y,
        width: Math.min(layout.cols, mapW - x),
        height: Math.min(layout.rows, mapH - y),
      });
    }
  return out;
}

/** 英寸 → 公分（顯示用，四捨五入到 0.01） */
export const inchesToCm = (inches: number): number => Math.round(inches * 254) / 100;
