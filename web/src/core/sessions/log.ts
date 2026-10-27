/**
 * 團期行事曆 → 跑團紀錄簿的交接資料（session-calendar 規格 3.8；session-log 規格 F117）。
 *
 * 行事曆把一團寫進瀏覽器儲存空間的固定鍵名，紀錄簿開啟時讀取、問要不要加進表格（讀完由紀錄簿刪除）。
 * 鍵名與格式沿用原作（卓準備カレンダー的「卓ログトラッカーへ送る」：`trpgWebTools.sessionLogTracker.pendingImport`，
 * `source: 'session-check-calendar'`）；本站另外多帶開始、結束時間（原作沒有，多的欄位不影響讀取）。
 * 讀寫 localStorage 一律包 try/catch。
 */

import { normalizeDates } from './dates';
import { canonicalStatus, importSystem, type SessionMedia, type SessionRow } from './model';
import { splitTags } from './report';

/** 交接資料的鍵名（localStorage） */
export const LOG_PENDING_IMPORT_KEY = 'trpgWebTools.sessionLogTracker.pendingImport';

export interface LogImportPlayer {
  pl: string;
  pc: string;
}

export interface LogImportLink {
  label: string;
  url: string;
}

export interface LogImportItem {
  /** `calendar_import_<毫秒時間戳>` */
  id: string;
  /** 行事曆裡這一團的識別碼 */
  sourceCalendarId: string;
  scenario: string;
  /** 系統（行事曆的原文） */
  system: string;
  /** `YYYY-MM-DD` */
  dates: string[];
  latestDate: string;
  sessionCount: number;
  gm: string;
  players: LogImportPlayer[];
  /** 形式（原文） */
  format: string;
  /** 'tentative' | 'scheduled' | 'completed' 或其他原文 */
  status: string;
  memo: string;
  links: LogImportLink[];
  hashtags: string[];
  /** `HH:MM`（本站多帶的欄位，可以沒有） */
  startTime?: string;
  endTime?: string;
}

export interface LogPendingImport {
  source: 'session-check-calendar';
  version: '1.0';
  createdAt: string;
  items: LogImportItem[];
}

const str = (v: unknown): string => (v == null ? '' : String(v));

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function createLogPendingImport(
  items: readonly LogImportItem[],
  now: number = Date.now(),
): LogPendingImport {
  return {
    source: 'session-check-calendar',
    version: '1.0',
    createdAt: new Date(now).toISOString(),
    items: [...items],
  };
}

/** 瀏覽器裡是否有還沒被紀錄簿讀取的交接資料 */
export function hasPendingLogImport(): boolean {
  try {
    return Boolean(local()?.getItem(LOG_PENDING_IMPORT_KEY));
  } catch {
    return false;
  }
}

/** 寫入交接資料；儲存空間不能用時回傳 false（由呼叫端顯示 JSON 讓使用者自己複製） */
export function writePendingLogImport(payload: LogPendingImport): boolean {
  try {
    const ls = local();
    if (!ls) return false;
    ls.setItem(LOG_PENDING_IMPORT_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/** 讀取交接資料（紀錄簿用）：沒有時 null；內容損壞時 'broken'。不會刪除（讀完由呼叫端 clearPendingLogImport） */
export function readPendingLogImport(): LogPendingImport | null | 'broken' {
  let raw: string | null = null;
  try {
    raw = local()?.getItem(LOG_PENDING_IMPORT_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as LogPendingImport;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return 'broken';
    return parsed;
  } catch {
    return 'broken';
  }
}

export function clearPendingLogImport(): void {
  try {
    local()?.removeItem(LOG_PENDING_IMPORT_KEY);
  } catch {
    /* 刪不掉就算了 */
  }
}

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/** 開始到結束的小時數（結束比開始早＝過了午夜）；有一邊沒有時空字串 */
export function hoursBetween(start: unknown, end: unknown): string {
  const a = TIME_RE.exec(str(start).trim());
  const b = TIME_RE.exec(str(end).trim());
  if (!a || !b) return '';
  let minutes = +b[1] * 60 + +b[2] - (+a[1] * 60 + +a[2]);
  if (minutes <= 0) minutes += 24 * 60;
  const hours = Math.round((minutes / 60) * 100) / 100;
  return String(hours);
}

/** 行事曆的狀態 → 紀錄簿的狀態正規值：完成 → 完結；確定、調整中 → 預定；其他照紀錄簿的規則 */
export function logStatusOf(status: unknown): string {
  const s = str(status).trim();
  if (s === 'completed' || s === '完了' || s === '完成') return '完結';
  if (s === 'scheduled' || s === 'tentative' || s === '確定' || s === '調整中') return '予定';
  return s ? canonicalStatus(s) : '';
}

/** PC 空白時的佔位（紀錄簿的 PL、PC 欄依順序配對，空白會被拆分略過，所以要佔位才不會錯位） */
export const PC_PLACEHOLDER = '—';

/**
 * 參加者 → 紀錄簿的 PL 欄與 PC 欄（「、」連接、同順序一一對應）：
 * 有 PL 的排前面、只有 PC 的排最後（PL 欄不放佔位，同團玩家的人數才不會多算）；
 * PC 空白而後面還有 PC 時寫佔位「—」，最後面連續空白的 PC 不寫（紀錄簿配對時本來就補空白）。
 */
export function pairedPeople(players: readonly Partial<LogImportPlayer>[]): {
  players: string;
  pcs: string;
} {
  const list = players
    .map((p) => ({ pl: str(p?.pl).trim(), pc: str(p?.pc).trim() }))
    .filter((p) => p.pl || p.pc);
  const ordered = [...list.filter((p) => p.pl), ...list.filter((p) => !p.pl)];
  const pcs = ordered.map((p) => p.pc);
  while (pcs.length && !pcs[pcs.length - 1]) pcs.pop();
  return {
    players: ordered
      .filter((p) => p.pl)
      .map((p) => p.pl)
      .join('、'),
    pcs: pcs.map((pc) => pc || PC_PLACEHOLDER).join('、'),
  };
}

/**
 * 交接資料的一個項目 → 紀錄簿的一團（部分欄位；之後由紀錄簿照匯入的規則補身分、識別碼）：
 * 日期清單、劇本、系統（匯入別名 → 正規值）、GM、PL 與 PC（pairedPeople：一一對應、PC 空白時佔位）、狀態、
 * 時間（開始到結束的小時數）、備註、主題標籤（空白連接）、貼文／連結（有網址的相關連結）、形式（原文，表格不顯示、照樣保留）。
 */
export function logRowFromImportItem(item: Partial<LogImportItem>): Partial<SessionRow> {
  const dates = normalizeDates(Array.isArray(item.dates) ? item.dates : [item.latestDate]);
  const { players: plText, pcs: pcText } = pairedPeople(
    Array.isArray(item.players) ? item.players : [],
  );
  const media: SessionMedia[] = (Array.isArray(item.links) ? item.links : [])
    .filter((l) => str(l?.url).trim())
    .map((l) => ({ type: 'link', url: str(l.url).trim(), caption: str(l.label).trim() }));
  const row: Partial<SessionRow> = {
    date: dates[0] ?? '',
    dates,
    scenario: str(item.scenario).trim(),
    system: item.system ? importSystem(str(item.system)) : '',
    gm: str(item.gm).trim(),
    players: plText,
    pc: pcText,
    status: logStatusOf(item.status),
    time: hoursBetween(item.startTime, item.endTime),
    note: str(item.memo).trim(),
    hashtag: splitTags(item.hashtags ?? [])
      .map((t) => `#${t}`)
      .join(' '),
  };
  if (media.length) row.media = media;
  if (str(item.format).trim()) row.format = str(item.format).trim();
  return row;
}
