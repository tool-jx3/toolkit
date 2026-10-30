/**
 * 搜尋與篩選（規格 F91）：依文字、泳道、分類、地點、角色、GM 專用篩選事件。純計算。
 *
 * - 同一種條件裡選好幾個是「或」（泳道甲或泳道乙），不同的條件是「且」。
 * - 文字以空白分隔成好幾個詞，每個詞都要出現在標題、說明、地點、相關角色（GM 檢視另加 GM 筆記）裡；不分大小寫、全形半形。
 * - 選了上層泳道時連同它的子泳道；主線是空字串；沒有分類是空字串。
 * - 條件裡指到面板上沒有的選項（已經不存在、這個檢視看不到、沒有事件在用）時不算（不會因此全部消失、也不會留著看不到的條件；
 *   PL 檢視也不會用到 GM 專用的值）。
 * - 篩選只針對事件；標記、目前進度照常顯示。
 */
import type { VisibleDoc, VisibleEvent } from './visible';

export type GmFilter = 'all' | 'only' | 'none';

export interface FilterState {
  text: string;
  /** 泳道 id；空字串＝主線 */
  lanes: string[];
  /** 分類 id；空字串＝沒有分類 */
  categories: string[];
  places: string[];
  people: string[];
  /** GM 專用：全部／只有 GM 專用／不含 GM 專用（GM 檢視才有） */
  gm: GmFilter;
}

export const emptyFilter = (): FilterState => ({
  text: '',
  lanes: [],
  categories: [],
  places: [],
  people: [],
  gm: 'all',
});

const strList = (v: unknown, max = 200): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max) : [];

/** 存在這台裝置的篩選讀回時整理 */
export function normalizeFilter(raw: unknown): FilterState {
  if (!raw || typeof raw !== 'object') return emptyFilter();
  const r = raw as Record<string, unknown>;
  return {
    text: typeof r.text === 'string' ? r.text.slice(0, 200) : '',
    lanes: strList(r.lanes),
    categories: strList(r.categories),
    places: strList(r.places),
    people: strList(r.people),
    gm: r.gm === 'only' || r.gm === 'none' ? r.gm : 'all',
  };
}

export const normText = (t: string) => t.normalize('NFKC').toLowerCase();

/** 篩選的選項（只用這個檢視看得到的資料：PL 檢視不會出現 GM 專用的名稱） */
export interface FilterOptions {
  lanes: { id: string; name: string; depth: 0 | 1; color: string }[];
  /** 主線有沒有事件 */
  main: boolean;
  categories: { id: string; name: string; color: string }[];
  /** 有沒有沒分類的事件 */
  uncategorized: boolean;
  places: string[];
  people: string[];
}

export function filterOptions(vdoc: VisibleDoc, untitled: string): FilterOptions {
  const laneIds = new Set(vdoc.lanes.map((l) => l.id));
  const tops = vdoc.lanes.filter((l) => !l.parentId || !laneIds.has(l.parentId));
  const lanes: FilterOptions['lanes'] = [];
  for (const t of tops) {
    lanes.push({ id: t.id, name: t.name.trim() || untitled, depth: 0, color: t.color });
    for (const c of vdoc.lanes)
      if (c.parentId === t.id)
        lanes.push({ id: c.id, name: c.name.trim() || untitled, depth: 1, color: c.color });
  }
  const usedCats = new Set(vdoc.events.map((e) => e.categoryId));
  const places = new Set<string>();
  const people = new Set<string>();
  for (const e of vdoc.events) {
    if (e.place.trim()) places.add(e.place.trim());
    for (const p of e.people) people.add(p);
  }
  for (const l of vdoc.lanes)
    if ((l.kind === 'character' || l.kind === 'npc') && l.name.trim()) people.add(l.name.trim());
  const collator = new Intl.Collator('zh-Hant');
  return {
    lanes,
    main: vdoc.events.some((e) => !e.laneId || !laneIds.has(e.laneId)),
    categories: vdoc.categories
      .filter((c) => usedCats.has(c.id))
      .map((c) => ({ id: c.id, name: c.name.trim() || untitled, color: c.color })),
    uncategorized: vdoc.events.some((e) => !e.categoryId),
    places: [...places].sort(collator.compare),
    people: [...people].sort(collator.compare),
  };
}

/** 篩選的面板上有哪些選項（effectiveFilter 用；不排序） */
function optionKeys(vdoc: VisibleDoc) {
  const laneIds = new Set(vdoc.lanes.map((l) => l.id));
  const lanes = new Set(laneIds);
  const categories = new Set<string>();
  const places = new Set<string>();
  const people = new Set<string>();
  const catIds = new Set(vdoc.categories.map((c) => c.id));
  for (const e of vdoc.events) {
    if (!e.laneId || !laneIds.has(e.laneId)) lanes.add('');
    categories.add(e.categoryId && catIds.has(e.categoryId) ? e.categoryId : '');
    if (e.place.trim()) places.add(e.place.trim());
    for (const p of e.people) people.add(p);
  }
  for (const l of vdoc.lanes)
    if ((l.kind === 'character' || l.kind === 'npc') && l.name.trim()) people.add(l.name.trim());
  return { lanes, categories, places, people };
}

/**
 * 實際有作用的條件：面板上沒有對應選項的拿掉（指到已經不存在、這個檢視看不到、或沒有事件在用的泳道〔主線〕、分類、地點、角色），
 * 所以不會有看不到、只能清除的條件；PL 檢視的 GM 專用條件不算。
 */
export function effectiveFilter(vdoc: VisibleDoc, f: FilterState): FilterState {
  const o = optionKeys(vdoc);
  return {
    text: f.text.trim(),
    lanes: f.lanes.filter((id) => o.lanes.has(id)),
    categories: f.categories.filter((id) => o.categories.has(id)),
    places: f.places.filter((p) => o.places.has(p)),
    people: f.people.filter((p) => o.people.has(p)),
    gm: vdoc.audience === 'gm' ? f.gm : 'all',
  };
}

/** 有沒有任何條件（已經整理過的） */
export function isFiltering(f: FilterState): boolean {
  return (
    !!f.text.trim() ||
    f.lanes.length > 0 ||
    f.categories.length > 0 ||
    f.places.length > 0 ||
    f.people.length > 0 ||
    f.gm !== 'all'
  );
}

/** 條件的數目（工具列的小標） */
export function filterCount(f: FilterState): number {
  return (
    (f.text.trim() ? 1 : 0) +
    (f.lanes.length ? 1 : 0) +
    (f.categories.length ? 1 : 0) +
    (f.places.length ? 1 : 0) +
    (f.people.length ? 1 : 0) +
    (f.gm !== 'all' ? 1 : 0)
  );
}

/** 事件符合篩選嗎（f 先經過 effectiveFilter） */
export function eventMatcher(vdoc: VisibleDoc, f: FilterState): (e: VisibleEvent) => boolean {
  const laneIds = new Set(vdoc.lanes.map((l) => l.id));
  const parentOf = new Map(vdoc.lanes.map((l) => [l.id, l.parentId]));
  const lanes = new Set(f.lanes);
  const cats = new Set(f.categories);
  const places = new Set(f.places);
  const people = new Set(f.people);
  const terms = normText(f.text).split(/\s+/).filter(Boolean);
  const gmView = vdoc.audience === 'gm';
  return (e) => {
    if (lanes.size) {
      const lane = e.laneId && laneIds.has(e.laneId) ? e.laneId : '';
      /* 選了上層泳道時連同子泳道；最上層泳道的上層是空字串（≠ 主線） */
      const parent = lane ? (parentOf.get(lane) ?? '') : '';
      if (!lanes.has(lane) && !(parent && laneIds.has(parent) && lanes.has(parent))) return false;
    }
    if (cats.size && !cats.has(e.categoryId)) return false;
    if (places.size && !places.has(e.place.trim())) return false;
    if (people.size && !e.people.some((p) => people.has(p))) return false;
    if (f.gm === 'only' && !e.gm) return false;
    if (f.gm === 'none' && e.gm) return false;
    if (terms.length) {
      const hay = normText(
        [e.title, e.description, e.place, e.people.join(' '), gmView ? e.gmNote : ''].join('\n'),
      );
      if (!terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  };
}

/** 符合的事件的 id（沒有條件時 null＝全部） */
export function matchingIds(vdoc: VisibleDoc, raw: FilterState): Set<string> | null {
  const f = effectiveFilter(vdoc, raw);
  if (!isFiltering(f)) return null;
  const ok = eventMatcher(vdoc, f);
  return new Set(vdoc.events.filter(ok).map((e) => e.id));
}

/** 只留符合的事件（與兩端都還在的關聯線）；沒有條件時原樣 */
export function filteredDoc(vdoc: VisibleDoc, ids: ReadonlySet<string> | null): VisibleDoc {
  if (!ids) return vdoc;
  return {
    ...vdoc,
    events: vdoc.events.filter((e) => ids.has(e.id)),
    links: vdoc.links.filter((k) => ids.has(k.from) && ids.has(k.to)),
  };
}
