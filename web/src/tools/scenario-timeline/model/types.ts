/**
 * 資料（規格 3.2）：自動儲存與專案檔共用。時間一律存標準寫法的字串（time.ts 的 canonical）。
 * normalizeDoc 把讀回、開啟、讀入的資料整理成可以用的樣子（認不得的拿掉、超過上限截掉、id 重複換新）。
 */
import { type Calendar, emptyCalendar, normalizeCalendar } from './calendar';
import { LINK_LIMITS, type Link, normalizeLinks } from './links';
import {
  afterUnit,
  canonical,
  dateValue,
  ERA_MAX,
  type EraArg,
  readTime,
  type TimeMode,
} from './time';

export type LaneKind = 'character' | 'npc' | 'place' | 'faction' | 'other';
export type EventKind = 'point' | 'range' | 'background';

export interface Lane {
  id: string;
  name: string;
  kind: LaneKind;
  color: string;
  /** 上層泳道（只有一層）；空字串＝最上層 */
  parentId: string;
  gm: boolean;
}

export interface Category {
  id: string;
  name: string;
  color: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  kind: EventKind;
  start: string;
  /** 期間、背景的結束（含）；時間點是空字串 */
  end: string;
  /** 空字串＝主線 */
  laneId: string;
  place: string;
  people: string[];
  /** 空字串＝沒有分類 */
  categoryId: string;
  /** 空字串＝不自訂 */
  color: string;
  gm: boolean;
  description: string;
  gmNote: string;
}

export interface Marker {
  id: string;
  label: string;
  time: string;
  color: string;
  gm: boolean;
}

export interface Progress {
  on: boolean;
  time: string;
  /** PL 版只到目前進度 */
  plOnly: boolean;
}

export interface TimelineDoc {
  title: string;
  mode: TimeMode;
  /** 架空年的曆名 */
  era: string;
  /** 換算用的「第 1 天」（YYYY-MM-DD；空字串＝還沒指定過） */
  dayOne: string;
  lanes: Lane[];
  categories: Category[];
  events: TimelineEvent[];
  markers: Marker[];
  progress: Progress;
  showNow: boolean;
  /** 範例（「這是範例」的提示） */
  sample: boolean;
  /** 架空曆的月份與星期（架空年才用；沒有月份＝只用年，F92） */
  calendar: Calendar;
  /** 事件之間的關聯線（F93） */
  links: Link[];
}

export const LIMITS = {
  events: 3000,
  lanes: 200,
  categories: 50,
  markers: 200,
  title: 120,
  eventTitle: 200,
  name: 60,
  place: 100,
  people: 30,
  person: 60,
  text: 4000,
  label: 60,
  links: LINK_LIMITS.links,
} as const;

/** 預設色（規格 3.6） */
export const PALETTE = [
  '#4f7cff',
  '#e0565b',
  '#2fa37a',
  '#d9902f',
  '#8a63d2',
  '#2b9fc2',
  '#c2558f',
  '#7a8a2e',
  '#6b7280',
] as const;
export const DEFAULT_EVENT_COLOR = '#4f7cff';
export const GM_COLOR = '#d99a1e';
export const NOW_COLOR = '#e5484d';

export const LANE_KINDS: readonly LaneKind[] = ['character', 'npc', 'place', 'faction', 'other'];
export const EVENT_KINDS: readonly EventKind[] = ['point', 'range', 'background'];

let seq = 0;
export function newId(prefix: string): string {
  seq = (seq + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${seq.toString(36)}`;
}

export function blankDoc(): TimelineDoc {
  return {
    title: '',
    mode: 'date',
    era: '',
    dayOne: '',
    lanes: [],
    categories: [],
    events: [],
    markers: [],
    progress: { on: false, time: '', plOnly: false },
    showNow: false,
    sample: false,
    calendar: emptyCalendar(),
    links: [],
  };
}

export function newEvent(partial: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    id: newId('e'),
    title: '新事件',
    kind: 'point',
    start: '',
    end: '',
    laneId: '',
    place: '',
    people: [],
    categoryId: '',
    color: '',
    gm: false,
    description: '',
    gmNote: '',
    ...partial,
  };
}

/* ---------- 整理 ---------- */

const str = (v: unknown, max: number): string =>
  typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v).slice(0, max) : '';
const bool = (v: unknown) => v === true;
const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);
const color = (v: unknown, fallback: string) => (isHex(v) ? v.toLowerCase() : fallback);
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/** 相關角色：以「、，,／/」分隔的文字或陣列 → 名字的陣列（去頭尾空白、不重複、有上限） */
export function splitPeople(v: unknown): string[] {
  const list = Array.isArray(v)
    ? v.flatMap((x) => (typeof x === 'string' ? x.split(/[、，,／/]/) : []))
    : typeof v === 'string'
      ? v.split(/[、，,／/]/)
      : [];
  const out: string[] = [];
  for (const raw of list) {
    const name = raw.trim().slice(0, LIMITS.person);
    if (name && !out.includes(name)) out.push(name);
    if (out.length >= LIMITS.people) break;
  }
  return out;
}

/** 讀回的時間：看得懂時改成標準寫法，看不懂時 null */
export function cleanTime(mode: TimeMode, v: unknown, era: EraArg): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const tv = readTime(mode, String(v), era);
  return tv ? canonical(mode, tv, era) : null;
}

/** 結束有沒有比開始晚（期間、背景） */
export function validRange(mode: TimeMode, start: string, end: string, era: EraArg): boolean {
  const a = readTime(mode, start, era);
  const b = readTime(mode, end, era);
  if (!a || !b) return false;
  return afterUnit(mode, b, era) > a.v;
}

/** 整理時略過或改掉的東西（開專案檔時通知） */
export interface NormalizeReport {
  /** 沒有任何劇本時間表的欄位（空物件） */
  empty: boolean;
  /** 事件清單不是清單 */
  eventsUnreadable: boolean;
  /** 看不懂而略過的事件（不是物件、開始看不懂） */
  skippedEvents: number;
  /** 超過上限沒讀的事件 */
  overEvents: number;
  /** 結束看不懂或不比開始晚、改成時間點的期間 */
  rangesToPoints: number;
  /** 看不懂而略過的標記 */
  skippedMarkers: number;
  /** 超過上限沒讀的標記、泳道、分類 */
  overMarkers: number;
  overLanes: number;
  overCategories: number;
  /** 上層不存在或超過一層、改成最上層的泳道 */
  lanesFlattened: number;
  /** 看不懂的時間寫法（當成日期時間；null＝沒有問題） */
  unknownMode: string | null;
  /** 兩端不存在、重複而略過的關聯線；超過上限的 */
  skippedLinks: number;
  overLinks: number;
}

export const emptyReport = (): NormalizeReport => ({
  empty: false,
  eventsUnreadable: false,
  skippedEvents: 0,
  overEvents: 0,
  rangesToPoints: 0,
  skippedMarkers: 0,
  overMarkers: 0,
  overLanes: 0,
  overCategories: 0,
  lanesFlattened: 0,
  unknownMode: null,
  skippedLinks: 0,
  overLinks: 0,
});

const DOC_KEYS = [
  'title',
  'mode',
  'era',
  'lanes',
  'categories',
  'events',
  'markers',
  'progress',
  'calendar',
  'links',
];

/** 整理成可以用的資料；完全不像時回傳 null。report 有給時填入略過或改掉的東西 */
export function normalizeDoc(raw: unknown, report?: NormalizeReport): TimelineDoc | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const rep = report ?? emptyReport();
  rep.empty = !DOC_KEYS.some((k) => k in r);
  const base = blankDoc();
  const mode = oneOf<TimeMode>(r.mode, ['date', 'day', 'year'], 'date');
  if (r.mode !== undefined && r.mode !== mode) rep.unknownMode = String(r.mode).slice(0, 20);
  const eraName = str(r.era, ERA_MAX);
  const calendar = normalizeCalendar(r.calendar);
  /* 時間的脈絡：曆名＋架空曆（只有架空年用得到月份） */
  const era: EraArg = { era: eraName, calendar };
  const used = new Set<string>();
  const uid = (v: unknown, prefix: string) => {
    let id = typeof v === 'string' && v && v.length <= 64 ? v : newId(prefix);
    if (used.has(id)) id = newId(prefix);
    used.add(id);
    return id;
  };

  const lanesAll = Array.isArray(r.lanes) ? r.lanes : [];
  rep.overLanes = Math.max(0, lanesAll.length - LIMITS.lanes);
  const lanesRaw = lanesAll.slice(0, LIMITS.lanes);
  const lanes: Lane[] = lanesRaw
    .filter((l): l is Record<string, unknown> => !!l && typeof l === 'object')
    .map((l, i) => ({
      id: uid(l.id, 'l'),
      name: str(l.name, LIMITS.name),
      kind: oneOf(l.kind, LANE_KINDS, 'other'),
      color: color(l.color, PALETTE[i % PALETTE.length]),
      parentId: typeof l.parentId === 'string' ? l.parentId : '',
      gm: bool(l.gm),
    }));
  const laneIds = new Set(lanes.map((l) => l.id));
  /* 上層：要存在、不是自己、本身是最上層（只有一層） */
  for (const l of lanes)
    if (l.parentId && (!laneIds.has(l.parentId) || l.parentId === l.id)) {
      l.parentId = '';
      rep.lanesFlattened++;
    }
  const top = new Set(lanes.filter((l) => !l.parentId).map((l) => l.id));
  for (const l of lanes)
    if (l.parentId && !top.has(l.parentId)) {
      l.parentId = '';
      rep.lanesFlattened++;
    }
  /* 有子泳道的不能是別人的子泳道（上面已經保證上層是最上層） */

  const catsAll = Array.isArray(r.categories) ? r.categories : [];
  rep.overCategories = Math.max(0, catsAll.length - LIMITS.categories);
  const catsRaw = catsAll.slice(0, LIMITS.categories);
  const categories: Category[] = catsRaw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
    .map((c, i) => ({
      id: uid(c.id, 'c'),
      name: str(c.name, LIMITS.name),
      color: color(c.color, PALETTE[i % PALETTE.length]),
    }));
  const catIds = new Set(categories.map((c) => c.id));

  rep.eventsUnreadable = r.events !== undefined && !Array.isArray(r.events);
  const eventsRaw = Array.isArray(r.events) ? r.events : [];
  const events: TimelineEvent[] = [];
  for (const e of eventsRaw) {
    if (!e || typeof e !== 'object') {
      rep.skippedEvents++;
      continue;
    }
    const o = e as Record<string, unknown>;
    const start = cleanTime(mode, o.start, era);
    if (!start) {
      rep.skippedEvents++;
      continue;
    }
    if (events.length >= LIMITS.events) {
      rep.overEvents++;
      continue;
    }
    let kind = oneOf(o.kind, EVENT_KINDS, 'point');
    let end = kind === 'point' ? '' : (cleanTime(mode, o.end, era) ?? '');
    if (kind !== 'point' && (!end || !validRange(mode, start, end, era))) {
      kind = 'point';
      end = '';
      rep.rangesToPoints++;
    }
    events.push({
      id: uid(o.id, 'e'),
      title: str(o.title, LIMITS.eventTitle),
      kind,
      start,
      end,
      laneId: typeof o.laneId === 'string' && laneIds.has(o.laneId) ? o.laneId : '',
      place: str(o.place, LIMITS.place),
      people: splitPeople(o.people),
      categoryId: typeof o.categoryId === 'string' && catIds.has(o.categoryId) ? o.categoryId : '',
      color: isHex(o.color) ? o.color.toLowerCase() : '',
      gm: bool(o.gm),
      description: str(o.description, LIMITS.text),
      gmNote: str(o.gmNote, LIMITS.text),
    });
  }

  const markersRaw = Array.isArray(r.markers) ? r.markers : [];
  const markers: Marker[] = [];
  for (const m of markersRaw) {
    if (!m || typeof m !== 'object') {
      rep.skippedMarkers++;
      continue;
    }
    const o = m as Record<string, unknown>;
    const time = cleanTime(mode, o.time, era);
    if (!time) {
      rep.skippedMarkers++;
      continue;
    }
    if (markers.length >= LIMITS.markers) {
      rep.overMarkers++;
      continue;
    }
    markers.push({
      id: uid(o.id, 'm'),
      label: str(o.label, LIMITS.label),
      time,
      color: color(o.color, '#8a63d2'),
      gm: bool(o.gm),
    });
  }

  const pr = (r.progress && typeof r.progress === 'object' ? r.progress : {}) as Record<
    string,
    unknown
  >;
  const progressTime = cleanTime(mode, pr.time, era) ?? '';
  const dayOne = cleanTime('date', r.dayOne, '');
  const linked = normalizeLinks(r.links, new Set(events.map((e) => e.id)));
  rep.skippedLinks = linked.skipped;
  rep.overLinks = linked.over;
  return {
    ...base,
    title: str(r.title, LIMITS.title),
    mode,
    era: eraName,
    dayOne: dayOne && /^\d{4}-\d{2}-\d{2}$/.test(dayOne) ? dayOne : '',
    lanes,
    categories,
    events,
    markers,
    progress: { on: bool(pr.on) && !!progressTime, time: progressTime, plOnly: bool(pr.plOnly) },
    showNow: bool(r.showNow),
    sample: bool(r.sample),
    calendar,
    links: linked.links,
  };
}

/* ---------- 查詢 ---------- */

export const laneById = (doc: Pick<TimelineDoc, 'lanes'>, id: string) =>
  doc.lanes.find((l) => l.id === id);
export const categoryById = (doc: Pick<TimelineDoc, 'categories'>, id: string) =>
  doc.categories.find((c) => c.id === id);

/** 事件的顏色：自訂 → 分類 → 泳道 → 預設（規格 F13、3.6） */
export function eventColor(
  doc: Pick<TimelineDoc, 'lanes' | 'categories'>,
  e: TimelineEvent,
): string {
  if (e.color) return e.color;
  const c = e.categoryId ? categoryById(doc, e.categoryId) : undefined;
  if (c) return c.color;
  const l = e.laneId ? laneById(doc, e.laneId) : undefined;
  return l?.color ?? DEFAULT_EVENT_COLOR;
}

/** 子泳道的 id（依清單順序） */
export const childLanes = (doc: Pick<TimelineDoc, 'lanes'>, id: string) =>
  doc.lanes.filter((l) => l.parentId === id);

/** 今天（這台電腦的日期）0:00 的分鐘數 */
export function todayValue(now = new Date()): number {
  return dateValue(now.getFullYear(), now.getMonth() + 1, now.getDate());
}
/** 現在時刻（這台電腦的日期時間）的分鐘數 */
export function nowValue(now = new Date()): number {
  return todayValue(now) + now.getHours() * 60 + now.getMinutes();
}
