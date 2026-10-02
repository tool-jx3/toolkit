/**
 * 跑團紀錄簿 → 團報產生器的交接資料（session-log 規格 3.9）。
 *
 * 紀錄簿把一團寫進瀏覽器儲存空間的固定鍵名，團報產生器開啟時讀取（讀完由產生器刪除）。
 * 鍵名與格式沿用舊版，新舊版的團報產生器都讀得到。讀寫 localStorage 一律包 try/catch。
 */
import { normalizeRowDates } from './dates';
import { type SessionRow, splitPeople } from './model';

/** 交接資料的鍵名（localStorage） */
export const REPORT_PENDING_IMPORT_KEY = 'trpgWebTools.sessionReportGenerator.pendingImport';

export interface ReportImportPlayer {
  pl: string;
  pc: string;
  characterUrl: string;
}

export interface ReportImportLink {
  label: string;
  url: string;
}

export interface ReportImportItem {
  id: string;
  sourceLogId: string;
  reported: boolean;
  scenario: string;
  /** 系統正規值（SESSION_SYSTEMS 的 value）或使用者輸入的文字 */
  system: string;
  dates: string[];
  latestDate: string;
  sessionCount: number;
  gm: string;
  players: ReportImportPlayer[];
  /** 'voice' | 'text' | 'semi-text' | '' */
  format: string;
  /** 'completed' | 'ongoing' | 其他原值 */
  status: string;
  memo: string;
  links: ReportImportLink[];
  hashtags: string[];
}

export interface ReportPendingImport {
  source: 'session-log-tracker';
  version: '1.0';
  createdAt: string;
  items: ReportImportItem[];
}

const str = (v: unknown): string => (v == null ? '' : String(v));

/** PL 與 PC 各自拆開後依序配對（長度取兩者較多者，至少 1 組；缺的是空字串） */
export function pairPlayers(players: unknown, pcs: unknown): [string, string][] {
  const pls = splitPeople(players);
  const pcList = splitPeople(pcs);
  const length = Math.max(pls.length, pcList.length, 1);
  return Array.from({ length }, (_, i) => [pls[i] ?? '', pcList[i] ?? ''] as [string, string]);
}

/** 主題標籤：以空白、「、」「,」「，」切開，去掉開頭的 #（陣列時逐項處理） */
export function splitTags(value: unknown): string[] {
  if (Array.isArray(value))
    return value.map((v) => str(v).replace(/^#/, '').trim()).filter(Boolean);
  return str(value)
    .split(/[\s、,，]+/)
    .map((v) => v.replace(/^#/, '').trim())
    .filter(Boolean);
}

/** 進行方式：voice／ボイ／通話 → voice；text／テキ → text；semi／半 → semi-text */
export function normalizeSessionFormat(value: unknown): string {
  const text = str(value).toLowerCase();
  if (text.includes('voice') || text.includes('ボイ') || text.includes('通話')) return 'voice';
  if (text.includes('text') || text.includes('テキ')) return 'text';
  if (text.includes('semi') || text.includes('半')) return 'semi-text';
  return '';
}

/** 狀態：完、済、end、completed → completed；継続、途中、予定、ongoing → ongoing；其他原值 */
export function normalizeSessionStatus(value: unknown): string {
  const text = str(value);
  if (/完|済|end|completed/i.test(text)) return 'completed';
  if (/継続|途中|予定|ongoing/i.test(text)) return 'ongoing';
  return text;
}

/** 相關網址：Session、Scenario 一定有；Kansou 有網址才有；之後是有網址的防雷連結 */
export function reportLinks(row: SessionRow): ReportImportLink[] {
  const base: ReportImportLink[] = [
    { label: 'Session', url: str(row.sessionUrl) },
    { label: 'Scenario', url: str(row.scenarioUrl) },
  ];
  if (row.kansouUrl) base.push({ label: 'Kansou', url: str(row.kansouUrl) });
  for (const l of Array.isArray(row.cushionLinks) ? row.cushionLinks : []) {
    if (l?.url) base.push({ label: l.label || 'Link', url: l.url });
  }
  return base;
}

/** 一團 → 交接資料的一個項目 */
export function createReportImportItem(
  row: SessionRow,
  now: number = Date.now(),
): ReportImportItem {
  const { date, dates } = normalizeRowDates(row);
  return {
    id: `report_import_${now}`,
    sourceLogId: str(row.id),
    reported: Boolean(row.reported),
    scenario: str(row.scenario || row.title),
    system: str(row.system),
    dates,
    latestDate: dates[dates.length - 1] || date,
    sessionCount: Math.max(dates.length, 1),
    gm: str(row.gm || row.keeper),
    players: pairPlayers(row.players, row.pc).map(([pl, pc]) => ({ pl, pc, characterUrl: '' })),
    format: normalizeSessionFormat(row.format || row.sessionFormat || ''),
    status: normalizeSessionStatus(row.status || ''),
    memo: [row.note, row.result, row.longNote]
      .map((v) => str(v).trim())
      .filter(Boolean)
      .join('\n\n'),
    links: reportLinks(row),
    hashtags: splitTags(row.hashtag || row.hashtags || row.tags || ''),
  };
}

export function createReportPendingImport(
  row: SessionRow,
  now: number = Date.now(),
): ReportPendingImport {
  return {
    source: 'session-log-tracker',
    version: '1.0',
    createdAt: new Date(now).toISOString(),
    items: [createReportImportItem(row, now)],
  };
}

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 瀏覽器裡是否有還沒被讀取的交接資料 */
export function hasPendingReportImport(): boolean {
  try {
    return Boolean(local()?.getItem(REPORT_PENDING_IMPORT_KEY));
  } catch {
    return false;
  }
}

/** 寫入交接資料；儲存空間不能用時回傳 false（由呼叫端顯示 JSON 讓使用者自己複製） */
export function writePendingReportImport(payload: ReportPendingImport): boolean {
  try {
    const ls = local();
    if (!ls) return false;
    ls.setItem(REPORT_PENDING_IMPORT_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

/**
 * 讀取交接資料（團報產生器用）：沒有時 null；內容損壞時 'broken'。不會刪除（讀完由呼叫端 clearPendingReportImport）。
 */
export function readPendingReportImport(): ReportPendingImport | null | 'broken' {
  let raw: string | null = null;
  try {
    raw = local()?.getItem(REPORT_PENDING_IMPORT_KEY) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ReportPendingImport;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.items)) return 'broken';
    return parsed;
  } catch {
    return 'broken';
  }
}

export function clearPendingReportImport(): void {
  try {
    local()?.removeItem(REPORT_PENDING_IMPORT_KEY);
  } catch {
    /* 刪不掉就算了 */
  }
}
