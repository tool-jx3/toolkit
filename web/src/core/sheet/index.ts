/**
 * core/sheet：格狀排版＋每格下方的說明文字區（例如表情合輯圖）。
 *
 * 規則：
 * - 欄數 ≤ 0 時自動（⌈√張數⌉），而且不大於張數；列數 ＝ ⌈張數 ÷ 欄數⌉，最後一列靠左。
 * - 每格 ＝ 上方「格子大小」見方的圖＋下方文字區；文字區**所有格子同高**＝最多行數 × 行高 ＋ 2 × 內距
 *   （行高 ＝ round(字級 × 1.28)、內距 ＝ round(字級 × 0.5)）；沒有任何格子有文字時文字區高度是 0。
 * - 文字寬度超過「格子大小 − 2 × 內距」時**逐字**換行（不避頭尾、英文也逐字）；原本的換行照用，連續換行算空白行。
 * - 尺寸：寬 ＝ 欄 × 格 ＋（欄 ＋ 1）× 間距；高 ＝ 列 ×（格 ＋ 文字區）＋（列 ＋ 1）× 間距。
 *
 * ```ts
 * const layout = layoutSheet({ count: 22, cellSize: 300, gap: 14, fontSize: 26,
 *   captions: picked.map((e) => (showText && e.showText ? e.label : '')), measure: captionMeasure(fontCss) });
 * canvas.width = layout.width; canvas.height = layout.height;
 * drawSheet(ctx, layout, { font: fontCss, color: '#222222', drawCell: (ctx, i, r) => drawLayers(ctx, layersOf(picked[i]), r) });
 * ```
 */

import type { Rect } from '../image';
import { canvasMeasure, type MeasureFn } from '../typeset';

/** 文字寬度量測（px） */
export type TextWidthFn = (text: string) => number;

export interface SheetOptions {
  /** 格子數 */
  count: number;
  /** 欄數（≤ 0 為自動） */
  columns?: number;
  /** 每格圖的邊長（px） */
  cellSize: number;
  /** 格與格之間、以及外圍的間距（px） */
  gap: number;
  /** 每格的文字（'' 或省略＝這格不畫文字） */
  captions?: readonly (string | null | undefined)[];
  /** 文字字級（px，預設 26） */
  fontSize?: number;
  /** 行高倍率（預設 1.28） */
  lineHeightRatio?: number;
  /** 內距倍率（預設 0.5） */
  padRatio?: number;
  /** 量測文字寬度（換行用；沒有文字時可省略） */
  measure?: TextWidthFn;
}

export interface SheetCell {
  index: number;
  column: number;
  row: number;
  /** 圖的範圍 */
  image: Rect;
  /** 文字區（寬同格子、高為文字區高度） */
  caption: Rect;
  /** 換行後的文字行（沒有文字時是空陣列） */
  lines: string[];
}

export interface SheetLayout {
  columns: number;
  rows: number;
  width: number;
  height: number;
  cellSize: number;
  gap: number;
  fontSize: number;
  lineHeight: number;
  pad: number;
  /** 文字區高度（所有格子相同） */
  captionHeight: number;
  cells: SheetCell[];
}

/** 自動欄數：⌈√n⌉ */
export function autoColumns(count: number): number {
  return count > 0 ? Math.ceil(Math.sqrt(count)) : 0;
}

/**
 * 逐字換行：原本的換行照用（空行保留成 ''）；一行的寬度超過 maxWidth 時從下一個字斷開（一行至少一個字）。
 */
export function wrapCaption(text: string, maxWidth: number, measure: TextWidthFn): string[] {
  const out: string[] = [];
  for (const hard of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    const chars = Array.from(hard);
    if (!chars.length) {
      out.push('');
      continue;
    }
    let cur = '';
    for (const ch of chars) {
      if (cur && measure(cur + ch) > maxWidth + 1e-6) {
        out.push(cur);
        cur = ch;
      } else cur += ch;
    }
    out.push(cur);
  }
  return out;
}

/** 文字寬度＝逐字前進寬度相加（用 core/typeset 的量測與快取）。font 是 canvas 的 font 字串。 */
export function captionMeasure(font: string, measure: MeasureFn = canvasMeasure): TextWidthFn {
  const cache = new Map<string, number>();
  const w = (ch: string) => {
    let v = cache.get(ch);
    if (v === undefined) {
      v = measure(font, ch).w;
      cache.set(ch, v);
    }
    return v;
  };
  return (text) => Array.from(text).reduce((s, ch) => s + w(ch), 0);
}

export function layoutSheet(options: SheetOptions): SheetLayout {
  const count = Math.max(0, Math.floor(options.count));
  const cellSize = Math.max(0, options.cellSize);
  const gap = Math.max(0, options.gap);
  const fontSize = options.fontSize ?? 26;
  const lineHeight = Math.round(fontSize * (options.lineHeightRatio ?? 1.28));
  const pad = Math.round(fontSize * (options.padRatio ?? 0.5));
  const want = Math.floor(options.columns ?? 0);
  const columns = count ? Math.min(count, want > 0 ? want : autoColumns(count)) : 0;
  const rows = columns ? Math.ceil(count / columns) : 0;
  const maxWidth = cellSize - 2 * pad;
  const lines: string[][] = [];
  let maxLines = 0;
  for (let i = 0; i < count; i++) {
    const t = options.captions?.[i];
    const l = t
      ? wrapCaption(t, maxWidth, options.measure ?? ((s) => Array.from(s).length * fontSize))
      : [];
    lines.push(l);
    maxLines = Math.max(maxLines, l.length);
  }
  const captionHeight = maxLines ? maxLines * lineHeight + 2 * pad : 0;
  const cells: SheetCell[] = [];
  for (let i = 0; i < count; i++) {
    const column = i % columns;
    const row = Math.floor(i / columns);
    const x = gap + column * (cellSize + gap);
    const y = gap + row * (cellSize + captionHeight + gap);
    cells.push({
      index: i,
      column,
      row,
      image: { x, y, width: cellSize, height: cellSize },
      caption: { x, y: y + cellSize, width: cellSize, height: captionHeight },
      lines: lines[i],
    });
  }
  return {
    columns,
    rows,
    width: columns * cellSize + (columns + 1) * gap,
    height: rows * (cellSize + captionHeight) + (rows + 1) * gap,
    cellSize,
    gap,
    fontSize,
    lineHeight,
    pad,
    captionHeight,
    cells,
  };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export interface DrawSheetOptions {
  /** 畫每一格的圖（rect 是圖的範圍） */
  drawCell: (ctx: Ctx2D, index: number, rect: Rect) => void;
  /** canvas 的 font 字串（例如 fontCss(font, 26)；字重半粗體 600） */
  font?: string;
  /** 文字顏色 */
  color?: string;
  /** 底色（null／省略＝透明） */
  background?: string | null;
}

/**
 * 依 layout 畫出整張：底色 → 每格的圖 → 每格的文字（水平置中；第一行的上緣在圖下方一個內距處）。
 * 畫布尺寸要先設成 layout.width × layout.height。
 */
export function drawSheet(ctx: Ctx2D, layout: SheetLayout, options: DrawSheetOptions): void {
  const { drawCell, font, color = '#222222', background } = options;
  ctx.save();
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, layout.width, layout.height);
  }
  for (const cell of layout.cells) drawCell(ctx, cell.index, cell.image);
  if (font) ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const cell of layout.cells) {
    cell.lines.forEach((line, i) => {
      if (!line) return;
      ctx.fillText(
        line,
        cell.image.x + layout.cellSize / 2,
        cell.caption.y + layout.pad + i * layout.lineHeight,
      );
    });
  }
  ctx.restore();
}
