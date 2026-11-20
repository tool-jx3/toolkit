/**
 * 「貼上試算表」的讀法（不依賴 React）：TSV／CSV → 一批棋子（規格 3.4）。
 *
 * 第一列是標題，決定每一欄的用途：
 *   1. 標題有前綴「狀態:氣力」「參數:HP」「差分:笑」→ 照前綴（標籤是冒號後面）；
 *   2. 標題在詞表裡（words.ts 的 COLUMN_HEADS）→ 那個用途；空白的標題不用；
 *   3. 其他：標題是 HP、MP、SAN 這類，或內容有「10/12」→ 狀態，其餘 → 參數。
 * 使用者可以逐欄改用途。之後每一列交給該欄用途的填法（`FILLERS`），填不進去的格回傳提示。
 * 欄的判斷參考原作（shiki365／キャラクター一括メーカー，MIT）；切欄用本站的 `@/core/csv`。
 */
import { parseDelimited } from '@/core/csv';
import { clampPieceSize, newPiece, type Piece } from './model';
import { alternation, keySet, readNumber } from './text';
import {
  COLUMN_HEADS,
  COLUMN_PREFIXES,
  type ColumnKind,
  NO_WORDS,
  STATUS_HEADS,
  wordKey,
  YES_WORDS,
} from './words';

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

/** 一格填不進去的原因 */
export type CellProblem = 'not-number' | 'not-color' | 'not-flag' | 'not-status';

/** 讀表格時的提示（文字由 strings.ts 依代碼組） */
export type TableHint =
  | { code: 'no-name-column' }
  | { code: CellProblem; line: number; header: string; cell: string };

export interface TableResult {
  columns: TableColumn[];
  pieces: Piece[];
  hints: TableHint[];
}

interface GridRow {
  /** 試算表的列號（1 起算；格裡有換行也算一列） */
  line: number;
  cells: string[];
}

/* ---------- 欄的用途 ---------- */

const KIND_BY_HEADER = new Map<string, ColumnKind>(
  (Object.entries(COLUMN_HEADS) as [ColumnKind, readonly string[]][]).flatMap(([kind, heads]) =>
    heads.map((h): [string, ColumnKind] => [wordKey(h), kind]),
  ),
);
const STATUS_HEADERS = keySet(STATUS_HEADS);

/** 「狀態:氣力」：前綴（不分大小寫）、冒號、標籤 */
const PREFIX_RULES = (Object.entries(COLUMN_PREFIXES) as [ColumnKind, readonly string[]][]).map(
  ([kind, words]) => ({
    kind,
    pattern: new RegExp(`^(?:${alternation(words)})\\s*[:：]\\s*(.*)$`, 'is'),
  }),
);

const NUMBER_TEXT = '-?\\d+(?:\\.\\d+)?';
/** 「10/12」「３／５」這種目前值／最大值 */
const FRACTION_CELL = new RegExp(`^\\s*${NUMBER_TEXT}\\s*[/／]\\s*${NUMBER_TEXT}\\s*$`);

function splitPrefix(header: string): { kind: ColumnKind; label: string } | null {
  for (const rule of PREFIX_RULES) {
    const hit = rule.pattern.exec(header);
    if (hit) return { kind: rule.kind, label: hit[1].trim() };
  }
  return null;
}

/** 沒有前綴的欄：詞表 → 狀態的標題或內容像「10/12」→ 參數 */
function guessKind(header: string, cells: readonly string[]): ColumnKind {
  if (header === '') return 'ignore';
  const key = wordKey(header);
  const listed = KIND_BY_HEADER.get(key);
  if (listed) return listed;
  return STATUS_HEADERS.has(key) || cells.some((c) => FRACTION_CELL.test(c)) ? 'status' : 'param';
}

/** 每一欄的用途；overrides：使用者改過的（標題 → 用途） */
function classifyColumns(
  headerRow: readonly string[],
  body: readonly GridRow[],
  overrides: Readonly<Record<string, ColumnKind>>,
): TableColumn[] {
  return headerRow.map((title, index) => {
    const header = title.trim();
    const prefixed = splitPrefix(header);
    const auto =
      prefixed?.kind ??
      guessKind(
        header,
        body.map((r) => r.cells[index] ?? ''),
      );
    const chosen = header === '' ? undefined : overrides[header];
    const label = prefixed ? prefixed.label : header;
    return { index, label, header, auto, kind: chosen || auto };
  });
}

/* ---------- 一格的填法 ---------- */

/** 開關欄的值：是 → true、否 → false、其他 → 讀不出（兩邊都有的寫法算「是」） */
const ANSWERS = new Map<string, boolean>([
  ...NO_WORDS.map((w): [string, boolean] => [wordKey(w), false]),
  ...YES_WORDS.map((w): [string, boolean] => [wordKey(w), true]),
]);
const yesNo = (cell: string): boolean | null => ANSWERS.get(wordKey(cell)) ?? null;

const HEX6 = /^#?([\da-f]{6})$/i;
const appendLine = (base: string, more: string): string => [base, more].filter(Boolean).join('\n');

type Filler = (c: Piece, cell: string, col: TableColumn) => CellProblem | undefined;

const numberInto =
  (put: (c: Piece, n: number) => void): Filler =>
  (c, cell) => {
    const n = readNumber(cell);
    if (n === null) return 'not-number';
    put(c, n);
    return undefined;
  };

const switchInto =
  (key: 'active' | 'secret' | 'invisible' | 'hideStatus'): Filler =>
  (c, cell) => {
    const on = yesNo(cell);
    if (on === null) return 'not-flag';
    c[key] = on;
    return undefined;
  };

const FILLERS: Readonly<Record<Exclude<ColumnKind, 'name' | 'ignore'>, Filler>> = {
  memo: (c, cell) => {
    c.memo = appendLine(c.memo, cell);
    return undefined;
  },
  commands: (c, cell) => {
    c.commands = appendLine(c.commands, cell);
    return undefined;
  },
  externalUrl: (c, cell) => {
    c.externalUrl = cell;
    return undefined;
  },
  image: (c, cell) => {
    c.imageName = cell;
    return undefined;
  },
  face: (c, cell, { label }) => {
    c.faces.push({ label, imageName: cell, imageId: null });
    return undefined;
  },
  initiative: numberInto((c, n) => {
    c.initiative = n;
  }),
  size: numberInto((c, n) => {
    c.size = clampPieceSize(n);
  }),
  color: (c, cell) => {
    const hex = HEX6.exec(cell.normalize('NFKC'))?.[1];
    if (hex === undefined) return 'not-color';
    c.color = `#${hex.toLowerCase()}`;
    return undefined;
  },
  active: switchInto('active'),
  secret: switchInto('secret'),
  invisible: switchInto('invisible'),
  hideStatus: switchInto('hideStatus'),
  /* 「10/12」或「10」；讀不出時照樣加（0），並提示 */
  status: (c, cell, { label }) => {
    const [now, top, ...beyond] = cell.normalize('NFKC').split('/');
    const value = readNumber(now);
    const max = top === undefined ? value : readNumber(top);
    c.status.push({ label, value: value ?? 0, max: max ?? 0 });
    return value === null || max === null || beyond.length > 0 ? 'not-status' : undefined;
  },
  param: (c, cell, { label }) => {
    c.params.push({ label, value: cell });
    return undefined;
  },
};

/* ---------- 整份 ---------- */

/** 切成列（引號裡的分隔符號與換行照原文），整列空白的不算 */
function readGrid(text: string): GridRow[] {
  return parseDelimited(text, { quotes: true })
    .map((cells, i) => ({ line: i + 1, cells }))
    .filter((row) => row.cells.some((cell) => cell.trim() !== ''));
}

/** 讀「貼上試算表」的文字；overrides：使用者改過用途的欄（標題 → 用途） */
export function parseTable(
  text: string,
  overrides: Readonly<Record<string, ColumnKind>> = {},
): TableResult {
  const [headerRow, ...body] = readGrid(text);
  if (!headerRow) return { columns: [], pieces: [], hints: [] };
  const columns = classifyColumns(headerRow.cells, body, overrides);
  const hints: TableHint[] = [];
  /* 沒有名稱欄時第一欄當名稱 */
  if (columns.length > 0 && columns.every((col) => col.kind !== 'name')) {
    columns[0].kind = 'name';
    hints.push({ code: 'no-name-column' });
  }
  /* 名稱欄有好幾個時用第一個 */
  const nameColumn = columns.find((col) => col.kind === 'name');
  const pieces = body.map(({ line, cells }) => {
    const piece = newPiece({ line, from: 'text' });
    columns.forEach((col) => {
      const cell = cells[col.index]?.trim() ?? '';
      if (cell === '' || col.kind === 'ignore') return;
      if (col.kind === 'name') {
        /* 格裡的換行換成空白 */
        if (col === nameColumn) piece.name = cell.split(/\s*\n\s*/).join(' ');
        return;
      }
      const problem = FILLERS[col.kind](piece, cell, col);
      if (problem) hints.push({ code: problem, header: col.header, line, cell });
    });
    return piece;
  });
  return { columns, pieces, hints };
}
