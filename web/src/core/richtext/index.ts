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
 *
 * **完整格式**（短文圖片產生器 prose-card 加的，全部選填；角色介紹圖不使用，資料與輸出不變）：
 * 片段可以另外有斜體、刪除線、螢光筆、字級、字型，顏色可以是空字串（＝跟著預設字色）；
 * 每一段可以有自己的對齊（靠左、置中、靠右、左右對齊）與「從新的一頁開始」（手動分頁）。
 * 編輯用 `RichTextEditor`（@/ui），排版用 `layoutRich` 的 `wrap: 'word'`（英數字詞不拆開）與 `paginateRows`（分頁）。
 */

export interface RichRun {
  text: string;
  bold: boolean;
  /** 小寫 #rrggbb；完整格式裡可以是空字串（＝跟著預設字色） */
  color: string;
  /** 斜體（完整格式） */
  italic?: boolean;
  /** 刪除線（完整格式） */
  strike?: boolean;
  /** 螢光筆（小寫 #rrggbb；完整格式） */
  highlight?: string;
  /** 字級（px；不給＝跟著整段的字級；完整格式） */
  size?: number;
  /** 字型（family；不給＝跟著整段的字型；完整格式） */
  font?: string;
}

/** 一段的對齊 */
export type RichAlign = 'left' | 'center' | 'right' | 'justify';

export const RICH_ALIGNS: readonly RichAlign[] = ['left', 'center', 'right', 'justify'];

export interface RichLine {
  runs: RichRun[];
  /** 這一段自己的對齊（不給＝跟著整體；完整格式） */
  align?: RichAlign;
  /** 這一段從新的一頁開始（手動分頁；完整格式） */
  pageBreak?: boolean;
}

/** 格式化文字：一行一項（行數＝原文的換行數＋1），行裡的片段不含換行 */
export interface RichDoc {
  lines: RichLine[];
}

export class RichTextError extends Error {
  override name = 'RichTextError';
}

const HEX = /^#[0-9a-f]{6}$/i;

/** 片段的格式（不含文字） */
export type RichStyle = Omit<RichRun, 'text'>;

/** 兩個片段的格式是否相同（沒設定的選填格式＝false／空） */
export function sameStyle(a: RichStyle, b: RichStyle): boolean {
  return (
    a.bold === b.bold &&
    a.color === b.color &&
    !!a.italic === !!b.italic &&
    !!a.strike === !!b.strike &&
    (a.highlight || '') === (b.highlight || '') &&
    (a.size || 0) === (b.size || 0) &&
    (a.font || '') === (b.font || '')
  );
}

/** 片段的副本：選填的格式只在有設定時出現（沒有完整格式的資料與以前完全相同） */
function cleanRun(r: RichRun): RichRun {
  const out: RichRun = { text: r.text, bold: r.bold, color: r.color };
  if (r.italic) out.italic = true;
  if (r.strike) out.strike = true;
  if (r.highlight) out.highlight = r.highlight;
  if (r.size) out.size = r.size;
  if (r.font) out.font = r.font;
  return out;
}

/** 只有格式（不含文字）的副本 */
export function styleOf(r: RichStyle): RichStyle {
  const { text: _t, ...rest } = cleanRun({ ...r, text: '' });
  return rest;
}

/** 一行的段落屬性（對齊、分頁）的副本；keepBreak＝false 時不帶分頁 */
function lineAttrs(line: RichLine | undefined, keepBreak = true): Omit<RichLine, 'runs'> {
  const out: Omit<RichLine, 'runs'> = {};
  if (line?.align) out.align = line.align;
  if (keepBreak && line?.pageBreak) out.pageBreak = true;
  return out;
}

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
  if (last && sameStyle(last, run)) last.text += run.text;
  else runs.push(cleanRun(run));
}

/** 整理：合併相鄰的同格式片段、去掉空片段、顏色轉小寫（不改內容） */
export function normalizeDoc(doc: RichDoc): RichDoc {
  const lines = (doc.lines.length ? doc.lines : [{ runs: [] }]).map((l) => {
    const runs: RichRun[] = [];
    for (const r of l.runs)
      append(runs, {
        ...r,
        text: r.text,
        bold: !!r.bold,
        color: r.color.toLowerCase(),
        highlight: r.highlight ? r.highlight.toLowerCase() : undefined,
      });
    return { runs, ...lineAttrs(l) };
  });
  return { lines };
}

/** 兩份格式化文字是否相同（整理後比較） */
export function sameDoc(a: RichDoc, b: RichDoc): boolean {
  return JSON.stringify(normalizeDoc(a)) === JSON.stringify(normalizeDoc(b));
}

export interface ValidateDocOptions {
  /**
   * 接受完整格式（斜體、刪除線、螢光筆、字級、字型、空白的顏色、段落的對齊與分頁）。
   * 不給時只看粗體與顏色（其他欄位丟掉），與以前相同。
   */
  full?: boolean;
  /** 完整格式的字級範圍（預設 6～400） */
  sizeRange?: readonly [number, number];
}

/**
 * 檢查外來的資料（存檔、編輯檔）：結構、每段的文字（不含換行）、粗體是真假值、顏色是色碼、總字數不超過 maxLength。
 * 不合格時丟 RichTextError；合格時回傳整理過的副本。
 */
export function validateDoc(
  raw: unknown,
  maxLength = 1000,
  opts: ValidateDocOptions = {},
): RichDoc {
  const d = raw as { lines?: unknown } | null;
  if (!d || typeof d !== 'object' || !Array.isArray(d.lines) || !d.lines.length)
    throw new RichTextError('格式化文字的行資料不正確。');
  if (d.lines.length > maxLength + 1) throw new RichTextError('格式化文字的行數太多。');
  const [minSize, maxSize] = opts.sizeRange ?? [6, 400];
  let count = 0;
  const bad = () => new RichTextError('格式化文字的格式不正確。');
  const lines: RichLine[] = d.lines.map((line) => {
    const l = line as { runs?: unknown; align?: unknown; pageBreak?: unknown } | null;
    if (!l || typeof l !== 'object' || !Array.isArray(l.runs)) throw bad();
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
        !(HEX.test(r.color) || (opts.full && r.color === ''))
      )
        throw bad();
      if (!opts.full) {
        append(runs, { text: r.text, bold: r.bold, color: r.color.toLowerCase() });
        continue;
      }
      if (r.italic !== undefined && typeof r.italic !== 'boolean') throw bad();
      if (r.strike !== undefined && typeof r.strike !== 'boolean') throw bad();
      if (r.highlight !== undefined && (typeof r.highlight !== 'string' || !HEX.test(r.highlight)))
        throw bad();
      if (
        r.size !== undefined &&
        (typeof r.size !== 'number' ||
          !Number.isFinite(r.size) ||
          r.size < minSize ||
          r.size > maxSize)
      )
        throw bad();
      if (r.font !== undefined && (typeof r.font !== 'string' || r.font.length > 200)) throw bad();
      append(runs, {
        text: r.text,
        bold: r.bold,
        color: r.color.toLowerCase(),
        italic: r.italic,
        strike: r.strike,
        highlight: r.highlight?.toLowerCase(),
        size: r.size,
        font: r.font,
      });
    }
    if (!opts.full) return { runs };
    if (l.align !== undefined && !RICH_ALIGNS.includes(l.align as RichAlign)) throw bad();
    if (l.pageBreak !== undefined && typeof l.pageBreak !== 'boolean') throw bad();
    return { runs, ...lineAttrs(l as RichLine) };
  });
  const doc = { lines };
  if (docLength(doc) > maxLength) throw new RichTextError(`格式化文字超過 ${maxLength} 字。`);
  return doc;
}

/** 一行的字數 */
const lineLength = (l: RichLine): number => l.runs.reduce((s, r) => s + r.text.length, 0);

/**
 * 切出全文的 [start, end)（UTF-16 位置；換行算一個字），格式一併保留。
 * 段落屬性：每一行保留對齊；「從新的一頁開始」只在切出的範圍包含那一段的開頭時保留。
 */
export function sliceDoc(doc: RichDoc, start: number, end = Number.POSITIVE_INFINITY): RichDoc {
  const out: RichDoc = { lines: [{ runs: [] }] };
  let offset = 0;
  let first = false;
  doc.lines.forEach((line, index) => {
    if (index) {
      if (offset >= start && offset < end) out.lines.push({ runs: [], ...lineAttrs(line) });
      offset += 1;
    }
    if (!first && start <= offset + lineLength(line)) {
      first = true;
      Object.assign(out.lines[0], lineAttrs(line, start <= offset));
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

/** 接起來：b 的第一行接在 a 的最後一行後面（這一行的段落屬性用 a 的） */
export function joinDocs(a: RichDoc, b: RichDoc): RichDoc {
  const lines: RichLine[] = a.lines.map((l) => ({
    runs: l.runs.map((r) => ({ ...r })),
    ...lineAttrs(l),
  }));
  if (!lines.length) lines.push({ runs: [] });
  const [first, ...rest] = b.lines.length ? b.lines : [{ runs: [] }];
  const tail = lines[lines.length - 1].runs;
  for (const r of first.runs) append(tail, r);
  for (const l of rest) lines.push({ runs: l.runs.map((r) => ({ ...r })), ...lineAttrs(l) });
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
        ? { runs: l.runs.map((r) => ({ ...r, color: color.toLowerCase() })), ...lineAttrs(l) }
        : { runs: l.runs.map((r) => ({ ...r })), ...lineAttrs(l) },
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
  /** 屬於第幾段（doc.lines 的索引） */
  line: number;
  /** 是不是這一段的最後一行 */
  last: boolean;
  /** 行尾空白的寬度（未壓縮；置中、靠右、左右對齊時不算進行寬） */
  trail: number;
}

export interface RichLayoutOptions {
  /** 欄寬（px） */
  width: number;
  /**
   * 一個字的前進寬度（含字距；呼叫端已處理空白加寬等規則）。第三個參數是這個字所在的片段
   * （完整格式的字級、字型、斜體會影響字寬）。
   */
  advance: (ch: string, bold: boolean, run: RichRun) => number;
  /** 每段第一行的縮排（px） */
  indent?: number;
  /** 第一段是接續上一頁的（第一行不縮排） */
  continued?: boolean;
  /** 水平壓縮比例（例如 0.95）：換行判斷用壓縮後的寬度 */
  scaleX?: number;
  /**
   * 換行規則：'char'（預設）逐字換行；'word' 英數字詞（含後面的空白）不拆開、空白掛在行尾不換到下一行，
   * 一個字詞比整行還寬時才逐字切開；中日韓文字照樣逐字。兩種都不把句讀放在行首。
   */
  wrap?: 'char' | 'word';
}

/** 字串拆成字（以 code point 為單位；組合字也會被拆開，與舊版逐字量相同） */
const chars = (s: string): string[] => Array.from(s);

/** 英數字詞的字（拉丁、希臘、西里爾字母、數字，以及字詞裡的撇號、連字號） */
const WORD_CHAR = /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Nd}'’\-_]/u;
const isSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === ' ';

interface Item {
  run: RichRun;
  ch: string;
  w: number;
}

/** 不放在行尾的字（左括號、左引號；'word' 規則用）：後面不換行 */
export const NO_LINE_END = new Set([...'([（【〈《「『“‘']);

/** 左右對齊時兩個字之間可以撐開嗎（英數字詞裡面不撐開，其他地方都可以：中日韓文字的字間、空白前後） */
export function justifyOpportunity(prev: string, cur: string): boolean {
  return !(WORD_CHAR.test(prev) && WORD_CHAR.test(cur));
}

/** 'word' 規則下，第 i 個字前面可不可以換行 */
function canBreakBefore(items: readonly Item[], i: number): boolean {
  if (i <= 0 || i >= items.length) return false;
  const cur = items[i].ch;
  const prev = items[i - 1].ch;
  if (isSpace(cur)) return false;
  if (NO_LINE_START.has(cur) || NO_LINE_END.has(prev)) return false;
  if (isSpace(prev)) return true;
  return !(WORD_CHAR.test(prev) && WORD_CHAR.test(cur));
}

/**
 * 一段（'word' 規則）的換行位置：回傳每一行第一個字的索引（第一行是 0）。
 * fits(from, to, rowIndex) 回答 items[from..to) 放不放得下一行（含縮排）。
 */
function wordBreaks(
  items: readonly Item[],
  fits: (from: number, to: number, row: number) => boolean,
) {
  const starts = [0];
  let from = 0;
  for (let i = 0; i < items.length; i++) {
    if (i === from) continue;
    if (isSpace(items[i].ch)) continue;
    if (fits(from, i + 1, starts.length - 1)) continue;
    /* 放不下：往前找最後一個可以換行的地方（這一行至少留一個字） */
    let cut = -1;
    for (let j = i; j > from; j--) {
      if (canBreakBefore(items, j)) {
        cut = j;
        break;
      }
    }
    if (cut < 0) {
      /* 一個字詞比整行還寬：逐字切（不把句讀放在行首時，帶前一個字下去） */
      cut = i;
      while (cut > from + 1 && NO_LINE_START.has(items[cut].ch)) cut--;
    }
    starts.push(cut);
    from = cut;
    /* 從新的一行重新檢查 cut..i */
    i = cut;
  }
  return starts;
}

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
    const firstIndent = li === 0 && o.continued ? 0 : indent;
    const items: Item[] = line.runs.flatMap((run) =>
      chars(run.text).map((ch) => ({ run, ch, w: o.advance(ch, run.bold, run) })),
    );
    const newRow = (ind: number): RichRow => ({
      runs: [],
      width: 0,
      indent: ind,
      start: offset,
      end: offset,
      line: li,
      last: false,
      trail: 0,
    });
    const addItem = (row: RichRow, it: Item) => {
      const last = row.runs.at(-1);
      if (last && sameStyle(last, it.run)) {
        last.text += it.ch;
        last.width += it.w;
      } else row.runs.push({ ...cleanRun({ ...it.run, text: it.ch }), width: it.w });
      row.width += it.w;
      row.trail = isSpace(it.ch) ? row.trail + it.w : 0;
      offset += it.ch.length;
      row.end = offset;
    };
    if (o.wrap === 'word') {
      /* 前綴和：快速算一段字的寬度 */
      const sum = [0];
      for (const it of items) sum.push(sum[sum.length - 1] + it.w);
      const starts = wordBreaks(
        items,
        (from, to, row) => (sum[to] - sum[from] + (row === 0 ? firstIndent : 0)) * k <= o.width,
      );
      starts.forEach((s, ri) => {
        const row = newRow(ri === 0 ? firstIndent : 0);
        const e = ri + 1 < starts.length ? starts[ri + 1] : items.length;
        for (let i = s; i < e; i++) addItem(row, items[i]);
        rows.push(row);
      });
    } else {
      let row = newRow(firstIndent);
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        let reserved = 0;
        for (let j = i + 1; j < items.length && NO_LINE_START.has(items[j].ch); j++)
          reserved += items[j].w;
        if (row.runs.length && (row.width + it.w + reserved + row.indent) * k > o.width) {
          rows.push(row);
          row = newRow(0);
        }
        addItem(row, it);
      }
      rows.push(row);
    }
    rows[rows.length - 1].last = true;
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

/** 這一行有沒有看得到的字（全是空白的行＝空行） */
export const rowHasInk = (row: RichRow): boolean => row.runs.some((r) => r.text.trim().length > 0);

/* ---------- 分頁（完整格式） ---------- */

export interface RichPage {
  /** 這一頁的行：rows[from, to) */
  from: number;
  to: number;
  /** 這一頁在全文的起點、終點（UTF-16 位置） */
  start: number;
  end: number;
  /** 這一頁的開頭在段落中間（接續上一頁） */
  continued: boolean;
  /** 這一頁的最後一行不是段落的結尾（下一頁接著） */
  openEnd: boolean;
}

export interface PaginateRowsOptions {
  /** 第 i 頁放本文的高度（px） */
  pageHeight: (page: number) => number;
  /** 一行的高度（px） */
  rowHeight: (row: RichRow) => number;
  /** 最多幾頁（預設 60）；放不下的行不排 */
  maxPages?: number;
  /** 第一頁放不下這個高度（一般是一行的高度）時，第一頁不放本文、從第二頁開始 */
  minFirst?: number;
}

export interface PaginateRowsResult {
  pages: RichPage[];
  /** 頁數到上限、還有放不下的行 */
  capped: boolean;
}

/**
 * 把排好的行分到頁上：一行一行放，放不下就換頁；段落有「從新的一頁開始」時（這一頁已經有字）換頁；
 * 第二頁以後開頭的空行省略（但「從新的一頁開始」的那一段就算是空的也留著：連續兩個分頁之間是空白的一頁）；
 * 空的頁也放不下的行硬放（不會無限換頁）；最後只剩空行時不再多一頁。至少一頁。
 */
export function paginateRows(
  doc: RichDoc,
  rows: readonly RichRow[],
  o: PaginateRowsOptions,
): PaginateRowsResult {
  const maxPages = Math.max(1, o.maxPages ?? 60);
  const pages: RichPage[] = [];
  let i = 0;
  let capped = false;
  const lineStart = (j: number) => j === 0 || rows[j - 1].line !== rows[j].line;
  const breakAt = (j: number) => lineStart(j) && !!doc.lines[rows[j].line]?.pageBreak;
  while (pages.length < maxPages) {
    const pi = pages.length;
    const cap = o.pageHeight(pi);
    if (pi > 0) {
      const s = i;
      while (i < rows.length && !rowHasInk(rows[i]) && !(i === s && breakAt(i))) i++;
    }
    const from = i;
    let used = 0;
    if (!(pi === 0 && o.minFirst !== undefined && cap < o.minFirst && rows.length)) {
      while (i < rows.length) {
        if (i > from && breakAt(i)) break;
        const h = o.rowHeight(rows[i]);
        if (i > from && used + h > cap + 1e-6) break;
        used += h;
        i++;
      }
    }
    const to = i;
    const at = rows[from]?.start ?? rows.at(-1)?.end ?? 0;
    pages.push({
      from,
      to,
      start: to > from ? rows[from].start : at,
      end: to > from ? rows[to - 1].end : at,
      continued: to > from && from > 0 && rows[from - 1].line === rows[from].line,
      openEnd: to > from && !rows[to - 1].last,
    });
    /* 後面只剩空行或沒有行：結束 */
    let rest = i;
    while (rest < rows.length && !rowHasInk(rows[rest])) rest++;
    if (rest >= rows.length) break;
    if (pages.length >= maxPages) capped = true;
  }
  return { pages, capped };
}

/* ---------- 編輯：在一段範圍套用格式 ---------- */

export interface RichFormat {
  /** true／false：設成粗體或取消；'toggle'：範圍裡全是粗體時取消，否則全部設成粗體 */
  bold?: boolean | 'toggle';
  /** 顏色（完整格式裡空字串＝回到預設字色） */
  color?: string;
  /** 以下為完整格式：斜體、刪除線（同粗體的寫法） */
  italic?: boolean | 'toggle';
  strike?: boolean | 'toggle';
  /** 螢光筆：色碼；null＝拿掉 */
  highlight?: string | null;
  /** 字級：px；null＝回到整段的字級 */
  size?: number | null;
  /** 字型：family；null＝回到整段的字型 */
  font?: string | null;
  /** 清除格式（粗體、斜體、刪除線、顏色〔回到 clearColor〕、螢光筆、字級、字型）；先清再套用其他項目 */
  clear?: boolean;
  /** 清除格式時的顏色（預設空字串＝預設字色） */
  clearColor?: string;
}

type Flag = 'bold' | 'italic' | 'strike';

/** 範圍 [start, end) 的片段都有某個開關格式嗎（空範圍看游標前一個字；什麼字都沒有時 false） */
function isRangeFlag(doc: RichDoc, start: number, end: number, flag: Flag): boolean {
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
        if (!r[flag]) all = false;
      }
      if (a > s && a <= e) before = !!r[flag];
      offset = e;
    }
  });
  if (a === b) return before ?? false;
  return any && all;
}

/** 範圍 [start, end) 裡是不是全部粗體（空範圍看游標前一個字；什麼字都沒有時 false） */
export function isRangeBold(doc: RichDoc, start: number, end: number): boolean {
  return isRangeFlag(doc, start, end, 'bold');
}

/** 範圍的格式（工具列的狀態）：開關＝全部都有；其他＝全部相同時的值，不同時 undefined（mixed 標記） */
export interface RangeMarks {
  bold: boolean;
  italic: boolean;
  strike: boolean;
  /** 共同的顏色（'' 是預設字色）；不同時 null */
  color: string | null;
  /** 共同的螢光筆（'' 是沒有）；不同時 null */
  highlight: string | null;
  /** 共同的字級（0 是跟著整段）；不同時 null */
  size: number | null;
  /** 共同的字型（'' 是跟著整段）；不同時 null */
  font: string | null;
}

/** 範圍的格式；空範圍看游標前一個字（段落開頭看後一個字；空段落是預設） */
export function rangeMarks(doc: RichDoc, start: number, end: number): RangeMarks {
  let a = Math.min(start, end);
  let b = Math.max(start, end);
  const runsIn: RichRun[] = [];
  let offset = 0;
  const all: { s: number; e: number; r: RichRun }[] = [];
  doc.lines.forEach((line, i) => {
    if (i) offset += 1;
    for (const r of line.runs) {
      all.push({ s: offset, e: offset + r.text.length, r });
      offset += r.text.length;
    }
  });
  if (a === b) {
    const prev = all.find((x) => a > x.s && a <= x.e);
    const next = all.find((x) => a >= x.s && a < x.e);
    const lineStart = a === 0 || docText(sliceDoc(doc, a - 1, a)) === '\n';
    const pick = lineStart ? next : (prev ?? next);
    if (pick) {
      a = pick.s;
      b = pick.s + 1;
    }
  }
  for (const x of all) if (x.e > a && x.s < b) runsIn.push(x.r);
  const common = <T>(get: (r: RichRun) => T, empty: T): T | null => {
    if (!runsIn.length) return empty;
    const v = get(runsIn[0]);
    return runsIn.every((r) => get(r) === v) ? v : null;
  };
  return {
    bold: runsIn.length > 0 && runsIn.every((r) => r.bold),
    italic: runsIn.length > 0 && runsIn.every((r) => !!r.italic),
    strike: runsIn.length > 0 && runsIn.every((r) => !!r.strike),
    color: common((r) => r.color, ''),
    highlight: common((r) => r.highlight ?? '', ''),
    size: common((r) => r.size ?? 0, 0),
    font: common((r) => r.font ?? '', ''),
  };
}

/** 一個片段套用格式後的樣子（toggles 已經算好） */
export function applyStyle(
  r: RichRun,
  f: RichFormat,
  toggled: Partial<Record<Flag, boolean>> = {},
): RichRun {
  let next: RichRun = { ...r };
  if (f.clear) next = { text: r.text, bold: false, color: f.clearColor ?? '' };
  const flag = (name: Flag) => {
    const v = f[name];
    if (v === undefined) return;
    const on = v === 'toggle' ? !!toggled[name] : v;
    if (on) next[name] = true;
    else if (name === 'bold') next.bold = false;
    else delete next[name];
  };
  flag('bold');
  flag('italic');
  flag('strike');
  if (f.color !== undefined) next.color = f.color.toLowerCase();
  if (f.highlight !== undefined) {
    if (f.highlight) next.highlight = f.highlight.toLowerCase();
    else delete next.highlight;
  }
  if (f.size !== undefined) {
    if (f.size) next.size = f.size;
    else delete next.size;
  }
  if (f.font !== undefined) {
    if (f.font) next.font = f.font;
    else delete next.font;
  }
  return cleanRun(next);
}

/** 在 [start, end)（全文位置）套用格式；換行不受影響。回傳新的格式化文字 */
export function applyRichFormat(doc: RichDoc, start: number, end: number, f: RichFormat): RichDoc {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.max(start, end);
  if (a === b) return doc;
  const toggled: Partial<Record<Flag, boolean>> = {};
  for (const name of ['bold', 'italic', 'strike'] as const)
    if (f[name] === 'toggle') toggled[name] = !isRangeFlag(doc, a, b, name);
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
      append(runs, applyStyle({ ...r, text: r.text.slice(lo, hi) }, f, toggled));
      append(runs, { ...r, text: r.text.slice(hi) });
    }
    return { runs, ...lineAttrs(line) };
  });
  return { lines };
}

/* ---------- 編輯：段落（完整格式） ---------- */

/** 位置 offset 在第幾段 */
export function lineIndexAt(doc: RichDoc, offset: number): number {
  let pos = 0;
  for (let i = 0; i < doc.lines.length; i++) {
    const len = lineLength(doc.lines[i]);
    if (offset <= pos + len) return i;
    pos += len + 1;
  }
  return doc.lines.length - 1;
}

/** 第 i 段在全文的起點 */
export function lineStartOf(doc: RichDoc, index: number): number {
  let pos = 0;
  for (let i = 0; i < index && i < doc.lines.length; i++) pos += lineLength(doc.lines[i]) + 1;
  return pos;
}

/** 範圍 [start, end] 碰到的段落（空範圍是游標所在的那一段） */
export function linesInRange(doc: RichDoc, start: number, end: number): number[] {
  const a = lineIndexAt(doc, Math.min(start, end));
  const b = lineIndexAt(doc, Math.max(start, end));
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

/** 範圍碰到的段落換成這個對齊（null＝拿掉，跟著整體） */
export function setLineAlign(
  doc: RichDoc,
  start: number,
  end: number,
  align: RichAlign | null,
): RichDoc {
  const hit = new Set(linesInRange(doc, start, end));
  return {
    lines: doc.lines.map((l, i) => {
      const copy: RichLine = { runs: l.runs.map((r) => ({ ...r })), ...lineAttrs(l) };
      if (hit.has(i)) {
        if (align) copy.align = align;
        else delete copy.align;
      }
      return copy;
    }),
  };
}

/** 範圍碰到的段落共同的對齊（沒有設定＝null；不同＝undefined） */
export function lineAlignIn(
  doc: RichDoc,
  start: number,
  end: number,
): RichAlign | null | undefined {
  const list = linesInRange(doc, start, end).map((i) => doc.lines[i]?.align ?? null);
  return list.every((v) => v === list[0]) ? list[0] : undefined;
}

/** 第 i 段的「從新的一頁開始」設定或拿掉 */
export function setPageBreak(doc: RichDoc, index: number, on: boolean): RichDoc {
  return {
    lines: doc.lines.map((l, i) => {
      const copy: RichLine = { runs: l.runs.map((r) => ({ ...r })), ...lineAttrs(l) };
      if (i === index) {
        if (on) copy.pageBreak = true;
        else delete copy.pageBreak;
      }
      return copy;
    }),
  };
}

/**
 * 在 [start, end) 換成一段純文字（用 style 的格式；文字裡的換行是新的段落，新的段落跟著原本那一段的對齊、
 * 不帶「從新的一頁開始」）。回傳新的格式化文字與插入之後的游標位置。
 */
export function replaceText(
  doc: RichDoc,
  start: number,
  end: number,
  text: string,
  style: RichStyle = { bold: false, color: '' },
): { doc: RichDoc; caret: number } {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.max(start, end);
  const clean = String(text ?? '').replace(/\r\n?/g, '\n');
  const align = doc.lines[lineIndexAt(doc, a)]?.align;
  const insert: RichDoc = {
    lines: clean.split('\n').map((t, i) => ({
      runs: t ? [cleanRun({ ...style, text: t })] : [],
      ...(i > 0 && align ? { align } : {}),
    })),
  };
  /* 尾段的第一行接在插入的最後一行後面（段落屬性用前面那一行的） */
  const joined = joinDocs(joinDocs(sliceDoc(doc, 0, a), insert), sliceDoc(doc, b));
  return { doc: normalizeDoc(joined), caret: a + clean.length };
}

/**
 * 在游標處分頁：[start, end) 的字刪掉，後面的字從新的一頁開始（游標在段落開頭時直接把那一段設成從新的一頁開始）。
 * 回傳新的格式化文字與游標位置（新的一段的開頭）。
 */
export function insertPageBreak(
  doc: RichDoc,
  start: number,
  end: number,
): { doc: RichDoc; caret: number } {
  const a = Math.max(0, Math.min(start, end));
  const b = Math.max(start, end);
  const base = a === b ? doc : replaceText(doc, a, b, '').doc;
  const li = lineIndexAt(base, a);
  if (a === lineStartOf(base, li)) return { doc: setPageBreak(base, li, true), caret: a };
  const split = replaceText(base, a, a, '\n', styleAtCaret(base, a));
  const next = setPageBreak(split.doc, li + 1, true);
  return { doc: next, caret: split.caret };
}

/** 游標前一個字的格式（打字時新字的格式；段落開頭看後一個字；空的時候是預設） */
export function styleAtCaret(doc: RichDoc, offset: number): RichStyle {
  let pos = 0;
  let before: RichRun | null = null;
  let after: RichRun | null = null;
  let atLineStart = true;
  for (let i = 0; i < doc.lines.length; i++) {
    if (i) pos += 1;
    const line = doc.lines[i];
    const ls = pos;
    for (const r of line.runs) {
      const s = pos;
      const e = pos + r.text.length;
      if (offset > s && offset <= e) before = r;
      if (offset >= s && offset < e && !after) after = r;
      pos = e;
    }
    if (offset >= ls && offset <= pos) {
      atLineStart = offset === ls;
      break;
    }
  }
  const pick = (atLineStart ? after : before) ?? before ?? after;
  return pick ? styleOf(pick) : { bold: false, color: '' };
}
