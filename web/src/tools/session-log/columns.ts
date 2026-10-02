/**
 * 表格的欄位（規格 F19、F38～F43、3.4）：預設欄位、可選欄位、自訂欄位，以及顯示、移除、排序、調整寬度、重設。
 * 純函式（不依賴 React）：輸入目前的欄位設定，回傳新的。
 */

/** 存檔裡的一欄（順序＝表格的順序） */
export interface ColumnState {
  key: string;
  /** 自訂欄位的名稱（內建欄位的名稱由 COLUMN_LABELS 決定，存的值只供舊版讀取） */
  label?: string;
  width: number;
  /** 固定欄（團報勾選、送出） */
  locked?: boolean;
  /** 使用者建立的欄位 */
  custom?: boolean;
  [extra: string]: unknown;
}

export const REPORTED_KEY = 'reported';
export const REPORT_KEY = 'report';

/** 預設欄位的順序（F19） */
export const DEFAULT_COLUMN_KEYS = [
  REPORTED_KEY,
  'date',
  'scenario',
  'system',
  'role',
  'gm',
  'players',
  'pc',
  'status',
  'time',
  'note',
  REPORT_KEY,
] as const;

/** 可選欄位（F38，依序） */
export const OPTIONAL_COLUMN_KEYS = [
  'fav',
  'ho',
  'ending',
  'survival',
  'campaign',
  'hashtag',
  'sessionUrl',
  'scenarioUrl',
  'kansouUrl',
] as const;

/** 內建欄位的名稱 */
export const COLUMN_LABELS: Readonly<Record<string, string>> = Object.freeze({
  reported: '團報',
  date: '日期',
  scenario: '劇本',
  system: '系統',
  role: '身分',
  gm: 'GM',
  players: 'PL',
  pc: 'PC',
  status: '狀態',
  time: '時間',
  note: '備註',
  report: '送出',
  fav: '最愛',
  ho: 'HO',
  ending: '結局',
  survival: '生還／撕卡',
  campaign: '長團',
  hashtag: '主題標籤',
  sessionUrl: '跑團紀錄網址',
  scenarioUrl: '劇本網址',
  kansouUrl: '感想網址',
});

/** 可選欄位的一句說明（F38） */
export const COLUMN_DESCRIPTIONS: Readonly<Record<string, string>> = Object.freeze({
  fav: '想特別標記的團打上星號',
  ho: '拿到的 HO、PC 編號',
  ending: '走到的結局或路線',
  survival: '角色生還或撕卡',
  campaign: '屬於哪個長團、系列',
  hashtag: '發團報、搜尋時用的標籤',
  sessionUrl: '跑團紀錄、團報貼文的網址',
  scenarioUrl: '劇本的發布頁或販售頁',
  kansouUrl: '公開感想的網址',
});

/** 預設寬度與最小寬度（px，3.4）；其他欄 140／72 */
const DEFAULT_WIDTHS: Readonly<Record<string, number>> = Object.freeze({
  reported: 78,
  fav: 72,
  date: 136,
  scenario: 310,
  system: 124,
  role: 96,
  gm: 124,
  players: 170,
  pc: 170,
  status: 120,
  time: 84,
  note: 250,
  report: 116,
});

const MIN_WIDTHS: Readonly<Record<string, number>> = Object.freeze({
  reported: 66,
  fav: 56,
  date: 112,
  scenario: 180,
  system: 108,
  role: 78,
  gm: 96,
  players: 110,
  pc: 110,
  status: 108,
  time: 72,
  note: 160,
  report: 116,
});

export const defaultWidth = (key: string): number => DEFAULT_WIDTHS[key] ?? 140;
export const minWidth = (key: string): number => MIN_WIDTHS[key] ?? 72;
export const maxWidth = (key: string): number => (key === 'scenario' || key === 'note' ? 520 : 360);

/** 欄寬夾在最小值與最大值之間（四捨五入成整數） */
export function clampColumnWidth(key: string, width: number): number {
  const w = Number.isFinite(width) && width > 0 ? width : defaultWidth(key);
  return Math.max(minWidth(key), Math.min(maxWidth(key), Math.round(w)));
}

export const isLockedKey = (key: string): boolean => key === REPORTED_KEY || key === REPORT_KEY;
export const isUrlColumn = (key: string): boolean => /Url$/.test(key);

export function defaultColumns(): ColumnState[] {
  return DEFAULT_COLUMN_KEYS.map((key) => ({
    key,
    width: defaultWidth(key),
    ...(isLockedKey(key) ? { locked: true } : {}),
  }));
}

/** 欄位名稱：內建欄位用 COLUMN_LABELS，自訂欄位用存的名稱 */
export function columnLabel(col: Pick<ColumnState, 'key' | 'label'>): string {
  return COLUMN_LABELS[col.key] ?? (col.label || col.key);
}

/** 欄位設定（顯示中的欄位、移除的欄位、自訂欄位） */
export interface ColumnsData {
  columns: ColumnState[];
  hiddenColumns: ColumnState[];
  customColumns: ColumnState[];
}

/** F38 的清單：可選欄位＋自訂欄位＋移除的自訂欄位（同一個鍵只列一次，後面的優先） */
export function extraColumns(data: ColumnsData): ColumnState[] {
  const map = new Map<string, ColumnState>();
  for (const key of OPTIONAL_COLUMN_KEYS) map.set(key, { key, width: defaultWidth(key) });
  for (const c of data.customColumns) map.set(c.key, c);
  for (const c of data.hiddenColumns) if (c.custom) map.set(c.key, c);
  return [...map.values()];
}

/**
 * 新增／編輯對話框的欄位（F45）：預設欄位（固定欄除外）＋所有額外欄位＋表格裡其他非固定欄位
 * （同一個鍵只列一次，位置照第一次出現）。
 */
export function dialogColumns(data: ColumnsData): ColumnState[] {
  const map = new Map<string, ColumnState>();
  for (const key of DEFAULT_COLUMN_KEYS)
    if (!isLockedKey(key)) map.set(key, { key, width: defaultWidth(key) });
  for (const c of extraColumns(data)) map.set(c.key, c);
  for (const c of data.columns) if (!c.locked) map.set(c.key, c);
  return [...map.values()];
}

/** 把一欄加進表格（插在送出欄前；沒有送出欄時加在最後），並從移除的欄位拿掉（F38） */
export function showColumn(
  data: ColumnsData,
  col: Pick<ColumnState, 'key'> & Partial<ColumnState>,
): ColumnsData {
  if (data.columns.some((c) => c.key === col.key)) return data;
  const next: ColumnState = {
    ...col,
    key: col.key,
    width: clampColumnWidth(col.key, Number(col.width) || defaultWidth(col.key)),
  };
  const columns = [...data.columns];
  const reportIndex = columns.findIndex((c) => c.key === REPORT_KEY);
  if (reportIndex >= 0) columns.splice(reportIndex, 0, next);
  else columns.push(next);
  return {
    ...data,
    columns,
    hiddenColumns: data.hiddenColumns.filter((c) => c.key !== col.key),
  };
}

/** 把一欄移出表格（固定欄不行）；資料保留，記在移除的欄位（F40） */
export function hideColumn(data: ColumnsData, key: string): ColumnsData {
  const index = data.columns.findIndex((c) => c.key === key && !c.locked);
  if (index < 0) return data;
  const removed = data.columns[index];
  return {
    ...data,
    columns: data.columns.filter((_, i) => i !== index),
    hiddenColumns: data.hiddenColumns.some((c) => c.key === key)
      ? data.hiddenColumns
      : [...data.hiddenColumns, removed],
  };
}

/** 重設欄位（F41）：預設欄位，移除的欄位清空；自訂欄位的定義保留 */
export function resetColumns(data: ColumnsData): ColumnsData {
  return { ...data, columns: defaultColumns(), hiddenColumns: [] };
}

/** 自訂欄位的鍵（`custom_<毫秒>`，重複時加 1） */
export function newCustomKey(data: ColumnsData, now: number = Date.now()): string {
  const used = new Set([
    ...data.columns.map((c) => c.key),
    ...data.customColumns.map((c) => c.key),
    ...data.hiddenColumns.map((c) => c.key),
  ]);
  let n = now;
  while (used.has(`custom_${n}`)) n++;
  return `custom_${n}`;
}

/** 建立自訂欄位（F39）：加進自訂欄位，並插在表格最後一欄（送出欄）之前 */
export function addCustomColumn(data: ColumnsData, label: string, now?: number): ColumnsData {
  const key = newCustomKey(data, now);
  const column: ColumnState = { key, label, width: defaultWidth(key), custom: true };
  const columns = [...data.columns];
  columns.splice(Math.max(columns.length - 1, 0), 0, column);
  return { ...data, columns, customColumns: [...data.customColumns, column] };
}

/** 拖曳排序的落點限制：不能在團報勾選欄之前、送出欄之後 */
function clampInsertIndex(columns: readonly ColumnState[], index: number): number {
  let i = index;
  const firstUnlocked = columns.findIndex((c) => !c.locked);
  if (firstUnlocked > 0) i = Math.max(i, firstUnlocked);
  const trailingLocked = columns.findIndex((c) => c.locked && c.key !== REPORTED_KEY);
  if (trailingLocked >= 0) i = Math.min(i, trailingLocked);
  return Math.max(i, 0);
}

/** 拖曳排序（F42）：把 source 放到 target 的前面或後面 */
export function moveColumn(
  columns: readonly ColumnState[],
  sourceKey: string,
  targetKey: string,
  side: 'before' | 'after',
): ColumnState[] {
  if (sourceKey === targetKey) return [...columns];
  const sourceIndex = columns.findIndex((c) => c.key === sourceKey);
  const targetIndex = columns.findIndex((c) => c.key === targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || columns[sourceIndex].locked) return [...columns];
  const rest = columns.filter((_, i) => i !== sourceIndex);
  let insert = rest.findIndex((c) => c.key === targetKey);
  if (side === 'after') insert += 1;
  insert = clampInsertIndex(rest, insert);
  rest.splice(insert, 0, columns[sourceIndex]);
  return rest;
}

/** 鍵盤排序（spec 5. D22）：往左或往右移一格（不越過固定欄） */
export function moveColumnBy(
  columns: readonly ColumnState[],
  key: string,
  delta: -1 | 1,
): ColumnState[] {
  const index = columns.findIndex((c) => c.key === key);
  if (index < 0 || columns[index].locked) return [...columns];
  const target = columns[index + delta];
  if (!target || target.locked) return [...columns];
  return moveColumn(columns, key, target.key, delta < 0 ? 'before' : 'after');
}

/** 調整欄寬（F43） */
export function resizeColumn(
  columns: readonly ColumnState[],
  key: string,
  width: number,
): ColumnState[] {
  return columns.map((c) =>
    c.key === key && !c.locked ? { ...c, width: clampColumnWidth(key, width) } : c,
  );
}

/** 表格裡還沒有的可選欄位，依鍵加進表格（匯入後，3.8.7） */
export function ensureColumnsForKeys(data: ColumnsData, keys: Iterable<string>): ColumnsData {
  let out = data;
  for (const key of keys) {
    if (out.columns.some((c) => c.key === key)) continue;
    if ((OPTIONAL_COLUMN_KEYS as readonly string[]).includes(key)) out = showColumn(out, { key });
  }
  return out;
}

/** 新增匯入時，把 JSON 檔有、表格沒有的欄位加在送出欄前（主題標籤除外；3.8.7） */
export function mergeColumns(
  current: readonly ColumnState[],
  imported: readonly ColumnState[],
): ColumnState[] {
  const merged = current.length ? [...current] : defaultColumns();
  for (const column of imported) {
    if (!column?.key || column.key === 'hashtag') continue;
    if (merged.some((c) => c.key === column.key)) continue;
    const insert: ColumnState = {
      ...column,
      width: clampColumnWidth(column.key, Number(column.width) || defaultWidth(column.key)),
    };
    const reportIndex = merged.findIndex((c) => c.key === REPORT_KEY);
    if (reportIndex >= 0) merged.splice(reportIndex, 0, insert);
    else merged.push(insert);
  }
  return merged;
}

/**
 * 讀入的欄位設定（存檔、JSON）整理：鍵是字串的物件、同一個鍵只留第一個、寬度夾在範圍內、固定欄加標記；
 * 自訂欄位保留名稱。`ensureLocked` 時團報勾選欄放最左、送出欄放最右（缺的補上）。
 */
export function cleanColumns(raw: unknown, { ensureLocked = false } = {}): ColumnState[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: ColumnState[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    if (typeof c.key !== 'string' || !c.key || seen.has(c.key)) continue;
    seen.add(c.key);
    const key = c.key;
    const col: ColumnState = { key, width: clampColumnWidth(key, Number(c.width)) };
    if (isLockedKey(key)) col.locked = true;
    if (c.custom || (!COLUMN_LABELS[key] && typeof c.label === 'string')) {
      col.custom = true;
      col.label = typeof c.label === 'string' && c.label ? c.label : key;
    }
    out.push(col);
  }
  if (!ensureLocked) return out;
  const middle = out.filter((c) => !c.locked);
  const reported = out.find((c) => c.key === REPORTED_KEY) ?? {
    key: REPORTED_KEY,
    width: defaultWidth(REPORTED_KEY),
    locked: true,
  };
  const report = out.find((c) => c.key === REPORT_KEY) ?? {
    key: REPORT_KEY,
    width: defaultWidth(REPORT_KEY),
    locked: true,
  };
  return [reported, ...middle, report];
}

/** 匯出 JSON 用：每一欄都寫上名稱（舊版讀得到） */
export function columnsForExport(columns: readonly ColumnState[]): ColumnState[] {
  return columns.map((c) => ({ ...c, label: columnLabel(c) }));
}
