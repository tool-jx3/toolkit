/**
 * 跑團紀錄簿的資料與規則（純函式）：存檔格式、讀入整理（F106、F107）、範例列（F34）、搜尋／篩選／排序（F15～F18）、
 * 統計（F10～F13）、表格的顯示文字（F20、F25、F26）、新增一團、JSON 匯出入（3.10）。
 */
import {
  COMMON_SYSTEMS,
  canonicalStatus,
  canonicalSurvival,
  canonicalSystem,
  DEFAULT_STATUS,
  localIsoDate,
  normalizeLegacySystem,
  normalizePersonName,
  normalizeRole,
  normalizeRoleGroup,
  normalizeRowDates,
  normalizeTimeValue,
  primaryDate,
  SESSION_ROLES,
  SESSION_STATUSES,
  SESSION_SURVIVALS,
  type SessionLink,
  type SessionMedia,
  type SessionRow,
  scenarioCountKey,
  splitPeople,
  statusLabel,
  survivalLabel,
  systemLabel,
  timeHours,
} from '@/core/sessions';
import {
  type ColumnState,
  type ColumnsData,
  cleanColumns,
  columnsForExport,
  defaultColumns,
  REPORT_KEY,
  REPORTED_KEY,
} from './columns';
import { S } from './strings';

/** 存檔的內容（createToolStore 的 data） */
export interface LogData extends ColumnsData {
  rows: SessionRow[];
}

/* ---------- 識別碼 ---------- */

let idCounter = 0;
/** 一團的識別碼（同舊版的寫法：`session_<毫秒>_<亂數>`） */
export function newRowId(now: number = Date.now()): string {
  idCounter = (idCounter + 1) % 1296;
  const rand = Math.random().toString(36).slice(2, 6) + idCounter.toString(36).padStart(2, '0');
  return `session_${now}_${rand}`;
}

/* ---------- 讀入整理 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const MEDIA_TYPES = new Set(['tweet', 'image', 'link']);

function cleanMedia(raw: unknown): SessionMedia[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(isObj).map((m) => ({
    type: (MEDIA_TYPES.has(String(m.type)) ? m.type : 'link') as SessionMedia['type'],
    url: String(m.url ?? ''),
    caption: String(m.caption ?? ''),
  }));
}

function cleanLinks(raw: unknown): SessionLink[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  return raw.filter(isObj).map((l) => ({ label: String(l.label ?? ''), url: String(l.url ?? '') }));
}

/**
 * 一團的整理（存檔、匯入；F107）：日期、舊系統名、GM 組的身分、時間去單位、團報勾選、貼文與連結的格式。
 * 不認得的欄位照樣保留。識別碼不是字串時換新的。
 */
export function normalizeLoadedRow(raw: Record<string, unknown>): SessionRow {
  const row = { ...raw } as SessionRow;
  if (typeof row.id !== 'string' || !row.id) row.id = newRowId();
  const { date, dates } = normalizeRowDates(raw);
  row.date = date;
  row.dates = dates;
  for (const key of Object.keys(row)) {
    const v = row[key];
    if (typeof v === 'number') row[key] = String(v);
  }
  if (typeof row.system === 'string') row.system = normalizeLegacySystem(row.system);
  if (typeof row.role === 'string') row.role = normalizeRole(row.role);
  if (row.time != null && row.time !== '') row.time = normalizeTimeValue(row.time);
  row.reported = Boolean(row.reported);
  const media = cleanMedia(raw.media);
  if (media) row.media = media;
  else delete row.media;
  const links = cleanLinks(raw.cushionLinks);
  if (links) row.cushionLinks = links;
  else delete row.cushionLinks;
  if (row.sample !== true) delete row.sample;
  return row;
}

/** 列的整理：物件才算，識別碼重複時換新的 */
export function cleanRows(raw: unknown): SessionRow[] {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: SessionRow[] = [];
  for (const item of list) {
    if (!isObj(item)) continue;
    const row = normalizeLoadedRow(item);
    if (seen.has(row.id)) row.id = newRowId();
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

/**
 * 存檔（新版的 data，或舊版 `sessionLogTool.state.v1` 的整個物件）→ 整理後的資料；不是物件或沒有列陣列時 null。
 * 舊版存檔另外照舊版的遷移旗標整理欄位（主題標籤欄改成可選、舊的欄寬）。
 */
export function restoreLogData(raw: unknown): LogData | null {
  if (!isObj(raw) || !Array.isArray(raw.rows)) return null;
  const migrations = isObj(raw.migrations) ? raw.migrations : null;
  const legacy = migrations !== null || !('customColumns' in raw);
  let columns = cleanColumns(raw.columns, { ensureLocked: true });
  if (!Array.isArray(raw.columns) || !raw.columns.length) columns = defaultColumns();
  if (legacy && !migrations?.hashtagOptional) columns = columns.filter((c) => c.key !== 'hashtag');
  if (legacy && !migrations?.v14ColumnWidths) {
    columns = columns.map((c) =>
      ['scenario', 'players', 'pc', 'note'].includes(c.key)
        ? { ...c, width: defaultColumns().find((d) => d.key === c.key)?.width ?? c.width }
        : c,
    );
  }
  const visible = new Set(columns.map((c) => c.key));
  return {
    rows: cleanRows(raw.rows),
    columns,
    hiddenColumns: cleanColumns(raw.hiddenColumns).filter((c) => !c.locked && !visible.has(c.key)),
    customColumns: cleanColumns(raw.customColumns).map((c) => ({ ...c, custom: true })),
  };
}

/* ---------- 範例列（F34；內容自寫） ---------- */

export function createSampleRows(): SessionRow[] {
  return S.samples.map((s) => ({
    id: newRowId(),
    sample: true,
    date: s.dates[0],
    dates: [...s.dates],
    scenario: s.scenario,
    system: s.system,
    role: s.role,
    gm: s.gm,
    players: s.players,
    pc: s.pc,
    status: s.status,
    time: s.time,
    note: s.note,
    longNote: s.longNote,
    reported: false,
  }));
}

export function initialLogData(): LogData {
  return {
    rows: createSampleRows(),
    columns: defaultColumns(),
    hiddenColumns: [],
    customColumns: [],
  };
}

/** 新增對話框的預設（F45） */
export function newSessionRow(today: string = localIsoDate()): SessionRow {
  return {
    id: newRowId(),
    date: today,
    dates: [today],
    scenario: '',
    system: 'CoC 6版',
    role: 'PL',
    gm: '',
    players: '',
    pc: '',
    status: DEFAULT_STATUS,
    time: '',
    note: '',
    hashtag: '',
    longNote: '',
  };
}

/* ---------- 顯示 ---------- */

/** 日期欄（F20）：主要日期；多天時「主要日期 另 N 天」 */
export function dateDisplay(row: Pick<SessionRow, 'date' | 'dates'>): string {
  const { dates } = normalizeRowDates(row);
  if (!dates.length) return '';
  const latest = dates[dates.length - 1];
  return dates.length === 1 ? latest : S.dateMore(latest, dates.length - 1);
}

/** 日期欄的滑過提示：全部日期 */
export function dateTitle(row: Pick<SessionRow, 'date' | 'dates'>): string {
  return normalizeRowDates(row).dates.join(' / ');
}

/** 時間欄（F25） */
export function timeDisplay(value: unknown): string {
  const n = normalizeTimeValue(value);
  return n ? S.hours(n) : '';
}

/** 身分標籤的分類（F23） */
export function roleKind(role: unknown): 'pl' | 'gm' | 'other' {
  const g = normalizeRoleGroup(role);
  return g === 'GM' ? 'gm' : g === 'PL' ? 'pl' : 'other';
}

/** 系統標籤的分類（F22）：常用 4 種各一色，其他同一色 */
export function systemKind(system: unknown): string {
  const v = String(system ?? '').trim();
  const i = COMMON_SYSTEMS.indexOf(v);
  return i >= 0 ? ['coc7', 'coc6', 'emoklore', 'madamisu'][i] : 'other';
}

/** 系統篩選的選項（F16）：常用 4 種＋各列出現過的系統（依此順序、不重複） */
export function systemFilterValues(rows: readonly SessionRow[]): string[] {
  return [...new Set([...COMMON_SYSTEMS, ...rows.map((r) => r.system ?? '').filter(Boolean)])];
}

/* ---------- 搜尋、篩選、排序（F15～F18） ---------- */

export type RoleFilter = 'all' | 'PL' | 'GM';
export type SortMode = 'newest' | 'oldest' | 'scenario' | 'gm';

export interface FilterState {
  search: string;
  /** 系統正規值；空字串＝所有系統 */
  system: string;
  role: RoleFilter;
  sort: SortMode;
}

export const DEFAULT_FILTER: FilterState = { search: '', system: '', role: 'all', sort: 'newest' };

const searchCache = new WeakMap<SessionRow, string>();

/** 搜尋用的文字（spec 5. D13）：文字欄位、日期、顯示名稱、貼文與防雷連結（小寫；每個列物件算一次） */
export function rowSearchText(row: SessionRow): string {
  const hit = searchCache.get(row);
  if (hit !== undefined) return hit;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (key === 'id') continue;
    if (typeof value === 'string') parts.push(value);
  }
  parts.push(...(row.dates ?? []));
  parts.push(systemLabel(row.system), statusLabel(row.status), survivalLabel(row.survival));
  for (const m of row.media ?? []) parts.push(m.url, m.caption);
  for (const l of row.cushionLinks ?? []) parts.push(l.label, l.url);
  const text = parts.join(' ').toLowerCase();
  searchCache.set(row, text);
  return text;
}

export const collator = new Intl.Collator('zh-Hant-TW');

const primaryDateCache = new WeakMap<SessionRow, string>();

/** 排序用的主要日期（每個列物件算一次） */
function rowPrimaryDate(row: SessionRow): string {
  let d = primaryDateCache.get(row);
  if (d === undefined) {
    d = primaryDate(row);
    primaryDateCache.set(row, d);
  }
  return d;
}

export function filterRows(rows: readonly SessionRow[], f: FilterState): SessionRow[] {
  const q = f.search.trim().toLowerCase();
  const out = rows.filter((row) => {
    if (f.system && row.system !== f.system) return false;
    if (f.role !== 'all' && normalizeRoleGroup(row.role) !== f.role) return false;
    return !q || rowSearchText(row).includes(q);
  });
  const keyed = out.map((row, i) => ({ row, i, date: rowPrimaryDate(row) }));
  keyed.sort((a, b) => {
    let d = 0;
    if (f.sort === 'oldest') d = a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    else if (f.sort === 'scenario')
      d = collator.compare(String(a.row.scenario ?? ''), String(b.row.scenario ?? ''));
    else if (f.sort === 'gm') d = collator.compare(String(a.row.gm ?? ''), String(b.row.gm ?? ''));
    else d = a.date > b.date ? -1 : a.date < b.date ? 1 : 0;
    return d || a.i - b.i;
  });
  return keyed.map((k) => k.row);
}

/** 這一列在目前的搜尋與篩選下看不看得到（F37） */
export function passesFilter(row: SessionRow, f: FilterState): boolean {
  return filterRows([row], { ...f, sort: 'newest' }).length === 1;
}

/* ---------- 統計（F10～F13） ---------- */

export interface Stats {
  days: number;
  scenarios: number;
  hours: number;
  coPlayers: number;
}

/** 一列對統計的貢獻（與 countUniqueScenarios、countCoPlayers 同樣的算法，自己的名字在加總時才排除） */
interface RowStatParts {
  days: number;
  scenarioKey: string;
  hours: number;
  /** GM 與 PL 欄的名字（比對用、非空） */
  people: string[];
}

const statCache = new WeakMap<SessionRow, RowStatParts>();

/** 每個列物件算一次（Immer 沒改到的列維持同一個物件：側欄改一團時只重算那一團） */
function rowStatParts(row: SessionRow): RowStatParts {
  const hit = statCache.get(row);
  if (hit) return hit;
  const people: string[] = [];
  for (const field of [row.gm, row.players])
    for (const name of splitPeople(field)) {
      const n = normalizePersonName(name);
      if (n) people.push(n);
    }
  const parts: RowStatParts = {
    days: normalizeRowDates(row).dates.length,
    scenarioKey: scenarioCountKey(row),
    hours: timeHours(row.time),
    people,
  };
  statCache.set(row, parts);
  return parts;
}

export function computeStats(rows: readonly SessionRow[], self: ReadonlySet<string>): Stats {
  let days = 0;
  let hours = 0;
  const scenarios = new Set<string>();
  const people = new Set<string>();
  for (const row of rows) {
    if (row.sample) continue;
    const p = rowStatParts(row);
    days += p.days;
    hours += p.hours;
    if (p.scenarioKey) scenarios.add(p.scenarioKey);
    for (const n of p.people) if (!self.has(n)) people.add(n);
  }
  return { days, scenarios: scenarios.size, hours, coPlayers: people.size };
}

/** 統計數字的顯示（F12、F14）：整數照寫；有小數時一位小數並去掉「.0」 */
/** 統計數字的動畫長度（F14） */
export const COUNT_UP_MS = 700;

/**
 * 統計數字的動畫進度（F14）：經過 elapsed 毫秒時的 ease-out 三次方，夾在 0～1。
 * rAF 的時間戳可能早於起算的 performance.now()，不夾的話第一個畫面會出現負數。
 */
export function countUpProgress(elapsed: number, duration: number = COUNT_UP_MS): number {
  const p = Math.min(Math.max(elapsed / duration, 0), 1);
  return 1 - (1 - p) ** 3;
}

export function formatStat(value: number, decimal: boolean): string {
  return decimal ? value.toFixed(1).replace(/\.0$/, '') : String(Math.round(value));
}

/* ---------- 欄位值的寫入（對話框、側欄） ---------- */

/** 系統欄的輸入：顯示名稱或正規值 → 正規值（舊系統名也整理） */
export const systemInput = (text: string): string =>
  normalizeLegacySystem(canonicalSystem(text)) ?? '';
export const statusInput = (text: string): string => canonicalStatus(text);
export const survivalInput = (text: string): string => canonicalSurvival(text);

/**
 * 新增／編輯對話框的身分、狀態、生還選單顯示的值（F48）：存的值不在選單裡（空白、小寫、其他字）時
 * 顯示第一項（PL、新規、生還未設定），按「儲存」時就存這個值（照舊版 <select> 的行為）。
 */
export function dialogChoice(key: 'role' | 'status' | 'survival', value: unknown): string {
  const v = value == null ? '' : String(value);
  if (key === 'role') return SESSION_ROLES.includes(v) ? v : SESSION_ROLES[0];
  if (key === 'status') return SESSION_STATUSES.some((s) => s.value === v) ? v : DEFAULT_STATUS;
  return SESSION_SURVIVALS.some((s) => s.value === v) ? v : '';
}

/* ---------- 貼文（F60） ---------- */

const TWEET_URL_RE = /^https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[^/?#]+\/status(?:es)?\/\d+/i;

export function classifyMediaUrl(url: string): SessionMedia['type'] {
  if (TWEET_URL_RE.test(url)) return 'tweet';
  if (/\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i.test(url) || /^data:image\//.test(url))
    return 'image';
  return 'link';
}

/** 連結的顯示文字：X／Twitter 是「X 貼文」，其他是網域 */
export function mediaLinkLabel(url: string): string {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    if (/x\.com|twitter\.com/.test(host)) return S.detail.xPost;
    return host;
  } catch {
    return String(url).slice(0, 40);
  }
}

export const isHttpUrl = (url: string): boolean => /^https?:\/\//i.test(url.trim());

/** 網址欄的檢查（F51）：空白或可以解析的絕對網址 */
export function isValidUrlField(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  try {
    new URL(v);
    return true;
  } catch {
    return false;
  }
}

/* ---------- JSON 匯出入（3.10） ---------- */

export const JSON_FORMAT = 'trpg-toolkit-session-log';
export const JSON_VERSION = 1;

export function exportJsonText(data: LogData, now: Date = new Date()): string {
  return JSON.stringify(
    {
      format: JSON_FORMAT,
      version: JSON_VERSION,
      exportedAt: now.toISOString(),
      rows: data.rows,
      columns: columnsForExport(data.columns),
      hiddenColumns: columnsForExport(data.hiddenColumns),
      customColumns: columnsForExport(data.customColumns),
    },
    null,
    2,
  );
}

export function exportJsonFileName(now: Date = new Date()): string {
  return `${S.jsonFilePrefix}-${localIsoDate(now)}.json`;
}

export interface JsonImportPayload {
  rows: Record<string, unknown>[];
  /** 檔案裡的欄位設定（沒有時 null） */
  columns: ColumnState[] | null;
}

/** 讀入 JSON（F85）：有 `rows` 陣列就接受；否則 null */
export function parseImportJson(text: string): JsonImportPayload | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return null;
  }
  if (!isObj(parsed) || !Array.isArray(parsed.rows)) return null;
  return {
    rows: parsed.rows.filter(isObj),
    columns: Array.isArray(parsed.columns)
      ? cleanColumns(parsed.columns, { ensureLocked: true })
      : null,
  };
}

/** 欄位設定是否含固定欄 */
export const hasLockedColumns = (columns: readonly ColumnState[]): boolean =>
  columns.some((c) => c.key === REPORTED_KEY) && columns.some((c) => c.key === REPORT_KEY);
