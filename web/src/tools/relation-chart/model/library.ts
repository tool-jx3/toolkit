/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 角色庫與關係庫（原作的 LIB_FIELDS、bindCharToLibrary、newVariantFrom、forkLibEntry、reclaimVirginLibEntry、
 * syncTagToRelLibrary、ensureRelLibrary）：
 * - 角色分三層：實例（分頁上的角色）→ 變體（外觀）→ 條目（這個人）。實例上留著變體與條目欄位的副本，
 *   畫法引擎與編輯畫面照舊讀攤平的角色；**變體與條目是正本**。
 * - 同步（syncLibrary）：每次改專案之後跑一次（state/store 的 updateProject）。
 *   ① 實例上被改的外觀欄位（和改之前的同一個實例比）寫回它的變體（統一顏色的條目：顏色寫進所有變體）；
 *   ② 沒有條目的實例（新增的角色、舊版的資料）自動建一筆條目、一件變體（原作的 bindCharToLibrary）；
 *   ③ 所有實例從變體與條目把副本拉回來（同一件變體的其他實例、其他分頁跟著變）。
 *   關係類型同理（只同步名稱與樣式；顯示、圖例、捆綁忽略是各分頁自己的）；沒有綁定的關係類型在新增、被改動、
 *   開檔整理時才收錄（刪掉變體＝解除綁定，照原作）。
 */
import { allChars } from './timeline';
import type {
  Char,
  CharEntry,
  Project,
  RadarVals,
  RelEntry,
  RelType,
  RelVariant,
  Sheet,
  Variant,
} from './types';

/** 變體的欄位（實例上是副本） */
export const VARIANT_KEYS = [
  'name',
  'color',
  'nameColor',
  'avatar',
  'icon',
  'noAvatar',
  'shape',
  'noBorder',
  'noBg',
  'borderOn',
  'bgOn',
  'size',
  'nameSize',
  'borderW',
  'labels',
  'frame',
] as const satisfies readonly (keyof Char & keyof Variant)[];
export type VariantKey = (typeof VARIANT_KEYS)[number];

/** 關係類型同步到關係庫的欄位（hidden、hideInLegend、pairSkip 是各分頁自己的） */
export const REL_KEYS = [
  'label',
  'color',
  'outlineColor',
  'lineStyle',
  'capStyle',
  'lineW',
  'outlineW',
  'mag',
] as const satisfies readonly (keyof RelType & keyof RelVariant)[];

const same = (a: unknown, b: unknown): boolean =>
  a === b ||
  (typeof a === 'object' &&
    typeof b === 'object' &&
    a !== null &&
    b !== null &&
    JSON.stringify(a) === JSON.stringify(b));

const clone = <T>(v: T): T =>
  v !== null && typeof v === 'object' ? (JSON.parse(JSON.stringify(v)) as T) : v;

/** 從角色（實例或變體）做一件新變體（原作的 newVariantFrom） */
export function variantFrom(
  src: Pick<Char, VariantKey>,
  id: number,
  radars: readonly RadarVals[] = [],
): Variant {
  const v = { id, radars: clone([...radars]) } as Variant;
  for (const k of VARIANT_KEYS) (v as unknown as Record<string, unknown>)[k] = clone(src[k]);
  return v;
}

export function relVariantFrom(
  t: Pick<RelType, (typeof REL_KEYS)[number]>,
  id: number,
): RelVariant {
  const v = { id } as RelVariant;
  for (const k of REL_KEYS) (v as unknown as Record<string, unknown>)[k] = clone(t[k]);
  return v;
}

/* ---------- 查詢 ---------- */

export const entryById = (p: Pick<Project, 'library'>, id: number): CharEntry | undefined =>
  p.library.find((e) => e.id === id);

/** 實例穿的變體（變體不在了＝第一件） */
export function variantOf(p: Pick<Project, 'library'>, c: Pick<Char, 'lib' | 'vari'>) {
  const e = entryById(p, c.lib);
  if (!e) return { entry: undefined, variant: undefined };
  return { entry: e, variant: e.variants.find((v) => v.id === c.vari) ?? e.variants[0] };
}

/** 變體的顯示名稱（名稱空白＝「變體 N」，N＝衣櫃裡的順序；原作的 variantDisplayName） */
export function variantName(e: CharEntry, v: Variant): string {
  const n = v.name.replace(/\s*\n+\s*/g, ' ').trim();
  return n || `變體 ${e.variants.indexOf(v) + 1}`;
}

/** 條目的顯示名稱：主要（第一件）變體的名字；空白＝「角色N」（N＝穿這個條目的實例裡最小的預設編號） */
export function entryName(p: Pick<Project, 'sheets'>, e: CharEntry): string {
  const n = (e.variants[0]?.name ?? '').replace(/\s*\n+\s*/g, ' ').trim();
  if (n) return n;
  let no = 0;
  for (const s of p.sheets)
    for (const c of allChars(s))
      if (c.lib === e.id && c.defNo && (!no || c.defNo < no)) no = c.defNo;
  return `角色${no || e.id}`;
}

/** 每個條目、每件變體用在幾張分頁（同一張分頁用兩次算 1） */
export function charLibUsage(sheets: readonly Sheet[]): {
  entry: Map<number, number>;
  variant: Map<number, number>;
  onSheet: (sheetIdx: number) => Set<number>;
} {
  const entry = new Map<number, number>();
  const variant = new Map<number, number>();
  const per = sheets.map((s) => {
    const es = new Set<number>();
    const vs = new Set<number>();
    for (const c of allChars(s)) {
      es.add(c.lib);
      vs.add(c.vari);
    }
    for (const id of es) entry.set(id, (entry.get(id) ?? 0) + 1);
    for (const id of vs) variant.set(id, (variant.get(id) ?? 0) + 1);
    return { es, vs };
  });
  return {
    entry,
    variant,
    onSheet: (i) => new Set([...(per[i]?.es ?? []), ...(per[i]?.vs ?? [])]),
  };
}

export function relLibUsage(sheets: readonly Sheet[]): {
  entry: Map<number, number>;
  variant: Map<number, number>;
} {
  const entry = new Map<number, number>();
  const variant = new Map<number, number>();
  for (const s of sheets) {
    const es = new Set<number>();
    const vs = new Set<number>();
    for (const t of s.types) {
      if (!t.lib) continue;
      es.add(t.lib);
      vs.add(t.vari);
    }
    for (const id of es) entry.set(id, (entry.get(id) ?? 0) + 1);
    for (const id of vs) variant.set(id, (variant.get(id) ?? 0) + 1);
  }
  return { entry, variant };
}

/* ---------- 同步 ---------- */

type Take = () => number;
const taker =
  (p: { nextId: number }): Take =>
  () =>
    p.nextId++;

/**
 * 改專案之後的同步（說明見檔案開頭）。p 可以是 immer 的草稿；prev＝改之前的專案（開檔整理時 null）。
 */
export function syncLibrary(p: Project, prev: Project | null): void {
  if (!p.library) p.library = [];
  if (!p.relLibrary) p.relLibrary = [];
  const take = taker(p);
  syncChars(p, prev, take);
  syncTypes(p, prev, take);
}

function syncChars(p: Project, prev: Project | null, take: Take): void {
  const lib = new Map(p.library.map((e) => [e.id, e]));
  const before = new Map<number, Char>();
  if (prev) for (const s of prev.sheets) for (const c of s.chars) before.set(c.id, c);
  /* ①② 實例的改動寫回變體；沒有條目的建一筆（時間軸分頁：每一格的角色都算，同一位在各格共用一筆） */
  const made = new Map<string, { lib: number; vari: number }>();
  for (const [si, s] of p.sheets.entries())
    for (const c of allChars(s)) {
      let e = lib.get(c.lib);
      const m = e ? undefined : made.get(`${si}:${c.id}`);
      if (m) {
        c.lib = m.lib;
        c.vari = m.vari;
        continue;
      }
      if (!e) {
        const eid = take();
        const vid = take();
        e = { id: eid, variants: [variantFrom(c, vid)], unified: false, info: '', font: c.font };
        p.library.push(e);
        lib.set(eid, e);
        c.lib = eid;
        c.vari = vid;
        made.set(`${si}:${c.id}`, { lib: eid, vari: vid });
        continue;
      }
      let v = e.variants.find((x) => x.id === c.vari) ?? e.variants[0];
      if (!v) {
        v = variantFrom(c, take());
        e.variants.push(v);
      }
      if (c.vari !== v.id) c.vari = v.id;
      const o = before.get(c.id);
      if (!o || o.lib !== c.lib || o.vari !== c.vari) continue;
      for (const k of VARIANT_KEYS) {
        if (same(c[k], o[k]) || same(c[k], v[k])) continue;
        (v as unknown as Record<string, unknown>)[k] = clone(c[k]);
        if (e.unified && (k === 'color' || k === 'nameColor'))
          for (const w of e.variants) if (w !== v) w[k] = c[k];
      }
      if (c.font !== o.font && c.font !== e.font) e.font = c.font;
    }
  /* ③ 副本拉回來 */
  for (const s of p.sheets)
    for (const c of allChars(s)) {
      const e = lib.get(c.lib);
      const v = e?.variants.find((x) => x.id === c.vari);
      if (!e || !v) continue;
      for (const k of VARIANT_KEYS)
        if (!same(c[k], v[k])) (c as unknown as Record<string, unknown>)[k] = clone(v[k]);
      if (c.font !== e.font) c.font = e.font;
    }
}

function syncTypes(p: Project, prev: Project | null, take: Take): void {
  const lib = new Map(p.relLibrary.map((e) => [e.id, e]));
  const before = new Map<number, RelType>();
  if (prev) for (const s of prev.sheets) for (const t of s.types) before.set(t.id, t);
  for (const s of p.sheets)
    for (const t of s.types) {
      const e = t.lib ? lib.get(t.lib) : undefined;
      const v = e?.variants.find((x) => x.id === t.vari);
      const o = before.get(t.id);
      if (!e || !v) {
        /* 沒有綁定（或綁到已刪掉的）：新增的、被改動的、開檔整理時收錄成新的一筆 */
        if (t.lib || t.vari) {
          t.lib = 0;
          t.vari = 0;
        }
        const edited = !prev || !o || REL_KEYS.some((k) => !same(t[k], o[k]));
        if (!edited) continue;
        const ne: RelEntry = { id: take(), variants: [relVariantFrom(t, take())] };
        p.relLibrary.push(ne);
        lib.set(ne.id, ne);
        t.lib = ne.id;
        t.vari = ne.variants[0].id;
        continue;
      }
      if (!o || o.lib !== t.lib || o.vari !== t.vari) continue;
      for (const k of REL_KEYS)
        if (!same(t[k], o[k]) && !same(t[k], v[k]))
          (v as unknown as Record<string, unknown>)[k] = clone(t[k]);
    }
  for (const s of p.sheets)
    for (const t of s.types) {
      const v = t.lib ? lib.get(t.lib)?.variants.find((x) => x.id === t.vari) : undefined;
      if (!v) continue;
      for (const k of REL_KEYS)
        if (!same(t[k], v[k])) (t as unknown as Record<string, unknown>)[k] = clone(v[k]);
    }
}

/* ---------- 動作用的小工具（在草稿上改） ---------- */

/**
 * 複製成新的人（原作的 forkLibEntry）：新條目只帶目前這件變體（含標籤、數值、頭像框），角色資訊與角色字型也帶過去。
 * 回傳新條目與變體的 id（實例自己換上）。
 */
export function forkEntry(
  p: Project,
  c: Pick<Char, 'lib' | 'vari'>,
): { lib: number; vari: number } {
  const { entry, variant } = variantOf(p, c);
  const take = taker(p);
  const eid = take();
  const vid = take();
  if (!entry || !variant) return { lib: 0, vari: 0 };
  p.library.push({
    id: eid,
    variants: [variantFrom(variant, vid, variant.radars)],
    unified: false,
    info: entry.info,
    font: entry.font,
  });
  return { lib: eid, vari: vid };
}

/**
 * 空角色回收（原作的 reclaimVirginLibEntry）：刪掉角色之後，條目只有一件變體、名字空白、沒有圖片與圖示、沒有標籤、
 * 也沒有其他實例在用＝條目一起刪。
 */
export function reclaimVirgin(p: Project, entryIds: Iterable<number>): void {
  const used = new Set<number>();
  for (const s of p.sheets) for (const c of allChars(s)) used.add(c.lib);
  const drop = new Set<number>();
  for (const id of entryIds) {
    if (used.has(id)) continue;
    const e = entryById(p, id);
    const v = e?.variants[0];
    if (!e || !v || e.variants.length !== 1) continue;
    if (v.name.trim() || v.avatar || v.icon || v.labels.length || v.radars.length || e.info.trim())
      continue;
    drop.add(id);
  }
  if (drop.size) p.library = p.library.filter((e) => !drop.has(e.id));
}
