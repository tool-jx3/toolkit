/**
 * 存檔的編碼與檢查（專案檔、自動存檔、圖庫備份共用）。
 *
 * 地圖的格子不直接寫成物件陣列（200 × 200 格、12 層時太大）：每一層列出用到的「放法」（圖塊、轉向、翻轉、
 * 大圖塊的編號與第幾塊），格子寫成連續相同的段（放法的序號＋連續幾格；0＝空的）。
 * 讀進來時逐項檢查，不合規格的整個檔案不收（訊息交給呼叫的人翻成介面文字）。
 */

import { placed } from './large';
import { validSize } from './map';
import {
  type Cell,
  type Layer,
  LIMITS,
  OPACITIES,
  type Opacity,
  type Placed,
  type TileDef,
  type TileMap,
  type Turn,
} from './types';

export class CodecError extends Error {
  constructor(readonly code: 'map' | 'layer' | 'cells' | 'tile' | 'def' | 'library') {
    super(code);
    this.name = 'CodecError';
  }
}

/** [圖塊 id, 轉向, 翻轉(0/1), 大圖塊編號?, 第幾欄?, 第幾列?] */
export type PlacedKey = [string, number, number] | [string, number, number, string, number, number];

export interface EncodedLayer {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  keys: PlacedKey[];
  /** [序號(0＝空), 連續幾格, …] */
  runs: number[];
}

export interface EncodedMap {
  name: string;
  width: number;
  height: number;
  background: string;
  layers: EncodedLayer[];
  defs: TileDef[];
}

const keyOf = (c: Placed): string =>
  c.i
    ? `${c.t}\u0000${c.r}\u0000${c.f ? 1 : 0}\u0000${c.i}\u0000${c.p?.[0] ?? 0}\u0000${c.p?.[1] ?? 0}`
    : `${c.t}\u0000${c.r}\u0000${c.f ? 1 : 0}`;

export function encodeLayer(l: Layer): EncodedLayer {
  const index = new Map<string, number>();
  const keys: PlacedKey[] = [];
  const runs: number[] = [];
  let prev = -1;
  let count = 0;
  for (const c of l.cells) {
    let k = 0;
    if (c) {
      const s = keyOf(c);
      let n = index.get(s);
      if (n === undefined) {
        keys.push(
          c.i
            ? [c.t, c.r, c.f ? 1 : 0, c.i, c.p?.[0] ?? 0, c.p?.[1] ?? 0]
            : [c.t, c.r, c.f ? 1 : 0],
        );
        n = keys.length;
        index.set(s, n);
      }
      k = n;
    }
    if (k === prev) count++;
    else {
      if (count) runs.push(prev, count);
      prev = k;
      count = 1;
    }
  }
  if (count) runs.push(prev, count);
  return {
    id: l.id,
    name: l.name,
    visible: l.visible,
    locked: l.locked,
    opacity: l.opacity,
    keys,
    runs,
  };
}

export function encodeMap(map: TileMap): EncodedMap {
  return {
    name: map.name,
    width: map.width,
    height: map.height,
    background: map.background,
    layers: map.layers.map(encodeLayer),
    defs: Object.values(map.defs),
  };
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const nameOk = (v: unknown): v is string =>
  typeof v === 'string' && !!v.trim() && Array.from(v).length <= LIMITS.maxName;
export const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const ID_RE = /^[\w:.-]{1,200}$/;

/** 圖塊定義的檢查（不合格丟 CodecError('def')） */
export function readDef(raw: unknown): TileDef {
  if (!raw || typeof raw !== 'object') throw new CodecError('def');
  const d = raw as Record<string, unknown>;
  if (!isStr(d.id, 200) || !ID_RE.test(d.id)) throw new CodecError('def');
  if (typeof d.name !== 'string' || Array.from(d.name).length > LIMITS.maxName)
    throw new CodecError('def');
  if (!isStr(d.src, 200) || !isStr(d.set, 200)) throw new CodecError('def');
  const r = d.rect;
  if (!Array.isArray(r) || r.length !== 4 || !r.every(isInt)) throw new CodecError('def');
  const [x, y, w, h] = r as number[];
  if (x < 0 || y < 0 || w < 1 || h < 1 || x + w > 8192 || y + h > 8192) throw new CodecError('def');
  const def: TileDef = {
    id: d.id,
    name: d.name,
    src: d.src,
    rect: [x, y, w, h],
    pixel: d.pixel !== false,
    set: d.set,
  };
  if (d.span !== undefined) {
    const s = d.span;
    if (!Array.isArray(s) || s.length !== 2 || !s.every((n) => isInt(n) && n >= 1 && n <= 200))
      throw new CodecError('def');
    if (s[0] !== 1 || s[1] !== 1) def.span = [s[0], s[1]];
  }
  if (d.gap !== undefined) {
    if (!isInt(d.gap) || d.gap < 0 || d.gap > 1024) throw new CodecError('def');
    if (d.gap) def.gap = d.gap;
  }
  if (def.span) {
    const [cols, rows] = def.span;
    const g = def.gap ?? 0;
    const cw = (w - (cols - 1) * g) / cols;
    const ch = (h - (rows - 1) * g) / rows;
    if (!Number.isInteger(cw) || !Number.isInteger(ch) || cw < 1 || ch < 1)
      throw new CodecError('def');
  }
  if (typeof d.cat === 'string' && d.cat.length <= 40) def.cat = d.cat;
  return def;
}

function readLayer(
  raw: unknown,
  width: number,
  height: number,
  known: (id: string) => TileDef | undefined,
  at: number,
): Layer {
  if (!raw || typeof raw !== 'object') throw new CodecError('layer');
  const l = raw as Record<string, unknown>;
  const id = typeof l.id === 'string' && ID_RE.test(l.id) ? l.id : `layer-${at}`;
  if (!nameOk(l.name)) throw new CodecError('layer');
  if (typeof l.visible !== 'boolean' || typeof l.locked !== 'boolean')
    throw new CodecError('layer');
  const opacity = (l.opacity ?? 1) as Opacity;
  if (!OPACITIES.includes(opacity)) throw new CodecError('layer');
  if (!Array.isArray(l.keys) || !Array.isArray(l.runs) || l.runs.length % 2)
    throw new CodecError('cells');
  const placements: Placed[] = l.keys.map((k: unknown) => {
    if (!Array.isArray(k) || (k.length !== 3 && k.length !== 6)) throw new CodecError('cells');
    const [t, r, f] = k;
    if (typeof t !== 'string' || !isInt(r) || r < 0 || r > 3 || (f !== 0 && f !== 1))
      throw new CodecError('cells');
    const def = known(t);
    if (!def) throw new CodecError('tile');
    if (k.length === 3) return placed(t, r, f === 1);
    const [, , , i, px, py] = k;
    const span = def.span ?? [1, 1];
    if (
      typeof i !== 'string' ||
      !i ||
      i.length > 100 ||
      !isInt(px) ||
      !isInt(py) ||
      px < 0 ||
      py < 0 ||
      px >= span[0] ||
      py >= span[1]
    )
      throw new CodecError('cells');
    return Object.freeze({
      t,
      r: r as Turn,
      f: f === 1,
      i,
      p: Object.freeze([px, py]) as readonly [number, number],
    });
  });
  const total = width * height;
  const cells: Cell[] = [];
  for (let n = 0; n < l.runs.length; n += 2) {
    const k = l.runs[n];
    const count = l.runs[n + 1];
    if (
      !isInt(k) ||
      !isInt(count) ||
      k < 0 ||
      k > placements.length ||
      count < 1 ||
      cells.length + count > total
    )
      throw new CodecError('cells');
    const v = k ? placements[k - 1] : null;
    for (let c = 0; c < count; c++) cells.push(v);
  }
  if (cells.length !== total) throw new CodecError('cells');
  return { id, name: l.name.trim(), visible: l.visible, locked: l.locked, opacity, cells };
}

/**
 * 讀地圖（專案檔、自動存檔）。builtin：內建圖塊的定義（地圖上用到但地圖沒記定義、也不是內建的圖塊 → 不收）。
 */
export function decodeMap(raw: unknown, builtin: (id: string) => TileDef | undefined): TileMap {
  if (!raw || typeof raw !== 'object') throw new CodecError('map');
  const m = raw as Record<string, unknown>;
  if (!isInt(m.width) || !isInt(m.height) || !validSize(m.width, m.height))
    throw new CodecError('map');
  if (typeof m.name !== 'string' || Array.from(m.name).length > LIMITS.maxName)
    throw new CodecError('map');
  if (typeof m.background !== 'string' || !HEX_COLOR.test(m.background))
    throw new CodecError('map');
  if (!Array.isArray(m.layers) || m.layers.length < 1 || m.layers.length > LIMITS.maxLayers)
    throw new CodecError('map');
  const defsRaw = Array.isArray(m.defs) ? m.defs : [];
  const defs: Record<string, TileDef> = {};
  for (const d of defsRaw) {
    const def = readDef(d);
    if (builtin(def.id)) continue;
    defs[def.id] = def;
  }
  const known = (id: string) => builtin(id) ?? defs[id];
  const ids = new Set<string>();
  const layers = m.layers.map((l, i) => {
    const layer = readLayer(l, m.width as number, m.height as number, known, i);
    if (ids.has(layer.id)) layer.id = `${layer.id}-${i}`;
    ids.add(layer.id);
    return layer;
  });
  return {
    name: m.name.trim(),
    width: m.width,
    height: m.height,
    background: m.background.toLowerCase(),
    layers,
    defs,
  };
}
