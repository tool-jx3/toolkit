/**
 * 地圖整體的操作（都回傳新的地圖，不改原本的；復原由 store 記）：新地圖、圖層（新增、複製、刪除、排序、
 * 顯示／鎖定／不透明度／名稱）、改大小、整張移動、換上一層畫好的格子。
 */
import {
  type Cell,
  DEFAULT_BACKGROUND,
  type Layer,
  LIMITS,
  OPACITIES,
  type Opacity,
  type TileDef,
  type TileMap,
} from './types';

export class MapError extends Error {
  constructor(
    readonly code:
      | 'size'
      | 'layers-max'
      | 'layers-min'
      | 'layer-missing'
      | 'name'
      | 'opacity'
      | 'crop'
      | 'no-layer'
      | 'leave',
    readonly count = 0,
  ) {
    super(code);
    this.name = 'MapError';
  }
}

/** 地圖大小可不可以用（每邊 4～200 格、總共不超過 40,000 格） */
export function validSize(width: number, height: number): boolean {
  return (
    Number.isInteger(width) &&
    Number.isInteger(height) &&
    width >= LIMITS.minSide &&
    height >= LIMITS.minSide &&
    width <= LIMITS.maxSide &&
    height <= LIMITS.maxSide &&
    width * height <= LIMITS.maxCells
  );
}

let layerSeq = 0;
export function newLayerId(): string {
  layerSeq = (layerSeq + 1) % 1_000_000;
  return `L${Date.now().toString(36)}${layerSeq.toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function emptyCells(width: number, height: number): Cell[] {
  return new Array<Cell>(width * height).fill(null);
}

export function newLayer(name: string, width: number, height: number, id = newLayerId()): Layer {
  return { id, name, visible: true, locked: false, opacity: 1, cells: emptyCells(width, height) };
}

/** 新地圖：三個圖層（地面、牆壁、物件） */
export function createMap(
  width: number,
  height: number,
  name: string,
  layerNames: readonly [string, string, string],
): TileMap {
  if (!validSize(width, height)) throw new MapError('size');
  return {
    name,
    width,
    height,
    background: DEFAULT_BACKGROUND,
    layers: layerNames.map((n, i) => newLayer(n, width, height, `layer-${i}`)),
    defs: {},
  };
}

const replaceLayer = (map: TileMap, index: number, layer: Layer): TileMap => ({
  ...map,
  layers: map.layers.map((l, i) => (i === index ? layer : l)),
});

/** 換上一層畫好的格子；加上新用到的自訂圖塊的定義 */
export function withLayerCells(
  map: TileMap,
  index: number,
  cells: readonly Cell[],
  defs: readonly TileDef[] = [],
): TileMap {
  const layer = map.layers[index];
  if (!layer) return map;
  const next = replaceLayer(map, index, { ...layer, cells });
  return addDefs(next, defs);
}

/** 地圖記下這些自訂圖塊的定義（已經有的不動） */
export function addDefs(map: TileMap, defs: readonly TileDef[]): TileMap {
  const add = defs.filter((d) => !map.defs[d.id]);
  if (!add.length) return map;
  const out = { ...map.defs };
  for (const d of add) out[d.id] = d;
  return { ...map, defs: out };
}

/** 地圖上用到的圖塊 id（所有圖層） */
export function usedTileIds(map: Pick<TileMap, 'layers'>): Set<string> {
  const s = new Set<string>();
  for (const l of map.layers) for (const c of l.cells) if (c) s.add(c.t);
  return s;
}

/** 只留用到的自訂圖塊定義（存檔前整理） */
export function pruneDefs(map: TileMap): TileMap {
  const used = usedTileIds(map);
  const keys = Object.keys(map.defs);
  if (keys.every((k) => used.has(k))) return map;
  const out: Record<string, TileDef> = {};
  for (const k of keys) if (used.has(k)) out[k] = map.defs[k];
  return { ...map, defs: out };
}

/* ---------- 圖層 ---------- */

/** 新圖層的名字：「圖層 N」，N 從圖層數＋1 起找沒用過的 */
export function nextLayerName(map: TileMap, label: (n: number) => string): string {
  const names = new Set(map.layers.map((l) => l.name));
  let n = map.layers.length + 1;
  while (names.has(label(n))) n++;
  return label(n);
}

/** 複製的名字：「<原名> 的副本」，重複時「…的副本 2」、「…的副本 3」… */
export function copyLayerName(
  map: TileMap,
  source: string,
  label: (name: string, n: number) => string,
): string {
  const names = new Set(map.layers.map((l) => l.name));
  const base = Array.from(source).slice(0, 85).join('');
  let n = 1;
  while (names.has(label(base, n))) n++;
  return label(base, n);
}

/** 新增圖層（放在最上面）；回傳新地圖與新圖層的 id */
export function addLayer(
  map: TileMap,
  name: string,
  max: number = LIMITS.maxLayers,
): { map: TileMap; id: string } {
  if (map.layers.length >= max) throw new MapError('layers-max');
  const layer = newLayer(name, map.width, map.height);
  return { map: { ...map, layers: [...map.layers, layer] }, id: layer.id };
}

/** 複製圖層（放在原本那層的正上方） */
export function duplicateLayer(
  map: TileMap,
  id: string,
  name: string,
  max: number = LIMITS.maxLayers,
): { map: TileMap; id: string } {
  if (map.layers.length >= max) throw new MapError('layers-max');
  const at = map.layers.findIndex((l) => l.id === id);
  if (at < 0) throw new MapError('layer-missing');
  const src = map.layers[at];
  const layer: Layer = { ...src, id: newLayerId(), name };
  const layers = [...map.layers];
  layers.splice(at + 1, 0, layer);
  return { map: { ...map, layers }, id: layer.id };
}

export function deleteLayer(map: TileMap, id: string): TileMap {
  if (map.layers.length <= 1) throw new MapError('layers-min');
  if (!map.layers.some((l) => l.id === id)) throw new MapError('layer-missing');
  return { ...map, layers: map.layers.filter((l) => l.id !== id) };
}

/** 把圖層移到第 to 個位置（0＝最下面） */
export function moveLayer(map: TileMap, id: string, to: number): TileMap {
  const from = map.layers.findIndex((l) => l.id === id);
  if (from < 0) throw new MapError('layer-missing');
  const target = Math.max(0, Math.min(map.layers.length - 1, to));
  if (target === from) return map;
  const layers = [...map.layers];
  const [l] = layers.splice(from, 1);
  layers.splice(target, 0, l);
  return { ...map, layers };
}

export interface LayerPatch {
  name?: string;
  visible?: boolean;
  locked?: boolean;
  opacity?: Opacity;
}

export function setLayer(map: TileMap, id: string, patch: LayerPatch): TileMap {
  const at = map.layers.findIndex((l) => l.id === id);
  if (at < 0) throw new MapError('layer-missing');
  const next: Layer = { ...map.layers[at] };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name || Array.from(name).length > LIMITS.maxName) throw new MapError('name');
    next.name = name;
  }
  if (patch.opacity !== undefined) {
    if (!OPACITIES.includes(patch.opacity)) throw new MapError('opacity');
    next.opacity = patch.opacity;
  }
  if (patch.visible !== undefined) next.visible = patch.visible;
  if (patch.locked !== undefined) next.locked = patch.locked;
  const cur = map.layers[at];
  if (
    next.name === cur.name &&
    next.opacity === cur.opacity &&
    next.visible === cur.visible &&
    next.locked === cur.locked
  )
    return map;
  return replaceLayer(map, at, next);
}

/** 圖層可以拿來選取、搬動（看得到、不透明度不是 0、沒鎖） */
export const editableLayer = (l: Layer): boolean => l.visible && l.opacity !== 0 && !l.locked;
/** 圖層可以畫（同上） */
export const paintableLayer = editableLayer;

/** 圖層上有幾格放了東西 */
export const filledCount = (l: Layer): number => l.cells.reduce((n, c) => (c ? n + 1 : n), 0);

/* ---------- 大小與整張移動 ---------- */

/** 移動 dx、dy 格之後落到 width × height 外面的格數（所有圖層） */
export function countCropped(
  map: TileMap,
  width: number,
  height: number,
  dx: number,
  dy: number,
): number {
  let n = 0;
  for (const l of map.layers)
    l.cells.forEach((c, i) => {
      if (!c) return;
      const x = (i % map.width) + dx;
      const y = Math.floor(i / map.width) + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) n++;
    });
  return n;
}

function remap(map: TileMap, width: number, height: number, dx: number, dy: number): TileMap {
  return {
    ...map,
    width,
    height,
    layers: map.layers.map((l) => {
      const cells = emptyCells(width, height);
      l.cells.forEach((c, i) => {
        if (!c) return;
        const x = (i % map.width) + dx;
        const y = Math.floor(i / map.width) + dy;
        if (x >= 0 && y >= 0 && x < width && y < height) cells[y * width + x] = c;
      });
      return { ...l, cells };
    }),
  };
}

/** 改大小（左上角不動）；有圖塊會被裁掉而沒有允許時丟 MapError('crop', 格數) */
export function resizeMap(map: TileMap, width: number, height: number, allowCrop = false): TileMap {
  if (!validSize(width, height)) throw new MapError('size');
  if (width === map.width && height === map.height) return map;
  const cropped = countCropped(map, width, height, 0, 0);
  if (cropped && !allowCrop) throw new MapError('crop', cropped);
  return remap(map, width, height, 0, 0);
}

/** 整張移動 dx、dy 格（地圖大小不變）；有圖塊會移到外面而沒有允許時丟 MapError('crop', 格數) */
export function shiftMap(map: TileMap, dx: number, dy: number, allowCrop = false): TileMap {
  if (!Number.isInteger(dx) || !Number.isInteger(dy)) throw new MapError('size');
  if (!dx && !dy) return map;
  const cropped = countCropped(map, map.width, map.height, dx, dy);
  if (cropped && !allowCrop) throw new MapError('crop', cropped);
  return remap(map, map.width, map.height, dx, dy);
}
