/**
 * JSON 的匯出與讀入（規格 3.7.1、3.7.2）。
 *
 * 讀得懂：
 * - 本工具匯出的 JSON（`format: 'trpg-toolkit/session-calendar'`）與專案檔（JSON 版）。
 * - 卓準備カレンダー的 JSON（`{ sessions: [...] }` 或場次的陣列）。
 * - taku_calendar 的 JSON（`{ title, events: [...], cpColors }` 或預定的陣列）。
 * - 跑團紀錄簿的 JSON（`{ rows: [...] }`，新舊版都是）：每一團的每一個日期各一個場次。
 * - 交接資料（`{ source, items: [...] }`：卓準備カレンダー送出的、跑團紀錄簿送給團報產生器的）。
 */
import { pairPlayers, splitTags, systemLabel } from '@/core/sessions';
import { isValidDate } from './dates';
import {
  type CalData,
  type CpColor,
  ENTRY_LIMIT,
  type Entry,
  newEntry,
  newId,
  normalizeColor,
  normalizeCpColor,
  normalizeEntry,
  normalizeTime,
  PLAN_COLOR,
  SESSION_CALENDAR,
  type SessionStatus,
  type Task,
} from './model';

export const JSON_FORMAT = 'trpg-toolkit/session-calendar';
export const JSON_VERSION = 1;

export type ImportFormat = 'self' | 'kuma' | 'taku' | 'log' | 'bridge' | 'ical';

export interface ImportBatch {
  format: ImportFormat;
  entries: Entry[];
  cpColors: CpColor[];
  /** taku_calendar 的標題（取代全部時套用） */
  title?: string;
  /** 超過上限、沒讀進來的筆數 */
  dropped: number;
}

export class ImportFormatError extends Error {}

/* ---------- 匯出 ---------- */

export function exportJsonText(data: CalData, now: Date = new Date()): string {
  const entries = data.entries.map((e) => {
    const copy = { ...e };
    delete copy.sample;
    return copy;
  });
  return JSON.stringify(
    {
      format: JSON_FORMAT,
      version: JSON_VERSION,
      exportedAt: now.toISOString(),
      title: data.title,
      entries,
      cpColors: data.cpColors,
    },
    null,
    2,
  );
}

/* ---------- 讀入 ---------- */

const str = (v: unknown): string => (v == null ? '' : String(v));
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** 卓準備カレンダー的狀態 → 本站 */
function kumaStatus(v: unknown): SessionStatus {
  const s = str(v);
  if (s === 'tentative' || s === 'completed' || s === 'scheduled') return s;
  if (/完|completed|済/.test(s)) return 'completed';
  if (/調整|tentative/.test(s)) return 'tentative';
  return 'scheduled';
}

function kumaTasks(v: unknown): Task[] {
  return (Array.isArray(v) ? v : [])
    .map((raw, i): Task | null => {
      const t = obj(raw);
      const title = str(t.title || t.name).trim();
      if (!title) return null;
      const order = Number(t.order);
      const due = str(t.due || t.date);
      return {
        id: str(t.id) || newId('task'),
        title,
        due: isValidDate(due) ? due : '',
        done: Boolean(t.done) || t.status === '完了' || t.status === '完成',
        order: Number.isFinite(order) ? order : (i + 1) * 10,
      };
    })
    .filter((t): t is Task => t !== null);
}

const tagList = (v: unknown): string[] => splitTags(Array.isArray(v) ? v : str(v));

/** 卓準備カレンダーの場次 → 本站的場次 */
export function fromKumaSession(raw: unknown): Entry | null {
  const s = obj(raw);
  const startRaw = str(s.start);
  const date = startRaw.slice(0, 10);
  if (!isValidDate(date)) return null;
  const players = (Array.isArray(s.players) ? s.players : [])
    .map((p) => ({ pl: str(obj(p).pl).trim(), pc: str(obj(p).pc).trim() }))
    .filter((p) => p.pl || p.pc);
  const links = (Array.isArray(s.links) ? s.links : [])
    .map((l) => ({ label: str(obj(l).label).trim(), url: str(obj(l).url).trim() }))
    .filter((l) => l.label || l.url);
  return newEntry('session', date, {
    id: str(s.id) || newId('session'),
    title: str(s.scenario || s.title).trim(),
    startTime: normalizeTime(startRaw.slice(11, 16)),
    endTime: normalizeTime(s.end),
    system: str(s.system).trim(),
    gm: str(s.gm).trim(),
    format: str(s.format).trim(),
    status: kumaStatus(s.status),
    memo: str(s.memo),
    tags: tagList(s.hashtags),
    players,
    links,
    tasks: kumaTasks(s.tasks),
    calendar: str(s.sourceCalendar).trim() || SESSION_CALENDAR,
  });
}

/** taku_calendar 的預定 → 本站的預定 */
export function fromTakuEvent(raw: unknown, calendar: string): Entry | null {
  const e = obj(raw);
  let start = str(e.start);
  let end = str(e.end) || start;
  if (!isValidDate(start)) return null;
  if (!isValidDate(end)) end = start;
  if (end < start) [start, end] = [end, start];
  return newEntry('plan', start, {
    id: str(e.id) || newId('plan'),
    title: str(e.title).trim(),
    end,
    memo: str(e.memo),
    color: normalizeColor(
      { mode: e.colorMode === 'gradient' ? 'gradient' : 'solid', c1: e.color1, c2: e.color2 },
      PLAN_COLOR,
    ),
    calendar,
  });
}

/** 跑團紀錄簿的一團 → 每個日期一個場次（範例列略過） */
export function fromLogRow(raw: unknown): Entry[] {
  const r = obj(raw);
  if (r.sample) return [];
  const dates = [
    ...new Set(
      (Array.isArray(r.dates) && r.dates.length ? r.dates : [r.date]).map(str).filter(isValidDate),
    ),
  ].sort();
  if (!dates.length) return [];
  const players = pairPlayers(r.players, r.pc)
    .map(([pl, pc]) => ({ pl, pc }))
    .filter((p) => p.pl || p.pc);
  const links = [
    ['跑團紀錄', r.sessionUrl],
    ['劇本', r.scenarioUrl],
    ['感想', r.kansouUrl],
  ]
    .filter(([, u]) => str(u).trim())
    .map(([label, u]) => ({ label: str(label), url: str(u).trim() }));
  const status: SessionStatus = r.status === '予定' ? 'scheduled' : 'completed';
  return dates.map((date) =>
    newEntry('session', date, {
      title: str(r.scenario || r.title).trim(),
      startTime: '',
      system: r.system ? systemLabel(r.system) : '',
      gm: str(r.gm).trim(),
      status,
      memo: str(r.note),
      tags: splitTags(r.hashtag ?? ''),
      players,
      links,
      calendar: '跑團紀錄簿',
    }),
  );
}

/** 交接資料的一個項目 → 一個場次 */
export function fromBridgeItem(raw: unknown, calendar: string): Entry | null {
  const it = obj(raw);
  const dates = (Array.isArray(it.dates) ? it.dates : []).map(str).filter(isValidDate).sort();
  const date = isValidDate(str(it.latestDate)) ? str(it.latestDate) : dates[0];
  if (!date) return null;
  const players = (Array.isArray(it.players) ? it.players : [])
    .map((p) => ({ pl: str(obj(p).pl).trim(), pc: str(obj(p).pc).trim() }))
    .filter((p) => p.pl || p.pc);
  const links = (Array.isArray(it.links) ? it.links : [])
    .map((l) => ({ label: str(obj(l).label).trim(), url: str(obj(l).url).trim() }))
    .filter((l) => l.url);
  return newEntry('session', date, {
    title: str(it.scenario || it.title).trim(),
    startTime: normalizeTime(it.startTime),
    endTime: normalizeTime(it.endTime),
    system: str(it.system).trim(),
    gm: str(it.gm || it.keeper).trim(),
    format: str(it.format).trim(),
    status: kumaStatus(it.status),
    memo: str(it.memo || it.note),
    tags: tagList(it.hashtags ?? it.tags),
    players,
    links,
    calendar,
  });
}

function limit(entries: Entry[]): { entries: Entry[]; dropped: number } {
  return entries.length > ENTRY_LIMIT
    ? { entries: entries.slice(0, ENTRY_LIMIT), dropped: entries.length - ENTRY_LIMIT }
    : { entries, dropped: 0 };
}

const cpList = (v: unknown): CpColor[] =>
  (Array.isArray(v) ? v : []).map(normalizeCpColor).filter((c): c is CpColor => c !== null);

const looksKuma = (v: unknown) => {
  const o = obj(v);
  return 'scenario' in o && 'start' in o;
};
const looksTaku = (v: unknown) => {
  const o = obj(v);
  return 'start' in o && 'end' in o && ('color1' in o || 'colorMode' in o || 'title' in o);
};

/** JSON 文字 → 要讀入的筆；看不懂時丟 ImportFormatError（訊息可以直接顯示） */
export function parseImportJson(text: string): ImportBatch {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    throw new ImportFormatError('這不是有效的 JSON 檔。');
  }
  const o = obj(data);
  const keep = (list: (Entry | null)[]) => list.filter((e): e is Entry => e !== null);

  /* 本工具：匯出的 JSON、專案檔 */
  const self =
    o.format === JSON_FORMAT
      ? o
      : o.tool === 'session-calendar' && obj(o.data).entries
        ? obj(o.data)
        : null;
  if (self && Array.isArray(self.entries)) {
    const { entries, dropped } = limit(keep(self.entries.map(normalizeEntry)));
    return {
      format: 'self',
      entries,
      cpColors: cpList(self.cpColors),
      title: typeof self.title === 'string' ? self.title : undefined,
      dropped,
    };
  }
  /* 卓準備カレンダー */
  const kumaList = Array.isArray(o.sessions)
    ? o.sessions
    : Array.isArray(data) && data.some(looksKuma)
      ? data
      : null;
  if (kumaList) {
    const { entries, dropped } = limit(keep(kumaList.map(fromKumaSession)));
    return { format: 'kuma', entries, cpColors: [], dropped };
  }
  /* taku_calendar */
  const takuList = Array.isArray(o.events)
    ? o.events
    : Array.isArray(data) && data.some(looksTaku)
      ? data
      : null;
  if (takuList) {
    const title = typeof o.title === 'string' && o.title.trim() ? o.title.trim() : undefined;
    const cal = title ?? '卓カレンダー';
    const { entries, dropped } = limit(keep(takuList.map((e) => fromTakuEvent(e, cal))));
    return { format: 'taku', entries, cpColors: cpList(o.cpColors), title, dropped };
  }
  /* 跑團紀錄簿 */
  const rows = Array.isArray(o.rows)
    ? o.rows
    : Array.isArray(o.logs)
      ? o.logs
      : Array.isArray(o.records)
        ? o.records
        : null;
  if (rows) {
    const { entries, dropped } = limit(rows.flatMap(fromLogRow));
    return { format: 'log', entries, cpColors: [], dropped };
  }
  /* 交接資料 */
  if (Array.isArray(o.items)) {
    const cal = o.source === 'session-log-tracker' ? '跑團紀錄簿' : '卓準備カレンダー';
    const { entries, dropped } = limit(keep(o.items.map((it) => fromBridgeItem(it, cal))));
    return { format: 'bridge', entries, cpColors: [], dropped };
  }
  throw new ImportFormatError(
    '看不懂這個 JSON：可以讀本工具、卓準備カレンダー、taku_calendar、跑團紀錄簿匯出的 JSON。',
  );
}

/* ---------- 合併 ---------- */

/**
 * 把讀入的筆加進現有的：識別碼重複時換新的（準備事項的識別碼也是），回傳加進去之後的筆。
 * `replace` 時直接換掉（識別碼照樣檢查同一批裡的重複）。
 */
export function mergeEntries(
  existing: readonly Entry[],
  incoming: readonly Entry[],
  replace: boolean,
): Entry[] {
  const ids = new Set(replace ? [] : existing.map((e) => e.id));
  const taskIds = new Set(replace ? [] : existing.flatMap((e) => e.tasks.map((t) => t.id)));
  const add = incoming.map((e) => {
    const id = ids.has(e.id) || !e.id ? newId(e.kind) : e.id;
    ids.add(id);
    const tasks = e.tasks.map((t) => {
      const tid = taskIds.has(t.id) || !t.id ? newId('task') : t.id;
      taskIds.add(tid);
      return tid === t.id ? t : { ...t, id: tid };
    });
    return { ...e, id, tasks };
  });
  const out = replace ? add : [...existing, ...add];
  return out.slice(0, ENTRY_LIMIT);
}

/** CP 色合併：名稱與顏色都一樣的不重複加 */
export function mergeCpColors(
  existing: readonly CpColor[],
  incoming: readonly CpColor[],
): CpColor[] {
  const out = [...existing];
  for (const c of incoming) {
    if (out.some((x) => x.name === c.name && x.c1 === c.c1 && x.c2 === c.c2)) continue;
    out.push(out.some((x) => x.id === c.id) ? { ...c, id: newId('cp') } : c);
  }
  return out;
}
