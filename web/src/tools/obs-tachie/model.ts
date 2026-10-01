/**
 * Discord 通話立繪產生器的資料：使用者、外觀預設集、已儲存的組合、目前的組合。
 * 預設值、讀回存檔時的修正（normalizeData），以及清單的增刪規則（規格 F03～F11、F44、F52～F54）。
 * 純函式，不依賴 React 與瀏覽器（單元測試用）。
 */
import { parseDiscordUserId } from '@/ccfolia';
import { normalizeHex } from '@/core/color';
import { isCssColor } from '@/core/css';
import type { FontValue } from '@/core/fonts';
import type { Anchor } from '@/ui';

export type Align = 'left' | 'center' | 'right';
export type BarWidth = 'fit' | 'fill';

/** 由左上到右下（與共用的 AnchorGrid 相同的值） */
export const ANCHOR_IDS: readonly Anchor[] = [
  'top-left',
  'top',
  'top-right',
  'left',
  'center',
  'right',
  'bottom-left',
  'bottom',
  'bottom-right',
];

export type AxisX = 'left' | 'center' | 'right';
export type AxisY = 'top' | 'center' | 'bottom';

/** 錨點的水平與垂直基準 */
export function axesOf(a: Anchor): { x: AxisX; y: AxisY } {
  const i = Math.max(0, ANCHOR_IDS.indexOf(a));
  return {
    x: (['left', 'center', 'right'] as const)[i % 3],
    y: (['top', 'center', 'bottom'] as const)[Math.floor(i / 3)],
  };
}

export interface TachieUser {
  /** Discord 使用者 ID（只有數字） */
  id: string;
  /** 備忘名稱 */
  memo: string;
  /** 畫面上的名字 */
  name: string;
}

export interface NameLabel {
  show: boolean;
  /** 相對於立繪的水平位置（正值往右） */
  x: number;
  /** 相對於立繪的垂直位置（正值往上；從哪個邊算起依錨點） */
  y: number;
  size: number;
  color: string;
  font: FontValue;
  align: Align;
  bold: boolean;
  stroke: boolean;
  strokeWidth: number;
  strokeColor: string;
  bar: boolean;
  barWidth: BarWidth;
  barColor: string;
  /** 0～100 */
  barOpacity: number;
  barRadius: number;
  barPadX: number;
  barPadY: number;
}

export interface Preset {
  id: string;
  name: string;
  /** 圖片存放處的鍵（圖片內容是 data URI 或網址）；沒有圖片時 null */
  image: string | null;
  anchor: Anchor;
  offsetX: number;
  offsetY: number;
  /** 指定寬度 px；null＝原尺寸 */
  width: number | null;
  bounce: boolean;
  bounceHeight: number;
  glow: boolean;
  glowColor: string;
  glowWidth: number;
  blink: boolean;
  /** 週期（毫秒） */
  period: number;
  dim: boolean;
  hideAway: boolean;
  label: NameLabel;
}

export interface Combo {
  userId: string;
  presetId: string;
}

export interface TachieData {
  users: TachieUser[];
  presets: Preset[];
  saved: Combo[];
  /** 第 3 步選中的組合（沒有選或已刪掉時各用清單的第一個） */
  current: { userId: string | null; presetId: string | null };
}

export const MIN_PERIOD = 50;
export const MIN_GLOW_WIDTH = 1;
/** 上傳上限 8 MB */
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** 預覽在量到圖片尺寸前暫用的寬度（1920 的 1/5） */
export const PROVISIONAL_WIDTH = 384;
/** 來源（預覽）的基準尺寸 */
export const SOURCE_SIZE = { width: 1920, height: 1080 } as const;

/** 名字的預設字型（裁定：預設用繁中字型） */
export const DEFAULT_LABEL_FONT: FontValue = {
  source: 'google',
  family: 'Noto Sans TC',
  weight: 700,
};

/**
 * 名字標籤的預設值。垂直位置依裁定改成 8（名字框下緣在立繪下緣往上 8px）：
 * 立繪貼著畫面底邊時名字也不會被切掉。其他照規格第 4 節。
 */
export const DEFAULT_LABEL: NameLabel = {
  show: false,
  x: 0,
  y: 8,
  size: 32,
  color: '#ffffff',
  font: DEFAULT_LABEL_FONT,
  align: 'center',
  bold: true,
  stroke: true,
  strokeWidth: 3,
  strokeColor: '#000000',
  bar: false,
  barWidth: 'fit',
  barColor: '#000000',
  barOpacity: 60,
  barRadius: 6,
  barPadX: 12,
  barPadY: 6,
};

/** 新預設集的選項（不含 id、名稱、圖片） */
export const DEFAULT_OPTIONS: Omit<Preset, 'id' | 'name' | 'image'> = {
  anchor: 'bottom-left',
  offsetX: 0,
  offsetY: 0,
  width: null,
  bounce: true,
  bounceHeight: 10,
  glow: true,
  glowColor: '#ffffff',
  glowWidth: 2,
  blink: false,
  period: 750,
  dim: false,
  hideAway: false,
  label: DEFAULT_LABEL,
};

export const DEFAULT_DATA: TachieData = {
  users: [],
  presets: [],
  saved: [],
  current: { userId: null, presetId: null },
};

/** 不重複的 id（預設集、圖片） */
export function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      return crypto.randomUUID();
  } catch {
    /* 不支援時改用時間＋亂數 */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createPreset(id = newId()): Preset {
  return { id, name: '', image: null, ...structuredCloneSafe(DEFAULT_OPTIONS) };
}

function structuredCloneSafe<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/* ---------- 讀回存檔、開啟專案檔時的修正 ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, fallback = ''): string => (typeof v === 'string' ? v : fallback);
const bool = (v: unknown, fallback: boolean): boolean => (typeof v === 'boolean' ? v : fallback);
const finite = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;
const atLeast = (v: unknown, min: number, fallback: number): number =>
  Math.max(min, finite(v, fallback));
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** 顏色：合格的寫法轉成小寫 #rrggbb（或 #rrggbbaa）；不合格時改白色（規格 5.） */
export function normalizeColor(v: unknown): string {
  const s = str(v).trim();
  return isCssColor(s) ? normalizeHex(s, '#ffffff') : '#ffffff';
}

function normalizeFont(v: unknown): FontValue {
  if (!isObj(v)) return { ...DEFAULT_LABEL_FONT };
  const source = oneOf(v.source, ['google', 'local', 'upload'] as const, 'google');
  return {
    /* 上傳字型 CSS 用不到（OBS 拿不到使用者的檔案），改成電腦字型 */
    source: source === 'upload' ? 'local' : source,
    family: str(v.family, DEFAULT_LABEL_FONT.family),
    weight: finite(v.weight, DEFAULT_LABEL_FONT.weight),
  };
}

function normalizeLabel(v: unknown): NameLabel {
  const o = isObj(v) ? v : {};
  const d = DEFAULT_LABEL;
  return {
    show: bool(o.show, d.show),
    x: finite(o.x, d.x),
    y: finite(o.y, d.y),
    size: finite(o.size, d.size),
    color: o.color === undefined ? d.color : normalizeColor(o.color),
    font: normalizeFont(o.font),
    align: oneOf(o.align, ['left', 'center', 'right'] as const, d.align),
    bold: bool(o.bold, d.bold),
    stroke: bool(o.stroke, d.stroke),
    strokeWidth: atLeast(o.strokeWidth, 0, d.strokeWidth),
    strokeColor: o.strokeColor === undefined ? d.strokeColor : normalizeColor(o.strokeColor),
    bar: bool(o.bar, d.bar),
    barWidth: oneOf(o.barWidth, ['fit', 'fill'] as const, d.barWidth),
    barColor: o.barColor === undefined ? d.barColor : normalizeColor(o.barColor),
    barOpacity: Math.min(100, atLeast(o.barOpacity, 0, d.barOpacity)),
    barRadius: atLeast(o.barRadius, 0, d.barRadius),
    barPadX: atLeast(o.barPadX, 0, d.barPadX),
    barPadY: atLeast(o.barPadY, 0, d.barPadY),
  };
}

/** 寬度：空白、0 以下、不是數字＝原尺寸（null） */
export function normalizeWidth(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

export function normalizePreset(v: unknown, id?: string): Preset {
  const o = isObj(v) ? v : {};
  const d = DEFAULT_OPTIONS;
  return {
    id: str(o.id) || id || newId(),
    name: str(o.name),
    image: typeof o.image === 'string' && o.image ? o.image : null,
    anchor: oneOf(o.anchor, ANCHOR_IDS, d.anchor),
    offsetX: finite(o.offsetX, d.offsetX),
    offsetY: finite(o.offsetY, d.offsetY),
    width: normalizeWidth(o.width),
    bounce: bool(o.bounce, d.bounce),
    bounceHeight: atLeast(o.bounceHeight, 0, d.bounceHeight),
    glow: bool(o.glow, d.glow),
    glowColor: o.glowColor === undefined ? d.glowColor : normalizeColor(o.glowColor),
    glowWidth: atLeast(o.glowWidth, MIN_GLOW_WIDTH, d.glowWidth),
    blink: bool(o.blink, d.blink),
    period: atLeast(o.period, MIN_PERIOD, d.period),
    dim: bool(o.dim, d.dim),
    hideAway: bool(o.hideAway, d.hideAway),
    label: normalizeLabel(o.label),
  };
}

/**
 * 存檔（或專案檔）→ 可以安全使用的資料：ID 只留數字、同一個 ID 只留最後一筆、數值夾到範圍內、
 * 顏色不合格改白色、已儲存的組合只留兩邊都還在的、目前的選擇找不到時清掉。
 */
export function normalizeData(raw: unknown): TachieData {
  const o = isObj(raw) ? raw : {};
  const users: TachieUser[] = [];
  for (const u of Array.isArray(o.users) ? o.users : []) {
    if (!isObj(u)) continue;
    const id = parseDiscordUserId(str(u.id) || (typeof u.id === 'number' ? String(u.id) : ''));
    if (!id) continue;
    const at = users.findIndex((x) => x.id === id);
    if (at >= 0) users.splice(at, 1);
    users.push({ id, memo: str(u.memo).trim(), name: str(u.name) });
  }
  const presets: Preset[] = [];
  for (const p of Array.isArray(o.presets) ? o.presets : []) {
    if (!isObj(p)) continue;
    const n = normalizePreset(p);
    if (presets.some((x) => x.id === n.id)) n.id = newId();
    presets.push(n);
  }
  const saved: Combo[] = [];
  for (const c of Array.isArray(o.saved) ? o.saved : []) {
    if (!isObj(c)) continue;
    const userId = str(c.userId);
    const presetId = str(c.presetId);
    if (!users.some((u) => u.id === userId) || !presets.some((p) => p.id === presetId)) continue;
    if (saved.some((s) => s.userId === userId && s.presetId === presetId)) continue;
    saved.push({ userId, presetId });
  }
  const cur = isObj(o.current) ? o.current : {};
  const userId = str(cur.userId);
  const presetId = str(cur.presetId);
  return {
    users,
    presets,
    saved,
    current: {
      userId: users.some((u) => u.id === userId) ? userId : null,
      presetId: presets.some((p) => p.id === presetId) ? presetId : null,
    },
  };
}

/* ---------- 使用者 ---------- */

export interface AddUserResult {
  data: TachieData;
  /** 去掉非數字後是空的 */
  error: boolean;
  /** 這個 ID 已經有了（取代並移到最後） */
  replaced: boolean;
  user: TachieUser | null;
}

/**
 * 新增使用者（F03、F04）：ID 去掉所有非數字字元，空的就是錯誤；名稱去掉前後空白。
 * 同一個 ID 再新增時取代原本那一筆並移到最後（用到他的已儲存組合保留）。
 */
export function addUser(
  data: TachieData,
  input: { id: string; memo: string; name: string },
): AddUserResult {
  const id = parseDiscordUserId(input.id);
  if (!id) return { data, error: true, replaced: false, user: null };
  const user: TachieUser = { id, memo: input.memo.trim(), name: input.name.trim() };
  const replaced = data.users.some((u) => u.id === id);
  return {
    data: { ...data, users: [...data.users.filter((u) => u.id !== id), user] },
    error: false,
    replaced,
    user,
  };
}

/** 刪除使用者（F06）：連帶刪掉用到他的已儲存組合 */
export function removeUser(data: TachieData, id: string): TachieData {
  return {
    ...data,
    users: data.users.filter((u) => u.id !== id),
    saved: data.saved.filter((s) => s.userId !== id),
    current: data.current.userId === id ? { ...data.current, userId: null } : data.current,
  };
}

/* ---------- 預設集 ---------- */

/** 刪除預設集（F09）：連帶刪掉用到它的已儲存組合 */
export function removePreset(data: TachieData, id: string): TachieData {
  return {
    ...data,
    presets: data.presets.filter((p) => p.id !== id),
    saved: data.saved.filter((s) => s.presetId !== id),
    current: data.current.presetId === id ? { ...data.current, presetId: null } : data.current,
  };
}

/** 選項恢復預設（F44）：保留 id、名稱與圖片 */
export function resetPresetOptions(p: Preset): Preset {
  return { id: p.id, name: p.name, image: p.image, ...structuredCloneSafe(DEFAULT_OPTIONS) };
}

/* ---------- 組合 ---------- */

/** 第 3 步實際用的組合：沒有選或選的已被刪掉時，各自用清單的第一個（F52） */
export function effectiveCombo(data: TachieData): {
  user: TachieUser | null;
  preset: Preset | null;
} {
  const user = data.users.find((u) => u.id === data.current.userId) ?? data.users[0] ?? null;
  const preset =
    data.presets.find((p) => p.id === data.current.presetId) ?? data.presets[0] ?? null;
  return { user, preset };
}

export const sameCombo = (a: Combo, b: Combo): boolean =>
  a.userId === b.userId && a.presetId === b.presetId;

/** 儲存目前的組合（F53）；已經存過時不變 */
export function saveCombo(data: TachieData): TachieData {
  const { user, preset } = effectiveCombo(data);
  if (!user || !preset) return data;
  const combo = { userId: user.id, presetId: preset.id };
  if (data.saved.some((s) => sameCombo(s, combo))) return data;
  return { ...data, saved: [...data.saved, combo] };
}

export const comboKey = (c: Combo): string => `${c.userId}\u0000${c.presetId}`;

/** 用到這個人／這個預設集的已儲存組合 */
export const combosOfUser = (data: TachieData, id: string): Combo[] =>
  data.saved.filter((s) => s.userId === id);
export const combosOfPreset = (data: TachieData, id: string): Combo[] =>
  data.saved.filter((s) => s.presetId === id);

/* ---------- 顯示用的名稱 ---------- */

/** 使用者的備忘名稱（空白時 null） */
export const memoOf = (u: TachieUser | null | undefined): string | null =>
  u?.memo.trim() ? u.memo.trim() : null;

/** 「備忘名稱（ID）」，沒有名稱時只有 ID（下拉選單、CSS 註解） */
export function userLabel(u: TachieUser): string {
  const memo = memoOf(u);
  return memo ? `${memo}（${u.id}）` : u.id;
}
