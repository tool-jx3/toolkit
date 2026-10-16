/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 連線總表的列（原作的 relTableRows）：目前分頁的個別關係（不含群體關係），篩選關係類型、搜尋兩端的名字、
 * 依來源／目標／關係名稱排序（繁中的字典序；再點同一個＝反向）。
 */
import { displayName } from '../engine/geom';
import type { Rel, Sheet } from '../model/types';

export type RelSortKey = 'from' | 'to' | 'type';

export interface RelTableQuery {
  /** 只看這一種（0＝全部） */
  type: number;
  sortKey: RelSortKey;
  /** 1＝正向、-1＝反向 */
  sortDir: 1 | -1;
  /** 搜尋（兩端的名字含關鍵字，不分大小寫） */
  query: string;
}

export const DEFAULT_REL_QUERY: RelTableQuery = { type: 0, sortKey: 'from', sortDir: 1, query: '' };

const collator = typeof Intl !== 'undefined' ? new Intl.Collator('zh-Hant') : null;
const cmp = (a: string, b: string) => (collator ? collator.compare(a, b) : a.localeCompare(b));

export function relTableRows(sheet: Sheet, q: RelTableQuery): Rel[] {
  const byId = new Map(sheet.chars.map((c) => [c.id, c]));
  const types = new Map(sheet.types.map((t) => [t.id, t]));
  const nameOf = (id: number) => {
    const c = byId.get(id);
    return c ? displayName(c) : '?';
  };
  let rows = sheet.rels.filter((r) => byId.has(r.from) && byId.has(r.to) && types.has(r.type));
  if (q.type) rows = rows.filter((r) => r.type === q.type);
  const needle = q.query.trim().toLowerCase();
  if (needle)
    rows = rows.filter(
      (r) =>
        nameOf(r.from).toLowerCase().includes(needle) ||
        nameOf(r.to).toLowerCase().includes(needle),
    );
  const key =
    q.sortKey === 'from'
      ? (r: Rel) => nameOf(r.from)
      : q.sortKey === 'to'
        ? (r: Rel) => nameOf(r.to)
        : (r: Rel) => types.get(r.type)?.label ?? '';
  return [...rows].sort((a, b) => cmp(key(a), key(b)) * q.sortDir);
}
