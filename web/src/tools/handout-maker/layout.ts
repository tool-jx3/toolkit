/**
 * 文字的排版（純函式；量字寬由呼叫端傳入，Node 可測）：
 * - flowText：一段一段的片段（含塗黑）排成多行——換行規則用共用的 `layoutRich`（英數字詞不拆開、句讀不放行首、左括號不放行尾），
 *   塗黑的頭尾各多留 `censorPad`（同原作的左右內距），再依對齊（靠左、置中、靠右、左右對齊）算出每個字的位置與塗黑的範圍。
 * - splitColumns：報紙的分欄（每欄行數平均、放不下的行不畫）。
 * - imageBox：附圖的大小（不放大、寬度不超過內容寬的 n%）。
 */
import { justifyOpportunity, layoutRich, type RichDoc, type RichRun } from '@/core/richtext';
import type { Segment } from './markup';
import type { Align } from './model';

/** 塗黑片段在排版時的記號（放在 richtext 片段的 highlight 欄；只在這個檔裡用） */
const CEN = 'censor';
const CEN_L = 'censor-l';
const CEN_R = 'censor-r';
const CEN_LR = 'censor-lr';

const isCensor = (h: string | undefined): boolean => !!h?.startsWith(CEN);
const padLeft = (h: string | undefined) => h === CEN_L || h === CEN_LR;
const padRight = (h: string | undefined) => h === CEN_R || h === CEN_LR;

export interface FlowOptions {
  /** 欄寬 */
  width: number;
  /** 一個字的寬（不含字距；粗細等由呼叫端的字型決定） */
  measure: (ch: string) => number;
  /** 每個字後面的字距 */
  letterSpacing?: number;
  /** 塗黑頭尾的留白 */
  censorPad?: number;
  align?: Align;
}

export interface FlowCell {
  ch: string;
  /** 字格的左緣（含塗黑的左留白） */
  x: number;
  /** 前進寬度（含字距、塗黑的留白） */
  adv: number;
  /** 字畫在 x + padL */
  padL: number;
  censored: boolean;
}

export interface FlowBar {
  x: number;
  w: number;
}

export interface FlowRow {
  cells: FlowCell[];
  /** 塗黑的範圍（同一行裡相鄰的塗黑字合成一條） */
  bars: FlowBar[];
  /** 這一行看得到的寬度（不含行尾空白、左右對齊的撐開） */
  width: number;
  /** 段落的最後一行 */
  last: boolean;
}

/** 片段 → richtext 的片段（塗黑的第一個字、最後一個字各自一段，排版時多留白） */
function runsOf(segs: readonly Segment[]): RichRun[] {
  const out: RichRun[] = [];
  for (const s of segs) {
    if (!s.censored) {
      out.push({ text: s.text, bold: false, color: '' });
      continue;
    }
    const chars = Array.from(s.text);
    if (chars.length === 1) out.push({ text: s.text, bold: false, color: '', highlight: CEN_LR });
    else {
      out.push({ text: chars[0], bold: false, color: '', highlight: CEN_L });
      if (chars.length > 2)
        out.push({ text: chars.slice(1, -1).join(''), bold: false, color: '', highlight: CEN });
      out.push({ text: chars[chars.length - 1], bold: false, color: '', highlight: CEN_R });
    }
  }
  return out;
}

const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '　';

/** 排成多行（每一段至少一行；空段是一個空行） */
export function flowText(lines: readonly (readonly Segment[])[], o: FlowOptions): FlowRow[] {
  const ls = o.letterSpacing ?? 0;
  const pad = o.censorPad ?? 0;
  const align = o.align ?? 'left';
  const doc: RichDoc = { lines: lines.map((segs) => ({ runs: runsOf(segs) })) };
  const advance = (ch: string, run: Pick<RichRun, 'highlight'>) =>
    Math.max(0, o.measure(ch) + ls) +
    (padLeft(run.highlight) ? pad : 0) +
    (padRight(run.highlight) ? pad : 0);
  const rows = layoutRich(doc, {
    width: Math.max(1, o.width),
    advance: (ch, _bold, run) => advance(ch, run),
    wrap: 'word',
  });
  return rows.map((row) => {
    const raw: { ch: string; adv: number; padL: number; censored: boolean }[] = [];
    for (const run of row.runs)
      for (const ch of Array.from(run.text))
        raw.push({
          ch,
          adv: advance(ch, run),
          padL: padLeft(run.highlight) ? pad : 0,
          censored: isCensor(run.highlight),
        });
    /* 行尾空白不算進對齊（塗黑的空白算字） */
    let vis = raw.length;
    while (vis > 0 && isSpace(raw[vis - 1].ch) && !raw[vis - 1].censored) vis--;
    const visible = raw.slice(0, vis).reduce((a, c) => a + c.adv, 0);
    let x =
      align === 'right' ? o.width - visible : align === 'center' ? (o.width - visible) / 2 : 0;
    x = Math.max(0, x);
    let gap = 0;
    if (align === 'justify' && !row.last && vis > 1) {
      let slots = 0;
      for (let j = 1; j < vis; j++) if (justifyOpportunity(raw[j - 1].ch, raw[j].ch)) slots++;
      if (slots > 0) gap = Math.max(0, (o.width - visible) / slots);
    }
    const cells: FlowCell[] = [];
    raw.forEach((c, j) => {
      cells.push({ ch: c.ch, x, adv: c.adv, padL: c.padL, censored: c.censored });
      x += c.adv;
      if (gap && j + 1 < vis && justifyOpportunity(c.ch, raw[j + 1].ch)) x += gap;
    });
    const bars: FlowBar[] = [];
    let open: FlowBar | null = null;
    for (const c of cells) {
      if (!c.censored) {
        open = null;
        continue;
      }
      if (open) open.w = c.x + c.adv - open.x;
      else {
        open = { x: c.x, w: c.adv };
        bars.push(open);
      }
    }
    return { cells, bars, width: visible, last: row.last };
  });
}

/** 一般文字（沒有塗黑）的多行排版：標題、報頭等 */
export function flowPlain(text: string, o: FlowOptions): FlowRow[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((t) => (t ? [{ text: t, censored: false }] : []));
  return flowText(lines, o);
}

/** 最寬的一行 */
export const widestRow = (rows: readonly FlowRow[]): number =>
  rows.reduce((m, r) => Math.max(m, r.width), 0);

export interface Columns {
  /** 每一欄的行（照順序） */
  columns: FlowRow[][];
  /** 有放不下、沒畫的行 */
  clipped: boolean;
}

/**
 * 分欄：每欄最多 maxRows 行；行數平均分配（前面的欄多一行），放不下的行不畫。
 * 一欄時就是前 maxRows 行。
 */
export function splitColumns(rows: readonly FlowRow[], count: number, maxRows: number): Columns {
  const n = Math.max(1, Math.floor(count));
  const cap = Math.max(0, Math.floor(maxRows));
  const per = Math.min(cap, Math.ceil(rows.length / n));
  const columns: FlowRow[][] = [];
  for (let i = 0; i < n; i++) columns.push(rows.slice(i * per, (i + 1) * per));
  return { columns, clipped: per * n < rows.length };
}

/** 報紙的欄數：寬度超過 500 時兩欄（同原作） */
export const newspaperColumns = (width: number): number => (width > 500 ? 2 : 1);

/** 附圖的顯示大小：寬＝min(原寬, 內容寬 × n%)，高照比例 */
export function imageBox(
  natural: { width: number; height: number },
  contentWidth: number,
  percent: number,
): { width: number; height: number } {
  if (!natural.width || !natural.height) return { width: 0, height: 0 };
  const max = (contentWidth * percent) / 100;
  const w = Math.min(natural.width, max);
  return { width: w, height: (w * natural.height) / natural.width };
}

export interface BubbleLayout {
  rows: FlowRow[];
  /** 泡泡的寬高（含內距） */
  width: number;
  height: number;
}

/**
 * 簡訊的泡泡：文字最寬到 maxWidth − 左右內距，泡泡寬＝最寬的一行＋內距。
 */
export function bubbleLayout(
  text: string,
  o: {
    maxWidth: number;
    padX: number;
    padY: number;
    lineHeight: number;
    measure: (ch: string) => number;
  },
): BubbleLayout {
  const inner = Math.max(1, o.maxWidth - o.padX * 2);
  const rows = flowPlain(text, { width: inner, measure: o.measure });
  const textW = Math.min(inner, widestRow(rows));
  return {
    rows,
    width: textW + o.padX * 2,
    height: rows.length * o.lineHeight + o.padY * 2,
  };
}
