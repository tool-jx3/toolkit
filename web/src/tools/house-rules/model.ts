/**
 * 房規表的資料（存檔、專案檔、復原的對象）與純函式：預設集、讀檔整理、表的模型（輸出共用）、檔名。
 * 規格：docs/refactor/specs/house-rules.md 第 3 節。
 */
import { safeFileName } from '@/core/files';
import {
  CATEGORY_NAMES,
  type CategoryId,
  CUSTOM_VALUES,
  type CustomValue,
  EDITION_SECTIONS,
  EDITIONS,
  type Edition,
  OPT_M,
  OPT_O,
  OPT_X,
  optionLabel,
  type RuleDef,
  SECTION_BY_ID,
  SECTIONS,
  type SectionId,
  SYSTEM_AUTO,
} from './rules';
import { OUT } from './strings';

export const TOOL_ID = 'house-rules';
/** 專案檔與瀏覽器存檔的資料版本 */
export const DATA_VERSION = 1;

/** 內建規則一列的狀態 */
export interface RowState {
  /** 選中的選項 id；null＝未設定 */
  val: string | null;
  /** 帶數字的選項的數字（同一條規則的數字選項共用） */
  n?: number;
  note: string;
  /** 放進表裡 */
  vis: boolean;
  /** 改過的名稱（沒改時沒有這個欄位） */
  name?: string;
}

/** 自己加的規則 */
export interface CustomRow {
  id: string;
  cat: CategoryId;
  name: string;
  val: CustomValue | null;
  /** 「自由填寫」的內容 */
  text: string;
  note: string;
  vis: boolean;
}

export interface SectionState {
  rows: Record<string, RowState>;
  custom: CustomRow[];
}

export interface TableInfo {
  title: string;
  kp: string;
  system: string;
  scenario: string;
  /** YYYY-MM-DD；空字串＝不寫 */
  date: string;
  remarks: string;
}

export interface HouseRulesData {
  edition: Edition;
  info: TableInfo;
  secs: Record<SectionId, SectionState>;
}

export type PresetId = 'raw' | 'pop' | 'clear';
export const PRESET_IDS: readonly PresetId[] = ['raw', 'pop', 'clear'];

/** 欄位的長度上限（字元） */
export const LIMITS = {
  title: 120,
  kp: 120,
  system: 120,
  scenario: 200,
  remarks: 4000,
  name: 200,
  note: 2000,
  text: 400,
  /** 每一區最多幾條自訂規則 */
  custom: 200,
} as const;

export const DEFAULT_EDITION: Edition = '7';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 今天的日期（YYYY-MM-DD，當地時間） */
export function today(now = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function newId(): string {
  return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function blankSections(): Record<SectionId, SectionState> {
  return {
    '6': { rows: {}, custom: [] },
    '7': { rows: {}, custom: [] },
    common: { rows: {}, custom: [] },
  };
}

/** 空白的表（還沒套預設集） */
export function blankData(date = today()): HouseRulesData {
  return {
    edition: DEFAULT_EDITION,
    info: { title: '', kp: '', system: '', scenario: '', date, remarks: '' },
    secs: blankSections(),
  };
}

/** 開頁的表：照規則書的值 */
export function initialData(date = today()): HouseRulesData {
  return applyPreset(blankData(date), 'raw');
}

/**
 * 套用預設集（回傳新的資料）：
 * - raw／pop：每條內建規則填入規則書／常見的值（帶數字的選項填預設數字）；放進表的是「開頁就放進表」的規則，
 *   pop 另外加上常見值與規則書不同的規則。注記、改過的名稱保留。
 * - clear：值與注記清空、數字拿掉；放進表與否、改過的名稱不變。
 * 自己加的規則一律不動。
 */
export function applyPreset(data: HouseRulesData, preset: PresetId): HouseRulesData {
  const secs = { ...data.secs };
  for (const sec of SECTIONS) {
    const bucket = secs[sec.id];
    const rows: Record<string, RowState> = { ...bucket.rows };
    for (const r of sec.rules) {
      const prev: RowState = rows[r.id] ?? { val: null, note: '', vis: false };
      if (preset === 'clear') {
        const { n: _n, ...rest } = prev;
        rows[r.id] = { ...rest, val: null, note: '' };
        continue;
      }
      const val = preset === 'pop' ? r.pop : r.raw;
      const op = r.opts.find((x) => x.id === val);
      const next: RowState = {
        ...prev,
        val,
        vis: r.core || (preset === 'pop' && r.pop !== r.raw),
      };
      if (op?.num) next.n = op.num.def;
      rows[r.id] = next;
    }
    secs[sec.id] = { ...bucket, rows };
  }
  return { ...data, secs };
}

/* ---------- 讀檔整理（自動存檔、專案檔共用） ---------- */

const str = (v: unknown, max: number): string | null =>
  typeof v === 'string' ? Array.from(v).slice(0, max).join('') : null;

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const INFO_LIMITS: Record<keyof TableInfo, number> = {
  title: LIMITS.title,
  kp: LIMITS.kp,
  system: LIMITS.system,
  scenario: LIMITS.scenario,
  date: 10,
  remarks: LIMITS.remarks,
};

/**
 * 整理讀進來的資料（壞掉的欄位用預設值）：先做一份「照規則書」的表，再把讀到的值蓋上去。
 * 不認得的規則、選項丟掉；數字夾到選項的範圍內；自訂規則的分類要在那一區裡。
 * 完全不是物件時回傳 null。
 */
export function sanitizeData(raw: unknown, date = today()): HouseRulesData | null {
  if (!isObj(raw)) return null;
  const base = initialData(date);
  const edition = EDITIONS.includes(String(raw.edition) as Edition)
    ? (String(raw.edition) as Edition)
    : base.edition;
  const info = { ...base.info };
  if (isObj(raw.info)) {
    for (const key of Object.keys(info) as (keyof TableInfo)[]) {
      const v = str(raw.info[key], INFO_LIMITS[key]);
      if (v !== null) info[key] = v;
    }
    if (info.date && !DATE_RE.test(info.date)) info.date = base.info.date;
  }
  const secs = blankSections();
  const srcSecs = isObj(raw.secs) ? raw.secs : {};
  for (const sec of SECTIONS) {
    const src = isObj(srcSecs[sec.id]) ? (srcSecs[sec.id] as Record<string, unknown>) : {};
    const srcRows = isObj(src.rows) ? src.rows : {};
    const rows: Record<string, RowState> = {};
    for (const r of sec.rules) {
      const def = base.secs[sec.id].rows[r.id];
      const got = srcRows[r.id];
      rows[r.id] = isObj(got) ? sanitizeRow(r, got, def) : { ...def };
    }
    const custom = Array.isArray(src.custom)
      ? src.custom
          .filter(
            (c): c is Record<string, unknown> => isObj(c) && sec.cats.includes(c.cat as CategoryId),
          )
          .slice(0, LIMITS.custom)
          .map((c) => sanitizeCustom(c))
      : [];
    /* 同一個 id 不能出現兩次（之後的改成新的 id） */
    const seen = new Set<string>();
    for (const c of custom) {
      if (seen.has(c.id)) c.id = newId();
      seen.add(c.id);
    }
    secs[sec.id] = { rows, custom };
  }
  return { edition, info, secs };
}

function sanitizeRow(r: RuleDef, got: Record<string, unknown>, def: RowState): RowState {
  const val =
    got.val === null
      ? null
      : r.opts.some((op) => op.id === got.val)
        ? (got.val as string)
        : def.val;
  const row: RowState = {
    val,
    note: str(got.note, LIMITS.note) ?? '',
    vis: typeof got.vis === 'boolean' ? got.vis : def.vis,
  };
  const numOp = r.opts.find((op) => op.num && op.id === val);
  const n = Number(got.n);
  if (numOp?.num) {
    row.n =
      got.n !== undefined && got.n !== null && got.n !== '' && Number.isFinite(n)
        ? clampNum(n, numOp.num.min, numOp.num.max)
        : (def.n ?? numOp.num.def);
  } else if (got.n !== undefined && Number.isFinite(n)) {
    row.n = Math.round(n);
  }
  const name = str(got.name, LIMITS.name);
  if (name?.trim() && name.trim() !== r.name) row.name = name;
  return row;
}

function sanitizeCustom(c: Record<string, unknown>): CustomRow {
  return {
    id: typeof c.id === 'string' && c.id ? c.id.slice(0, 64) : newId(),
    cat: c.cat as CategoryId,
    name: str(c.name, LIMITS.name) ?? '',
    val: CUSTOM_VALUES.includes(c.val as CustomValue) ? (c.val as CustomValue) : null,
    text: str(c.text, LIMITS.text) ?? '',
    note: str(c.note, LIMITS.note) ?? '',
    vis: c.vis !== false,
  };
}

export function clampNum(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(v)));
}

/* ---------- 一列的顯示內容（編輯畫面與輸出共用） ---------- */

/** 值的種類：決定輸出的顏色 */
export type ValueKind = 'o' | 'x' | 'm' | 'opt' | 'text' | 'unset';

export interface RowView {
  name: string;
  value: string;
  kind: ValueKind;
  note: string;
}

/** 內建規則目前的名稱（改過就用改過的） */
export function ruleName(r: RuleDef, row: RowState | undefined): string {
  return row?.name?.trim() || r.name;
}

export function builtinView(r: RuleDef, row: RowState): RowView {
  const note = row.note.trim();
  const name = ruleName(r, row);
  const op = r.opts.find((x) => x.id === row.val);
  if (!op) return { name, value: OUT.unset, kind: 'unset', note };
  const kind: ValueKind = op.sym ? (op.id as ValueKind) : 'opt';
  return { name, value: optionLabel(op, row.n), kind, note };
}

const SYMBOL: Record<'o' | 'x' | 'm', string> = {
  o: OPT_O.label,
  x: OPT_X.label,
  m: OPT_M.label,
};

export function customView(c: CustomRow): RowView {
  const name = c.name.trim() || OUT.newRule;
  const note = c.note.trim();
  if (c.val === 'text') {
    const text = c.text.trim();
    return { name, value: text || OUT.unset, kind: text ? 'text' : 'unset', note };
  }
  if (c.val) return { name, value: SYMBOL[c.val], kind: c.val, note };
  return { name, value: OUT.unset, kind: 'unset', note };
}

/** 一個分類裡的每一列（內建規則依清單順序，自己加的接在後面） */
export type CatItem =
  | { kind: 'builtin'; rule: RuleDef; row: RowState }
  | { kind: 'custom'; row: CustomRow };

export function categoryItems(
  data: HouseRulesData,
  secId: SectionId,
  catId: CategoryId,
): CatItem[] {
  return bucketItems(data.secs[secId], secId, catId);
}

/** 同上，只拿一個區塊的狀態（編輯畫面的分類只訂閱自己的區塊） */
export function bucketItems(bucket: SectionState, secId: SectionId, catId: CategoryId): CatItem[] {
  const sec = SECTION_BY_ID[secId];
  return [
    ...sec.rules
      .filter((r) => r.cat === catId)
      .map((r): CatItem => ({ kind: 'builtin', rule: r, row: bucket.rows[r.id] })),
    ...bucket.custom
      .filter((c) => c.cat === catId)
      .map((c): CatItem => ({ kind: 'custom', row: c })),
  ];
}

export function itemView(item: CatItem): RowView {
  return item.kind === 'builtin' ? builtinView(item.rule, item.row) : customView(item.row);
}

export function categoryCount(
  data: HouseRulesData,
  secId: SectionId,
  catId: CategoryId,
): { shown: number; total: number } {
  const items = categoryItems(data, secId, catId);
  return { shown: items.filter((i) => i.row.vis).length, total: items.length };
}

/* ---------- 表的模型（PNG、純文字、Markdown 共用） ---------- */

export interface TableCategory {
  title: string;
  rows: RowView[];
}

export interface TableSection {
  id: SectionId;
  title: string;
  /** 各版通用的區塊用另一個顏色 */
  tone: 'edition' | 'common';
  cats: TableCategory[];
}

export interface TableModel {
  title: string;
  /** 表頭的資訊（[標籤, 內容]） */
  meta: [string, string][];
  sections: TableSection[];
  remarks: string;
}

/** YYYY-MM-DD → YYYY.MM.DD */
export const displayDate = (date: string) => date.replace(/-/g, '.');

export function buildModel(data: HouseRulesData): TableModel {
  const { info } = data;
  const meta: [string, string][] = [];
  if (info.kp.trim()) meta.push([OUT.meta.kp, info.kp.trim()]);
  meta.push([OUT.meta.system, info.system.trim() || SYSTEM_AUTO[data.edition]]);
  if (info.scenario.trim()) meta.push([OUT.meta.scenario, info.scenario.trim()]);
  if (info.date) meta.push([OUT.meta.date, displayDate(info.date)]);
  const sections: TableSection[] = [];
  for (const secId of EDITION_SECTIONS[data.edition]) {
    const sec = SECTION_BY_ID[secId];
    const cats: TableCategory[] = [];
    for (const catId of sec.cats) {
      const rows = categoryItems(data, secId, catId)
        .filter((i) => i.row.vis)
        .map(itemView);
      if (rows.length) cats.push({ title: CATEGORY_NAMES[catId], rows });
    }
    if (cats.length)
      sections.push({
        id: secId,
        title: sec.title,
        tone: secId === 'common' ? 'common' : 'edition',
        cats,
      });
  }
  return {
    title: info.title.trim() || OUT.defaultTitle,
    meta,
    sections,
    remarks: info.remarks.trim(),
  };
}

/** 表上有沒有任何一條規則 */
export const hasRows = (m: TableModel) => m.sections.length > 0;

/** 有沒有任何注記（沒有時 PNG 與 Markdown 不畫注記欄） */
export const hasNotes = (m: TableModel) =>
  m.sections.some((s) => s.cats.some((c) => c.rows.some((r) => r.note)));

/** 匯出檔名的主體：標題（空白時「房規表」）＋「_」＋更新日期（YYYYMMDD；沒填時今天） */
export function fileBase(data: HouseRulesData, now = new Date()): string {
  const title = safeFileName(data.info.title.trim() || OUT.defaultTitle, {
    underscore: true,
    maxLength: 60,
    fallback: OUT.defaultTitle,
  });
  return `${title}_${(data.info.date || today(now)).replace(/-/g, '')}`;
}
