/**
 * 表格：每一格是一個段落串列（至少一個段落）。增減列欄、把一格讀成字串、輸出文字（規格 3.6.3、3.6.4）。
 */
import { CELL_TEXT_SKIP, newBlock, PLAIN_EDIT_TYPES } from './blocks';
import { setBlockText } from './text';
import type { Block, Table, TableLook } from './types';

export const SEED_ITEM = '項目';
export const SEED_CONTENT = '內容';
/** 舊版（日文）的初始欄名：一樣當成「還沒改過」 */
const LEGACY_SEED_ITEM = ['項目', '項目'];
const LEGACY_SEED_CONTENT = ['內容', '内容'];

export const LOOK_HEADS: Record<Exclude<TableLook, 'grid'>, readonly string[]> = {
  list: ['骰值', '標題', '內容'],
  card: ['題名', '內容'],
};

export function newTable(): Table {
  const t: Table = {
    head: true,
    rowhead: false,
    capOn: true,
    out: '',
    outMode: 'roll',
    look: 'grid',
    name: '',
    dice: '',
    rows: 4,
    ncol: 2,
    cb: {},
  };
  cellWrite(t, 0, 0, SEED_ITEM);
  cellWrite(t, 0, 1, SEED_CONTENT);
  tblFit(t);
  return t;
}

export const tblRows = (t: Pick<Table, 'rows'>): number => Math.max(1, Math.floor(+t.rows || 1));
export const tblCols = (t: Pick<Table, 'ncol'>): number => Math.max(1, Math.floor(+t.ncol || 1));
export const cellKey = (r: number, c: number): string => `${r},${c}`;

/** 一格的段落串列（make 時沒有就建立一個空描述文） */
export function cellBlocks(t: Table, r: number, c: number, make = false): Block[] {
  if (!t.cb || typeof t.cb !== 'object' || Array.isArray(t.cb)) t.cb = {};
  const k = cellKey(r, c);
  if (!Array.isArray(t.cb[k])) {
    if (!make) return [];
    t.cb[k] = [newBlock('desc', '')];
  }
  if (make && !t.cb[k].length) t.cb[k].push(newBlock('desc', ''));
  return t.cb[k];
}

/** 讀取用（不修改） */
export function cellList(t: Pick<Table, 'cb'>, r: number, c: number): readonly Block[] {
  const l = t.cb?.[cellKey(r, c)];
  return Array.isArray(l) ? l : [];
}

/** 一格讀成一個字串：可輸入段落的文字以換行接起來 */
export function cellRead(t: Pick<Table, 'cb'>, r: number, c: number): string {
  return cellList(t, r, c)
    .filter((x) => !CELL_TEXT_SKIP.includes(x.type))
    .map((x) => String(x.text ?? ''))
    .filter((x) => x !== '')
    .join('\n');
}

export function cellsRead(t: Table): string[][] {
  const out: string[][] = [];
  for (let r = 0; r < tblRows(t); r++) {
    const row: string[] = [];
    for (let c = 0; c < tblCols(t); c++) row.push(cellRead(t, r, c));
    out.push(row);
  }
  return out;
}

/** 單行欄位顯示的文字：第一個可輸入段落 */
export function cellHead(t: Pick<Table, 'cb'>, r: number, c: number): string {
  const b = cellList(t, r, c).find((x) => PLAIN_EDIT_TYPES.includes(x.type));
  return b ? String(b.text ?? '') : '';
}

/** 單行欄位寫回：改第一個可輸入段落（沒有就在最前面加一個描述文） */
export function cellWrite(t: Table, r: number, c: number, text: unknown): void {
  const l = cellBlocks(t, r, c, true);
  const i = l.findIndex((x) => PLAIN_EDIT_TYPES.includes(x.type));
  const v = String(text ?? '');
  if (i >= 0) setBlockText(l[i], v);
  else l.unshift(newBlock('desc', v));
}

/** 依列數、欄數整理儲存格：範圍外的刪掉、缺的補上 */
export function tblFit(t: Table): void {
  const R = tblRows(t);
  const C = tblCols(t);
  if (!t.cb || typeof t.cb !== 'object' || Array.isArray(t.cb)) t.cb = {};
  for (const k of Object.keys(t.cb)) {
    const [r, c] = k.split(',').map(Number);
    if (!(r >= 0 && r < R && c >= 0 && c < C)) delete t.cb[k];
  }
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) cellBlocks(t, r, c, true);
}

function remap(t: Table, fn: (r: number, c: number) => [number, number] | null): void {
  const cb: Record<string, Block[]> = {};
  for (const [k, v] of Object.entries(t.cb ?? {})) {
    const [r, c] = k.split(',').map(Number);
    const to = fn(r, c);
    if (to) cb[cellKey(to[0], to[1])] = v;
  }
  t.cb = cb;
}

export function tblAddRow(t: Table, at?: number): void {
  const R = tblRows(t);
  const i = at == null ? R : Math.max(0, Math.min(R, at));
  remap(t, (r, c) => [r >= i ? r + 1 : r, c]);
  t.rows = R + 1;
  tblFit(t);
}

export function tblDelRow(t: Table, at: number): boolean {
  const R = tblRows(t);
  if (R <= 1) return false;
  const i = Math.max(0, Math.min(R - 1, at));
  remap(t, (r, c) => (r === i ? null : [r > i ? r - 1 : r, c]));
  t.rows = R - 1;
  tblFit(t);
  return true;
}

export function tblAddCol(t: Table, at?: number): void {
  const C = tblCols(t);
  const i = at == null ? C : Math.max(0, Math.min(C, at));
  remap(t, (r, c) => [r, c >= i ? c + 1 : c]);
  t.ncol = C + 1;
  tblFit(t);
}

export function tblDelCol(t: Table, at: number): boolean {
  const C = tblCols(t);
  if (C <= 1) return false;
  const i = Math.max(0, Math.min(C - 1, at));
  remap(t, (r, c) => (c === i ? null : [r, c > i ? c - 1 : c]));
  t.ncol = C - 1;
  tblFit(t);
  return true;
}

/** 換外觀（F101）：條列至少 3 欄、標題框至少 2 欄；第 1 列空白或仍是初始欄名時換成該外觀的欄名 */
export function setLook(t: Table, look: TableLook): void {
  if (t.look === look) return;
  t.look = look;
  if (look === 'grid') return;
  while (tblCols(t) < (look === 'list' ? 3 : 2)) tblAddCol(t);
  const h0 = cellHead(t, 0, 0).trim();
  const h1 = cellHead(t, 0, 1).trim();
  const seeded = LEGACY_SEED_ITEM.includes(h0) && LEGACY_SEED_CONTENT.includes(h1);
  if (t.head && ((!h0 && !h1) || seeded)) {
    LOOK_HEADS[look].forEach((x, i) => {
      if (i < tblCols(t)) cellWrite(t, 0, i, x);
    });
  }
}

/** 補齊表格資料、把舊格式（字串二維陣列）轉成段落串列（規格 3.1.3） */
export function ensureTable(b: Block, fix?: (x: Block) => Block): Table {
  if (!b.tbl || typeof b.tbl !== 'object') b.tbl = newTable();
  const t = b.tbl as Table;
  t.head = t.head !== false;
  t.rowhead = !!t.rowhead;
  t.capOn = t.capOn !== false;
  t.out = String(t.out ?? '');
  t.outMode = (['free', 'simple', 'roll'] as const).includes(t.outMode) ? t.outMode : 'roll';
  t.outOpen = !!t.outOpen;
  t.look = t.look === 'list' || t.look === 'card' ? t.look : 'grid';
  t.name = String(t.name ?? '');
  t.dice = String(t.dice ?? '');
  if (!t.cb || typeof t.cb !== 'object' || Array.isArray(t.cb)) t.cb = {};
  for (const k of Object.keys(t.cb)) {
    if (!Array.isArray(t.cb[k])) delete t.cb[k];
    else if (fix) t.cb[k] = t.cb[k].filter((x) => x && typeof x === 'object').map(fix);
  }
  const old = Array.isArray(t.cells) ? t.cells : Array.isArray(t.seed) ? t.seed : null;
  if (old?.length) {
    t.rows = old.length;
    t.ncol = Math.max(1, ...old.map((r) => (Array.isArray(r) ? r.length : 1)));
    old.forEach((row, ri) => {
      const cells = Array.isArray(row) ? row : [];
      for (let ci = 0; ci < t.ncol; ci++) {
        const v = String(cells[ci] ?? '');
        const l = cellBlocks(t, ri, ci, true);
        if (v === '') continue;
        const i = l.findIndex((x) => PLAIN_EDIT_TYPES.includes(x.type));
        if (i >= 0 && !String(l[i].text ?? '')) l[i].text = v;
        else if (!l.some((x) => String(x.text ?? '') === v)) l.unshift(newBlock('desc', v));
      }
    });
  }
  delete t.cells;
  delete t.seed;
  t.rows = tblRows(t);
  t.ncol = tblCols(t);
  tblFit(t);
  return t;
}

/* ---------- 輸出文字（3.6.4） ---------- */

const ROLL_NUM = /^\d+(\s*[-–〜～]\s*\d+)?$/;

export function rollTableText(t: Table): string {
  const rows = cellsRead(t)
    .slice(t.head ? 1 : 0)
    .filter((r) => r.some((c) => String(c).trim()));
  const name = String(t.name ?? '').trim() || '表';
  const dice = String(t.dice ?? '').trim() || `1D${Math.max(1, rows.length)}`;
  const body = rows
    .map((r, i) => {
      const first = String(r[0] ?? '').trim();
      const isNum = ROLL_NUM.test(first);
      const val = isNum ? first.replace(/\s+/g, '') : String(i + 1);
      const parts = (isNum ? r.slice(1) : r).map((c) => String(c).trim()).filter(Boolean);
      const rest = parts.join(t.look === 'list' ? '\n' : '　');
      return `${val}:${rest.replace(/\n/g, '\\n')}`;
    })
    .join('\n');
  return `/roll-table\n${name}\n${dice}\n${body}`;
}

export function simpleTableText(t: Table): string {
  const cs = cellsRead(t);
  const head = t.head ? cs[0] : [];
  const rows = cs.slice(t.head ? 1 : 0).filter((r) => r.some((c) => String(c).trim()));
  const name = String(t.name ?? '').trim();
  const body = rows
    .map((r) => {
      const cells = r.map((c) => String(c).trim());
      if (t.look === 'grid' && head.length > 1) {
        return cells
          .map((c, i) => (c ? ((head[i] ?? '').trim() ? `${head[i].trim()}：${c}` : c) : ''))
          .filter(Boolean)
          .join('／');
      }
      const t0 = cells[0] ?? '';
      const rest = cells.slice(1).filter(Boolean);
      return (t0 ? `■${t0}\n` : '') + rest.join('\n');
    })
    .filter((x) => x.trim())
    .join(t.look === 'grid' ? '\n' : '\n\n');
  return (name ? `${name}\n` : '') + body;
}

export function tblOutText(t: Table): string {
  if (t.outMode === 'free') return String(t.out ?? '');
  if (t.outMode === 'simple') return simpleTableText(t);
  return rollTableText(t);
}

/** 匯出 HTML 的「複製輸出」：自己寫的文字不是空白時用它，否則用 roll-table */
export function exportOutText(t: Table): string {
  return String(t.out ?? '').trim() || rollTableText(t);
}
