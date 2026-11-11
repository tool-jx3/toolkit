/**
 * 年表（規格 F50～F54、3.7）：依時間排的清單、分段；純文字、Markdown、列印用的 HTML。純計算。
 * 第三批：每個事件下面列它的關聯線（F111：「→ 導致：…」「← 起因：…」「⇄ 矛盾：…」）；架空曆的時刻（F110）。
 */
import { escapeHtml } from '@/core/html';
import { type CalInfo, calParts, monthName, valueOfDay } from './calendar';
import { eventSpan } from './layout';
import type { LinkKind } from './links';
import {
  countdownText,
  phaseLabel,
  phaseOf,
  type Session,
  sessionText,
  slotName,
  slotOf,
  zeroOf,
} from './session';
import {
  afterUnit,
  clockText,
  ctxParts,
  dateLabel,
  dateParts,
  dayNumber,
  type EraArg,
  formatLong,
  type Precision,
  readTime,
  sessionOf,
  type TimeMode,
  type Tv,
  yearLabel,
} from './time';
import { eventColor } from './types';
import type { VisibleDoc, VisibleEvent } from './visible';

/** 年表裡一筆事件的一條關聯線（F111） */
export interface ChronLink {
  /** out＝從這個事件連出去（導致：→）、in＝連進來（←）；同時、矛盾、相關沒有方向（⇄） */
  dir: 'out' | 'in' | 'both';
  kind: LinkKind;
  /** 另一端的事件 */
  otherId: string;
  other: string;
  note: string;
  /** PL 版看不到（GM 專用的線、一端是 PL 看不到的事件；只有 GM 版會是 true） */
  secret: boolean;
}

/** 年表裡一筆事件的真相（F116；知道真相的檢視才有） */
export interface ChronTruth {
  title: string;
  /** 和證詞不同時的時間（「21:10～21:30」）；相同時空字串 */
  time: string;
  place: string;
}

export interface ChronRow {
  /** exit＝泳道的退場時刻（F121） */
  kind: 'event' | 'marker' | 'exit';
  id: string;
  /** 段裡的時間（「21:00」「整天」「～3月14日」） */
  time: string;
  /** 完整的時間（提示、螢幕閱讀器） */
  fullTime: string;
  title: string;
  laneName: string;
  laneColor: string;
  categoryName: string;
  categoryColor: string;
  place: string;
  people: string[];
  description: string;
  gmNote: string;
  /** 事件自己是 GM 專用 */
  gm: boolean;
  /** PL 版看不到（GM 專用、在 GM 專用的泳道） */
  secret: boolean;
  background: boolean;
  ongoing: boolean;
  color: string;
  /** 這個事件的關聯線（列出關聯線時；依另一端在年表上的順序） */
  links: ChronLink[];
  /** 不分段時的時間（「第 1 天 18:00～19:00」；進行表用，F122） */
  when?: string;
  /** 公開範圍：偽裝、伏字（知道真相的檢視才有，F116） */
  face?: 'alibi' | 'redacted';
  truth?: ChronTruth;
  /** 調查後公開（F119） */
  opened?: boolean;
  /** 退場的那條泳道（kind 是 exit 時） */
  laneId?: string;
}

export interface ChronSection {
  key: string;
  heading: string;
  rows: ChronRow[];
}

export interface Chronicle {
  title: string;
  /** 人物別的視角（泳道的名稱；F118） */
  povName?: string;
  /** 「最早～最晚」（沒有東西時空字串） */
  range: string;
  sections: ChronSection[];
  count: number;
}

const RANK: Record<Precision, number> = { year: 0, month: 1, day: 2, minute: 3 };

function sectionOf(mode: TimeMode, tv: Tv, ctx: EraArg): { key: string; heading: string } {
  const { era, info } = ctxParts(ctx);
  if (mode === 'year') {
    /* 架空曆：只到年的在那一年的段、只到月的在那一月的段、到日（與時刻）的每天一段 */
    if (info && tv.p !== 'year') {
      const c = calParts(info, tv.v);
      if (tv.p === 'month') return { key: `m${c.y}-${c.m}`, heading: formatLong(mode, tv, ctx) };
      const day: Tv = tv.p === 'minute' ? { v: valueOfDay(info, c.T), p: 'day' } : tv;
      return { key: `d${c.T}`, heading: formatLong(mode, day, ctx) };
    }
    return { key: `y${tv.v}`, heading: yearLabel(tv.v, era) };
  }
  if (mode === 'day') {
    const ses = tv.p === 'minute' ? sessionOf(ctx) : null;
    if (ses) return sessionSection(ses, tv.v);
    const n = dayNumber(tv.v);
    return { key: `d${n}`, heading: `第 ${n} 天` };
  }
  const d = dateParts(tv.v);
  if (tv.p === 'year') return { key: `y${d.y}`, heading: `${d.y}年` };
  if (tv.p === 'month') return { key: `m${d.y}-${d.m}`, heading: `${d.y}年${d.m}月` };
  return { key: `d${d.days}`, heading: dateLabel(tv.v) };
}

/**
 * 第 N 天有標示時的段（F126）：時刻照第 N 天；日程每天一段（06:00 換日）；倒數不分段（標題空白）；階段每個階段一段。
 */
function sessionSection(ses: Session, v: number): { key: string; heading: string } {
  if (ses.style === 'schedule') {
    const t = slotOf(v);
    return { key: `s${t.day}`, heading: `第 ${t.day} 天` };
  }
  if (ses.style === 'countdown') return { key: 'cd', heading: '' };
  if (ses.style === 'phase') {
    const n = phaseOf(ses, v).n;
    return { key: `p${n}`, heading: phaseLabel(n) };
  }
  const n = dayNumber(v);
  return { key: `d${n}`, heading: `第 ${n} 天` };
}

/** 標示的段裡的時間（寫到分）：日程寫段名（不在開頭時加時刻）、倒數寫 T-、階段寫「+15 分」（開頭不寫） */
function sessionInSection(ses: Session, v: number): string {
  if (ses.style === 'schedule') {
    const t = slotOf(v);
    return `${slotName(t.slot)}${t.off ? ` ${clockText(v)}` : ''}`;
  }
  if (ses.style === 'countdown') return countdownText(zeroOf(ses) - v);
  if (ses.style === 'phase') {
    const t = phaseOf(ses, v);
    return t.off ? `+${t.off} 分` : '';
  }
  return clockText(v);
}

/** 標示的期間的結束（相對於開始：同一段只寫段裡的時間） */
function sessionEnd(ses: Session, start: Tv, end: Tv): string {
  if (end.p !== 'minute') return `第 ${dayNumber(end.v)} 天`;
  if (ses.style === 'schedule') {
    const same = slotOf(start.v).day === slotOf(end.v).day;
    return same ? sessionInSection(ses, end.v) : (sessionText(ses, end.v) ?? '');
  }
  if (ses.style === 'phase') return sessionText(ses, end.v) ?? '';
  if (ses.style === 'countdown') return sessionInSection(ses, end.v);
  return dayNumber(end.v) === dayNumber(start.v)
    ? clockText(end.v)
    : `第 ${dayNumber(end.v)} 天 ${clockText(end.v)}`;
}

/**
 * 段裡的開始時間：寫到分＝時刻；只到日＝「整天」（時間點與期間的開始相同：「整天～3月14日」）；只到月、年＝不寫。
 * 架空年不寫；架空曆打開「寫到時刻」時和日期時間相同（F110）。
 */
function startText(
  mode: TimeMode,
  tv: Tv,
  info: CalInfo | null = null,
  ses: Session | null = null,
): string {
  if (ses && mode === 'day' && tv.p === 'minute') return sessionInSection(ses, tv.v);
  if (mode === 'year') {
    if (!info?.clock) return '';
    if (tv.p === 'minute') return clockText(calParts(info, tv.v).min);
    return tv.p === 'day' ? '整天' : '';
  }
  if (tv.p === 'minute') return clockText(tv.v);
  if (tv.p === 'day') return '整天';
  return '';
}

/** 架空曆的期間的結束（同一年不寫年；寫到時刻的同一天只寫時刻） */
function calEndText(info: CalInfo, start: Tv, end: Tv, era: string): string {
  const s = calParts(info, start.v);
  const e = calParts(info, end.v);
  if (end.p === 'minute') {
    if (s.T === e.T) return clockText(e.min);
    const md = `${monthName(info, e.m - 1)} ${e.d} 日`;
    return `${s.y === e.y ? md : `${yearLabel(e.y, era)} ${md}`} ${clockText(e.min)}`;
  }
  if (end.p !== 'month' && end.p !== 'day') return yearLabel(e.y, era);
  const md = `${monthName(info, e.m - 1)}${end.p === 'day' ? ` ${e.d} 日` : ''}`;
  return s.y === e.y ? md : `${yearLabel(e.y, era)} ${md}`;
}

/** 期間的結束（相對於開始寫：同一天只寫時刻、同一年不寫年） */
export function endText(mode: TimeMode, start: Tv, end: Tv, ctx: EraArg): string {
  const { era, info } = ctxParts(ctx);
  if (mode === 'year') return info ? calEndText(info, start, end, era) : yearLabel(end.v, era);
  const ses = mode === 'day' ? sessionOf(ctx) : null;
  if (ses) return sessionEnd(ses, start, end);
  if (mode === 'day') {
    if (end.p === 'minute')
      return dayNumber(end.v) === dayNumber(start.v)
        ? clockText(end.v)
        : `第 ${dayNumber(end.v)} 天 ${clockText(end.v)}`;
    return `第 ${dayNumber(end.v)} 天`;
  }
  const s = dateParts(start.v);
  const e = dateParts(end.v);
  const sameYear = s.y === e.y;
  if (end.p === 'year') return `${e.y}年`;
  if (end.p === 'month') return sameYear ? `${e.m}月` : `${e.y}年${e.m}月`;
  const date = sameYear ? `${e.m}月${e.d}日` : `${e.y}年${e.m}月${e.d}日`;
  if (end.p === 'day') return date;
  return s.days === e.days ? clockText(end.v) : `${date} ${clockText(end.v)}`;
}

interface Sortable {
  row: ChronRow;
  v: number;
  rank: number;
  endV: number;
  lane: number;
  marker: number;
  idx: number;
  section: { key: string; heading: string };
}

export interface ChronicleOptions {
  /** 每個事件下面列它的關聯線（F111；預設不列） */
  links?: boolean;
}

/** 不分段的時間：開始的完整寫法＋「～」相對的結束（進行表、真相用） */
export function whenText(
  mode: TimeMode,
  e: Pick<VisibleEvent, 'kind' | 'start' | 'end' | 'ongoing'>,
  ctx: EraArg,
): string {
  const a = readTime(mode, e.start, ctx);
  if (!a) return '';
  const head = formatLong(mode, a, ctx);
  if (e.kind === 'point') return head;
  if (e.ongoing) return `${head}～（進行中）`;
  const b = readTime(mode, e.end, ctx);
  return b ? `${head}～${endText(mode, a, b, ctx)}` : head;
}

/** 真相（F116）：和證詞的時間不同時寫時間 */
function truthOf(
  mode: TimeMode,
  e: VisibleEvent,
  truth: VisibleEvent | undefined,
  ctx: EraArg,
  untitled: string,
): ChronTruth | undefined {
  if (!truth) return undefined;
  const same = truth.start === e.start && truth.end === e.end && truth.kind === e.kind;
  return {
    title: truth.title.trim() || untitled,
    time: same ? '' : whenText(mode, truth, ctx),
    place: truth.place.trim(),
  };
}

export function chronicle(
  vdoc: VisibleDoc,
  untitled: string,
  fallbackTitle: string,
  options: ChronicleOptions = {},
): Chronicle {
  const { mode } = vdoc;
  /* 曆名與架空曆 */
  const era: EraArg = vdoc;
  const info = mode === 'year' ? ctxParts(era).info : null;
  const ses = mode === 'day' ? sessionOf(era) : null;
  const laneOrder = new Map(vdoc.lanes.map((l, i) => [l.id, i]));
  const truths = new Map((vdoc.truths ?? []).map((t) => [t.truthOf ?? '', t]));
  const list: Sortable[] = [];
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let loTv: Tv | null = null;
  let hiTv: Tv | null = null;
  for (const [idx, e] of vdoc.events.entries()) {
    const a = readTime(mode, e.start, era);
    if (!a) continue;
    const isRange = e.kind !== 'point';
    const endTv = isRange ? readTime(mode, e.end, era) : null;
    const span = eventSpan(mode, e, era);
    let time = startText(mode, a, info, ses);
    let fullTime = formatLong(mode, a, era);
    if (isRange) {
      const tail = e.ongoing ? '（進行中）' : endTv ? endText(mode, a, endTv, era) : '';
      time = `${time}～${tail}`;
      fullTime = `${fullTime}～${e.ongoing ? '（進行中）' : endTv ? formatLong(mode, endTv, era) : ''}`;
    }
    const lane = vdoc.lanes.find((l) => l.id === e.laneId);
    const cat = vdoc.categories.find((c) => c.id === e.categoryId);
    if (a.v < lo) {
      lo = a.v;
      loTv = a;
    }
    const last = endTv && !e.ongoing ? endTv : a;
    const lastEnd = afterUnit(mode, last, era);
    if (lastEnd > hi) {
      hi = lastEnd;
      hiTv = last;
    }
    list.push({
      row: {
        kind: 'event',
        id: e.id,
        time,
        fullTime,
        title: e.title.trim() || untitled,
        laneName: lane?.name.trim() || (lane ? untitled : ''),
        laneColor: lane?.color ?? '',
        categoryName: cat?.name ?? '',
        categoryColor: cat?.color ?? '',
        place: e.place,
        people: e.people,
        description: e.description,
        gmNote: e.gmNote,
        gm: e.gm,
        secret: e.secret,
        background: e.kind === 'background',
        ongoing: !!e.ongoing,
        color: eventColor(vdoc, e),
        links: [],
        when: whenText(mode, e, era),
        ...(e.scope && !e.masked ? { face: e.scope } : {}),
        ...(e.scope ? { truth: truthOf(mode, e, truths.get(e.id), era, untitled) } : {}),
        ...(e.opened ? { opened: true } : {}),
      },
      v: a.v,
      rank: RANK[a.p],
      endV: span?.b ?? a.v,
      lane: e.laneId ? (laneOrder.get(e.laneId) ?? -1) : -1,
      marker: 0,
      idx,
      section: sectionOf(mode, a, era),
    });
  }
  for (const [idx, m] of vdoc.markers.entries()) {
    const t = readTime(mode, m.time, era);
    if (!t) continue;
    if (t.v < lo) {
      lo = t.v;
      loTv = t;
    }
    if (afterUnit(mode, t, era) > hi) {
      hi = afterUnit(mode, t, era);
      hiTv = t;
    }
    list.push({
      row: {
        kind: 'marker',
        id: m.id,
        time: startText(mode, t, info, ses),
        fullTime: formatLong(mode, t, era),
        title: m.label.trim() || untitled,
        laneName: '',
        laneColor: '',
        categoryName: '',
        categoryColor: '',
        place: '',
        people: [],
        description: '',
        gmNote: '',
        gm: m.gm,
        secret: m.secret,
        background: false,
        ongoing: false,
        color: m.color,
        links: [],
      },
      v: t.v,
      rank: RANK[t.p],
      endV: t.v,
      lane: 0,
      marker: 1,
      idx,
      section: sectionOf(mode, t, era),
    });
  }
  /* 泳道的退場時刻（F121）：排在同一時間的標記後面 */
  for (const [idx, l] of vdoc.lanes.entries()) {
    if (!l.exit) continue;
    const t = readTime(mode, l.exit.time, era);
    if (!t) continue;
    if (t.v < lo) {
      lo = t.v;
      loTv = t;
    }
    if (afterUnit(mode, t, era) > hi) {
      hi = afterUnit(mode, t, era);
      hiTv = t;
    }
    list.push({
      row: {
        kind: 'exit',
        id: `exit:${l.id}`,
        laneId: l.id,
        time: startText(mode, t, info, ses),
        fullTime: formatLong(mode, t, era),
        when: formatLong(mode, t, era),
        title: l.exit.label.trim(),
        laneName: l.name.trim() || untitled,
        laneColor: l.color,
        categoryName: '',
        categoryColor: '',
        place: '',
        people: [],
        description: '',
        gmNote: '',
        gm: false,
        secret: false,
        background: false,
        ongoing: false,
        color: l.color,
        links: [],
      },
      v: t.v,
      rank: RANK[t.p],
      endV: t.v,
      lane: idx,
      marker: 2,
      idx,
      section: sectionOf(mode, t, era),
    });
  }
  list.sort(
    (p, q) =>
      p.v - q.v ||
      p.rank - q.rank ||
      p.marker - q.marker ||
      p.endV - q.endV ||
      p.lane - q.lane ||
      p.idx - q.idx,
  );
  if (options.links) addLinks(vdoc, list);
  const sections: ChronSection[] = [];
  for (const it of list) {
    const last = sections[sections.length - 1];
    if (last && last.key === it.section.key) last.rows.push(it.row);
    else sections.push({ ...it.section, rows: [it.row] });
  }
  const from = loTv as Tv | null;
  const to = hiTv as Tv | null;
  let range = '';
  if (from && to)
    range =
      from.v === to.v && from.p === to.p
        ? formatLong(mode, from, era)
        : `${formatLong(mode, from, era)}～${formatLong(mode, to, era)}`;
  const povLane = vdoc.pov ? vdoc.lanes.find((l) => l.id === vdoc.pov) : undefined;
  return {
    title: vdoc.title.trim() || fallbackTitle,
    ...(povLane ? { povName: povLane.name.trim() || untitled } : {}),
    range,
    sections,
    count: list.length,
  };
}

/**
 * 每個事件下面的關聯線（F111）：兩端都在年表裡的線（PL 版本來就沒有 GM 專用的線與一端看不到的線；
 * 篩選中只有兩端都符合的線），從那一端看的方向；依另一端在年表上的順序。
 */
function addLinks(vdoc: VisibleDoc, list: Sortable[]): void {
  const order = new Map<string, number>();
  const rows = new Map<string, ChronRow>();
  for (const [i, it] of list.entries())
    if (it.row.kind === 'event') {
      order.set(it.row.id, i);
      rows.set(it.row.id, it.row);
    }
  for (const k of vdoc.links) {
    const a = rows.get(k.from);
    const b = rows.get(k.to);
    if (!a || !b || a === b) continue;
    const both = k.kind !== 'cause';
    const base = { kind: k.kind, note: k.note.trim(), secret: k.secret };
    a.links.push({ ...base, dir: both ? 'both' : 'out', otherId: b.id, other: b.title });
    b.links.push({ ...base, dir: both ? 'both' : 'in', otherId: a.id, other: a.title });
  }
  for (const r of rows.values())
    if (r.links.length > 1)
      r.links.sort((p, q) => (order.get(p.otherId) ?? 0) - (order.get(q.otherId) ?? 0));
}

const LINK_ARROW: Record<ChronLink['dir'], string> = { out: '→', in: '←', both: '⇄' };
const LINK_WORD: Record<LinkKind, string> = {
  cause: '導致',
  same: '同時',
  conflict: '矛盾',
  related: '相關',
};

/** 一行裡的文字：連續的空白（含換行）換成一個空白 */
const oneLine = (t: string) => t.replace(/\s+/g, ' ').trim();

/**
 * 一條關聯線的文字：「→ 導致：抵達黑水灣車站（說明）」「← 起因：委託信寄出」「⇄ 矛盾：…」。
 * 標題、說明裡的換行換成空白（CSV 讀入或手改的專案檔可能有換行；一條線一行）。
 */
export function linkText(l: ChronLink): string {
  const word = l.kind === 'cause' && l.dir === 'in' ? '起因' : LINK_WORD[l.kind];
  const note = oneLine(l.note);
  return `${LINK_ARROW[l.dir]} ${word}：${oneLine(l.other)}${note ? `（${note}）` : ''}`;
}

/* ---------- 文字 ---------- */

const IND = '　　';

function detailLines(r: ChronRow): string[] {
  const parts: string[] = [];
  if (r.place) parts.push(`地點：${r.place}`);
  if (r.people.length) parts.push(`相關角色：${r.people.join('、')}`);
  return parts.length ? [parts.join('／')] : [];
}

const lines = (t: string) =>
  t
    .split(/\r?\n/)
    .map((x) => x.trimEnd())
    .filter((x, i, all) => x || (i > 0 && i < all.length - 1));

/** 公開範圍的小標（F116～F119）：證詞、伏字（知道真相時）、調查後公開 */
export const FACE_TAG: Record<'alibi' | 'redacted', string> = { alibi: '證詞', redacted: '伏字' };
export const OPENED_TAG = '調查後公開';

function faceTags(r: ChronRow): string[] {
  const tags: string[] = [];
  if (r.face) tags.push(FACE_TAG[r.face]);
  if (r.opened) tags.push(OPENED_TAG);
  return tags;
}

function rowTags(r: ChronRow, gm: boolean, lane = true): string {
  const tags: string[] = [];
  if (lane && r.laneName) tags.push(r.laneName);
  if (r.categoryName) tags.push(r.categoryName);
  if (r.background) tags.push('背景');
  if (gm && r.gm) tags.push('GM 專用');
  tags.push(...faceTags(r));
  return tags.map((t) => `〔${t}〕`).join('');
}

/** 真相的一行（F116）：「〔真相〕從後樓梯進書房（21:10～21:30／地點：書房）」 */
export function truthLine(t: ChronTruth): string {
  const extra = [t.time, t.place ? `地點：${t.place}` : ''].filter(Boolean);
  return `〔真相〕${oneLine(t.title)}${extra.length ? `（${extra.map(oneLine).join('／')}）` : ''}`;
}

/** 退場的一行（F121）：「館主 退場（死亡）」 */
export function exitText(r: Pick<ChronRow, 'laneName' | 'title'>): string {
  return `${r.laneName} 退場${r.title ? `（${r.title}）` : ''}`;
}

/** 標題後面的對象：GM 用、人物別 */
function audienceSuffix(ch: { povName?: string }, gm: boolean, md = false): string {
  if (gm) return md ? '（GM 用）' : '〔GM 用〕';
  if (ch.povName) return md ? `（${ch.povName} 視角）` : `〔${ch.povName} 視角〕`;
  return '';
}

/** 一筆事件的細節（純文字；縮排在 ind 之後）：地點與角色、說明、真相、關聯線、GM 筆記 */
function textDetails(r: ChronRow, gm: boolean, ind: string): string[] {
  const out: string[] = [];
  for (const l of detailLines(r)) out.push(ind + l);
  for (const l of lines(r.description)) out.push(ind + l);
  if (r.truth) out.push(ind + truthLine(r.truth));
  for (const k of r.links) out.push(`${ind}${linkText(k)}${gm && k.secret ? '〔GM 專用〕' : ''}`);
  if (gm && r.gmNote.trim()) {
    const note = lines(r.gmNote);
    for (const [i, l] of note.entries()) out.push(ind + (i === 0 ? `〔GM 筆記〕${l}` : l));
  }
  return out;
}

/** 純文字年表（規格 3.7） */
export function chronicleText(ch: Chronicle, audience: 'gm' | 'pl'): string {
  const gm = audience === 'gm';
  const out: string[] = [`${ch.title}${audienceSuffix(ch, gm)}`];
  if (ch.range) out.push(ch.range);
  for (const s of ch.sections) {
    /* 倒數不分段（標題空白，F126） */
    out.push('');
    if (s.heading) out.push(`■ ${s.heading}`);
    for (const r of s.rows) {
      const time = r.time ? `${r.time}　` : '';
      if (r.kind === 'marker') {
        out.push(`◆ ${time}${r.title}（標記）${gm && r.gm ? '〔GM 專用〕' : ''}`);
        continue;
      }
      if (r.kind === 'exit') {
        out.push(`◇ ${time}${exitText(r)}`);
        continue;
      }
      out.push(`・${time}${r.title}${rowTags(r, gm)}`);
      out.push(...textDetails(r, gm, IND));
    }
  }
  return `${out.join('\n')}\n`;
}

/** Markdown 的特殊字元跳脫 */
export function mdEscape(t: string): string {
  return t.replace(/([\\`*_[\]<>#|~])/g, '\\$1');
}

/** 一筆事件（Markdown）：標題那一行與子項目 */
function mdRow(r: ChronRow, gm: boolean, head: string, lane = true): string[] {
  const out: string[] = [];
  const tags: string[] = [];
  if (lane && r.laneName) tags.push(mdEscape(r.laneName));
  if (r.categoryName) tags.push(mdEscape(r.categoryName));
  if (r.background) tags.push('背景');
  const face = faceTags(r)
    .map((t) => `〔${t}〕`)
    .join('');
  out.push(
    `- ${head}${mdEscape(r.title)}${tags.length ? `（${tags.join('・')}）` : ''}${gm && r.gm ? '〔GM 專用〕' : ''}${face}`,
  );
  for (const l of detailLines(r)) out.push(`  - ${mdEscape(l)}`);
  const desc = lines(r.description);
  if (desc.length) {
    out.push(`  - ${mdEscape(desc[0])}`);
    for (const l of desc.slice(1)) out.push(`    ${mdEscape(l)}`);
  }
  if (r.truth) out.push(`  - ${mdEscape(truthLine(r.truth))}`);
  for (const k of r.links)
    out.push(`  - ${mdEscape(linkText(k))}${gm && k.secret ? '〔GM 專用〕' : ''}`);
  if (gm && r.gmNote.trim()) {
    const note = lines(r.gmNote);
    out.push(`  - **GM 筆記**：${mdEscape(note[0] ?? '')}`);
    for (const l of note.slice(1)) out.push(`    ${mdEscape(l)}`);
  }
  return out;
}

export function chronicleMarkdown(ch: Chronicle, audience: 'gm' | 'pl'): string {
  const gm = audience === 'gm';
  const out: string[] = [`# ${mdEscape(ch.title)}${audienceSuffix(ch, gm, true)}`];
  if (ch.range) out.push('', ch.range);
  for (const s of ch.sections) {
    if (s.heading) out.push('', `## ${mdEscape(s.heading)}`, '');
    else out.push('');
    for (const r of s.rows) {
      const time = r.time ? `**${mdEscape(r.time)}** ` : '';
      if (r.kind === 'marker') {
        out.push(`- ◆ ${time}${mdEscape(r.title)}（標記）${gm && r.gm ? '〔GM 專用〕' : ''}`);
        continue;
      }
      if (r.kind === 'exit') {
        out.push(`- ◇ ${time}${mdEscape(exitText(r))}`);
        continue;
      }
      out.push(...mdRow(r, gm, time));
    }
  }
  return `${out.join('\n')}\n`;
}

/* ---------- 列印 ---------- */

export const PRINT_CSS = `
body{font-family:"Noto Sans TC","PingFang TC","Microsoft JhengHei","Noto Sans CJK TC",sans-serif;color:#111;font-size:10.5pt;line-height:1.55}
h1{font-size:17pt;margin:0 0 2pt}
.range{color:#555;margin:0 0 10pt}
h2{font-size:12pt;margin:12pt 0 4pt;padding-bottom:2pt;border-bottom:1px solid #999;break-after:avoid}
ol{list-style:none;margin:0;padding:0}
li{display:grid;grid-template-columns:8.5em 1fr;gap:0 10pt;padding:3pt 0;border-bottom:1px solid #e5e5e5;break-inside:avoid}
.time{color:#333;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.title{font-weight:700}
.tag{display:inline-block;font-size:8.5pt;font-weight:400;border:1px solid #bbb;border-radius:3pt;padding:0 3pt;margin-left:4pt;color:#444}
.tag.gm{border-color:#c08414;color:#8a5a12}
.dot{display:inline-block;width:7pt;height:7pt;border-radius:50%;margin-right:4pt;vertical-align:0}
.meta{color:#444;font-size:9.5pt}
.desc{white-space:pre-wrap}
.note{white-space:pre-wrap;border-left:3pt solid #d99a1e;padding-left:5pt;color:#5a3d06;margin-top:2pt}
li.secret{border-left:3pt solid #d99a1e;padding-left:4pt}
li.marker .title{font-weight:600}
`;

/** 列出關聯線時另外加的樣式（沒有關聯線時列印文件和以前相同） */
const PRINT_LINK_CSS = `.link{color:#444;font-size:9.5pt}
.link.gm{color:#8a5a12}
`;

/** 有真相、退場、調查後公開時另外加的樣式（沒用時列印文件和以前相同；F116、F121） */
const PRINT_FACE_CSS = `.truth{color:#9f1d1d;font-size:9.5pt;border-left:3pt solid #c2410c;padding-left:5pt;margin-top:2pt}
.tag.face{border-color:#c2410c;color:#9f1d1d}
li.exit .title{color:#7f1d1d}
`;

/** 列印用的樣式（年表裡有關聯線時加上關聯線的樣式） */
export function chroniclePrintCss(ch: Chronicle): string {
  const any = ch.sections.some((s) => s.rows.some((r) => r.links.length));
  const face = ch.sections.some((s) =>
    s.rows.some((r) => r.truth || r.face || r.opened || r.kind === 'exit'),
  );
  return PRINT_CSS + (any ? PRINT_LINK_CSS : '') + (face ? PRINT_FACE_CSS : '');
}

/** 列印用的 HTML（一頁；跟著內容換頁） */
export function chronicleHtml(ch: Chronicle, audience: 'gm' | 'pl'): string {
  const gm = audience === 'gm';
  const h = escapeHtml;
  const rows = (s: ChronSection) =>
    s.rows
      .map((r) => {
        if (r.kind === 'exit')
          return `<li class="exit"><span class="time">${h(r.time)}</span><div><span class="title">◇ ${h(exitText(r))}</span></div></li>`;
        const cls = [r.kind === 'marker' ? 'marker' : '', gm && r.secret ? 'secret' : '']
          .filter(Boolean)
          .join(' ');
        const tags: string[] = [];
        if (r.laneName)
          tags.push(
            `<span class="tag"><span class="dot" style="background:${h(r.laneColor || r.color)}"></span>${h(r.laneName)}</span>`,
          );
        if (r.categoryName) tags.push(`<span class="tag">${h(r.categoryName)}</span>`);
        if (r.background) tags.push('<span class="tag">背景</span>');
        if (r.kind === 'marker') tags.push('<span class="tag">標記</span>');
        if (gm && r.gm) tags.push('<span class="tag gm">GM 專用</span>');
        for (const t of faceTags(r)) tags.push(`<span class="tag face">${h(t)}</span>`);
        const meta: string[] = [];
        if (r.place) meta.push(`地點：${h(r.place)}`);
        if (r.people.length) meta.push(`相關角色：${h(r.people.join('、'))}`);
        return `<li${cls ? ` class="${cls}"` : ''}><span class="time">${h(r.time)}</span><div><span class="title">${r.kind === 'marker' ? '◆ ' : ''}${h(r.title)}</span>${tags.join('')}${meta.length ? `<div class="meta">${meta.join('／')}</div>` : ''}${r.description.trim() ? `<div class="desc">${h(r.description.trim())}</div>` : ''}${r.truth ? `<div class="truth">${h(truthLine(r.truth))}</div>` : ''}${r.links.map((k) => `<div class="link${gm && k.secret ? ' gm' : ''}">${h(linkText(k))}${gm && k.secret ? '〔GM 專用〕' : ''}</div>`).join('')}${gm && r.gmNote.trim() ? `<div class="note">GM 筆記：${h(r.gmNote.trim())}</div>` : ''}</div></li>`;
      })
      .join('');
  return `<h1>${h(ch.title)}${h(audienceSuffix(ch, gm, true))}</h1>${ch.range ? `<p class="range">${h(ch.range)}</p>` : ''}${ch.sections
    .map((s) => `${s.heading ? `<h2>${h(s.heading)}</h2>` : ''}<ol>${rows(s)}</ol>`)
    .join('')}`;
}

/* ---------- 進行表（F122：人物・地點別） ---------- */

export interface LaneSection {
  /** 泳道 id；主線是空字串 */
  key: string;
  name: string;
  color: string;
  /** 退場（「21:30 退場（死亡）」；沒有時空字串） */
  exit: string;
  rows: ChronRow[];
}

export interface LaneReport {
  title: string;
  povName?: string;
  range: string;
  lanes: LaneSection[];
}

/**
 * 人物・地點別的進行表：每條泳道一段（主線有事件時在最上面；子泳道接在上層後面），
 * 段裡依時間排，時間寫完整的（不分日子的段）。沒有事件的泳道寫「（沒有紀錄）」。標記不列（退場寫在段的標題）。
 */
export function laneReport(
  ch: Chronicle,
  vdoc: VisibleDoc,
  main: string,
  untitled: string,
): LaneReport {
  const rows = ch.sections.flatMap((s) => s.rows);
  const byLane = new Map<string, ChronRow[]>();
  const laneIds = new Set(vdoc.lanes.map((l) => l.id));
  const events = new Map(vdoc.events.map((e) => [e.id, e]));
  for (const r of rows) {
    if (r.kind !== 'event') continue;
    const e = events.get(r.id);
    const key = e?.laneId && laneIds.has(e.laneId) ? e.laneId : '';
    const list = byLane.get(key) ?? [];
    list.push(r);
    byLane.set(key, list);
  }
  const order: VisibleDoc['lanes'] = [];
  for (const l of vdoc.lanes) {
    if (l.parentId && laneIds.has(l.parentId)) continue;
    order.push(l);
    for (const c of vdoc.lanes) if (c.parentId === l.id) order.push(c);
  }
  const out: LaneSection[] = [];
  if (byLane.get('')?.length)
    out.push({ key: '', name: main, color: '', exit: '', rows: byLane.get('') ?? [] });
  for (const l of order) {
    const exitRow = rows.find((r) => r.kind === 'exit' && r.laneId === l.id);
    out.push({
      key: l.id,
      name: l.name.trim() || untitled,
      color: l.color,
      exit: exitRow
        ? `${exitRow.when ?? exitRow.fullTime} 退場${exitRow.title ? `（${exitRow.title}）` : ''}`
        : '',
      rows: byLane.get(l.id) ?? [],
    });
  }
  return {
    title: ch.title,
    ...(ch.povName ? { povName: ch.povName } : {}),
    range: ch.range,
    lanes: out,
  };
}

const NO_RECORD = '（沒有紀錄）';

/** 進行表的純文字 */
export function laneReportText(rep: LaneReport, audience: 'gm' | 'pl'): string {
  const gm = audience === 'gm';
  const out: string[] = [`${rep.title}${audienceSuffix(rep, gm)}`];
  if (rep.range) out.push(rep.range);
  for (const l of rep.lanes) {
    out.push('', `■ ${l.name}${l.exit ? `　${l.exit}` : ''}`);
    if (!l.rows.length) out.push(NO_RECORD);
    for (const r of l.rows) {
      out.push(`・${r.when ? `${r.when}　` : ''}${r.title}${rowTags(r, gm, false)}`);
      out.push(...textDetails(r, gm, IND));
    }
  }
  return `${out.join('\n')}\n`;
}

/** 進行表的 Markdown */
export function laneReportMarkdown(rep: LaneReport, audience: 'gm' | 'pl'): string {
  const gm = audience === 'gm';
  const out: string[] = [`# ${mdEscape(rep.title)}${audienceSuffix(rep, gm, true)}`];
  if (rep.range) out.push('', rep.range);
  for (const l of rep.lanes) {
    out.push('', `## ${mdEscape(l.name)}${l.exit ? `（${mdEscape(l.exit)}）` : ''}`, '');
    if (!l.rows.length) out.push(NO_RECORD);
    for (const r of l.rows)
      out.push(...mdRow(r, gm, r.when ? `**${mdEscape(r.when)}** ` : '', false));
  }
  return `${out.join('\n')}\n`;
}
