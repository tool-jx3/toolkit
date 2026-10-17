/**
 * 文字規則（純函式；量字寬由呼叫端給，所以可以在 Node 測試）：
 * - `linkTokens`：#標籤、@提及的判斷（F32；前面是開頭、空白或「(」，後面接文字、數字、底線、點）；
 * - `collapseCaption`：「更多」折疊（F33；第一行、最多 38 個字）；
 * - `ellipsize`：單行放不下時接「…」；
 * - `layoutLines`：好幾段不同字型、顏色的文字一起換行（共用 `core/richtext` 的 `layoutRich`，'word' 規則：
 *   英數字詞不拆開、句讀不在行首）；`BADGE` 這個字代表徽章等固定寬度的東西。
 */
import { layoutRich, type RichDoc, type RichRun } from '@/core/richtext';

export interface FontSpec {
  family: string;
  weight: number;
  size: number;
  italic?: boolean;
}

/** 量一段文字在某個字型下的寬度 */
export type Measure = (text: string, font: FontSpec) => number;

/** 代表徽章（或其他固定寬度的圖示）的字（Unicode 私用區） */
export const BADGE = '\uE000';
/** 代表置頂圖示的字 */
export const PIN = '\uE001';

export interface Run {
  text: string;
  font: FontSpec;
  /** 顏色（CSS 顏色） */
  color: string;
  /** 每個字固定的寬度（徽章等）；不給時量字 */
  advance?: number;
}

export interface LaidRun extends Run {
  /** 在這一行的 x */
  x: number;
  width: number;
}

export interface Line {
  runs: LaidRun[];
  /** 這一行的寬（不含行尾空白） */
  width: number;
}

/* ---------- #標籤、@提及 ---------- */

const LINK = /(^|[\s(])([#@][\p{L}\p{N}_.]+)/gu;

export interface Token {
  text: string;
  link: boolean;
}

/** 切成一般文字與 #／@ 的連結（接起來就是原文） */
export function linkTokens(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(LINK)) {
    const start = (m.index ?? 0) + m[1].length;
    if (start > last) out.push({ text: text.slice(last, start), link: false });
    out.push({ text: m[2], link: true });
    last = start + m[2].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), link: false });
  return out;
}

/* ---------- 折疊 ---------- */

export const COLLAPSE_CHARS = 38;

/** 「更多」折疊：第一行、最多 38 個字；有截掉時 more 為 true */
export function collapseCaption(text: string): { text: string; more: boolean } {
  const first = text.split('\n')[0];
  const chars = Array.from(first);
  const cut = chars.length > COLLAPSE_CHARS ? chars.slice(0, COLLAPSE_CHARS).join('') : first;
  return { text: cut, more: cut !== text };
}

/* ---------- 省略 ---------- */

/** 放不下 width 時從後面拿掉字、接「…」 */
export function ellipsize(text: string, width: number, font: FontSpec, measure: Measure): string {
  if (measure(text, font) <= width) return text;
  const chars = Array.from(text);
  let lo = 0;
  let hi = chars.length;
  /* 找最多可以留幾個字 */
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${chars.slice(0, mid).join('')}…`, font) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${chars.slice(0, lo).join('').trimEnd()}…`;
}

/* ---------- 換行 ---------- */

/** 每個字型的字寬快取（逐字量，給 layoutRich） */
const charCache = new WeakMap<Measure, Map<string, number>>();

function charWidth(measure: Measure, ch: string, font: FontSpec): number {
  let m = charCache.get(measure);
  if (!m) {
    m = new Map();
    charCache.set(measure, m);
  }
  const key = `${font.italic ? 'i' : ''}${font.weight}|${font.size}|${font.family}|${ch}`;
  let w = m.get(key);
  if (w === undefined) {
    w = measure(ch, font);
    m.set(key, w);
  }
  return w;
}

/**
 * 好幾段文字一起換行（原文的換行是新的一行）。回傳每一行的片段（同一段相鄰的字合在一起）與 x 位置。
 */
export function layoutLines(runs: readonly Run[], width: number, measure: Measure): Line[] {
  /* 每一段在 RichRun 的 font 欄記它的索引，換行後再找回原本的字型與顏色 */
  const doc: RichDoc = { lines: [{ runs: [] }] };
  runs.forEach((r, i) => {
    r.text.split('\n').forEach((part, k) => {
      if (k > 0) doc.lines.push({ runs: [] });
      if (part)
        doc.lines[doc.lines.length - 1].runs.push({
          text: part,
          bold: false,
          color: '#000000',
          font: String(i),
        });
    });
  });
  const src = (r: RichRun) => runs[Number(r.font)];
  const rows = layoutRich(doc, {
    width,
    wrap: 'word',
    advance: (ch, _bold, r) => {
      const run = src(r);
      return run.advance ?? charWidth(measure, ch, run.font);
    },
  });
  return rows.map((row) => {
    let x = 0;
    const out: LaidRun[] = row.runs.map((rr) => {
      const run = src(rr);
      const laid: LaidRun = { ...run, text: rr.text, x, width: rr.width };
      x += rr.width;
      return laid;
    });
    return { runs: out, width: Math.max(0, row.width - row.trail) };
  });
}
