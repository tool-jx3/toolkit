/**
 * iCalendar（.ics，RFC 5545）的匯出與讀入（規格 3.7.3、3.7.4）。
 *
 * 匯出：每一筆一個 VEVENT——整天的用 `VALUE=DATE`（DTEND 是結束日的隔天）；有時間的換成 UTC（`…Z`），
 * 結束時間比開始早＝過了午夜。分類（CATEGORIES）是所屬的行事曆，狀態 TENTATIVE／CONFIRMED，說明裡寫系統、GM、參加者、
 * 連結與準備事項；另外把整筆資料放在 `X-TRPG-CALENDAR`（本工具讀回時完整還原，其他行事曆 App 會忽略）。
 * 文字照規定跳脫（\\ \; \, \n），每行超過 75 位元組時折行。
 *
 * 讀入：Google 日曆等匯出的 .ics——展開折行、日期（整天、UTC、TZID、浮動時間）、行事曆名稱（X-WR-CALNAME，
 * 沒有時用分類、再沒有用檔名）；取消的（STATUS:CANCELLED）略過，重複的（RRULE）只讀第一次並計數。
 */
import { addDays, dayNumber } from '@/core/holidays';
import { pad2 } from './dates';
import {
  type Entry,
  type EntryKind,
  entryTitle,
  newEntry,
  normalizeEntry,
  PLAN_COLOR,
  SESSION_COLOR,
} from './model';

/* ---------- 文字 ---------- */

export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

export function unescapeText(text: string): string {
  return text.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

const encoder = new TextEncoder();

/** 一行超過 75 位元組時折行（CRLF＋一個空白；不切開一個字） */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = encoder.encode(ch).length;
    const limit = out.length ? 74 : 75;
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/* ---------- 時間 ---------- */

const compactDate = (date: string) => date.replace(/-/g, '');

/** 本地日期＋時間 → UTC 的 `YYYYMMDDTHHMMSSZ` */
function utcStamp(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const t = new Date(y, m - 1, d, hh, mm, 0);
  return `${t.getUTCFullYear()}${pad2(t.getUTCMonth() + 1)}${pad2(t.getUTCDate())}T${pad2(t.getUTCHours())}${pad2(t.getUTCMinutes())}00Z`;
}

/** 匯出的時刻（DTSTAMP） */
function nowStamp(now: Date): string {
  return `${now.getUTCFullYear()}${pad2(now.getUTCMonth() + 1)}${pad2(now.getUTCDate())}T${pad2(now.getUTCHours())}${pad2(now.getUTCMinutes())}${pad2(now.getUTCSeconds())}Z`;
}

/* ---------- 匯出 ---------- */

const STATUS_TEXT: Record<Entry['status'], string> = {
  scheduled: '確定',
  tentative: '調整中',
  completed: '完成',
};

/** 說明欄：備註，場次另加系統、GM、形式、參加者、連結與準備事項 */
export function describeEntry(e: Entry): string {
  const lines: string[] = [];
  if (e.kind === 'session') {
    if (e.system) lines.push(`系統：${e.system}`);
    if (e.gm) lines.push(`GM／KP：${e.gm}`);
    if (e.format) lines.push(`形式：${e.format}`);
    lines.push(`狀態：${STATUS_TEXT[e.status]}`);
    if (e.players.length)
      lines.push(
        `參加者：${e.players.map((p) => (p.pc ? `${p.pl}（${p.pc}）` : p.pl)).join('、')}`,
      );
    for (const l of e.links) if (l.url) lines.push(`${l.label || '連結'}：${l.url}`);
    for (const t of e.tasks)
      lines.push(`${t.done ? '☑' : '☐'} ${t.title}${t.due ? `（${t.due}）` : ''}`);
    if (e.tags.length) lines.push(e.tags.map((t) => `#${t}`).join(' '));
  }
  if (e.memo.trim()) {
    if (lines.length) lines.push('');
    lines.push(e.memo.trim());
  }
  return lines.join('\n');
}

/** 一筆 → VEVENT 的各行（還沒折行） */
function eventLines(e: Entry, stamp: string): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${e.id}@trpg-toolkit`, `DTSTAMP:${stamp}`];
  lines.push(`SUMMARY:${escapeText(entryTitle(e))}`);
  if (e.startTime) {
    lines.push(`DTSTART:${utcStamp(e.start, e.startTime)}`);
    if (e.endTime) {
      /* 結束日的結束時間；同一天而且比開始早＝過了午夜 */
      const endDate = e.end === e.start && e.endTime <= e.startTime ? addDays(e.end, 1) : e.end;
      lines.push(`DTEND:${utcStamp(endDate, e.endTime)}`);
    } else if (e.end !== e.start) {
      lines.push(`DTEND:${utcStamp(addDays(e.end, 1), '00:00')}`);
    }
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(e.start)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(e.end, 1))}`);
  }
  if (e.calendar) lines.push(`CATEGORIES:${escapeText(e.calendar)}`);
  if (e.kind === 'session')
    lines.push(`STATUS:${e.status === 'tentative' ? 'TENTATIVE' : 'CONFIRMED'}`);
  const desc = describeEntry(e);
  if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
  const data = { ...e };
  delete data.sample;
  lines.push(`X-TRPG-CALENDAR:${escapeText(JSON.stringify(data))}`);
  lines.push('END:VEVENT');
  return lines;
}

export function exportIcal(
  entries: readonly Entry[],
  { title, now = new Date() }: { title: string; now?: Date },
): string {
  const stamp = nowStamp(now);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//TRPG Toolkit//session-calendar//ZH-TW',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  if (title.trim()) lines.push(`X-WR-CALNAME:${escapeText(title.trim())}`);
  for (const e of entries) lines.push(...eventLines(e, stamp));
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/* ---------- 讀入 ---------- */

export interface IcalProperty {
  name: string;
  params: Record<string, string>;
  value: string;
}

/** 展開折行、拆成屬性 */
export function parseIcalLines(text: string): IcalProperty[] {
  const unfolded = text.replace(/^﻿/, '').replace(/\r?\n[ \t]/g, '');
  const out: IcalProperty[] = [];
  for (const raw of unfolded.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line) continue;
    /* 名稱;參數=值;參數="值":內容（參數的引號裡可以有冒號） */
    let i = 0;
    let inQuote = false;
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQuote = !inQuote;
      else if (c === ':' && !inQuote) break;
    }
    if (i >= line.length) continue;
    const head = line.slice(0, i);
    const value = line.slice(i + 1);
    const parts = head.match(/(?:[^;"]|"[^"]*")+/g) ?? [head];
    const params: Record<string, string> = {};
    for (const p of parts.slice(1)) {
      const eq = p.indexOf('=');
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, '');
    }
    out.push({ name: parts[0].toUpperCase(), params, value });
  }
  return out;
}

interface WallTime {
  date: string;
  /** `HH:MM`；整天時空字串 */
  time: string;
}

/** 某個時區的牆上時間 → UTC 毫秒（用 Intl 求那一刻的時差，算兩次讓夏令時間邊界也對） */
function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, tz: string): number {
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offsetAt = (ms: number) => {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
    });
    const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute) - ms;
  };
  let t = guess - offsetAt(guess);
  t = guess - offsetAt(t);
  return t;
}

const localWall = (ms: number): WallTime => {
  const t = new Date(ms);
  return {
    date: `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(t.getDate())}`,
    time: `${pad2(t.getHours())}:${pad2(t.getMinutes())}`,
  };
};

/** DTSTART／DTEND 的值 → 本機的日期與時間；看不懂時 null */
export function parseIcalTime(prop: IcalProperty | undefined): WallTime | null {
  if (!prop) return null;
  const v = prop.value.trim();
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
  if (!m) return null;
  const [, y, mo, d, hh, mi, , z] = m;
  const date = `${y}-${mo}-${d}`;
  if (prop.params.VALUE === 'DATE' || hh === undefined) return { date, time: '' };
  if (z) return localWall(Date.UTC(+y, +mo - 1, +d, +hh, +mi));
  const tz = prop.params.TZID;
  if (tz) {
    try {
      return localWall(zonedToUtc(+y, +mo, +d, +hh, +mi, tz));
    } catch {
      /* 不認得的時區：當成本機時間 */
    }
  }
  return { date, time: `${hh}:${mi}` };
}

/** DURATION（P1D、PT2H30M、P1DT2H）→ 分鐘 */
export function parseDuration(v: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(
    v.trim(),
  );
  if (!m) return null;
  const [, sign, w, d, h, mi] = m;
  const total = ((+(w ?? 0) * 7 + +(d ?? 0)) * 24 + +(h ?? 0)) * 60 + +(mi ?? 0);
  return sign === '-' ? -total : total;
}

export interface IcalImport {
  entries: Entry[];
  /** 從本工具的 X-TRPG-CALENDAR 完整還原的筆（讀成場次／預定的選項不改它們） */
  restored: Set<string>;
  /** 重複的預定（只讀了第一次） */
  recurring: number;
  /** 略過的（取消的、日期看不懂的） */
  skipped: number;
}

/**
 * 讀入 .ics 的文字。`fallbackName` 是檔名（沒有行事曆名稱、分類時用）。
 * 讀成哪一種：有時間的當場次、整天的當預定（之後可以在讀入對話框改）。
 */
export function parseIcal(text: string, fallbackName = 'iCal'): IcalImport {
  const props = parseIcalLines(text);
  const result: IcalImport = { entries: [], restored: new Set(), recurring: 0, skipped: 0 };
  let calName = '';
  let event: IcalProperty[] | null = null;
  let nested = 0;
  for (const p of props) {
    if (p.name === 'BEGIN') {
      if (p.value.toUpperCase() === 'VEVENT' && !event) event = [];
      else if (event) nested++;
      continue;
    }
    if (p.name === 'END') {
      if (event && nested) nested--;
      else if (event && p.value.toUpperCase() === 'VEVENT') {
        const entry = eventToEntry(event, calName, fallbackName, result);
        if (entry) result.entries.push(entry);
        event = null;
      }
      continue;
    }
    if (event) {
      if (!nested) event.push(p);
    } else if (p.name === 'X-WR-CALNAME' && !calName) calName = unescapeText(p.value).trim();
  }
  return result;
}

function eventToEntry(
  props: IcalProperty[],
  calName: string,
  fallbackName: string,
  result: IcalImport,
): Entry | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const text = (name: string) => unescapeText(get(name)?.value ?? '').trim();
  if (text('STATUS').toUpperCase() === 'CANCELLED') {
    result.skipped++;
    return null;
  }
  const own = get('X-TRPG-CALENDAR');
  if (own) {
    try {
      const restored = normalizeEntry(JSON.parse(unescapeText(own.value)));
      if (restored) {
        result.restored.add(restored.id);
        if (get('RRULE')) result.recurring++;
        return restored;
      }
    } catch {
      /* 壞掉時照一般的事件讀 */
    }
  }
  const start = parseIcalTime(get('DTSTART'));
  if (!start) {
    result.skipped++;
    return null;
  }
  let end: WallTime | null = parseIcalTime(get('DTEND'));
  if (!end) {
    const dur = get('DURATION') ? parseDuration(get('DURATION')?.value ?? '') : null;
    if (dur !== null) {
      if (!start.time)
        end = { date: addDays(start.date, Math.max(1, Math.round(dur / 1440))), time: '' };
      else {
        const [h, m] = start.time.split(':').map(Number);
        const total = h * 60 + m + dur;
        const days = Math.floor(total / 1440);
        const rest = ((total % 1440) + 1440) % 1440;
        end = {
          date: addDays(start.date, days),
          time: `${pad2(Math.floor(rest / 60))}:${pad2(rest % 60)}`,
        };
      }
    }
  }
  if (get('RRULE')) result.recurring++;
  const allDay = !start.time;
  let endDate = start.date;
  let endTime = '';
  if (end) {
    if (allDay) endDate = end.time ? end.date : addDays(end.date, -1);
    else {
      endTime = end.time;
      /* 結束在隔天 00:00（或過了午夜的同一晚）：日子算到開始那天 */
      const nextDay = addDays(start.date, 1);
      if (end.date === nextDay && end.time <= start.time) endDate = start.date;
      else if (end.date > start.date && end.time === '00:00') {
        endDate = addDays(end.date, -1);
        endTime = '';
      } else endDate = end.date;
    }
  }
  if (dayNumber(endDate) < dayNumber(start.date)) endDate = start.date;
  const categories = text('CATEGORIES').split(',')[0]?.trim() ?? '';
  const kind: EntryKind = allDay ? 'plan' : 'session';
  const desc = text('DESCRIPTION');
  const location = text('LOCATION');
  const memo = [desc, location ? `地點：${location}` : ''].filter(Boolean).join('\n');
  const status = text('STATUS').toUpperCase();
  return newEntry(kind, start.date, {
    title: text('SUMMARY'),
    end: endDate,
    startTime: start.time,
    endTime,
    memo,
    calendar: calName || categories || fallbackName,
    status: status === 'TENTATIVE' ? 'tentative' : 'scheduled',
  });
}

/** 讀入對話框的「讀成」：auto（有時間的當場次）、session、plan；本工具還原的不改 */
export function convertKinds(
  entries: readonly Entry[],
  restored: ReadonlySet<string>,
  as: 'auto' | EntryKind,
): Entry[] {
  return entries.map((e) => {
    if (restored.has(e.id)) return e;
    const kind: EntryKind = as === 'auto' ? (e.startTime ? 'session' : 'plan') : as;
    if (kind === e.kind) return e;
    return {
      ...e,
      kind,
      color: { ...e.color, c1: kind === 'session' ? SESSION_COLOR : PLAN_COLOR },
    };
  });
}
