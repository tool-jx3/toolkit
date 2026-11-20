/**
 * 「貼上試算表」的讀法（不依賴 React）：TSV／CSV → 一批棋子（規格 3.4）。
 *
 * 第一列是標題。每一欄的用途：標題在詞表裡（COLUMN_HEADS）→ 那個用途；標題寫「狀態:氣力」「參數:HP」「差分:笑」→ 照前綴；
 * 其他的欄：內容有「10/12」或標題是 HP、MP、SAN 這類 → 狀態，其餘 → 參數。使用者可以逐欄改用途。
 * 規則照原作（shiki365／キャラクター一括メーカー 的 parse.v1.js 的表格部分，MIT）；切欄用本站的 `@/core/csv`。
 */
import { parseDelimited } from '@/core/csv';
import { clampSize, newPiece, type Piece } from './model';
import { keySet, readNumber } from './text';
import { COLUMN_HEADS, type ColumnKind, NO_WORDS, STATUS_HEADS, wordKey, YES_WORDS } from './words';

/** 一欄 */
export interface TableColumn {
  /** 第幾欄（0 起算） */
  index: number;
  /** 標題原文（去頭尾空白） */
  header: string;
  /** 狀態、參數、差分的標籤（標題去掉前綴） */
  label: string;
  kind: ColumnKind;
  /** 自動判斷的用途 */
  auto: ColumnKind;
}

/** 讀表格時的提示（文字由 strings.ts 依代碼組） */
export type TableHint =
  | { code: 'no-name-column' }
  | { code: 'not-number'; line: number; header: string; cell: string }
  | { code: 'not-color'; line: number; header: string; cell: string }
  | { code: 'not-flag'; line: number; header: string; cell: string }
  | { code: 'not-status'; line: number; header: string; cell: string };

export interface TableResult {
  columns: TableColumn[];
  pieces: Piece[];
  hints: TableHint[];
}

const BY_HEAD = new Map<string, ColumnKind>();
for (const [kind, heads] of Object.entries(COLUMN_HEADS) as [ColumnKind, readonly string[]][]) {
  for (const h of heads) BY_HEAD.set(wordKey(h), kind);
}

/** 標題的前綴：「狀態:」「參數:」「差分:」（日文、英文也認得） */
const PREFIXES: readonly [RegExp, ColumnKind][] = [
  [/^(?:ステータス|status|狀態|状态)\s*[:：]\s*/i, 'status'],
  [/^(?:パラメータ|パラメーター|param|params|參數|参数)\s*[:：]\s*/i, 'param'],
  [/^(?:差分|face)\s*[:：]\s*/i, 'face'],
];
const STATUS_HEAD_KEYS = keySet(STATUS_HEADS);
const FRACTION = /^\s*-?\d+(?:\.\d+)?\s*[/／]\s*-?\d+(?:\.\d+)?\s*$/;
const YES = keySet(YES_WORDS);
const NO = keySet(NO_WORDS);

function flag(v: string): boolean | null {
  const k = wordKey(v);
  if (YES.has(k)) return true;
  if (NO.has(k)) return false;
  return null;
}

interface Row {
  /** 試算表的列號（1 起算；格裡有換行也算一列） */
  line: number;
  cells: string[];
}

function columnsOf(rows: readonly Row[], overrides: Readonly<Record<string, ColumnKind>>) {
  let named = false;
  const columns = rows[0].cells.map((raw, index): TableColumn => {
    const header = raw.trim();
    let label = header;
    let kind: ColumnKind | null = null;
    for (const [re, id] of PREFIXES) {
      if (re.test(header)) {
        kind = id;
        label = header.replace(re, '').trim();
        break;
      }
    }
    if (!kind && !header) kind = 'ignore';
    if (!kind) kind = BY_HEAD.get(wordKey(header)) ?? null;
    if (!kind) {
      const fraction = rows.slice(1).some((r) => FRACTION.test(r.cells[index] ?? ''));
      kind = fraction || STATUS_HEAD_KEYS.has(wordKey(header)) ? 'status' : 'param';
    }
    const auto = kind;
    const chosen = header ? overrides[header] : undefined;
    if (chosen) kind = chosen;
    if (kind === 'name') named = true;
    return { index, header, label, kind, auto };
  });
  return { columns, named };
}

/** 讀「貼上試算表」的文字；overrides：使用者改過用途的欄（標題 → 用途） */
export function parseTable(
  text: string,
  overrides: Readonly<Record<string, ColumnKind>> = {},
): TableResult {
  const hints: TableHint[] = [];
  const rows: Row[] = parseDelimited(text, { quotes: true })
    .map((cells, i) => ({ line: i + 1, cells }))
    .filter((r) => r.cells.some((c) => c.trim() !== ''));
  if (!rows.length) return { columns: [], pieces: [], hints };
  const { columns, named } = columnsOf(rows, overrides);
  if (!named && columns.length) {
    columns[0].kind = 'name';
    hints.push({ code: 'no-name-column' });
  }
  const firstName = columns.find((c) => c.kind === 'name');
  const pieces: Piece[] = [];
  const join = (a: string, b: string) => (a && b ? `${a}\n${b}` : a || b);
  for (const row of rows.slice(1)) {
    const c = newPiece({ line: row.line, from: 'text' });
    for (const col of columns) {
      const cell = (row.cells[col.index] ?? '').trim();
      if (cell === '' || col.kind === 'ignore') continue;
      const at = { line: row.line, header: col.header, cell };
      switch (col.kind) {
        case 'name':
          if (col === firstName) c.name = cell.replace(/\s*\n\s*/g, ' ');
          break;
        case 'memo':
          c.memo = join(c.memo, cell);
          break;
        case 'commands':
          c.commands = join(c.commands, cell);
          break;
        case 'externalUrl':
          c.externalUrl = cell;
          break;
        case 'image':
          c.imageName = cell;
          break;
        case 'face':
          c.faces.push({ label: col.label, imageId: null, imageName: cell });
          break;
        case 'initiative':
        case 'size': {
          const n = readNumber(cell);
          if (n == null) hints.push({ code: 'not-number', ...at });
          else if (col.kind === 'initiative') c.initiative = n;
          else c.size = clampSize(n);
          break;
        }
        case 'color': {
          const m = /^#?([0-9a-f]{6})$/i.exec(cell.normalize('NFKC'));
          if (m) c.color = `#${m[1].toLowerCase()}`;
          else hints.push({ code: 'not-color', ...at });
          break;
        }
        case 'active':
        case 'secret':
        case 'invisible':
        case 'hideStatus': {
          const f = flag(cell);
          if (f == null) hints.push({ code: 'not-flag', ...at });
          else if (col.kind === 'invisible') c.invisible = f;
          else c[col.kind] = f;
          break;
        }
        case 'status': {
          const parts = cell.normalize('NFKC').split('/');
          const value = readNumber(parts[0]);
          const max = parts.length > 1 ? readNumber(parts[1]) : value;
          if (value == null || max == null || parts.length > 2) {
            hints.push({ code: 'not-status', ...at });
          }
          c.status.push({ label: col.label, value: value ?? 0, max: max ?? 0 });
          break;
        }
        case 'param':
          c.params.push({ label: col.label, value: cell });
          break;
      }
    }
    pieces.push(c);
  }
  return { columns, pieces, hints };
}
