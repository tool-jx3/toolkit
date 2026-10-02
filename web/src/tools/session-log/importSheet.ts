/**
 * 試算表匯入（規格 3.8.1～3.8.4、3.11）：標題辨識與欄位對應、一列 → 一團、值的整理、自己的名字推測身分、重複鍵、範本 CSV。
 */
import { toCsv } from '@/core/csv';
import {
  canonicalStatus,
  canonicalSurvival,
  DEFAULT_STATUS,
  importRole,
  importSystem,
  normalizeLegacySystem,
  normalizePersonName,
  normalizeRole,
  normalizeRowDates,
  normalizeScenarioForCount,
  normalizeTimeValue,
  type SessionRow,
  splitFlexibleDates,
  splitPeople,
  statusLabel,
  survivalLabel,
  systemLabel,
} from '@/core/sessions';
import { newRowId } from './logic';
import { S } from './strings';

/** 試算表可以對應的欄位（依序；F77 的選單） */
export const SHEET_FIELDS = [
  'date',
  'scenario',
  'system',
  'role',
  'roleKp',
  'rolePl',
  'gm',
  'players',
  'pc',
  'status',
  'time',
  'note',
  'longNote',
  'campaign',
  'hashtag',
  'ending',
  'survival',
  'sessionUrl',
  'scenarioUrl',
  'kansouUrl',
  'scenarioCountKey',
] as const;

export type SheetField = (typeof SHEET_FIELDS)[number];
/** 一欄的對應（空字串＝不匯入） */
export type SheetMapping = SheetField | '';

/**
 * 標題的別名（比對前已經過 normalizeHeaderCell）。完全相等優先；都沒有時「兩個字以上的別名是標題的一部分」。
 * 依欄位順序比對。日文、英文寫法照舊版；繁中另外增補（含本工具範本 CSV 的標題，3.11）。
 */
const HEADER_ALIASES: readonly (readonly [SheetField, readonly string[]])[] = [
  [
    'date',
    ['日付', '日時', '開催日', 'プレイ日', 'セッション日', '通過日', 'date', '日期', '跑團日期'],
  ],
  [
    'scenario',
    [
      'シナリオ',
      'シナリオ名',
      '題名',
      'タイトル',
      '作品名',
      '名前',
      'scenario',
      'title',
      'name',
      '劇本',
      '劇本名稱',
      '劇本名',
      '標題',
    ],
  ],
  [
    'system',
    ['システム', 'システム名', 'ゲームシステム', 'ルール', 'system', '系統', '系統名稱', '規則'],
  ],
  ['role', ['ロール', '役割', '立場', 'role', 'plkp', 'kppl', '身分', '身份']],
  [
    'gm',
    [
      'gm',
      'kp',
      'dl',
      'キーパー',
      'ゲームマスター',
      'マスター',
      'gmkp',
      '進行役',
      '進行',
      '回し手',
      'keeper',
      'kp名',
      'gm名',
      '主持',
      '主持人',
      '守密人',
      'kp名稱',
      'gm名稱',
    ],
  ],
  [
    'players',
    [
      'pl',
      'プレイヤー',
      '同卓者',
      '参加者',
      'メンバー',
      'players',
      'player',
      'pcpl1',
      'pcpl2',
      'pcpl3',
      'pcpl4',
      'pcpl',
      'pl1',
      'pl2',
      'pl3',
      'pl4',
      'pl名',
      '玩家',
      '同團玩家',
      '參加者',
      '成員',
      'pl名稱',
    ],
  ],
  [
    'pc',
    [
      'pc',
      '探索者',
      'キャラ',
      'キャラクター',
      '探索者名',
      'pc名',
      '自pc',
      '使用pc',
      '担当pc',
      'charactername',
      'characternames',
      'キャラクター名',
      'キャラ名',
      '調查員',
      '調查員名稱',
      '角色',
      '角色名稱',
      'pc名稱',
    ],
  ],
  [
    'status',
    ['状態', 'ステータス', '進捗', '新規継続', 'newcont', 'newcontinue', 'status', '狀態', '進度'],
  ],
  [
    'time',
    ['時間', '所要時間', 'プレイ時間', 'セッション時間', 'time', 'hours', '遊玩時間', '時數'],
  ],
  ['note', ['メモ', '備考', 'ノート', 'コメント', 'note', 'memo', '備註', '備註簡短感想']],
  [
    'longNote',
    ['長文感想', '詳細メモ', '感想', '感想ネタバレ注意', 'longnote', '長篇感想', '詳細備註'],
  ],
  ['campaign', ['キャンペーン', 'シリーズ', '親アイテム', 'campaign', '長團', '系列']],
  ['hashtag', ['ハッシュタグ', 'タグ', 'hashtag', 'tag', 'tags', '主題標籤', '標籤']],
  ['ending', ['エンディング', '結末', 'ルート', 'エンド', 'end', 'ending', '結局', '路線']],
  ['survival', ['生還', '生死', 'ロスト', '生還ロスト', 'survival', '撕卡', '生還撕卡']],
  [
    'sessionUrl',
    [
      'セッションurl',
      'ログurl',
      'ログ',
      'セッションリンク',
      'sessionurl',
      '跑團紀錄網址',
      '紀錄網址',
    ],
  ],
  ['scenarioUrl', ['シナリオurl', '配布ページ', 'boothurl', 'scenariourl', '劇本網址']],
  ['kansouUrl', ['感想url', '感想リンク', 'kansoururl', '感想網址', '感想連結']],
  ['scenarioCountKey', ['シナリオキー', '集計キー', 'scenariocountkey', '劇本計數鍵']],
];

/* ---------- 小型大寫字母（Notion 的標題） ---------- */

const SMALL_CAPS: Readonly<Record<string, string>> = Object.freeze({
  ᴀ: 'A',
  ʙ: 'B',
  ᴄ: 'C',
  ᴅ: 'D',
  ᴇ: 'E',
  ꜰ: 'F',
  ɢ: 'G',
  ʜ: 'H',
  ɪ: 'I',
  ᴊ: 'J',
  ᴋ: 'K',
  ʟ: 'L',
  ᴍ: 'M',
  ɴ: 'N',
  ᴏ: 'O',
  ᴘ: 'P',
  ꞯ: 'Q',
  ʀ: 'R',
  ꜱ: 'S',
  ᴛ: 'T',
  ᴜ: 'U',
  ᴠ: 'V',
  ᴡ: 'W',
  ʏ: 'Y',
  ᴢ: 'Z',
});
const SMALL_CAPS_RE = new RegExp(`[${Object.keys(SMALL_CAPS).join('')}]`, 'g');

/** 小型大寫字母換回一般的大寫字母 */
export function desmallcaps(text: unknown): string {
  return String(text ?? '').replace(SMALL_CAPS_RE, (ch) => SMALL_CAPS[ch] ?? ch);
}

/** 標題比對用的寫法：小型大寫 → NFKC → 小寫 → 刪掉空白、底線、・／/、括號與句點 */
export function normalizeHeaderCell(value: unknown): string {
  return desmallcaps(value)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s　_・／/]+/g, '')
    .replace(/[()（）.]/g, '');
}

const BOOLISH_RE = /^(yes|no|true|false|✓|✔|✗|✘|はい|いいえ|有|無|○|◯|●|×|✕|y|n|1|0)$/i;
const YESISH_RE = /^(yes|true|✓|✔|はい|有|○|◯|●|y|1|kp|pl|参加|通過|済)$/i;

/** 一個標題 → 欄位（3.8.1）；samples 是下面幾列的值（判斷 KP／PL 欄是不是是非旗標） */
export function guessFieldForHeader(
  header: unknown,
  samples: readonly unknown[] = [],
): SheetMapping {
  const key = normalizeHeaderCell(header);
  if (!key) return '';
  if (key === 'kp' || key === 'pl') {
    const vals = samples.map((v) => String(v ?? '').trim()).filter(Boolean);
    if (vals.length && vals.every((v) => BOOLISH_RE.test(v)))
      return key === 'kp' ? 'roleKp' : 'rolePl';
  }
  for (const [field, aliases] of HEADER_ALIASES) if (aliases.includes(key)) return field;
  for (const [field, aliases] of HEADER_ALIASES)
    if (aliases.some((a) => a.length >= 2 && key.includes(a))) return field;
  return '';
}

/** 試算表格線（F77） */
export interface SheetGrid {
  columns: string[];
  mapping: SheetMapping[];
  rows: string[][];
  hasHeader: boolean;
}

/** 解讀後的二維陣列 → 格線（3.8.1：每格去頭尾空白、全空的列略過、補齊欄數、辨識標題） */
export function detectSheet(raw: readonly (readonly string[])[]): SheetGrid | null {
  const grid = raw
    .map((cells) => cells.map((c) => String(c).trim()))
    .filter((cells) => cells.some(Boolean));
  if (!grid.length) return null;
  const width = Math.max(...grid.map((r) => r.length));
  for (const r of grid) while (r.length < width) r.push('');
  const sampleRows = grid.slice(1, 8);
  const guesses = grid[0].map((cell, i) =>
    guessFieldForHeader(
      cell,
      sampleRows.map((r) => r[i]),
    ),
  );
  const hasHeader = guesses.filter(Boolean).length >= Math.min(2, width);
  return {
    columns: hasHeader
      ? grid[0].map((cell, i) => cell || S.sheet.colN(i + 1))
      : grid[0].map((_, i) => S.sheet.colN(i + 1)),
    mapping: hasHeader ? guesses : new Array<SheetMapping>(width).fill(''),
    rows: hasHeader ? grid.slice(1) : grid,
    hasHeader,
  };
}

/** 匯入中的一團（還沒補識別碼） */
export type PartialRow = Partial<SessionRow> & Record<string, unknown>;

/** 一列儲存格 → 一團（3.8.2 第 1 步） */
export function buildRowFromCells(
  cells: readonly string[],
  mapping: readonly SheetMapping[],
): PartialRow {
  const row: PartialRow = {};
  mapping.forEach((key, i) => {
    if (!key) return;
    const value = (cells[i] ?? '').trim();
    if (!value) return;
    if (key === 'roleKp' || key === 'rolePl') {
      if (!row.role && YESISH_RE.test(value)) row.role = key === 'roleKp' ? 'KP' : 'PL';
      return;
    }
    row[key] = row[key] ? `${row[key]} / ${value}` : value;
  });
  return row;
}

/** 值的整理（3.8.2 第 2 步） */
export function coerceImportValues(input: PartialRow): PartialRow {
  const row: PartialRow = { ...input };
  if (row.date && (!Array.isArray(row.dates) || !row.dates.length)) {
    const iso = splitFlexibleDates(row.date);
    if (iso.length) {
      row.dates = [...iso].sort();
      row.date = row.dates[0];
    }
  }
  if (typeof row.system === 'string' && row.system) row.system = importSystem(row.system);
  if (typeof row.status === 'string' && row.status) row.status = canonicalStatus(row.status);
  if (typeof row.survival === 'string' && row.survival)
    row.survival = canonicalSurvival(row.survival);
  if (typeof row.role === 'string' && row.role) row.role = importRole(row.role);
  if (row.time) row.time = normalizeTimeValue(row.time);
  for (const key of ['players', 'pc', 'gm'] as const) {
    if (!row[key]) continue;
    row[key] = String(row[key])
      .replace(/\s*[｜]\s*/g, '、')
      .replace(/、{2,}/g, '、')
      .replace(/^[、\s]+|[、\s]+$/g, '');
  }
  return row;
}

/** 沒有身分時依自己的名字推測（3.8.2 第 3 步） */
export function applySelfRole(input: PartialRow, self: ReadonlySet<string>): PartialRow {
  if (input.role) return input;
  const row = { ...input };
  if (row.players && splitPeople(row.players).some((n) => self.has(normalizePersonName(n)))) {
    row.role = 'PL';
    return row;
  }
  if (!row.gm) return row;
  const gms = splitPeople(row.gm);
  row.role = gms.length && gms.every((n) => self.has(normalizePersonName(n))) ? 'KP' : 'PL';
  return row;
}

/** 補值（3.8.2 第 4 步）：識別碼、日期整理、狀態預設、舊系統名與身分 */
export function normalizeImportedRow(input: PartialRow): SessionRow {
  const row = { ...input } as SessionRow;
  if (typeof row.id !== 'string' || !row.id) row.id = newRowId();
  const { date, dates } = normalizeRowDates(input);
  row.date = date;
  row.dates = dates;
  if (!row.status) row.status = DEFAULT_STATUS;
  if (typeof row.system === 'string') row.system = normalizeLegacySystem(row.system);
  if (typeof row.role === 'string') row.role = normalizeRole(row.role);
  return row;
}

/** 劇本、日期、PC、GM 都空的不匯入（3.8.2 第 5 步） */
export const hasContent = (row: SessionRow): boolean =>
  Boolean(row.scenario || row.date || row.pc || row.gm);

/** 試算表的一列 → 一團（第 1～4 步） */
export function sheetRowToSession(
  cells: readonly string[],
  mapping: readonly SheetMapping[],
  self: ReadonlySet<string>,
): SessionRow {
  return normalizeImportedRow(
    applySelfRole(coerceImportValues(buildRowFromCells(cells, mapping)), self),
  );
}

/**
 * 同上，但同一列（同一個儲存格陣列）、同一組對應與自己的名字時沿用上次的結果：
 * 格線改一格只有那一列換新陣列，重算重複標示與筆數時其他列不必再算一次。
 */
const sheetRowCache = new WeakMap<
  readonly string[],
  { mapping: readonly SheetMapping[]; self: ReadonlySet<string>; row: SessionRow }
>();
export function sheetRowToSessionCached(
  cells: readonly string[],
  mapping: readonly SheetMapping[],
  self: ReadonlySet<string>,
): SessionRow {
  const hit = sheetRowCache.get(cells);
  if (hit && hit.mapping === mapping && hit.self === self) return hit.row;
  const row = sheetRowToSession(cells, mapping, self);
  sheetRowCache.set(cells, { mapping, self, row });
  return row;
}

/** 試算表 → 要匯入的團（第 1～5 步） */
export function buildSheetRows(grid: SheetGrid, self: ReadonlySet<string>): SessionRow[] {
  return grid.rows
    .map((cells) => sheetRowToSessionCached(cells, grid.mapping, self))
    .filter(hasContent);
}

/** 部分欄位的一團（團報文字、CCFOLIA 轉入）→ 第 2～5 步 */
export function finishPartialRows(
  rows: readonly PartialRow[],
  self: ReadonlySet<string>,
): SessionRow[] {
  return rows
    .map((r) => normalizeImportedRow(applySelfRole(coerceImportValues({ ...r }), self)))
    .filter(hasContent);
}

/* ---------- 重複（3.8.4） ---------- */

/** 重複鍵：第一個日期｜整理後的劇本（日期或劇本空白時空字串） */
export function sessionDupKey(row: Pick<SessionRow, 'date' | 'dates' | 'scenario'>): string {
  const { dates } = normalizeRowDates(row);
  const date = dates[0] ?? '';
  const scenario = normalizeScenarioForCount(row.scenario)
    .normalize('NFKC')
    .toLowerCase()
    .replace(/\s+/g, '');
  return date && scenario ? `${date}|${scenario}` : '';
}

export function existingDupKeys(rows: readonly SessionRow[]): Set<string> {
  return new Set(rows.map(sessionDupKey).filter(Boolean));
}

export interface DupCount {
  /** 會匯入的筆數（略過重複時扣掉） */
  willImport: number;
  dup: number;
}

/** 重複筆數：與現有資料、同一批前面的列比較 */
export function countDuplicates(
  rows: readonly SessionRow[],
  existing: ReadonlySet<string>,
  skipDup: boolean,
): DupCount {
  const seen = new Set(existing);
  let dup = 0;
  for (const row of rows) {
    const k = sessionDupKey(row);
    if (!k) continue;
    if (seen.has(k)) dup++;
    else seen.add(k);
  }
  return { willImport: skipDup ? rows.length - dup : rows.length, dup };
}

/** 略過重複（F88） */
export function dropDuplicates(
  rows: readonly SessionRow[],
  existing: ReadonlySet<string>,
): SessionRow[] {
  const seen = new Set(existing);
  return rows.filter((row) => {
    const k = sessionDupKey(row);
    if (!k) return true;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/* ---------- 範本 CSV（3.11） ---------- */

/** 範本的欄位（不含 KP／PL 旗標、長篇感想、劇本計數鍵；spec 5. D10） */
export const TEMPLATE_FIELDS: readonly SheetField[] = [
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
  'campaign',
  'hashtag',
  'ending',
  'survival',
  'sessionUrl',
  'scenarioUrl',
  'kansouUrl',
];

export function templateCsv(): string {
  const header = TEMPLATE_FIELDS.map((f) => S.sheet.templateHeaders[f]);
  const examples = S.sheet.templateRows.map((r) =>
    TEMPLATE_FIELDS.map((f) => {
      const v = r[f] ?? '';
      if (f === 'system') return systemLabel(v);
      if (f === 'status') return statusLabel(v);
      if (f === 'survival') return survivalLabel(v);
      return v;
    }),
  );
  return toCsv([header, ...examples], { bom: true });
}
