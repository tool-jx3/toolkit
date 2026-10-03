/**
 * core/richtext：格式化文字（逐行的文字片段，每段可以是粗體、有自己的顏色）與它在畫布上的排版。
 * 純資料＋純函式（量字寬由呼叫端傳入），不依賴 DOM，可以直接做單元測試；RichTextField（@/ui）編輯、
 * 版型畫布（@/core/scene）與 PDF 都用同一份資料。
 *
 * ```ts
 * const doc = plainDoc('第一行\n第二行', '#323232');
 * const rows = layoutRich(doc, { width: 520, advance: (ch, bold) => widthOf(ch, bold), indent: 30 });
 * const cut = splitRich(doc, rows, 12);          // 放得下 12 行時，多出來的部分（null＝放得下）
 * ```
 */

export interface RichRun {
  text: string;
  bold: boolean;
  /** 小寫 #rrggbb */
  color: string;
}

export interface RichLine {
  runs: RichRun[];
}

/** 格式化文字：一行一項（行數＝原文的換行數＋1），行裡的片段不含換行 */
export interface RichDoc {
  lines: RichLine[];
}

export class RichTextError extends Error {
  override name = 'RichTextError';
}

const HEX = /^#[0-9a-f]{6}$/i;

/** 純文字 → 格式化文字（全部同一個顏色、不粗體） */
export function plainDoc(text: string, color = '#363636'): RichDoc {
  return {
    lines: String(text ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((t) => ({ runs: t ? [{ text: t, bold: false, color: color.toLowerCase() }] : [] })),
  };
}

/** 全文（行與行之間是換行） */
export function docText(doc: RichDoc): string {
  return doc.lines.map((l) => l.runs.map((r) => r.text).join('')).join('\n');
}

/** 字數（UTF-16 長度，與原生文字欄的 maxLength 相同） */
export const docLength = (doc: RichDoc): number => docText(doc).length;

/** 是不是空的（沒有任何字） */
export const isEmptyDoc = (doc: RichDoc): boolean => doc.lines.every((l) => l.runs.length === 0);

/** 加一段到行尾：格式相同就接在前一段後面，空字串略過 */
function append(runs: RichRun[], run: RichRun): void {
  if (!run.text) return;
  const last = runs.at(-1);
  if (last && last.bold === run.bold && last.color === run.color) last.text += run.text;
  else runs.push({ ...run });
}

/** 整理：合併相鄰的同格式片段、去掉空片段、顏色轉小寫（不改內容） */
export function normalizeDoc(doc: RichDoc): RichDoc {
  const lines = (doc.lines.length ? doc.lines : [{ runs: [] }]).map((l) => {
    const runs: RichRun[] = [];
    for (const r of l.runs)
      append(runs, { text: r.text, bold: !!r.bold, color: r.color.toLowerCase() });
    return { runs };
  });
  return { lines };
}

/** 兩份格式化文字是否相同（整理後比較） */
export function sameDoc(a: RichDoc, b: RichDoc): boolean {
  return JSON.stringify(normalizeDoc(a)) === JSON.stringify(normalizeDoc(b));
}

/**
 * 檢查外來的資料（存檔、編輯檔）：結構、每段的文字（不含換行）、粗體是真假值、顏色是色碼、總字數不超過 maxLength。
 * 不合格時丟 RichTextError；合格時回傳整理過的副本。
 */
export function validateDoc(raw: unknown, maxLength = 1000): RichDoc {
  const d = raw as { lines?: unknown } | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.lines) || !d.lines.length)
    throw new RichTextError('格式化文字的行資料不正確。');
  if (d.lines.length > maxLength + 1) throw new RichTextError('格式化文字的行數太多。');
  let count = 0;
  const lines: RichLine[] = d.lines.map((line) => {
    const l = line as { runs?: unknown } | null;
    if (!l || typeof l !== 'object' || !Array.isArray(l.runs))
      throw new RichTextError('格式化文字的格式不正確。');
    const runs: RichRun[] = [];
    for (const item of l.runs) {
      const r = item as Partial<RichRun> | null;
      count += 1;
      if (
        count > maxLength * 2 ||
        !r ||
        typeof r.text !== 'string' ||
        /[\r\n]/.test(r.text) ||
        typeof r.bold !== 'boolean' ||
        typeof r.color !== 'string' ||
        !HEX.test(r.color)
      )
        throw new RichTextError('格式化文字的格式不正確。');
      append(runs, { text: r.text, bold: r.bold, color: r.color.toLowerCase() });
    }
    return { runs };
  });
  const doc = { lines };
  if (docLength(doc) > maxLength) throw new RichTextError(`格式化文字超過 ${maxLength} 字。`);
  return doc;
}

/** 切出全文的 [start, end)（UTF-16 位置；換行算一個字），格式一併保留 */
export function sliceDoc(doc: RichDoc, start: number, end = Number.POSITIVE_INFINITY): RichDoc {
  const out: RichDoc = { lines: [{ runs: [] }] };
  let offset = 0;
  doc.lines.forEach((line, index) => {
    if (index) {
      if (offset >= start && offset < end) out.lines.push({ runs: [] });
      offset += 1;
    }
    for (const run of line.runs) {
      const a = Math.max(0, start - offset);
      const b = Math.min(run.text.length, end - offset);
      if (b > a)
        append(out.lines[out.lines.length - 1].runs, { ...run, text: run.text.slice(a, b) });
      offset += run.text.length;
    }
  });
  return out;
}

/** 接起來：b 的第一行接在 a 的最後一行後面 */
export function joinDocs(a: RichDoc, b: RichDoc): RichDoc {
  const lines = a.lines.map((l) => ({ runs: l.runs.map((r) => ({ ...r })) }));
  if (!lines.length) lines.push({ runs: [] });
  const [first, ...rest] = b.lines.length ? b.lines : [{ runs: [] }];
  const tail = lines[lines.length - 1].runs;
  for (const r of first.runs) append(tail, r);
  for (const l of rest) lines.push({ runs: l.runs.map((r) => ({ ...r })) });
  return { lines };
}

/** 把某些行（例如以「──」開頭的引言行）整行換成指定顏色 */
export function recolorLines(
  doc: RichDoc,
  match: (lineText: string) => boolean,
  color: string,
): RichDoc {
  return {
    lines: doc.lines.map((l) =>
      match(l.runs.map((r) => r.text).join(''))
        ? { runs: l.runs.map((r) => ({ ...r, color: color.toLowerCase() })) }
        : { runs: l.runs.map((r) => ({ ...r })) },
    ),
  };
}

/* ---------- 排版 ---------- */

/** 不放在行首的字（句讀、右括號）：遇到時連同前一個字一起換到下一行 */
export const NO_LINE_START = new Set([...'.,!?…:;)]〉》」』】、。，！？：；）．']);

export interface RichRowRun extends RichRun {
  /** 這一段的寬度（未壓縮） */
  width: number;
}

export interface RichRow {
  runs: RichRowRun[];
  /** 這一行的字寬總和（未壓縮、不含縮排） */
  width: number;
  /** 縮排（未壓縮） */
  indent: number;
  /** 這一行在全文的起點、終點（UTF-16 位置） */
  start: number;
  end: number;
}

export interface RichLayoutOptions {
  /** 欄寬（px） */
  width: number;
  /** 一個字的前進寬度（含字距；呼叫端已處理空白加寬等規則） */
  advance: (ch: string, bold: boolean) => number;
  /** 每段第一行的縮排（px） */
  indent?: number;
  /** 第一段是接續上一頁的（第一行不縮排） */
  continued?: boolean;
  /** 水平壓縮比例（例如 0.95）：換行判斷用壓縮後的寬度 */
  scaleX?: number;
}

/** 字串拆成字（以 code point 為單位；組合字也會被拆開，與舊版逐字量相同） */
const chars = (s: string): string[] => Array.from(s);

/**
 * 逐字累加寬度排成多行：加上這個字（與後面緊接的不可放行首的字）會超過欄寬時換行；
 * 每一段（原文的換行）是新的一行，第一行縮排（continued 時第一段不縮排）。
 * 回傳的每一行記得在全文的位置，切頁時可以準確切開原文與格式。
 */
export function layoutRich(doc: RichDoc, o: RichLayoutOptions): RichRow[] {
  const k = o.scaleX ?? 1;
  const indent = o.indent ?? 0;
  const rows: RichRow[] = [];
  let offset = 0;
  doc.lines.forEach((line, li) => {
    if (li) offset += 1;
    let row: RichRow = {
      runs: [],
      width: 0,
      indent: li === 0 && o.continued ? 0 : indent,
      start: offset,
      end: offset,
    };
    const push = () => {
      rows.push(row);
      row = { runs: [], width: 0, indent: 0, start: offset, end: offset };
    };
    const items = line.runs.flatMap((run) =>
      chars(run.text).map((ch) => ({ run, ch, w: o.advance(ch, run.bold) })),
    );
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      let reserved = 0;
      for (let j = i + 1; j < items.length && NO_LINE_START.has(items[j].ch); j++)
        reserved += items[j].w;
      if (row.runs.length && (row.width + it.w + reserved + row.indent) * k > o.width) push();
      const last = row.runs.at(-1);
      if (last && last.bold === it.run.bold && last.color === it.run.color) {
        last.text += it.ch;
        last.width += it.w;
      } else row.runs.push({ text: it.ch, bold: it.run.bold, color: it.run.color, width: it.w });
      row.width += it.w;
      offset += it.ch.length;
      row.end = offset;
    }
    push();
  });
  return rows;
}

/** 放得下幾行（至少 1 行） */
export const rowsThatFit = (height: number, lineHeight: number): number =>
  Math.max(1, Math.floor(height / lineHeight + 1e-9));

export interface RichSplit {
  before: RichDoc;
  after: RichDoc;
  /** 切在段落中間（下一頁開頭那一行不縮排） */
  continued: boolean;
}

/**
 * 只放得下 maxRows 行時，從第一個放不下的行的開頭切開；放得下（或後面沒有字）時回傳 null。
 */
export function splitRich(
  doc: RichDoc,
  rows: readonly RichRow[],
  maxRows: number,
): RichSplit | null {
  if (rows.length <= maxRows) return null;
  const cut = rows[maxRows].start;
  const text = docText(doc);
  if (cut >= text.length) return null;
  return {
    before: sliceDoc(doc, 0, cut),
    after: sliceDoc(doc, cut),
    continued: cut > 0 && text[cut - 1] !== '\n',
  };
}

/** 一行畫出來的寬度（壓縮後、含縮排） */
export const rowWidth = (row: RichRow, scaleX = 1): number => (row.width + row.indent) * scaleX;

/* ---------- 編輯：在一段範圍套用格式 ---------- */

export interface RichFormat {
  /** true／false：設成粗體或取消；'toggle'：範圍裡全是粗體時取消，否則全部設成粗體 */
  bold?: boolean | 'toggle';
  color?: string;
}

/** 範圍 [start, end) 裡是不是全部粗體（空範圍看游標前一個字；什麼字都沒有時 false） */
export function isRangeBold(doc: RichDoc, start: number, end: number): boolean {
  const a = Math.min(start, end);
  const b = Math.max(start, end);
  let offset = 0;
  let any = false;
  let all = true;
  let before: boolean | null = null;
  doc.lines.forEach((line, i) => {
    if (i) offset += 1;
    for (const r of line.runs) {
      const s = offset;
      const e = offset + r.text.length;
      if (e > a && s < b) {
        any = true;
        if (!r.bold) all = false;
      }
      if (a > s && a <= e) before = r.bold;
      offset = e;
    }
  });
  if (a === b) return before ?? false;
  return any && all;
}

/** 在 [start, end)（全文位置）套用格式；換行不受影響。回傳新的格式化文字 */
export function applyRichFormat(doc: RichDoc, start: number, end: number, f: RichFormat): RichDoc {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.max(start, end);
  if (a === b) return doc;
  const bold = f.bold === 'toggle' ? !isRangeBold(doc, a, b) : f.bold;
  let offset = 0;
  const lines = doc.lines.map((line, i) => {
    if (i) offset += 1;
    const runs: RichRun[] = [];
    for (const r of line.runs) {
      const s = offset;
      offset += r.text.length;
      const lo = Math.max(0, a - s);
      const hi = Math.min(r.text.length, b - s);
      if (hi <= lo) {
        append(runs, r);
        continue;
      }
      append(runs, { ...r, text: r.text.slice(0, lo) });
      append(runs, {
        text: r.text.slice(lo, hi),
        bold: bold ?? r.bold,
        color: f.color ? f.color.toLowerCase() : r.color,
      });
      append(runs, { ...r, text: r.text.slice(hi) });
    }
    return { runs };
  });
  return { lines };
}
