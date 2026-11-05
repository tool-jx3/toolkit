/**
 * 圖庫：自己匯入的圖塊組（同一個瀏覽器的所有地圖共用，存在 IndexedDB；不列入地圖的復原）。
 *
 * - 圖塊組有好幾次「匯入」（一次匯入＝一張圖塊表或一批圖檔），可以刪掉單一次匯入或整個圖塊組；
 *   已經放在地圖上的不受影響（地圖自己記著用到的圖塊的定義）。
 * - 刪掉的圖塊組與圖塊記下來：之後開啟帶著它們的專案檔時不會又加回圖庫（帶進來的地圖照樣畫得出來）。
 * - 圖塊的排列（拖曳排序）、內建圖塊組改過的名字、隱藏的內建圖塊組也存在這裡，備份時一起帶走。
 */
import { CodecError, readDef } from './codec';
import { LIMITS, type TileDef } from './types';

export interface CustomImport {
  id: string;
  name: string;
  tiles: TileDef[];
}

export interface CustomSet {
  id: string;
  name: string;
  imports: CustomImport[];
}

export interface Library {
  sets: CustomSet[];
  /** 刪掉的自訂圖塊組與圖塊的 id */
  removed: string[];
  /** 圖塊的排列：圖塊組 id → 圖塊 id（沒列到的照原本的順序排在後面） */
  order: Record<string, string[]>;
  /** 內建圖塊組改過的名字 */
  names: Record<string, string>;
  /** 收起來（不在調色盤列出）的內建圖塊組 */
  hidden: string[];
}

/** 自訂圖塊組最多幾組；一個圖庫最多幾個自訂圖塊 */
export const MAX_SETS = 64;
export const MAX_LIBRARY_TILES = 4096;

export const emptyLibrary = (): Library => ({
  sets: [],
  removed: [],
  order: {},
  names: {},
  hidden: [],
});

export class LibraryError extends Error {
  constructor(readonly code: 'sets-max' | 'tiles-max' | 'missing' | 'name' | 'empty') {
    super(code);
    this.name = 'LibraryError';
  }
}

const rand = () => Math.random().toString(36).slice(2, 10);
export const newSetId = () => `custom-${Date.now().toString(36)}${rand()}`;
export const newTileId = () => `c${Date.now().toString(36)}${rand()}`;
export const newImportId = () => `import-${Date.now().toString(36)}${rand()}`;

const cleanName = (name: string): string => {
  const n = name.trim();
  if (!n || Array.from(n).length > LIMITS.maxName) throw new LibraryError('name');
  return n;
};

/** 圖庫裡所有自訂圖塊 */
export const libraryTiles = (lib: Library): TileDef[] =>
  lib.sets.flatMap((s) => s.imports.flatMap((i) => i.tiles));

export const setTiles = (set: CustomSet): TileDef[] => set.imports.flatMap((i) => i.tiles);

export function createSet(lib: Library, name: string): { lib: Library; id: string } {
  if (lib.sets.length >= MAX_SETS) throw new LibraryError('sets-max');
  const id = newSetId();
  return { lib: { ...lib, sets: [...lib.sets, { id, name: cleanName(name), imports: [] }] }, id };
}

/** 改名：自訂圖塊組改本身的名字；內建的記在 names */
export function renameSet(lib: Library, id: string, name: string, builtin: boolean): Library {
  const n = cleanName(name);
  if (builtin) return { ...lib, names: { ...lib.names, [id]: n } };
  if (!lib.sets.some((s) => s.id === id)) throw new LibraryError('missing');
  return { ...lib, sets: lib.sets.map((s) => (s.id === id ? { ...s, name: n } : s)) };
}

/** 加一次匯入（tiles 的 id、set 由這裡給） */
export function addImport(
  lib: Library,
  setId: string,
  name: string,
  tiles: readonly Omit<TileDef, 'id' | 'set'>[],
): { lib: Library; tiles: TileDef[] } {
  const set = lib.sets.find((s) => s.id === setId);
  if (!set) throw new LibraryError('missing');
  if (!tiles.length) throw new LibraryError('empty');
  if (libraryTiles(lib).length + tiles.length > MAX_LIBRARY_TILES)
    throw new LibraryError('tiles-max');
  const made: TileDef[] = tiles.map((t) => ({ ...t, id: newTileId(), set: setId }));
  const imp: CustomImport = {
    id: newImportId(),
    name: Array.from(name.trim() || set.name)
      .slice(0, LIMITS.maxName)
      .join(''),
    tiles: made,
  };
  return {
    lib: {
      ...lib,
      sets: lib.sets.map((s) => (s.id === setId ? { ...s, imports: [...s.imports, imp] } : s)),
    },
    tiles: made,
  };
}

const unique = (list: readonly string[]): string[] => [...new Set(list)];

export function deleteImport(lib: Library, setId: string, importId: string): Library {
  const set = lib.sets.find((s) => s.id === setId);
  const imp = set?.imports.find((i) => i.id === importId);
  if (!set || !imp) throw new LibraryError('missing');
  const gone = new Set(imp.tiles.map((t) => t.id));
  const order = lib.order[setId];
  return {
    ...lib,
    sets: lib.sets.map((s) =>
      s.id === setId ? { ...s, imports: s.imports.filter((i) => i.id !== importId) } : s,
    ),
    removed: unique([...lib.removed, ...gone]),
    order: order ? { ...lib.order, [setId]: order.filter((id) => !gone.has(id)) } : lib.order,
  };
}

export function deleteSet(lib: Library, setId: string): Library {
  const set = lib.sets.find((s) => s.id === setId);
  if (!set) throw new LibraryError('missing');
  const { [setId]: _drop, ...order } = lib.order;
  return {
    ...lib,
    sets: lib.sets.filter((s) => s.id !== setId),
    removed: unique([...lib.removed, setId, ...setTiles(set).map((t) => t.id)]),
    order,
  };
}

export function setHidden(lib: Library, setId: string, hidden: boolean): Library {
  const has = lib.hidden.includes(setId);
  if (has === hidden) return lib;
  return {
    ...lib,
    hidden: hidden ? [...lib.hidden, setId] : lib.hidden.filter((h) => h !== setId),
  };
}

/* ---------- 排列 ---------- */

/** 依記下的順序排（沒記到的新圖塊照原本的順序排在後面；記錄裡已經不在的 id 不影響） */
export function orderedTiles<T extends { id: string }>(
  tiles: readonly T[],
  order: readonly string[] = [],
): T[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return tiles
    .map((t, i) => ({ t, i }))
    .sort(
      (a, b) =>
        (rank.get(a.t.id) ?? Number.POSITIVE_INFINITY) -
          (rank.get(b.t.id) ?? Number.POSITIVE_INFINITY) || a.i - b.i,
    )
    .map((x) => x.t);
}

/**
 * 把 moving（一個或好幾個圖塊）移到 target 的前面（after＝後面）；回傳新的完整順序。
 * target 在 moving 裡、或不在清單裡時不動。
 */
export function moveInOrder(
  tiles: readonly { id: string }[],
  order: readonly string[],
  moving: readonly string[],
  target: string,
  after: boolean,
): string[] {
  const list = orderedTiles(tiles, order).map((t) => t.id);
  const ids = new Set(moving);
  const picked = list.filter((id) => ids.has(id));
  if (ids.has(target) || !picked.length || !list.includes(target)) return list;
  const rest = list.filter((id) => !ids.has(id));
  rest.splice(rest.indexOf(target) + (after ? 1 : 0), 0, ...picked);
  return rest;
}

/* ---------- 開專案檔時收進圖庫 ---------- */

export interface AdoptSource {
  /** 地圖用到的自訂圖塊定義 */
  defs: readonly TileDef[];
  /** 專案檔記的圖塊組名稱 */
  setNames: Readonly<Record<string, string>>;
  /** 這次讀入的名稱（新的「匯入」用這個名字） */
  label: string;
}

/**
 * 專案檔帶來的自訂圖塊收進圖庫：圖庫裡沒有、也沒有被刪過的才收；圖塊組不在時新增（名字照專案檔）。
 * 回傳新的圖庫與收進來幾個圖塊。
 */
export function adoptTiles(
  lib: Library,
  src: AdoptSource,
  isBuiltinSet: (id: string) => boolean,
): { lib: Library; added: number } {
  const removed = new Set(lib.removed);
  const known = new Set(libraryTiles(lib).map((t) => t.id));
  const bySet = new Map<string, TileDef[]>();
  for (const d of src.defs) {
    if (isBuiltinSet(d.set) || removed.has(d.id) || removed.has(d.set) || known.has(d.id)) continue;
    const list = bySet.get(d.set) ?? [];
    list.push(d);
    bySet.set(d.set, list);
  }
  if (!bySet.size) return { lib, added: 0 };
  let sets = lib.sets;
  let added = 0;
  let total = known.size;
  for (const [setId, defs] of bySet) {
    const room = Math.max(0, MAX_LIBRARY_TILES - total);
    const take = defs.slice(0, room);
    if (!take.length) break;
    const imp: CustomImport = { id: newImportId(), name: src.label, tiles: take };
    const has = sets.some((s) => s.id === setId);
    if (!has && sets.length >= MAX_SETS) continue;
    sets = has
      ? sets.map((s) => (s.id === setId ? { ...s, imports: [...s.imports, imp] } : s))
      : [...sets, { id: setId, name: src.setNames[setId] ?? src.label, imports: [imp] }];
    added += take.length;
    total += take.length;
  }
  return { lib: { ...lib, sets }, added };
}

/* ---------- 檢查與合併（備份、自動存檔） ---------- */

const strList = (v: unknown, max = 100_000): string[] => {
  if (v === undefined) return [];
  if (
    !Array.isArray(v) ||
    v.length > max ||
    v.some((s) => typeof s !== 'string' || !s || s.length > 500)
  )
    throw new CodecError('library');
  return unique(v as string[]);
};

const strRecord = (v: unknown): Record<string, string> => {
  if (v === undefined) return {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new CodecError('library');
  const out: Record<string, string> = {};
  for (const [k, s] of Object.entries(v)) {
    if (
      k.length > 200 ||
      typeof s !== 'string' ||
      !s.trim() ||
      Array.from(s).length > LIMITS.maxName
    )
      throw new CodecError('library');
    out[k] = s.trim();
  }
  return out;
};

/** 讀圖庫（自動存檔、備份）；不合規格丟 CodecError('library') */
export function readLibrary(raw: unknown): Library {
  if (!raw || typeof raw !== 'object') throw new CodecError('library');
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.sets) || r.sets.length > MAX_SETS) throw new CodecError('library');
  const tileIds = new Set<string>();
  const setIds = new Set<string>();
  const sets: CustomSet[] = r.sets.map((s: unknown) => {
    if (!s || typeof s !== 'object') throw new CodecError('library');
    const o = s as Record<string, unknown>;
    if (typeof o.id !== 'string' || !o.id || o.id.length > 200 || setIds.has(o.id))
      throw new CodecError('library');
    if (typeof o.name !== 'string' || !o.name.trim() || Array.from(o.name).length > LIMITS.maxName)
      throw new CodecError('library');
    if (!Array.isArray(o.imports)) throw new CodecError('library');
    setIds.add(o.id);
    const setId = o.id;
    const imports = o.imports.map((i: unknown) => {
      if (!i || typeof i !== 'object') throw new CodecError('library');
      const im = i as Record<string, unknown>;
      if (
        typeof im.id !== 'string' ||
        !im.id ||
        im.id.length > 200 ||
        typeof im.name !== 'string' ||
        !Array.isArray(im.tiles)
      )
        throw new CodecError('library');
      const tiles = im.tiles.map((t: unknown) => {
        const def = { ...readDef(t), set: setId };
        if (tileIds.has(def.id)) throw new CodecError('library');
        tileIds.add(def.id);
        return def;
      });
      return { id: im.id, name: Array.from(im.name).slice(0, LIMITS.maxName).join(''), tiles };
    });
    return { id: setId, name: o.name.trim(), imports };
  });
  if (tileIds.size > MAX_LIBRARY_TILES) throw new CodecError('library');
  const orderRaw = r.order ?? {};
  if (!orderRaw || typeof orderRaw !== 'object' || Array.isArray(orderRaw))
    throw new CodecError('library');
  const order: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(orderRaw)) {
    if (k.length > 200) throw new CodecError('library');
    order[k] = strList(v);
  }
  return {
    sets,
    removed: strList(r.removed),
    order,
    names: strRecord(r.names),
    hidden: strList(r.hidden, 1000),
  };
}

/**
 * 讀入圖庫備份：備份裡的圖塊組加進來（同一個圖塊組的新圖塊併進去、名字照備份）、排列與內建圖塊組的名字照備份、
 * 收起來的內建圖塊組合併。刪過的紀錄合併，但兩邊都還在的不算刪掉。回傳新的圖庫與加了幾個圖塊。
 */
export function mergeLibrary(current: Library, incoming: Library): { lib: Library; added: number } {
  const known = new Set(libraryTiles(current).map((t) => t.id));
  let sets = current.sets;
  let added = 0;
  let total = known.size;
  for (const s of incoming.sets) {
    const existing = sets.find((x) => x.id === s.id);
    const imports: CustomImport[] = [];
    for (const imp of s.imports) {
      const fresh = imp.tiles
        .filter((t) => !known.has(t.id))
        .slice(0, Math.max(0, MAX_LIBRARY_TILES - total));
      if (!fresh.length) continue;
      for (const t of fresh) known.add(t.id);
      total += fresh.length;
      added += fresh.length;
      imports.push({
        ...imp,
        id: existing?.imports.some((i) => i.id === imp.id) ? newImportId() : imp.id,
        tiles: fresh,
      });
    }
    if (existing)
      sets = sets.map((x) =>
        x.id === s.id ? { ...x, name: s.name, imports: [...x.imports, ...imports] } : x,
      );
    else if (sets.length < MAX_SETS && imports.length) sets = [...sets, { ...s, imports }];
    else if (sets.length < MAX_SETS && !s.imports.length) sets = [...sets, { ...s, imports: [] }];
  }
  const live = new Set([
    ...sets.map((s) => s.id),
    ...sets.flatMap((s) => setTiles(s).map((t) => t.id)),
  ]);
  return {
    lib: {
      sets,
      removed: unique([...current.removed, ...incoming.removed]).filter((id) => !live.has(id)),
      order: { ...current.order, ...incoming.order },
      names: { ...current.names, ...incoming.names },
      hidden: unique([...current.hidden, ...incoming.hidden]),
    },
    added,
  };
}

/** 圖庫用到的圖片（資產 id） */
export const libraryImages = (lib: Library): Set<string> =>
  new Set(libraryTiles(lib).map((t) => t.src));
