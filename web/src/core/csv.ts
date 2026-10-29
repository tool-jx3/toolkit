/**
 * core/csv：試算表文字（貼上的 Excel／Google 試算表／Notion 表格、CSV／TSV 檔）的讀寫。
 *
 * - 讀：`parseDelimited(text, { quotes })`：換行統一成 LF、去掉結尾的空行；第一行有 Tab 就當 TSV（以 Tab 切開；
 *   預設不處理引號，`quotes: true` 時以 `"` 開頭、`"` 結束的欄位照試算表的寫法讀：可含 Tab 與換行，`""` 是一個引號），
 *   否則當 CSV（雙引號包住的欄位可含逗號與換行，`""` 是一個引號）。空白文字回傳 []。
 * - 寫：`csvCell(value, { guard })`（含 `"`、`,`、換行時以雙引號包住、引號重複）、`toCsv(rows, { bom, eol, guard })`。
 * - 公式注入：`guard` 讓以 `=`、`+`、`-`、`@`、Tab、CR 開頭的格前面加 `'`（試算表才不會當公式算）；
 *   讀回時用 `unguardFormula` 拿掉，讓同一套工具匯出再讀入的文字相同。
 */

/** CSV（RFC 4180 的寫法；不處理 BOM，換行要先統一成 LF） */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/**
 * TSV，處理試算表複製時加的引號：欄位以 `"` 開頭、在 Tab／換行／結尾前以 `"` 結束時，
 * 引號裡的 Tab 與換行屬於這一格，`""` 是一個引號；其他情形（引號沒有收尾、收尾後還有字）照原文讀。
 */
function parseTsvQuoted(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  const n = text.length;
  let i = 0;
  const plainEnd = (from: number) => {
    let k = from;
    while (k < n && text[k] !== '\t' && text[k] !== '\n') k++;
    return k;
  };
  for (;;) {
    let field: string | null = null;
    if (text[i] === '"') {
      let j = i + 1;
      let buf = '';
      let closed = false;
      while (j < n) {
        const ch = text[j];
        if (ch === '"') {
          if (text[j + 1] === '"') {
            buf += '"';
            j += 2;
            continue;
          }
          closed = true;
          j++;
          break;
        }
        buf += ch;
        j++;
      }
      if (closed && (j >= n || text[j] === '\t' || text[j] === '\n')) {
        field = buf;
        i = j;
      }
    }
    if (field === null) {
      const k = plainEnd(i);
      field = text.slice(i, k);
      i = k;
    }
    row.push(field);
    if (i >= n) {
      rows.push(row);
      return rows;
    }
    if (text[i] === '\n') {
      rows.push(row);
      row = [];
    }
    i++;
  }
}

export interface ParseDelimitedOptions {
  /** TSV 也處理引號（Excel／Google 試算表複製含換行、引號的格會以 `"` 包住）；預設 false：TSV 照原文以 Tab 切開 */
  quotes?: boolean;
}

/** 貼上的表格或 CSV／TSV 檔 → 二維陣列（第一行有 Tab 就是 TSV） */
export function parseDelimited(
  text: string,
  { quotes = false }: ParseDelimitedOptions = {},
): string[][] {
  const normalized = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '');
  if (!normalized.trim()) return [];
  const firstLine = normalized.split('\n', 1)[0];
  if (firstLine.includes('\t'))
    return quotes
      ? parseTsvQuoted(normalized)
      : normalized.split('\n').map((line) => line.split('\t'));
  return parseCsv(normalized);
}

/** 以 `=`、`+`、`-`、`@`、Tab、CR 開頭（前面可以已經有 `'`）的文字：試算表會當公式 */
const FORMULA_START = /^'*[=+\-@\t\r]/;

/** 防公式注入：以 `=`、`+`、`-`、`@`、Tab、CR 開頭的文字前面加 `'`（已經是 `'` 開頭的再多加一個，讀回才相同） */
export function guardFormula(text: string): string {
  return FORMULA_START.test(text) ? `'${text}` : text;
}

/** `guardFormula` 的反向：`'` 後面接 `=`、`+`、`-`、`@`、Tab、CR（或更多 `'`）時拿掉一個 `'`；其他文字不變 */
export function unguardFormula(text: string): string {
  return /^'+[=+\-@\t\r]/.test(text) ? text.slice(1) : text;
}

export interface CsvCellOptions {
  /** 防公式注入（`guardFormula`）；預設 false */
  guard?: boolean;
}

/** 一格 CSV：含 `"`、`,`、換行時以雙引號包住（引號重複）；`guard: true` 時先防公式注入 */
export function csvCell(value: unknown, { guard = false }: CsvCellOptions = {}): string {
  const raw = value == null ? '' : String(value);
  const text = guard ? guardFormula(raw) : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface ToCsvOptions {
  /** 開頭加 UTF-8 BOM（Excel 才認得是 UTF-8；預設 false） */
  bom?: boolean;
  /** 換行（預設 CRLF） */
  eol?: string;
  /**
   * 防公式注入（`guardFormula`）：true 是每一格；函式時只防它回傳 true 的格（例：時間欄不防，負的年份才不會被改）。
   * 預設 false。
   */
  guard?: boolean | ((column: number, row: number) => boolean);
}

/** UTF-8 的 BOM（U+FEFF） */
const BOM = String.fromCharCode(0xfeff);

/** 二維陣列 → CSV 文字 */
export function toCsv(
  rows: readonly (readonly unknown[])[],
  { bom = false, eol = '\r\n', guard = false }: ToCsvOptions = {},
): string {
  const guarded = (c: number, r: number) => (typeof guard === 'function' ? guard(c, r) : guard);
  return (
    (bom ? BOM : '') +
    rows
      .map((cells, r) => cells.map((v, c) => csvCell(v, { guard: guarded(c, r) })).join(','))
      .join(eol)
  );
}
