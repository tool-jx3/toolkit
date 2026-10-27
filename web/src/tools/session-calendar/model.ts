/**
 * 資料模型（規格 3.1）：行事曆裡的每一筆是「場次」或「預定」（同一種資料、用 kind 區分），另有外觀設定與 CP 色。
 *
 * - 場次（session）：跑團的一團——劇本、系統、日期與時間、GM、形式、狀態、參加者、相關連結、準備事項、備註。
 * - 預定（plan）：其他行程或空檔標記——標題、開始到結束（可以多日）、備註。
 * - 兩種都有開始日、結束日（多日）、可有可無的開始與結束時間、顏色（單色或兩色漸層）、所屬的行事曆名稱。
 *
 * 讀回存檔、專案檔、JSON 時一律經過 normalize*：缺的欄位補預設值、看不懂的值換成預設，不認得的欄位丟掉。
 */
import { normalizeHex } from '@/core/color';
import { addDays, dayNumber } from '@/core/holidays';
import { isIsoDate } from '@/core/sessions';

export type EntryKind = 'session' | 'plan';
export type SessionStatus = 'tentative' | 'scheduled' | 'completed';
export type ColorMode = 'solid' | 'gradient';

export interface EntryColor {
  mode: ColorMode;
  c1: string;
  c2: string;
}

export interface Player {
  pl: string;
  pc: string;
}

export interface EntryLink {
  label: string;
  url: string;
}

/** 準備事項（屬於一個場次） */
export interface Task {
  id: string;
  title: string;
  /** 期限 `YYYY-MM-DD`；沒有時空字串 */
  due: string;
  done: boolean;
  /** 準備事項清單的順序（所有場次的準備事項一起排；小的在前） */
  order: number;
}

export interface Entry {
  id: string;
  kind: EntryKind;
  /** 場次：劇本名稱；預定：標題 */
  title: string;
  /** `YYYY-MM-DD` */
  start: string;
  /** `YYYY-MM-DD`（≥ start；單日時等於 start） */
  end: string;
  /** `HH:MM` 或空字串 */
  startTime: string;
  endTime: string;
  color: EntryColor;
  memo: string;
  /** 所屬的行事曆（匯入時分組、iCal 的分類） */
  calendar: string;
  /* 以下是場次的欄位（預定不顯示，但保留） */
  system: string;
  gm: string;
  format: string;
  status: SessionStatus;
  tags: string[];
  players: Player[];
  links: EntryLink[];
  tasks: Task[];
  /** 第一次開啟時放的範例 */
  sample?: boolean;
}

/** CP 色：取了名字存起來的兩色漸層 */
export interface CpColor {
  id: string;
  name: string;
  c1: string;
  c2: string;
}

export type BgMode = 'theme' | 'gradient' | 'pattern' | 'image';
export type PatternKind = 'dots' | 'stripes' | 'check' | 'grid' | 'heart' | 'star';
export type ImageFit = 'cover' | 'tile';

export interface Look {
  /** theme：跟著介面的深淺色；其他：自訂背景＋下面的文字與框線顏色 */
  bg: BgMode;
  gradient: { colors: [string, string, string]; angle: number };
  pattern: { kind: PatternKind; base: string; color: string; size: number; alpha: number };
  /** 圖片存在資產庫（id），fade＝蓋一層白色的濃度 % */
  image: { id: string | null; fade: number; fit: ImageFit };
  colors: { text: string; muted: string; border: string; card: string; cardAlpha: number };
}

export interface CalData {
  /** 行事曆標題（年曆與截圖的標題） */
  title: string;
  /** 週的第一天：0＝星期日、1＝星期一 */
  weekStart: 0 | 1;
  showHolidays: boolean;
  /** 月曆上顯示準備事項 */
  showTasks: boolean;
  /** 截圖的寬度（px，輸出時再乘 2） */
  shotWidth: number;
  look: Look;
  entries: Entry[];
  cpColors: CpColor[];
}

/* ---------- 常數 ---------- */

export const DEFAULT_TITLE = '團期行事曆';
export const SESSION_CALENDAR = '跑團';
export const PLAN_CALENDAR = '預定';
export const UNTITLED_PLAN = '（無標題）';
export const UNTITLED_SESSION = '（未命名的場次）';

export const SESSION_COLOR = '#5b7fd6';
export const PLAN_COLOR = '#e0789b';
export const SECOND_COLOR = '#9b6fd6';

export const SHOT_WIDTH_MIN = 480;
export const SHOT_WIDTH_MAX = 1600;
export const SHOT_WIDTH_DEFAULT = 1200;

export const PATTERN_SIZE = { min: 16, max: 96 } as const;
export const PATTERN_ALPHA = { min: 10, max: 100 } as const;
export const IMAGE_FADE = { min: 0, max: 90 } as const;
/** 背景圖片長邊的上限（px） */
export const IMAGE_MAX_SIDE = 1600;

/** 最近用過的顏色、CP 色的上限 */
export const COLOR_HISTORY_MAX = 10;
export const CP_COLORS_MAX = 40;
/** 防呆：一個行事曆最多幾筆 */
export const ENTRY_LIMIT = 5000;
export const TASKS_PER_ENTRY_MAX = 100;

export const SESSION_STATUSES: readonly SessionStatus[] = ['scheduled', 'tentative', 'completed'];
export const PATTERN_KINDS: readonly PatternKind[] = [
  'dots',
  'stripes',
  'check',
  'grid',
  'heart',
  'star',
];

/* ---------- 識別碼 ---------- */

let seq = 0;
export function newId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
      return `${prefix}_${crypto.randomUUID().slice(0, 13)}`;
  } catch {
    /* 沒有 randomUUID 時用時間＋序號 */
  }
  seq += 1;
  return `${prefix}_${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/* ---------- 預設值 ---------- */

export function defaultLook(): Look {
  return {
    bg: 'theme',
    gradient: { colors: ['#fdf3ec', '#f4ecf8', '#e9f1fb'], angle: 135 },
    pattern: { kind: 'dots', base: '#fbf7f1', color: '#b58fc4', size: 32, alpha: 40 },
    image: { id: null, fade: 50, fit: 'cover' },
    colors: {
      text: '#3a3340',
      muted: '#7a7084',
      border: '#e2d7e0',
      card: '#ffffff',
      cardAlpha: 80,
    },
  };
}

export function newEntry(kind: EntryKind, date: string, patch: Partial<Entry> = {}): Entry {
  return {
    id: newId(kind === 'session' ? 'session' : 'plan'),
    kind,
    title: '',
    start: date,
    end: date,
    startTime: kind === 'session' ? '20:00' : '',
    endTime: '',
    color: { mode: 'solid', c1: kind === 'session' ? SESSION_COLOR : PLAN_COLOR, c2: SECOND_COLOR },
    memo: '',
    calendar: kind === 'session' ? SESSION_CALENDAR : PLAN_CALENDAR,
    system: '',
    gm: '',
    format: '',
    status: 'scheduled',
    tags: [],
    players: [],
    links: [],
    tasks: [],
    ...patch,
  };
}

export function newTask(title: string, due: string, order: number): Task {
  return { id: newId('task'), title, due, done: false, order };
}

export function initialData(today: string): CalData {
  return {
    title: DEFAULT_TITLE,
    weekStart: 0,
    showHolidays: true,
    showTasks: true,
    shotWidth: SHOT_WIDTH_DEFAULT,
    look: defaultLook(),
    entries: sampleEntries(today),
    cpColors: [],
  };
}

/** 範例（虛構的劇本與團員；日期跟著第一次開啟的那一天） */
export function sampleEntries(today: string): Entry[] {
  const d = (n: number) => addDays(today, n);
  return [
    newEntry('session', d(3), {
      title: '霧港燈塔的最後一夜',
      startTime: '20:00',
      endTime: '23:30',
      system: 'CoC 7版',
      gm: '白鷺',
      format: '線上・語音（CCFOLIA＋Discord）',
      status: 'scheduled',
      tags: ['TRPG', 'CoC'],
      players: [
        { pl: '阿樹', pc: '林曉舟' },
        { pl: '小鹿', pc: '程雨' },
        { pl: '貓又', pc: '沈墨' },
      ],
      links: [{ label: 'CCFOLIA 房間', url: '' }],
      tasks: [
        { id: newId('task'), title: '寄行前說明給 PL', due: d(-1), done: true, order: 10 },
        { id: newId('task'), title: '準備 NPC 立繪', due: d(0), done: false, order: 20 },
        { id: newId('task'), title: '設定房間的 BGM', due: d(2), done: false, order: 30 },
      ],
      memo: '前一天再確認一次房間的權限。',
      sample: true,
    }),
    newEntry('session', d(9), {
      title: '星屑圖書館的借閱證',
      startTime: '13:00',
      endTime: '17:00',
      system: 'Emoklore',
      gm: '小熊',
      format: '線上・文字',
      status: 'tentative',
      tags: ['TRPG'],
      tasks: [{ id: newId('task'), title: '分享劇本概要', due: d(5), done: false, order: 40 }],
      sample: true,
    }),
    newEntry('plan', d(12), {
      title: '出差（臺中）',
      end: d(14),
      color: { mode: 'solid', c1: '#8a96a8', c2: SECOND_COLOR },
      sample: true,
    }),
    newEntry('plan', d(19), {
      title: '跑團合宿',
      end: d(20),
      color: { mode: 'gradient', c1: '#f29e6d', c2: '#c76fd6' },
      memo: '兩天一夜，地點未定。',
      sample: true,
    }),
  ];
}

/* ---------- 整理（讀檔用） ---------- */

const str = (v: unknown, max = 2000): string => (v == null ? '' : String(v)).slice(0, max);
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** `H:MM`、`HH:MM`、`HHMM` → `HH:MM`；看不懂時空字串 */
export function normalizeTime(v: unknown): string {
  const s = str(v, 20).trim().normalize('NFKC');
  const m = TIME_RE.exec(s) ?? /^([01]\d|2[0-3])([0-5]\d)$/.exec(s);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

export function normalizeColor(raw: unknown, fallback: string): EntryColor {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return {
    mode: c.mode === 'gradient' ? 'gradient' : 'solid',
    c1: normalizeHex(str(c.c1 || fallback, 30), fallback, false),
    c2: normalizeHex(str(c.c2 || SECOND_COLOR, 30), SECOND_COLOR, false),
  };
}

export function normalizeTask(raw: unknown, index: number): Task | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const title = str(t.title, 200).trim();
  if (!title) return null;
  const order = Number(t.order);
  return {
    id: str(t.id, 80) || newId('task'),
    title,
    due: isIsoDate(t.due) ? String(t.due) : '',
    done: Boolean(t.done),
    order: Number.isFinite(order) ? order : (index + 1) * 10,
  };
}

const LINK_SCHEMES = new Set(['http:', 'https:', 'mailto:']);

/**
 * 連結的網址：http、https、mailto 照原樣；沒有寫 scheme 時補 `https://`（例：ccfolia.com/rooms/x）；
 * 其他 scheme（javascript: 等）或看不懂時 null。空白時空字串。
 */
export function normalizeLinkUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return '';
  /* `名稱:` 後面接數字的是主機名稱＋埠號（localhost:3000），不是 scheme */
  const url = /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(v) ? v : `https://${v.replace(/^\/+/, '')}`;
  try {
    return LINK_SCHEMES.has(new URL(url).protocol) ? url : null;
  } catch {
    return null;
  }
}

const STATUS_SET = new Set<string>(SESSION_STATUSES);

export function normalizeEntry(raw: unknown): Entry | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const kind: EntryKind = e.kind === 'plan' ? 'plan' : 'session';
  if (!isIsoDate(e.start)) return null;
  const start = String(e.start);
  let end = isIsoDate(e.end) ? String(e.end) : start;
  let s = start;
  if (dayNumber(end) < dayNumber(s)) [s, end] = [end, s];
  const base = newEntry(kind, s);
  const list = <T>(v: unknown, map: (x: unknown, i: number) => T | null, max: number): T[] =>
    (Array.isArray(v) ? v : [])
      .slice(0, max)
      .map(map)
      .filter((x): x is T => x !== null);
  return {
    ...base,
    id: str(e.id, 80) || base.id,
    title: str(e.title, 300),
    start: s,
    end,
    startTime: normalizeTime(e.startTime),
    endTime: normalizeTime(e.endTime),
    color: normalizeColor(e.color, kind === 'session' ? SESSION_COLOR : PLAN_COLOR),
    memo: str(e.memo, 20000),
    calendar: str(e.calendar, 100).trim() || base.calendar,
    system: str(e.system, 100),
    gm: str(e.gm, 200),
    format: str(e.format, 200),
    status: STATUS_SET.has(String(e.status)) ? (e.status as SessionStatus) : 'scheduled',
    tags: list(e.tags, (t) => str(t, 60).trim() || null, 30),
    players: list(
      e.players,
      (p) => {
        if (!p || typeof p !== 'object') return null;
        const o = p as Record<string, unknown>;
        const pl = str(o.pl, 100).trim();
        const pc = str(o.pc, 100).trim();
        return pl || pc ? { pl, pc } : null;
      },
      50,
    ),
    links: list(
      e.links,
      (l) => {
        if (!l || typeof l !== 'object') return null;
        const o = l as Record<string, unknown>;
        const label = str(o.label, 100).trim();
        /* 網址只留 http(s)、mailto（讀入的檔案裡的 javascript: 等丟掉，名稱留著） */
        const url = normalizeLinkUrl(str(o.url, 2000)) ?? '';
        return label || url ? { label, url } : null;
      },
      30,
    ),
    tasks: list(e.tasks, normalizeTask, TASKS_PER_ENTRY_MAX),
    ...(e.sample ? { sample: true } : {}),
  };
}

const PATTERN_SET = new Set<string>(PATTERN_KINDS);
const clampNum = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function normalizeLook(raw: unknown): Look {
  const d = defaultLook();
  if (!raw || typeof raw !== 'object') return d;
  const l = obj(raw);
  const hex = (v: unknown, f: string) => normalizeHex(str(v || f, 30), f, false);
  const g = obj(l.gradient);
  const p = obj(l.pattern);
  const im = obj(l.image);
  const c = obj(l.colors);
  const gc = Array.isArray(g.colors) ? g.colors : [];
  const bg = String(l.bg);
  return {
    bg: bg === 'gradient' || bg === 'pattern' || bg === 'image' ? bg : 'theme',
    gradient: {
      colors: [
        hex(gc[0], d.gradient.colors[0]),
        hex(gc[1], d.gradient.colors[1]),
        hex(gc[2], d.gradient.colors[2]),
      ],
      angle: clampNum(g.angle, 0, 360, d.gradient.angle),
    },
    pattern: {
      kind: PATTERN_SET.has(String(p.kind)) ? (p.kind as PatternKind) : d.pattern.kind,
      base: hex(p.base, d.pattern.base),
      color: hex(p.color, d.pattern.color),
      size: clampNum(p.size, PATTERN_SIZE.min, PATTERN_SIZE.max, d.pattern.size),
      alpha: clampNum(p.alpha, PATTERN_ALPHA.min, PATTERN_ALPHA.max, d.pattern.alpha),
    },
    image: {
      id: typeof im.id === 'string' && im.id ? im.id : null,
      fade: clampNum(im.fade, IMAGE_FADE.min, IMAGE_FADE.max, d.image.fade),
      fit: im.fit === 'tile' ? 'tile' : 'cover',
    },
    colors: {
      text: hex(c.text, d.colors.text),
      muted: hex(c.muted, d.colors.muted),
      border: hex(c.border, d.colors.border),
      card: hex(c.card, d.colors.card),
      cardAlpha: clampNum(c.cardAlpha, 0, 100, d.colors.cardAlpha),
    },
  };
}

export function normalizeCpColor(raw: unknown, index: number): CpColor | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const c1 = normalizeHex(str(c.c1, 30), '', false);
  const c2 = normalizeHex(str(c.c2, 30), '', false);
  if (!c1 || !c2) return null;
  return {
    id: str(c.id, 80) || newId('cp'),
    name: str(c.name, 40).trim() || `CP 色 ${index + 1}`,
    c1,
    c2,
  };
}

/** 存檔、專案檔 → 資料；不是物件時 null */
export function normalizeData(raw: unknown, today: string): CalData | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const base = initialData(today);
  const entries = (Array.isArray(r.entries) ? r.entries : [])
    .slice(0, ENTRY_LIMIT)
    .map(normalizeEntry)
    .filter((e): e is Entry => e !== null);
  return {
    title: typeof r.title === 'string' ? r.title.slice(0, 60) : base.title,
    weekStart: r.weekStart === 1 ? 1 : 0,
    showHolidays: r.showHolidays !== false,
    showTasks: r.showTasks !== false,
    shotWidth: clampNum(r.shotWidth, SHOT_WIDTH_MIN, SHOT_WIDTH_MAX, SHOT_WIDTH_DEFAULT),
    look: normalizeLook(r.look),
    entries,
    cpColors: (Array.isArray(r.cpColors) ? r.cpColors : [])
      .slice(0, CP_COLORS_MAX)
      .map(normalizeCpColor)
      .filter((c): c is CpColor => c !== null),
  };
}

/* ---------- 小工具 ---------- */

/** 這一筆涵蓋這一天嗎 */
export const covers = (e: Pick<Entry, 'start' | 'end'>, date: string): boolean =>
  e.start <= date && date <= e.end;

/** 天數（含頭尾） */
export const spanDays = (e: Pick<Entry, 'start' | 'end'>): number =>
  dayNumber(e.end) - dayNumber(e.start) + 1;

/** 顯示用的標題（空白時「（無標題）」等） */
export const entryTitle = (e: Pick<Entry, 'kind' | 'title'>): string =>
  e.title.trim() || (e.kind === 'plan' ? UNTITLED_PLAN : UNTITLED_SESSION);

/** 時間的寫法：「20:00–23:30」「20:00」或空字串 */
export function timeRange(e: Pick<Entry, 'startTime' | 'endTime'>): string {
  if (!e.startTime) return e.endTime ? `–${e.endTime}` : '';
  return e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime;
}

/** 移動一筆（保持天數）：開始日改成 newStart */
export function movedTo<T extends Pick<Entry, 'start' | 'end'>>(e: T, newStart: string): T {
  const len = dayNumber(e.end) - dayNumber(e.start);
  return { ...e, start: newStart, end: addDays(newStart, len) };
}

/** 排序：開始日 → 時間（沒有時間的在前）→ 天數多的在前 → 標題 */
export function compareEntries(a: Entry, b: Entry): number {
  if (a.start !== b.start) return a.start < b.start ? -1 : 1;
  const la = spanDays(a);
  const lb = spanDays(b);
  if (la !== lb) return lb - la;
  if (a.startTime !== b.startTime) return a.startTime < b.startTime ? -1 : 1;
  return a.title.localeCompare(b.title, 'zh-Hant');
}

const mixHex = (a: string, b: string, t: number): string => {
  const n = (h: string, i: number) => Number.parseInt(h.slice(1 + i * 2, 3 + i * 2), 16) || 0;
  const c = (i: number) =>
    Math.round(n(a, i) + (n(b, i) - n(a, i)) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${c(0)}${c(1)}${c(2)}`;
};

/**
 * 漸層切成一段：一筆跨 total 天、這一段是第 from 天起的 span 天（被週、月切開時），回傳這一段頭尾的顏色，
 * 拼起來是一條連續的漸層。單色時原樣。
 */
export function colorSlice(c: EntryColor, from: number, span: number, total: number): EntryColor {
  if (c.mode !== 'gradient' || total <= 1) return c;
  return {
    mode: 'gradient',
    c1: mixHex(c.c1, c.c2, from / total),
    c2: mixHex(c.c1, c.c2, (from + span) / total),
  };
}

/** 顏色的 CSS（單色或往右的漸層） */
export const colorCss = (c: EntryColor): string =>
  c.mode === 'gradient' ? `linear-gradient(90deg, ${c.c1}, ${c.c2})` : c.c1;
