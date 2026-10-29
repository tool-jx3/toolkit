/**
 * KP 對照表（規格 F50～F56、3.6）：幾個 PL 的地雷表合成一張表。
 * 列＝主題（內建主題依分類；自訂主題以名稱比對合併：全形半形、大小寫、空白都當成一樣，分類不同也合併），欄＝成員。
 * 每一列的判定：有人填地雷 → ng；有人填先問我 → ask；有人沒填 → missing；全員在「有就開心」以上 → good；其他 → neutral。
 * 純函式（Node 可測）。
 */
import {
  isLevel,
  type Jirai,
  type LevelId,
  labelKey,
  newId,
  normalizeJirai,
  oneLine,
  type ProfileData,
} from './model';
import { sharedData } from './share';
import { OUT } from './strings';
import { CATEGORIES } from './topics';

export const MAX_MEMBERS = 12;
export const MEMBER_NAME_MAX = 24;

export type MemberSource = 'link' | 'file' | 'self';

export interface Member {
  id: string;
  name: string;
  source: MemberSource;
  /** 內容的指紋（同一份重複加入時用） */
  sig: string;
  jirai: Jirai;
}

export type RowStatus = 'ng' | 'ask' | 'missing' | 'good' | 'neutral';
export const ROW_STATUSES: readonly RowStatus[] = ['ng', 'ask', 'missing', 'good', 'neutral'];

export interface CompareCell {
  level: LevelId | null;
  note: string;
}

export interface CompareRow {
  key: string;
  label: string;
  builtin: boolean;
  cells: CompareCell[];
  status: RowStatus;
  /** 大家填的不一樣（沒填也算一種） */
  mixed: boolean;
}

export interface CompareGroup {
  key: string;
  name: string;
  rows: CompareRow[];
}

/** FNV-1a（32 位元）→ 8 個十六進位 */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** 一個人的資料 → 對照表的成員（分享的內容：看不到的成人向主題拿掉） */
export function memberFrom(d: ProfileData, source: MemberSource, fallbackName: string): Member {
  const s = sharedData(d);
  const name = oneLine(s.profile.nickname, MEMBER_NAME_MAX).trim() || fallbackName;
  const jirai = s.jirai;
  const content = [
    s.profile.nickname.trim(),
    jirai.adult,
    jirai.levels,
    jirai.notes,
    jirai.custom.map((t) => [t.cat, t.label, t.level, t.note]),
    jirai.cats,
    jirai.memo,
  ];
  return { id: newId('m'), name, source, sig: fnv(JSON.stringify(content)), jirai };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 存在瀏覽器的成員清單 → 可以用的清單（壞掉的丟掉） */
export function normalizeMembers(raw: unknown): Member[] {
  if (!Array.isArray(raw)) return [];
  const out: Member[] = [];
  const ids = new Set<string>();
  for (const x of raw) {
    if (out.length >= MAX_MEMBERS) break;
    if (!isObj(x)) continue;
    let id = typeof x.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(x.id) ? x.id : newId('m');
    if (ids.has(id)) id = newId('m');
    ids.add(id);
    const source: MemberSource = x.source === 'file' || x.source === 'self' ? x.source : 'link';
    out.push({
      id,
      name: oneLine(x.name, MEMBER_NAME_MAX),
      source,
      sig: typeof x.sig === 'string' ? x.sig.slice(0, 16) : '',
      jirai: normalizeJirai(x.jirai),
    });
  }
  return out;
}

export function rowStatus(levels: readonly (LevelId | null)[]): RowStatus {
  if (levels.includes('ng')) return 'ng';
  if (levels.includes('ask')) return 'ask';
  if (levels.some((l) => l === null)) return 'missing';
  if (levels.every((l) => l === 'love' || l === 'like')) return 'good';
  return 'neutral';
}

const finishRow = (
  key: string,
  label: string,
  builtin: boolean,
  cells: CompareCell[],
): CompareRow => {
  const levels = cells.map((c) => c.level);
  return {
    key,
    label,
    builtin,
    cells,
    status: rowStatus(levels),
    mixed: new Set(levels).size > 1,
  };
};

/** 合成對照表（沒有人填的列不列；成人向：有成員顯示成人向時才列） */
export function compareGroups(members: readonly Member[]): CompareGroup[] {
  if (!members.length) return [];
  const includeAdult = members.some((m) => m.jirai.adult);
  const groups: CompareGroup[] = [];
  const byKey = new Map<string, CompareGroup>();
  const empty = (): CompareCell[] => members.map(() => ({ level: null, note: '' }));

  for (const c of CATEGORIES) {
    if (c.adult && !includeAdult) continue;
    const g: CompareGroup = { key: `b:${c.key}`, name: c.name, rows: [] };
    groups.push(g);
    byKey.set(g.key, g);
    for (const t of c.topics) {
      const cells = members.map((m) => {
        const visible = !c.adult || m.jirai.adult;
        const level = visible ? (m.jirai.levels[t.key] ?? null) : null;
        return {
          level: isLevel(level) ? level : null,
          note: visible ? (m.jirai.notes[t.key] ?? '') : '',
        };
      });
      if (cells.some((x) => x.level))
        g.rows.push(finishRow(`${g.key}|${t.key}`, t.label, true, cells));
    }
  }

  /*
   * 自訂主題：以主題名稱合併（全形半形、大小寫、空白當成一樣；分類不同也算同一個主題），
   * 放在第一個寫了它的人的分類（內建分類，或自訂分類的名稱——同名的自訂分類合成一組）。
   */
  const custom = new Map<string, { label: string; gKey: string; cells: CompareCell[] }>();
  members.forEach((m, mi) => {
    const catName = new Map(m.jirai.cats.map((c) => [c.id, c.name]));
    for (const t of m.jirai.custom) {
      const label = t.label.trim();
      if (!label) continue;
      let gKey: string;
      let gName: string;
      if (catName.has(t.cat)) {
        gName = catName.get(t.cat)?.trim() || OUT.untitledCategory;
        gKey = `c:${labelKey(gName)}`;
      } else {
        const def = CATEGORIES.find((c) => c.key === t.cat);
        if (!def || (def.adult && !m.jirai.adult)) continue;
        gKey = `b:${def.key}`;
        gName = def.name;
      }
      const rKey = labelKey(label);
      let r = custom.get(rKey);
      if (!r) {
        if (!byKey.has(gKey)) {
          const g = { key: gKey, name: gName, rows: [] };
          groups.push(g);
          byKey.set(gKey, g);
        }
        r = { label, gKey, cells: empty() };
        custom.set(rKey, r);
      }
      /* 同一個人有兩個同名的主題時，以先填了程度的為準 */
      if (!r.cells[mi].level) r.cells[mi] = { level: t.level, note: t.note.trim() };
    }
  });
  for (const [rKey, r] of custom) {
    const g = byKey.get(r.gKey);
    if (g && r.cells.some((x) => x.level))
      g.rows.push(finishRow(`~${rKey}`, r.label, false, r.cells));
  }
  return groups.filter((g) => g.rows.length);
}

export type CompareFilter = 'all' | 'issues' | 'mixed';

export function filterGroups(
  groups: readonly CompareGroup[],
  filter: CompareFilter,
): CompareGroup[] {
  if (filter === 'all') return groups.slice();
  return groups
    .map((g) => ({
      ...g,
      rows: g.rows.filter((r) =>
        filter === 'issues' ? r.status === 'ng' || r.status === 'ask' : r.mixed,
      ),
    }))
    .filter((g) => g.rows.length);
}

export function countStatus(groups: readonly CompareGroup[]): Record<RowStatus, number> {
  const out: Record<RowStatus, number> = { ng: 0, ask: 0, missing: 0, good: 0, neutral: 0 };
  for (const g of groups) for (const r of g.rows) out[r.status] += 1;
  return out;
}

/** 複製用的摘要：有人填地雷、有人填先問我的主題（後面寫是誰、補充） */
export function compareSummary(
  members: readonly Member[],
  groups: readonly CompareGroup[],
  words: { title: string; ng: string; ask: string; none: string },
): string {
  const lines = [`【${words.title}】${members.map((m) => m.name).join(OUT.sep)}`];
  const part = (level: 'ng' | 'ask', head: string) => {
    const items: string[] = [];
    for (const g of groups)
      for (const r of g.rows) {
        const who = r.cells
          .map((c, i) =>
            c.level === level ? (c.note ? `${members[i].name}：${c.note}` : members[i].name) : '',
          )
          .filter(Boolean);
        if (who.length) items.push(`${r.label}（${who.join(OUT.sep)}）`);
      }
    if (items.length) lines.push(`${OUT.symbols[level]} ${head}：${items.join(OUT.sep)}`);
    return items.length;
  };
  const n = part('ng', words.ng) + part('ask', words.ask);
  if (!n) lines.push(words.none);
  return lines.join('\n');
}
