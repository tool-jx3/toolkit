/**
 * 把一個場次送到跑團紀錄簿、團報產生器（規格 3.8）：組成 @/core/sessions 的交接資料。
 * 跑團紀錄簿的格式照原作（卓準備カレンダー的「卓ログトラッカーへ送る」），另外多帶開始、結束時間；
 * 團報產生器用跑團紀錄簿送出時的同一種格式（`source` 是 'session-check-calendar'）。
 */

import { addDays, dayNumber } from '@/core/holidays';
import {
  createLogPendingImport,
  type LogImportItem,
  type LogPendingImport,
  type ReportImportItem,
  type ReportPendingImport,
} from '@/core/sessions';
import type { Entry } from './model';

/** 這個場次的日期（多日時每一天） */
export function entryDates(e: Pick<Entry, 'start' | 'end'>): string[] {
  const n = Math.min(dayNumber(e.end) - dayNumber(e.start) + 1, 60);
  return Array.from({ length: Math.max(1, n) }, (_, i) => addDays(e.start, i));
}

/** 團報產生器的「進行方式」：半（半文字）→ semi-text；語音、通話、voice → voice；文字、text → text */
export function reportFormat(format: string): string {
  const t = format.toLowerCase();
  if (/半|semi/.test(t)) return 'semi-text';
  if (/語音|通話|voice|ボイ|ボイス/.test(t)) return 'voice';
  if (/文字|text|テキ/.test(t)) return 'text';
  return '';
}

export function logImportItem(e: Entry, now: number = Date.now()): LogImportItem {
  const dates = entryDates(e);
  return {
    id: `calendar_import_${now}`,
    sourceCalendarId: e.id,
    scenario: e.title.trim(),
    system: e.system.trim(),
    dates,
    latestDate: dates[dates.length - 1],
    sessionCount: dates.length,
    gm: e.gm.trim(),
    players: e.players.map((p) => ({ pl: p.pl, pc: p.pc })),
    format: e.format.trim(),
    status: e.status,
    memo: e.memo.trim(),
    links: e.links.map((l) => ({ label: l.label, url: l.url })),
    hashtags: [...e.tags],
    startTime: e.startTime,
    endTime: e.endTime,
  };
}

export const logPayload = (e: Entry, now: number = Date.now()): LogPendingImport =>
  createLogPendingImport([logImportItem(e, now)], now);

export function reportImportItem(e: Entry, now: number = Date.now()): ReportImportItem {
  const dates = entryDates(e);
  return {
    id: `report_import_${now}`,
    sourceLogId: '',
    reported: false,
    scenario: e.title.trim(),
    system: e.system.trim(),
    dates,
    latestDate: dates[dates.length - 1],
    sessionCount: dates.length,
    gm: e.gm.trim(),
    players: (e.players.length ? e.players : [{ pl: '', pc: '' }]).map((p) => ({
      pl: p.pl,
      pc: p.pc,
      characterUrl: '',
    })),
    format: reportFormat(e.format),
    status: e.status === 'completed' ? 'completed' : 'ongoing',
    memo: e.memo.trim(),
    links: e.links.filter((l) => l.url).map((l) => ({ label: l.label || 'Link', url: l.url })),
    hashtags: [...e.tags],
  };
}

export function reportPayload(e: Entry, now: number = Date.now()): ReportPendingImport {
  return {
    source: 'session-check-calendar',
    version: '1.0',
    createdAt: new Date(now).toISOString(),
    items: [reportImportItem(e, now)],
  };
}
