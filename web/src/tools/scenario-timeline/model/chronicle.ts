/**
 * 年表（規格 F50～F54、3.7）：依時間排的清單、分段；純文字、Markdown、列印用的 HTML。純計算。
 * 第三批：每個事件下面列它的關聯線（F111：「→ 導致：…」「← 起因：…」「⇄ 矛盾：…」）；架空曆的時刻（F110）。
 */
import { escapeHtml } from '@/core/html';
import { type CalInfo, calParts, monthName, valueOfDay } from './calendar';
import { eventSpan } from './layout';
import type { LinkKind } from './links';
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
  type TimeMode,
  type Tv,
  yearLabel,
} from './time';
import { eventColor } from './types';
import type { VisibleDoc } from './visible';

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

export interface ChronRow {
  kind: 'event' | 'marker';
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
}

export interface ChronSection {
  key: string;
  heading: string;
  rows: ChronRow[];
}

export interface Chronicle {
  title: string;
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
    const n = dayNumber(tv.v);
    return { key: `d${n}`, heading: `第 ${n} 天` };
  }
  const d = dateParts(tv.v);
  if (tv.p === 'year') return { key: `y${d.y}`, heading: `${d.y}年` };
  if (tv.p === 'month') return { key: `m${d.y}-${d.m}`, heading: `${d.y}年${d.m}月` };
  return { key: `d${d.days}`, heading: dateLabel(tv.v) };
}

/**
 * 段裡的開始時間：寫到分＝時刻；只到日＝「整天」（時間點與期間的開始相同：「整天～3月14日」）；只到月、年＝不寫。
 * 架空年不寫；架空曆打開「寫到時刻」時和日期時間相同（F110）。
 */
function startText(mode: TimeMode, tv: Tv, info: CalInfo | null = null): string {
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
function endText(mode: TimeMode, start: Tv, end: Tv, ctx: EraArg): string {
  const { era, info } = ctxParts(ctx);
  if (mode === 'year') return info ? calEndText(info, start, end, era) : yearLabel(end.v, era);
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
  const laneOrder = new Map(vdoc.lanes.map((l, i) => [l.id, i]));
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
    let time = startText(mode, a, info);
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
        time: startText(mode, t, info),
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
  return {
    title: vdoc.title.trim() || fallbackTitle,
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

function rowTags(r: ChronRow, gm: boolean): string {
  const tags: string[] = [];
  if (r.laneName) tags.push(r.laneName);
  if (r.categoryName) tags.push(r.categoryName);
  if (r.background) tags.push('背景');
  if (gm && r.gm) tags.push('GM 專用');
  return tags.map((t) => `〔${t}〕`).join('');
}

/** 純文字年表（規格 3.7） */
export function chronicleText(ch: Chronicle, audience: 'gm' | 'pl'): string {
  const gm = audience === 'gm';
  const out: string[] = [`${ch.title}${gm ? '〔GM 用〕' : ''}`];
  if (ch.range) out.push(ch.range);
  for (const s of ch.sections) {
    out.push('', `■ ${s.heading}`);
    for (const r of s.rows) {
      const time = r.time ? `${r.time}　` : '';
      if (r.kind === 'marker') {
        out.push(`◆ ${time}${r.title}（標記）${gm && r.gm ? '〔GM 專用〕' : ''}`);
        continue;
      }
      out.push(`・${time}${r.title}${rowTags(r, gm)}`);
      for (const l of detailLines(r)) out.push(IND + l);
      for (const l of lines(r.description)) out.push(IND + l);
      for (const k of r.links)
        out.push(`${IND}${linkText(k)}${gm && k.secret ? '〔GM 專用〕' : ''}`);
      if (gm && r.gmNote.trim()) {
        const note = lines(r.gmNote);
        for (const [i, l] of note.entries()) out.push(IND + (i === 0 ? `〔GM 筆記〕${l}` : l));
      }
    }
  }
  return `${out.join('\n')}\n`;
}

/** Markdown 的特殊字元跳脫 */
export function mdEscape(t: string): string {
  return t.replace(/([\\`*_[\]<>#|~])/g, '\\$1');
}

export function chronicleMarkdown(ch: Chronicle, audience: 'gm' | 'pl'): string {
  const gm = audience === 'gm';
  const out: string[] = [`# ${mdEscape(ch.title)}${gm ? '（GM 用）' : ''}`];
  if (ch.range) out.push('', ch.range);
  for (const s of ch.sections) {
    out.push('', `## ${mdEscape(s.heading)}`, '');
    for (const r of s.rows) {
      const time = r.time ? `**${mdEscape(r.time)}** ` : '';
      if (r.kind === 'marker') {
        out.push(`- ◆ ${time}${mdEscape(r.title)}（標記）${gm && r.gm ? '〔GM 專用〕' : ''}`);
        continue;
      }
      const tags: string[] = [];
      if (r.laneName) tags.push(mdEscape(r.laneName));
      if (r.categoryName) tags.push(mdEscape(r.categoryName));
      if (r.background) tags.push('背景');
      out.push(
        `- ${time}${mdEscape(r.title)}${tags.length ? `（${tags.join('・')}）` : ''}${gm && r.gm ? '〔GM 專用〕' : ''}`,
      );
      for (const l of detailLines(r)) out.push(`  - ${mdEscape(l)}`);
      const desc = lines(r.description);
      if (desc.length) {
        out.push(`  - ${mdEscape(desc[0])}`);
        for (const l of desc.slice(1)) out.push(`    ${mdEscape(l)}`);
      }
      for (const k of r.links)
        out.push(`  - ${mdEscape(linkText(k))}${gm && k.secret ? '〔GM 專用〕' : ''}`);
      if (gm && r.gmNote.trim()) {
        const note = lines(r.gmNote);
        out.push(`  - **GM 筆記**：${mdEscape(note[0] ?? '')}`);
        for (const l of note.slice(1)) out.push(`    ${mdEscape(l)}`);
      }
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

/** 列印用的樣式（年表裡有關聯線時加上關聯線的樣式） */
export function chroniclePrintCss(ch: Chronicle): string {
  const any = ch.sections.some((s) => s.rows.some((r) => r.links.length));
  return any ? PRINT_CSS + PRINT_LINK_CSS : PRINT_CSS;
}

/** 列印用的 HTML（一頁；跟著內容換頁） */
export function chronicleHtml(ch: Chronicle, audience: 'gm' | 'pl'): string {
  const gm = audience === 'gm';
  const h = escapeHtml;
  const rows = (s: ChronSection) =>
    s.rows
      .map((r) => {
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
        const meta: string[] = [];
        if (r.place) meta.push(`地點：${h(r.place)}`);
        if (r.people.length) meta.push(`相關角色：${h(r.people.join('、'))}`);
        return `<li${cls ? ` class="${cls}"` : ''}><span class="time">${h(r.time)}</span><div><span class="title">${r.kind === 'marker' ? '◆ ' : ''}${h(r.title)}</span>${tags.join('')}${meta.length ? `<div class="meta">${meta.join('／')}</div>` : ''}${r.description.trim() ? `<div class="desc">${h(r.description.trim())}</div>` : ''}${r.links.map((k) => `<div class="link${gm && k.secret ? ' gm' : ''}">${h(linkText(k))}${gm && k.secret ? '〔GM 專用〕' : ''}</div>`).join('')}${gm && r.gmNote.trim() ? `<div class="note">GM 筆記：${h(r.gmNote.trim())}</div>` : ''}</div></li>`;
      })
      .join('');
  return `<h1>${h(ch.title)}${gm ? '（GM 用）' : ''}</h1>${ch.range ? `<p class="range">${h(ch.range)}</p>` : ''}${ch.sections
    .map((s) => `<h2>${h(s.heading)}</h2><ol>${rows(s)}</ol>`)
    .join('')}`;
}
