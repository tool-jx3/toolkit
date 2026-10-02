/**
 * core/csv：試算表文字（貼上的 Excel／Google 試算表／Notion 表格、CSV／TSV 檔）的讀寫。
 *
 * - 讀：`parseDelimited(text)`：換行統一成 LF、去掉結尾的空行；第一行有 Tab 就當 TSV（以 Tab 切開，不處理引號），
 *   否則當 CSV（雙引號包住的欄位可含逗號與換行，`""` 是一個引號）。空白文字回傳 []。
 * - 寫：`csvCell(value)`（含 `"`、`,`、換行時以雙引號包住、引號重複）、`toCsv(rows, { bom, eol })`。
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

/** 貼上的表格或 CSV／TSV 檔 → 二維陣列（第一行有 Tab 就是 TSV） */
export function parseDelimited(text: string): string[][] {
  const normalized = String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n+$/, '');
  if (!normalized.trim()) return [];
  const firstLine = normalized.split('\n')[0];
  if (firstLine.includes('\t')) return normalized.split('\n').map((line) => line.split('\t'));
  return parseCsv(normalized);
}

/** 一格 CSV：含 `"`、`,`、換行時以雙引號包住（引號重複） */
export function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface ToCsvOptions {
  /** 開頭加 UTF-8 BOM（Excel 才認得是 UTF-8；預設 false） */
  bom?: boolean;
  /** 換行（預設 CRLF） */
  eol?: string;
}

/** UTF-8 的 BOM（U+FEFF） */
const BOM = String.fromCharCode(0xfeff);

/** 二維陣列 → CSV 文字 */
export function toCsv(
  rows: readonly (readonly unknown[])[],
  { bom = false, eol = '\r\n' }: ToCsvOptions = {},
): string {
  return (bom ? BOM : '') + rows.map((cells) => cells.map(csvCell).join(',')).join(eol);
}
