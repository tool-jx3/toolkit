/**
 * 填字遊戲的整張圖（規格 3.7）：標題＋盤面＋橫向／直向提示。先排版（純計算，量字寬的函式由外面給，
 * 單元測試可以用假的），再畫到 canvas。預覽、下載 PNG、列印用同一份排版；下載是 2 倍。
 *
 * 尺寸照原作的匯出：外圍留白 60 px、卡片內距 40 px；格子 48 px、格線 1 px、盤面內距 2 px。
 * 卡片寬：左右排列時 max(1300, 盤面 ＋ 外框 ＋ 間隔 ＋ 兩欄提示〔每欄至少 300 px〕＋ 內距)＝max(1300, 盤面寬 ＋ 810)
 * （原作把盤面寬量成 0，卡片永遠 1300、大盤面時提示欄被擠窄；規格 5. D6 修正）；上下排列時 max(900, 盤面寬 ＋ 100)。
 */
import { ensureFont, fontFamilyCss } from '@/core/fonts';
import { wrapChars } from '@/core/typeset';
import {
  type Cell,
  clueLists,
  hintRuns,
  type PlacedWord,
  type Puzzle,
  puzzleCells,
} from './generate';
import type { FontRole, SheetLayout } from './model';

export interface SheetOptions {
  /** 解答版（顯示答案、提示裡標出答案、標題旁加「（解答）」） */
  reveal: boolean;
  layout: SheetLayout;
  title: string;
  emptyColor: string;
  emptyTransparent: boolean;
  /** 各部分的字型名稱 */
  fonts: Record<FontRole, string>;
  /** 介面文字（標題旁的標記、兩個提示清單的標題） */
  labels: { answerBadge: string; across: string; down: string };
}

export interface FontSpec {
  role: FontRole;
  size: number;
  weight: number;
}

export type MeasureFn = (text: string, font: FontSpec) => number;

export type SheetOp =
  | {
      t: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: string;
      stroke?: string;
      r?: number;
      shadow?: boolean;
    }
  | {
      t: 'text';
      x: number;
      y: number;
      text: string;
      font: FontSpec;
      color: string;
      align: 'left' | 'center' | 'right';
      baseline: 'top' | 'middle';
    };

export interface SheetLayoutResult {
  width: number;
  height: number;
  ops: SheetOp[];
  /** 盤面（含內距）在圖上的位置 */
  board: { x: number; y: number; w: number; h: number };
}

/* ---------- 尺寸與配色（px，倍率 1） ---------- */

export const SHEET = {
  outer: 60,
  cardPad: 40,
  rowMinWidth: 1300,
  /** 左右排列時提示每一欄的最小寬度（5. D6） */
  clueMinColumn: 300,
  colMinWidth: 900,
  colExtra: 100,
  cell: 48,
  gap: 1,
  boardPad: 2,
  wrapPad: 24,
  layoutGap: 48,
  columnGap: 32,
  titleSize: 28,
  titleLine: 42,
  badgeSize: 20,
  badgeGap: 8,
  titlePadBottom: 24,
  titleMarginBottom: 40,
  headerSize: 13.6,
  headerLine: 28.4,
  headerPadBottom: 8,
  headerRule: 2,
  headerMarginBottom: 16,
  clueSize: 15.2,
  clueLine: 24.32,
  clueNumWidth: 24,
  clueNumGap: 12,
  clueGap: 16,
  cellText: 20,
  cellNum: 10.4,
} as const;

export const SHEET_COLORS = {
  page: '#ffffff',
  text: '#1e293b',
  muted: '#64748b',
  subtle: '#f1f5f9',
  primary: '#3b82f6',
  danger: '#ef4444',
  acrossBg: '#eff6ff',
  acrossText: '#2563eb',
  downBg: '#ecfdf5',
  downText: '#10b981',
  cell: '#ffffff',
  cellBorder: '#1e293b',
} as const;

/** 下載的倍率 */
export const PNG_SCALE = 2;

/** 盤面的寬高（含內距） */
export function boardSize(p: Pick<Puzzle, 'width' | 'height'>, transparent: boolean) {
  const { cell, gap, boardPad } = SHEET;
  if (transparent) return { w: p.width * cell, h: p.height * cell };
  return {
    w: p.width * cell + (p.width - 1) * gap + boardPad * 2,
    h: p.height * cell + (p.height - 1) * gap + boardPad * 2,
  };
}

/**
 * 卡片的寬度：小盤面（9 欄以下）時同原作的 1300／900；左右排列的盤面比較寬時，卡片加寬到提示每欄至少
 * clueMinColumn（5. D6）：盤面 ＋ 外框（內距 24 × 2 ＋ 框線 2）＋ 間隔 48 ＋ 兩欄與欄間距 ＋ 卡片內距 80。
 */
export function cardWidth(boardW: number, layout: SheetLayout): number {
  const S = SHEET;
  if (layout === 'col') return Math.max(S.colMinWidth, boardW + S.colExtra);
  const wrap = boardW + S.wrapPad * 2 + 2;
  const clues = S.clueMinColumn * 2 + S.columnGap;
  return Math.max(S.rowMinWidth, wrap + S.layoutGap + clues + S.cardPad * 2);
}

/* ---------- 斷行（提示裡的答案是粗體，量字寬時分開） ---------- */

/** 粗體的一段（答案或 ○）的記號：整段當成一個字交給斷行，前面加這個記號 */
const BOLD = '\u0001';

export interface StyledLine {
  runs: { text: string; bold: boolean }[];
}

/**
 * 依寬度斷行：中文逐字、英文單字與韓文詞不從中間斷（比一整行長才斷）、行首行尾禁則。
 * 粗體的一段（答案或蓋住答案的 ○）整段不斷開，像英文單字一樣和緊接的標點、英數連在一起（同原作的 keep-all）。
 */
export function wrapRuns(
  runs: readonly { text: string; bold: boolean }[],
  maxWidth: number,
  font: FontSpec,
  bold: FontSpec,
  measure: MeasureFn,
): StyledLine[] {
  const chars: string[] = [];
  for (const r of runs) {
    if (r.bold && r.text) chars.push(BOLD + r.text);
    else for (const ch of Array.from(r.text)) chars.push(ch);
  }
  const unit = (c: string) =>
    c.startsWith(BOLD) ? measure(c.slice(BOLD.length), bold) : measure(c, font);
  const lines = wrapChars(chars, Math.max(1, maxWidth), unit);
  return lines.map((line) => {
    const out: StyledLine['runs'] = [];
    for (const c of line) {
      const isBold = c.startsWith(BOLD);
      const text = isBold ? c.slice(BOLD.length) : c;
      const last = out[out.length - 1];
      if (last && last.bold === isBold) last.text += text;
      else out.push({ text, bold: isBold });
    }
    return { runs: out };
  });
}

/* ---------- 排版 ---------- */

/** 英文字母顯示成大寫（原作的盤面用 CSS 轉大寫） */
export const cellChar = (ch: string): string => {
  const up = ch.toUpperCase();
  return Array.from(up).length === 1 ? up : ch;
};

export function layoutSheet(
  puzzle: Puzzle,
  o: SheetOptions,
  measure: MeasureFn,
): SheetLayoutResult {
  const S = SHEET;
  const C = SHEET_COLORS;
  const ops: SheetOp[] = [];
  const text = (
    s: string,
    x: number,
    y: number,
    font: FontSpec,
    color: string,
    align: 'left' | 'center' | 'right' = 'left',
    baseline: 'top' | 'middle' = 'middle',
  ) => {
    if (s) ops.push({ t: 'text', x, y, text: s, font, color, align, baseline });
  };

  const board = boardSize(puzzle, o.emptyTransparent);
  const card = cardWidth(board.w, o.layout);
  const inner = card - S.cardPad * 2;
  const left = S.outer + S.cardPad;
  let y = S.outer + S.cardPad;

  /* 標題（＋解答標記）：置中，太長時換行 */
  const titleFont: FontSpec = { role: 'title', size: S.titleSize, weight: 800 };
  const badgeFont: FontSpec = { role: 'title', size: S.badgeSize, weight: 800 };
  const title = o.title.trim();
  const badgeW = o.reveal ? measure(o.labels.answerBadge, badgeFont) : 0;
  const titleMax = inner - (o.reveal ? badgeW + S.badgeGap : 0);
  const titleLines = title
    ? wrapRuns([{ text: title, bold: false }], titleMax, titleFont, titleFont, measure).map((l) =>
        l.runs.map((r) => r.text).join(''),
      )
    : [];
  const titleH = Math.max(titleLines.length * S.titleLine, o.reveal ? S.titleLine : 0);
  if (titleH > 0) {
    const widest = Math.max(0, ...titleLines.map((l) => measure(l, titleFont)));
    const groupW = widest + (o.reveal ? (widest ? S.badgeGap : 0) + badgeW : 0);
    const gx = left + (inner - groupW) / 2;
    titleLines.forEach((line, i) => {
      text(
        line,
        gx + widest / 2,
        y + i * S.titleLine + S.titleLine / 2,
        titleFont,
        C.text,
        'center',
      );
    });
    if (o.reveal)
      text(o.labels.answerBadge, gx + groupW, y + titleH / 2, badgeFont, C.primary, 'right');
    y += titleH + S.titlePadBottom;
    ops.push({ t: 'rect', x: left, y, w: inner, h: 1, fill: C.subtle });
    y += 1 + S.titleMarginBottom;
  }

  /* 盤面的外框（白底、圓角、細框、淡陰影） */
  const wrapW = board.w + S.wrapPad * 2 + 2;
  const wrapH = board.h + S.wrapPad * 2 + 2;
  const wrapX = o.layout === 'row' ? left : left + (inner - wrapW) / 2;
  const wrapY = y;
  ops.push({
    t: 'rect',
    x: wrapX,
    y: wrapY,
    w: wrapW,
    h: wrapH,
    fill: C.page,
    stroke: C.subtle,
    r: 20,
    shadow: true,
  });
  const bx = wrapX + 1 + S.wrapPad;
  const by = wrapY + 1 + S.wrapPad;
  drawBoard(ops, puzzle, o, bx, by, board);

  /* 提示 */
  const { across, down } = clueLists(puzzle);
  const cluesX = o.layout === 'row' ? wrapX + wrapW + S.layoutGap : left;
  const cluesY = o.layout === 'row' ? wrapY : wrapY + wrapH + S.layoutGap;
  const cluesW = o.layout === 'row' ? left + inner - cluesX : inner;
  const colW = Math.max(60, (cluesW - S.columnGap) / 2);
  const h1 = drawClueColumn(ops, across, 'across', cluesX, cluesY, colW, o, measure);
  const h2 = drawClueColumn(
    ops,
    down,
    'down',
    cluesX + colW + S.columnGap,
    cluesY,
    colW,
    o,
    measure,
  );
  const cluesH = Math.max(h1, h2);

  const contentBottom =
    o.layout === 'row' ? Math.max(wrapY + wrapH, cluesY + cluesH) : cluesY + cluesH;
  const height = Math.ceil(contentBottom + S.cardPad + S.outer);
  return {
    width: card + S.outer * 2,
    height,
    ops,
    board: { x: bx, y: by, w: board.w, h: board.h },
  };
}

function drawBoard(
  ops: SheetOp[],
  puzzle: Puzzle,
  o: SheetOptions,
  bx: number,
  by: number,
  board: { w: number; h: number },
) {
  const S = SHEET;
  const C = SHEET_COLORS;
  const cells = puzzleCells(puzzle);
  const transparent = o.emptyTransparent;
  if (!transparent)
    ops.push({ t: 'rect', x: bx, y: by, w: board.w, h: board.h, fill: o.emptyColor, r: 4 });
  const numFont: FontSpec = { role: 'grid', size: S.cellNum, weight: 700 };
  const charFont: FontSpec = { role: 'grid', size: S.cellText, weight: 700 };
  const step = transparent ? S.cell : S.cell + S.gap;
  const origin = transparent ? 0 : S.boardPad;
  cells.forEach((row, cy) => {
    row.forEach((cell: Cell | null, cx) => {
      if (!cell) return;
      const x = bx + origin + cx * step;
      const y = by + origin + cy * step;
      ops.push({
        t: 'rect',
        x,
        y,
        w: S.cell,
        h: S.cell,
        fill: C.cell,
        stroke: transparent ? C.cellBorder : undefined,
      });
      const inset = transparent ? 1 : 0;
      if (cell.num)
        ops.push({
          t: 'text',
          x: x + inset + 4,
          y: y + inset + 2,
          text: String(cell.num),
          font: numFont,
          color: C.muted,
          align: 'left',
          baseline: 'top',
        });
      if (o.reveal)
        ops.push({
          t: 'text',
          x: x + S.cell / 2,
          y: y + S.cell / 2,
          text: cellChar(cell.char),
          font: charFont,
          color: C.text,
          align: 'center',
          baseline: 'middle',
        });
    });
  });
}

/** 一欄提示（標題＋清單）；回傳高度 */
function drawClueColumn(
  ops: SheetOp[],
  words: readonly PlacedWord[],
  dir: 'across' | 'down',
  x: number,
  y0: number,
  w: number,
  o: SheetOptions,
  measure: MeasureFn,
): number {
  const S = SHEET;
  const C = SHEET_COLORS;
  let y = y0;
  const headFont: FontSpec = { role: 'clues', size: S.headerSize, weight: 700 };
  const label = dir === 'across' ? o.labels.across : o.labels.down;
  const badgeW = measure(label, headFont) + 24;
  ops.push({
    t: 'rect',
    x,
    y,
    w: badgeW,
    h: S.headerLine,
    fill: dir === 'across' ? C.acrossBg : C.downBg,
    r: 8,
  });
  ops.push({
    t: 'text',
    x: x + 12,
    y: y + S.headerLine / 2,
    text: label,
    font: headFont,
    color: dir === 'across' ? C.acrossText : C.downText,
    align: 'left',
    baseline: 'middle',
  });
  y += S.headerLine + S.headerPadBottom;
  ops.push({ t: 'rect', x, y, w, h: S.headerRule, fill: C.subtle });
  y += S.headerRule + S.headerMarginBottom;

  const font: FontSpec = { role: 'clues', size: S.clueSize, weight: 400 };
  const bold: FontSpec = { role: 'clues', size: S.clueSize, weight: 700 };
  const textX = x + S.clueNumWidth + S.clueNumGap;
  const textW = Math.max(20, w - S.clueNumWidth - S.clueNumGap);
  words.forEach((word, i) => {
    if (i > 0) y += S.clueGap;
    ops.push({
      t: 'text',
      x: x + S.clueNumWidth,
      y: y + 1.6 + S.clueLine / 2,
      text: `${word.num}.`,
      font: bold,
      color: C.muted,
      align: 'right',
      baseline: 'middle',
    });
    const runs = hintRuns(word.hint, word.answer, o.reveal).map((r) => ({
      text: r.text,
      bold: r.answer,
    }));
    const lines = wrapRuns(runs, textW, font, bold, measure);
    lines.forEach((line, li) => {
      let lx = textX;
      const ly = y + li * S.clueLine + S.clueLine / 2;
      for (const run of line.runs) {
        const f = run.bold ? bold : font;
        const color = run.bold ? (o.reveal ? C.primary : C.danger) : C.text;
        if (run.text)
          ops.push({
            t: 'text',
            x: lx,
            y: ly,
            text: run.text,
            font: f,
            color,
            align: 'left',
            baseline: 'middle',
          });
        lx += measure(run.text, f);
      }
    });
    y += Math.max(1, lines.length) * S.clueLine;
  });
  return y - y0;
}

/* ---------- 畫到 canvas ---------- */

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const fontString = (f: FontSpec, fonts: Record<FontRole, string>) =>
  `${f.weight} ${f.size}px ${fontFamilyCss(fonts[f.role])}`;

/** 用 canvas 量字寬（同一個字型同一段字只量一次） */
export function canvasMeasure(ctx: Ctx2D, fonts: Record<FontRole, string>): MeasureFn {
  const cache = new Map<string, number>();
  return (s, f) => {
    const font = fontString(f, fonts);
    const key = `${font}\u0000${s}`;
    let w = cache.get(key);
    if (w === undefined) {
      ctx.font = font;
      w = ctx.measureText(s).width;
      cache.set(key, w);
    }
    return w;
  };
}

/** 依排版畫圖；scale＝倍率（canvas 的大小要先設好） */
export function paintSheet(
  ctx: Ctx2D,
  layout: SheetLayoutResult,
  fonts: Record<FontRole, string>,
  scale: number,
): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.fillStyle = SHEET_COLORS.page;
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const op of layout.ops) {
    if (op.t === 'rect') {
      ctx.beginPath();
      if (op.r && 'roundRect' in ctx) ctx.roundRect(op.x, op.y, op.w, op.h, op.r);
      else ctx.rect(op.x, op.y, op.w, op.h);
      if (op.fill) {
        ctx.save();
        if (op.shadow) {
          ctx.shadowColor = 'rgba(0, 0, 0, 0.04)';
          ctx.shadowBlur = 8 * scale;
          ctx.shadowOffsetY = 2 * scale;
        }
        ctx.fillStyle = op.fill;
        ctx.fill();
        ctx.restore();
      }
      if (op.stroke) {
        ctx.save();
        ctx.beginPath();
        if (op.r && 'roundRect' in ctx)
          ctx.roundRect(op.x + 0.5, op.y + 0.5, op.w - 1, op.h - 1, op.r);
        else ctx.rect(op.x + 0.5, op.y + 0.5, op.w - 1, op.h - 1);
        ctx.strokeStyle = op.stroke;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }
      continue;
    }
    ctx.font = fontString(op.font, fonts);
    ctx.fillStyle = op.color;
    ctx.textAlign = op.align;
    ctx.textBaseline = op.baseline;
    ctx.fillText(op.text, op.x, op.y);
  }
  ctx.restore();
}

/** canvas 一邊的上限（瀏覽器多半是 32,767 px）；圖很大時倍率跟著降低 */
export const MAX_CANVAS_SIDE = 32000;
/** canvas 的面積上限（約 2.68 億畫素） */
export const MAX_CANVAS_PIXELS = 260_000_000;

/** 實際的倍率：想要的倍率，但不超過 canvas 的上限 */
export function effectiveScale(layout: Pick<SheetLayoutResult, 'width' | 'height'>, scale: number) {
  return Math.min(
    scale,
    MAX_CANVAS_SIDE / layout.width,
    MAX_CANVAS_SIDE / layout.height,
    Math.sqrt(MAX_CANVAS_PIXELS / (layout.width * layout.height)),
  );
}

/** 圖上所有的字（載入字型用），依字型分開 */
export function sheetText(puzzle: Puzzle, o: SheetOptions): Record<FontRole, string> {
  const uniq = (s: string) => Array.from(new Set(Array.from(s))).join('');
  const grid = `${puzzle.words.map((w) => w.answer + w.answer.toUpperCase()).join('')}0123456789`;
  const clues = `${o.labels.across}${o.labels.down}○.0123456789${puzzle.words.map((w) => w.hint).join('')}`;
  return {
    title: uniq(`${o.title}${o.labels.answerBadge}`),
    grid: uniq(grid),
    clues: uniq(clues),
  };
}

const ROLE_WEIGHTS: Record<FontRole, number[]> = { title: [800], grid: [700], clues: [400, 700] };

/** 載入三種字型（只下載用到的字；載不到時用備用字型） */
export async function loadSheetFonts(puzzle: Puzzle, o: SheetOptions): Promise<void> {
  const texts = sheetText(puzzle, o);
  const jobs: Promise<boolean>[] = [];
  (Object.keys(ROLE_WEIGHTS) as FontRole[]).forEach((role) => {
    for (const w of ROLE_WEIGHTS[role])
      if (texts[role]) jobs.push(ensureFont(o.fonts[role], w, texts[role], { timeoutMs: 6000 }));
  });
  await Promise.all(jobs);
}
