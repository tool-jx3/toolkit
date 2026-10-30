/**
 * 讀入 vis-timeline 的資料（規格 F94）：DataSet 匯出的 items／groups 陣列（JSON）轉成本站的事件與泳道。純計算。
 *
 * 格式照 vis-timeline 的文件與 examples（visjs/vis-timeline `eb7ab7c`）：
 * - items：start（必填）、end、content（可以是 HTML）、group、type（box、point、range、background）、className、title（提示）、style、id…
 * - groups：id、content（可以是 HTML）、nestedGroups（子分組的 id）、showNested（false＝收合）、order、style、className、title、visible…
 * - 時間：ISO 8601 字串（有時區〔Z、+08:00〕的換成這台電腦的時間，和 vis-timeline 顯示的相同；沒有時區的照寫的）、
 *   數字（毫秒的時間戳）、ASP.NET 的 `/Date(…)/`、本站看得懂的日期寫法。
 * - vis-timeline 的 end 是「到那一刻為止」：只寫到日的 end（例 2014-04-19）是那天 0:00，換成本站「包含整天」的結束是前一天。
 *
 * 轉換：content→標題、title→說明（HTML 轉純文字）、group→泳道（groups 的 content 當名稱；專案裡名稱與上層都相同的泳道沿用）、
 * className→分類（名稱照寫）、style 的 background(-color)→自訂顏色、nestedGroups→子泳道（只有一層：更深的放到最上層底下）。
 * 其他欄位略過（通知略過了哪些）。
 */
import { normalizeHex, parseColor } from '@/core/color';
import {
  afterUnit,
  canonical,
  convertTime,
  dateValue,
  dayOneValue,
  endFromExclusive,
  MINUTES_PER_DAY,
  parseTime,
  readTime,
  type Tv,
} from './time';
import {
  type Category,
  type EventKind,
  type Lane,
  LIMITS,
  newEvent,
  newId,
  PALETTE,
  type TimelineDoc,
  type TimelineEvent,
} from './types';

/* ---------- HTML → 純文字 ---------- */

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  copy: '©',
  reg: '®',
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  laquo: '«',
  raquo: '»',
  times: '×',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{1,10});/gi, (m, body: string) => {
    if (body[0] === '#') {
      const code =
        body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[body.toLowerCase()] ?? m;
  });
}

/** 結尾換行的區塊標籤 */
const BLOCK_END = new Set([
  'p',
  'div',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'tr',
  'ul',
  'ol',
  'table',
]);

/**
 * HTML → 純文字（規格 D4：本站不收 HTML）：註解、script／style 整段拿掉、<br> 與區塊的結尾換行、其他標籤拿掉、實體字元換回來。
 * 結果只當文字顯示，不會再當成 HTML。
 *
 * 一次由左往右掃（線性時間）：沒收尾的「<」（後面再也沒有「>」）照原文、沒收尾的註解拿掉後面全部、
 * 沒有結束標籤的 script／style 只拿掉開始標籤。max 給了時，輸出夠長（max 的 4 倍以上）就停（標題、說明有字數上限）。
 */
export function htmlToText(
  html: string,
  multiline = false,
  max = Number.POSITIVE_INFINITY,
): string {
  const src = String(html);
  const lower = src.toLowerCase();
  const limit = Number.isFinite(max) ? max * 4 + 256 : Number.POSITIVE_INFINITY;
  const out: string[] = [];
  let len = 0;
  const push = (t: string) => {
    out.push(t);
    len += t.length;
  };
  /** 沒有結束標籤的 script／style（找過一次就不再找） */
  const noClose = new Set<string>();
  let i = 0;
  while (i < src.length && len < limit) {
    const lt = src.indexOf('<', i);
    if (lt < 0) {
      push(src.slice(i));
      break;
    }
    if (lt > i) push(src.slice(i, lt));
    i = lt;
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      if (end < 0) break;
      i = end + 3;
      continue;
    }
    const gt = src.indexOf('>', i + 1);
    if (gt < 0) {
      /* 後面再也沒有「>」：剩下的都不是標籤 */
      push(src.slice(i));
      break;
    }
    const m = /^(\/?)([a-z][a-z0-9]*)/.exec(lower.slice(i + 1, Math.min(gt, i + 12)));
    const closing = m?.[1] === '/';
    const name = m?.[2] ?? '';
    i = gt + 1;
    if (!closing && (name === 'script' || name === 'style') && !noClose.has(name)) {
      const close = lower.indexOf(`</${name}`, i);
      const cgt = close < 0 ? -1 : src.indexOf('>', close);
      if (cgt < 0) noClose.add(name);
      else {
        push(' ');
        i = cgt + 1;
      }
      continue;
    }
    if (name === 'br' && !closing) push('\n');
    else if (closing && BLOCK_END.has(name)) push('\n');
  }
  let s = out.join('');
  if (s.length > limit) s = s.slice(0, limit);
  s = decodeEntities(s);
  if (!multiline) return s.replace(/\s+/g, ' ').trim();
  return s
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/* ---------- 時間 ---------- */

/** Date（這台電腦的時區）→ 日期時間的 Tv（寫到分；剛好 0:00 時只到日） */
function localTv(d: Date): Tv | null {
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  const y = d.getFullYear();
  if (y < 1 || y > 9999) return null;
  const v = dateValue(y, d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes());
  return d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0
    ? { v, p: 'day' }
    : { v, p: 'minute' };
}

/** UTC 的年月日時分秒 → Date（0～99 年不會被當成 19xx 年） */
function utcDate(y: number, mo: number, d: number, hh: number, mm: number, ss: number) {
  const out = new Date(0);
  out.setUTCFullYear(y, mo - 1, d);
  out.setUTCHours(hh, mm, ss, 0);
  return out;
}

const ISO =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

/**
 * vis-timeline 的時間 → 日期時間的 Tv（看不懂時 null）。
 * 有時區的換成這台電腦的時間；沒有時區的照寫的；數字是毫秒的時間戳（這台電腦的時間）。
 */
export function visTime(value: unknown): Tv | null {
  if (typeof value === 'number') return Number.isFinite(value) ? localTv(new Date(value)) : null;
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  const asp = /^\/Date\((-?\d+)(?:[+-]\d{4})?\)\/$/.exec(s);
  if (asp) return localTv(new Date(Number(asp[1])));
  if (/^-?\d{9,}$/.test(s)) return localTv(new Date(Number(s)));
  const m = ISO.exec(s);
  if (m) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const hh = m[4] ? Number(m[4]) : 0;
    const mm = m[5] ? Number(m[5]) : 0;
    const ss = m[6] ? Number(m[6]) : 0;
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || hh > 23 || mm > 59 || ss > 59) return null;
    if (m[7]) {
      /* 有時區：那一刻在這台電腦上的時間 */
      const tz = m[7].toUpperCase();
      let off = 0;
      if (tz !== 'Z') {
        const sign = tz[0] === '-' ? -1 : 1;
        const digits = tz.slice(1).replace(':', '');
        off = sign * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4)));
      }
      const utc = utcDate(y, mo, d, hh, mm, ss);
      return localTv(new Date(utc.getTime() - off * 60000));
    }
    const r = parseTime(
      'date',
      m[4] ? `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}` : `${m[1]}-${m[2]}-${m[3]}`,
    );
    return r.ok ? r.tv : null;
  }
  const r = parseTime('date', s);
  if (r.ok) return r.tv;
  const t = Date.parse(s);
  return Number.isFinite(t) ? localTv(new Date(t)) : null;
}

/* ---------- 偵測 ---------- */

export interface VisData {
  items: unknown[];
  groups: unknown[] | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** 一個陣列是 items（大多有 start）、groups（大多有 id／content、沒有 start）或都不是 */
export function classifyArray(list: unknown[]): 'items' | 'groups' | null {
  const objs = list.filter(isObj);
  if (!objs.length || objs.length < list.length / 2) return null;
  const withStart = objs.filter((o) => 'start' in o).length;
  if (withStart >= objs.length / 2) return 'items';
  const groupish = objs.filter((o) => 'id' in o && ('content' in o || 'nestedGroups' in o)).length;
  return groupish >= objs.length / 2 ? 'groups' : null;
}

/**
 * 讀進來的 JSON（一個或好幾個檔案／貼上的文字）→ items、groups；認不出來時 null。
 * 接受：items 陣列、groups 陣列、`{ items, groups }`（也認 `{ data: … }` 包一層）。
 */
export function detectVis(values: readonly unknown[]): VisData | null {
  let items: unknown[] | null = null;
  let groups: unknown[] | null = null;
  const take = (v: unknown) => {
    if (Array.isArray(v)) {
      const kind = classifyArray(v);
      if (kind === 'items') items = [...(items ?? []), ...v];
      else if (kind === 'groups') groups = [...(groups ?? []), ...v];
      return;
    }
    if (!isObj(v)) return;
    if (Array.isArray(v.items)) items = [...(items ?? []), ...v.items];
    if (Array.isArray(v.groups)) groups = [...(groups ?? []), ...v.groups];
    if (!('items' in v) && !('groups' in v) && 'data' in v) take(v.data);
  };
  for (const v of values) take(v);
  if (!items) return null;
  return { items, groups };
}

/* ---------- 轉換 ---------- */

export interface VisSkip {
  /** 第幾個項目（1 起算） */
  index: number;
  reason: string;
}

export interface VisImport {
  events: TimelineEvent[];
  /** 新增的泳道 */
  lanes: Lane[];
  /** 新增的分類 */
  categories: Category[];
  /** 要收合的泳道（showNested: false） */
  collapsed: string[];
  skipped: VisSkip[];
  /** 略過的欄位 → 用到的項目、分組數 */
  ignored: [string, number][];
  /** 其他說明（期間沒有結束改成時間點、巢狀超過一層…） */
  notes: string[];
  /** 有內容的項目數 */
  total: number;
}

const ITEM_FIELDS = new Set([
  'id',
  'start',
  'end',
  'content',
  'group',
  'type',
  'className',
  'title',
  'style',
]);
const GROUP_FIELDS = new Set([
  'id',
  'content',
  'nestedGroups',
  'showNested',
  'order',
  'style',
  'treeLevel',
]);

/** style 的背景色（#rgb、#rrggbb、rgb(…)；background 簡寫取第一個看得懂的顏色）；看不懂、透明時空字串 */
export function styleColor(style: unknown): string {
  if (typeof style !== 'string') return '';
  const m = /(?:^|;)\s*background(?:-color)?\s*:\s*([^;]+)/i.exec(style);
  if (!m) return '';
  const raw = m[1].replace(/!important/i, '').trim();
  const parts = [raw, ...(raw.match(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi) ?? [])];
  for (const p of parts) {
    const c = parseColor(p);
    if (c && c.a > 0) return normalizeHex(p, '', false).toLowerCase();
  }
  return '';
}

/** 欄位的文字（HTML 轉純文字，截到 max 字） */
const textOf = (v: unknown, max: number, multiline = false): string =>
  (typeof v === 'string'
    ? htmlToText(v, multiline, max)
    : typeof v === 'number'
      ? String(v)
      : ''
  ).slice(0, max);

const keyOf = (v: unknown): string | null =>
  typeof v === 'string' || typeof v === 'number' ? String(v) : null;

/**
 * 轉成本站的事件與泳道。doc 的時間寫法不是日期時間時照 F04 換算（第 N 天：專案的「第 1 天」，沒有時用最早的那天；
 * 架空年：取西元年）。泳道、分類照名稱對到現有的，沒有的新增。
 */
export function convertVis(
  data: VisData,
  doc: Pick<TimelineDoc, 'mode' | 'era' | 'dayOne' | 'lanes' | 'categories'> &
    Partial<Pick<TimelineDoc, 'calendar'>>,
  maxEvents: number = LIMITS.events,
): VisImport {
  const ignored = new Map<string, number>();
  const ignore = (k: string) => ignored.set(k, (ignored.get(k) ?? 0) + 1);
  const notes: string[] = [];

  /* 泳道 */
  const lanes: Lane[] = [];
  /*
   * 沿用專案裡已有的泳道：名稱＋上層都相同的（不同上層底下的同名分組是不同的泳道，例如兩個「North America」）。
   * 這次讀入的分組一個 id 一條泳道（同名的也分開）；只有 group 的值、沒有 groups 時同一個值一條。
   */
  const laneKey = (parentId: string, name: string) => `${parentId}\u0000${name}`;
  const laneByName = new Map<string, string>();
  for (const l of doc.lanes) {
    const key = laneKey(l.parentId, l.name.trim());
    if (!laneByName.has(key)) laneByName.set(key, l.id);
  }
  const groupLane = new Map<string, string>();
  const collapsed: string[] = [];
  let laneFull = 0;
  const addLane = (name: string, color: string, parentId: string): string => {
    const n = name.slice(0, LIMITS.name);
    const hit = laneByName.get(laneKey(parentId, n));
    if (hit) return hit;
    if (doc.lanes.length + lanes.length >= LIMITS.lanes) {
      laneFull++;
      return '';
    }
    const lane: Lane = {
      id: newId('l'),
      name: n,
      kind: 'other',
      color: color || PALETTE[(doc.lanes.length + lanes.length) % PALETTE.length],
      parentId,
      gm: false,
    };
    lanes.push(lane);
    return lane.id;
  };

  if (data.groups) {
    const groups = data.groups.filter(isObj);
    /* 順序：有 order 時照 order（vis-timeline 預設的分組順序），否則照原本的順序 */
    const orderOf = (g: Record<string, unknown>) =>
      typeof g.order === 'number' && Number.isFinite(g.order) ? g.order : Number.POSITIVE_INFINITY;
    const ordered = groups
      .map((g, i) => ({ g, i, o: orderOf(g) }))
      .sort((p, q) => (p.o === q.o ? p.i - q.i : p.o < q.o ? -1 : 1))
      .map((x) => x.g);
    const byId = new Map<string, Record<string, unknown>>();
    for (const g of ordered) {
      const id = keyOf(g.id);
      if (id !== null && !byId.has(id)) byId.set(id, g);
    }
    /* 上層：nestedGroups（第一個出現的上層為準） */
    const parentOf = new Map<string, string>();
    for (const [id, g] of byId)
      if (Array.isArray(g.nestedGroups))
        for (const c of g.nestedGroups) {
          const cid = keyOf(c);
          if (cid !== null && cid !== id && byId.has(cid) && !parentOf.has(cid))
            parentOf.set(cid, id);
        }
    /* 最上層的祖先（巢狀超過一層的放到它底下；有循環時停下） */
    const topOf = (id: string): string => {
      let cur = id;
      const seen = new Set<string>([cur]);
      while (parentOf.has(cur)) {
        const next = parentOf.get(cur) as string;
        if (seen.has(next)) break;
        seen.add(next);
        cur = next;
      }
      return cur;
    };
    let deep = 0;
    let hidden = 0;
    /* 先放上層，再放子分組（子分組要在上層之後） */
    const tops = [...byId.keys()].filter((id) => topOf(id) === id);
    const place = (id: string, parentLane: string) => {
      const g = byId.get(id) as Record<string, unknown>;
      for (const k of Object.keys(g)) if (!GROUP_FIELDS.has(k)) ignore(k);
      if (g.visible === false) hidden++;
      const name = textOf(g.content, LIMITS.name) || `分組 ${id}`;
      const laneId = addLane(name, styleColor(g.style), parentLane);
      groupLane.set(id, laneId);
      if (
        laneId &&
        g.showNested === false &&
        Array.isArray(g.nestedGroups) &&
        g.nestedGroups.length
      )
        collapsed.push(laneId);
      return laneId;
    };
    for (const t of tops) {
      const laneId = place(t, '');
      const kids = [...byId.keys()].filter((id) => id !== t && topOf(id) === t);
      for (const k of kids) {
        if (parentOf.get(k) !== t) deep++;
        place(k, laneId);
      }
    }
    if (deep) notes.push(`巢狀超過一層的 ${deep} 個分組放到最上層的分組底下（本站只有一層）。`);
    if (hidden) notes.push(`${hidden} 個 visible: false 的分組照樣讀入成泳道。`);
  }

  /* 分類（className） */
  const categories: Category[] = [];
  const catByName = new Map<string, string>();
  for (const c of doc.categories)
    if (!catByName.has(c.name.trim())) catByName.set(c.name.trim(), c.id);
  const catFor = (name: string): string => {
    const n = name.trim().slice(0, LIMITS.name);
    if (!n) return '';
    const hit = catByName.get(n);
    if (hit) return hit;
    if (doc.categories.length + categories.length >= LIMITS.categories) return '';
    const c: Category = {
      id: newId('c'),
      name: n,
      color: PALETTE[(doc.categories.length + categories.length) % PALETTE.length],
    };
    categories.push(c);
    catByName.set(n, c.id);
    return c.id;
  };

  /* 第 N 天的「第 1 天」：專案的，沒有時用最早的那天 */
  let dayOne: number | null = doc.dayOne ? dayOneValue(doc.dayOne) : null;
  if (doc.mode === 'day' && dayOne === null) {
    let lo = Number.POSITIVE_INFINITY;
    for (const it of data.items) if (isObj(it)) lo = Math.min(lo, visTime(it.start)?.v ?? lo);
    dayOne = Number.isFinite(lo) ? Math.floor(lo / MINUTES_PER_DAY) * MINUTES_PER_DAY : 0;
  }
  const toMode = (tv: Tv, role: 'start' | 'end'): string | null => {
    const text = canonical('date', tv);
    if (doc.mode === 'date') return text;
    return convertTime('date', doc.mode, text, { era: doc, dayOne: dayOne ?? 0, role });
  };

  const events: TimelineEvent[] = [];
  const skipped: VisSkip[] = [];
  let total = 0;
  let noEnd = 0;
  let zero = 0;
  let over = 0;
  data.items.forEach((raw, i) => {
    const index = i + 1;
    if (!isObj(raw)) {
      if (raw !== null && raw !== undefined) {
        total++;
        skipped.push({ index, reason: '不是項目（物件）' });
      }
      return;
    }
    total++;
    if (events.length >= maxEvents) {
      over++;
      return;
    }
    for (const k of Object.keys(raw)) if (!ITEM_FIELDS.has(k)) ignore(k);
    const start = visTime(raw.start);
    if (!start) {
      skipped.push({ index, reason: raw.start === undefined ? '沒有 start' : '看不懂 start' });
      return;
    }
    const hasEnd = raw.end !== undefined && raw.end !== null && raw.end !== '';
    const endTv = hasEnd ? visTime(raw.end) : null;
    if (hasEnd && !endTv) {
      skipped.push({ index, reason: '看不懂 end' });
      return;
    }
    let kind: EventKind;
    const type = typeof raw.type === 'string' ? raw.type.toLowerCase() : raw.type;
    if (type === undefined || type === null || type === '') kind = endTv ? 'range' : 'point';
    else if (type === 'box' || type === 'point') kind = 'point';
    else if (type === 'range') kind = 'range';
    else if (type === 'background') kind = 'background';
    else {
      skipped.push({ index, reason: `看不懂 type「${String(raw.type).slice(0, 20)}」` });
      return;
    }
    let end = '';
    if (kind !== 'point') {
      if (!endTv) {
        if (kind === 'background') {
          skipped.push({ index, reason: '背景（background）沒有 end' });
          return;
        }
        kind = 'point';
        noEnd++;
      } else {
        /* vis-timeline 的 end 是那一刻；只到日的結束換成本站「包含整天」的寫法（前一天） */
        const e = endTv.p === 'day' ? endFromExclusive('date', endTv.v, 'day') : endTv;
        const after = e.p === 'day' ? e.v + MINUTES_PER_DAY : e.v;
        if (after <= start.v) {
          kind = 'point';
          zero++;
        } else {
          const text = toMode(e, 'end');
          if (text === null) {
            skipped.push({ index, reason: 'end 換不成這份專案的時間寫法' });
            return;
          }
          end = text;
        }
      }
    }
    const startText = toMode(start, 'start');
    if (startText === null) {
      skipped.push({ index, reason: 'start 換不成這份專案的時間寫法' });
      return;
    }
    /* 換算後（第 N 天、架空年）結束不比開始晚的改成時間點 */
    if (end) {
      const a = readTime(doc.mode, startText, doc);
      const b = readTime(doc.mode, end, doc);
      if (!a || !b || afterUnit(doc.mode, b, doc) <= a.v) {
        end = '';
        zero++;
      }
    }
    if (kind !== 'point' && !end) kind = 'point';
    const groupKey = keyOf(raw.group);
    let laneId = '';
    if (groupKey !== null) {
      laneId = groupLane.get(groupKey) ?? '';
      if (!groupLane.has(groupKey)) {
        laneId = addLane(`分組 ${groupKey}`, '', '');
        groupLane.set(groupKey, laneId);
      }
    }
    events.push(
      newEvent({
        title: textOf(raw.content, LIMITS.eventTitle),
        kind,
        start: startText,
        end: kind === 'point' ? '' : end,
        laneId,
        categoryId: typeof raw.className === 'string' ? catFor(raw.className) : '',
        color: styleColor(raw.style),
        description: textOf(raw.title, LIMITS.text, true),
      }),
    );
  });
  if (noEnd) notes.push(`${noEnd} 個 range 沒有 end，改成時間點。`);
  if (zero) notes.push(`${zero} 個項目的 end 不比 start 晚，改成時間點。`);
  if (over) notes.push(`事件最多 ${maxEvents} 個，${over} 個項目沒有讀入。`);
  if (laneFull) notes.push(`泳道最多 ${LIMITS.lanes} 條，${laneFull} 個分組放在主線。`);
  return {
    events,
    lanes,
    categories,
    collapsed,
    skipped,
    ignored: [...ignored.entries()].sort((p, q) => q[1] - p[1]),
    notes,
    total,
  };
}
