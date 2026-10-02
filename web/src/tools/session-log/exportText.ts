/**
 * 已通關劇本清單（規格 3.7、F94～F101）：全部劇本、依系統、依 PL／KP、場次明細。
 * 換行一律 LF、結尾沒有換行；全形空白（U+3000）是格式的一部分。
 */
import {
  normalizeRoleGroup,
  normalizeScenarioForCount,
  primaryDate,
  type SessionRow,
  SYSTEM_SORT_PRIORITY,
  scenarioCountKey,
  splitPeople,
  systemLabel,
} from '@/core/sessions';
import { dateDisplay } from './logic';
import { S } from './strings';

export type ExportMode = 'all' | 'system' | 'role' | 'sessions';
export const EXPORT_MODES: readonly ExportMode[] = ['all', 'system', 'role', 'sessions'];

/** 沒有日期的團排在最後用的日期 */
const NO_DATE = '9999-99-99';

const exportDate = (row: SessionRow): string => primaryDate(row) || NO_DATE;

/** 輸出對象（3.7.1）：非範例列，名字篩選後依主要日期由舊到新（同日維持原順序） */
export function exportRows(rows: readonly SessionRow[], query: string): SessionRow[] {
  const q = query.trim().toLowerCase();
  const list = rows.filter((row) => {
    if (row.sample) return false;
    if (!q) return true;
    return [row.scenario, row.gm, row.players, row.pc, row.note, row.campaign].some((v) =>
      String(v ?? '')
        .toLowerCase()
        .includes(q),
    );
  });
  return list
    .map((row, i) => ({ row, i, d: exportDate(row) }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.i - b.i))
    .map((x) => x.row);
}

export interface ScenarioEntry {
  /** 代表列（日期最早的那一團） */
  row: SessionRow;
  count: number;
  firstDate: string;
}

/** 合併成劇本（劇本計數鍵不分大小寫；鍵是空的不列入），依最早的日期排列 */
export function uniqueScenarioList(rows: readonly SessionRow[]): ScenarioEntry[] {
  const map = new Map<string, ScenarioEntry>();
  for (const row of rows) {
    const key = scenarioCountKey(row).toLowerCase();
    if (!key) continue;
    const date = exportDate(row);
    const existing = map.get(key);
    if (!existing) map.set(key, { row, count: 1, firstDate: date });
    else {
      existing.count += 1;
      if (date < existing.firstDate) {
        existing.firstDate = date;
        existing.row = row;
      }
    }
  }
  return [...map.values()]
    .map((e, i) => ({ e, i }))
    .sort((a, b) =>
      a.e.firstDate < b.e.firstDate ? -1 : a.e.firstDate > b.e.firstDate ? 1 : a.i - b.i,
    )
    .map((x) => x.e);
}

/** 清單上的劇本名稱 */
export function displayScenarioName(row: SessionRow): string {
  return (
    normalizeScenarioForCount(row.scenario) || String(row.scenario ?? '').trim() || S.out.unset
  );
}

const plCountLabel = (row: SessionRow): string =>
  `${Math.max(splitPeople(row.players).length, 1)}PL`;

function groupBy<T>(items: readonly T[], keyFn: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item) || S.out.unset;
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }
  return groups;
}

/**
 * 系統的分組鍵（正規值，日文）的排序規則：照舊版用日文排序，清單的系統順序與舊版相同
 * （表格的依劇本、依 GM 排序才用繁中排序規則）。
 */
const systemCollator = new Intl.Collator('ja');

/** 系統的順序：CoC 6版、CoC 7版、エモクロア、マダミス 在前，其他依正規值的日文排序 */
function sortedSystemGroups<T>(groups: Map<string, T[]>): [string, T[]][] {
  return [...groups.entries()].sort((a, b) => {
    const ia = SYSTEM_SORT_PRIORITY.indexOf(a[0]);
    const ib = SYSTEM_SORT_PRIORITY.indexOf(b[0]);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return systemCollator.compare(a[0], b[0]);
  });
}

function plCountSections(entries: readonly ScenarioEntry[]): string {
  const byCount = groupBy(entries, (e) => plCountLabel(e.row));
  return [...byCount.entries()]
    .sort((a, b) => Number.parseInt(a[0], 10) - Number.parseInt(b[0], 10))
    .map(([count, items]) => {
      const lines = items.map((e, i) => `　　${i + 1}. ${displayScenarioName(e.row)}`).join('\n');
      return `　${count}\n${lines}`;
    })
    .join('\n');
}

const systemGroupKey = (e: ScenarioEntry): string => e.row.system || S.out.noSystem;

/** 3.7.2 全部劇本（spec 5. D9：沒有日期時不寫日期） */
export function buildAllScenarioText(rows: readonly SessionRow[]): string {
  const list = uniqueScenarioList(rows);
  if (!list.length) return '';
  const lines = list.map((e, i) => {
    const times = e.count > 1 ? `（×${e.count}）` : '';
    const date = e.firstDate === NO_DATE ? '' : `　${e.firstDate}`;
    return `${i + 1}. ${displayScenarioName(e.row)}${times}${date}`;
  });
  return `${S.out.allHead(list.length, rows.length)}\n\n${lines.join('\n')}`;
}

/** 3.7.3 依系統 */
export function buildSystemText(rows: readonly SessionRow[]): string {
  const list = uniqueScenarioList(rows);
  if (!list.length) return '';
  return sortedSystemGroups(groupBy(list, systemGroupKey))
    .map(
      ([system, entries]) =>
        `${S.out.systemHead(systemLabel(system), entries.length)}\n${plCountSections(entries)}`,
    )
    .join('\n\n');
}

type RoleKey = 'PL' | 'GM' | 'other';

function roleGroupKey(row: SessionRow): RoleKey {
  const g = normalizeRoleGroup(row.role);
  return g === 'GM' || g === 'PL' ? g : 'other';
}

/** 3.7.4 依 PL／KP */
export function buildRoleText(rows: readonly SessionRow[]): string {
  const byRole = groupBy(rows, roleGroupKey);
  const order: RoleKey[] = ['PL', 'GM', 'other'];
  return order
    .filter((k) => byRole.get(k)?.length)
    .map((k) => {
      const list = uniqueScenarioList(byRole.get(k) ?? []);
      const body = sortedSystemGroups(groupBy(list, systemGroupKey))
        .map(([system, entries]) => `【${systemLabel(system)}】\n${plCountSections(entries)}`)
        .join('\n\n');
      return `${S.out.roleHead(S.out.roleNames[k], list.length)}\n${body}`;
    })
    .join('\n\n\n');
}

/** 3.7.5 場次明細 */
export function buildSessionsText(rows: readonly SessionRow[]): string {
  if (!rows.length) return '';
  const blocks = rows.map((row, i) => {
    const date = dateDisplay(row) || S.out.noDate;
    const role = normalizeRoleGroup(row.role) === 'GM' ? 'KP/GM' : row.role || '-';
    const system = row.system ? systemLabel(row.system) : '-';
    const scenario = String(row.scenario ?? '').trim() || S.out.unset;
    const head = `${i + 1}. ${date}　${system}　${role}　${scenario}`;
    const people: string[] = [];
    if (row.gm) people.push(`KP/GM: ${row.gm}`);
    if (row.players) people.push(`PL: ${row.players}`);
    if (row.pc) people.push(`PC: ${row.pc}`);
    return people.length ? `${head}\n　${people.join(' ／ ')}` : head;
  });
  return `${S.out.sessionsHead(rows.length)}\n\n${blocks.join('\n')}`;
}

export function buildExportText(rows: readonly SessionRow[], mode: ExportMode): string {
  if (mode === 'system') return buildSystemText(rows);
  if (mode === 'role') return buildRoleText(rows);
  if (mode === 'sessions') return buildSessionsText(rows);
  return buildAllScenarioText(rows);
}

/** 名字篩選的提示（F95） */
export function exportHint(rows: readonly SessionRow[], query: string): string {
  const q = query.trim();
  if (!q) return '';
  if (!rows.length) return S.out.noMatch(q);
  return S.out.match(q, rows.length, uniqueScenarioList(rows).length);
}
