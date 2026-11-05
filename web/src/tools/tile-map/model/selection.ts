/**
 * 選取工具：選取的是「格子」（索引），範圍是選中的圖層裡可以編輯的（看得到、不透明度不是 0、沒鎖）。
 * 大圖塊選到一格就整個選進來（跨圖層的選取也一樣，選進來的格子又碰到別的大圖塊時繼續擴大）。
 * 搬動、轉 90°、左右翻轉、刪除在所有可以編輯的選中圖層上一起做，算一步。
 *
 * 變換的做法：先算出選取的外框（含兩端的左、上、右、下），每種操作是「舊位置 → 新位置」與「圖塊怎麼變」
 * 兩個小函式（moverFor）；每個圖層照同一份對照表搬。
 */
import { editableLayer, MapError } from './map';
import type { Cell, Layer, Placed, TileMap, Turn } from './types';

export type SelectionOp = 'move' | 'rotate' | 'flip' | 'delete';

const editableOf = (map: TileMap, layerIds: ReadonlySet<string>): Layer[] =>
  map.layers.filter((l) => layerIds.has(l.id) && editableLayer(l));

/** 一個圖層裡每個大圖塊佔的格子（大圖塊的編號 → 索引） */
function piecesOf(layer: Layer): Map<string, number[]> {
  const pieces = new Map<string, number[]>();
  layer.cells.forEach((c, i) => {
    if (!c?.i) return;
    const list = pieces.get(c.i);
    if (list) list.push(i);
    else pieces.set(c.i, [i]);
  });
  return pieces;
}

/**
 * 選取擴大到完整的大圖塊（跨圖層）：待查的格子排成一列，每一格看各圖層在那裡的大圖塊，
 * 沒查過的大圖塊把它其餘的格子加進選取、也排進待查（新加進來的格子在別的圖層可能碰到別的大圖塊）。
 */
export function expandInstances(layers: readonly Layer[], indices: Iterable<number>): number[] {
  const picked = new Set(indices);
  const pieces: (Map<string, number[]> | undefined)[] = [];
  const seen = layers.map(() => new Set<string>());
  const queue = [...picked];
  for (let q = 0; q < queue.length; q++) {
    const at = queue[q];
    layers.forEach((layer, li) => {
      const id = layer.cells[at]?.i;
      if (!id || seen[li].has(id)) return;
      seen[li].add(id);
      pieces[li] ??= piecesOf(layer);
      for (const k of pieces[li].get(id) ?? [])
        if (!picked.has(k)) {
          picked.add(k);
          queue.push(k);
        }
    });
  }
  return [...picked];
}

/** a 到 b（含兩端、不分大小）夾在 0～size−1 之間的整數 */
function clippedRange(a: number, b: number, size: number): number[] {
  const from = Math.max(0, Math.min(a, b));
  const to = Math.min(size - 1, Math.max(a, b));
  return to < from ? [] : Array.from({ length: to - from + 1 }, (_, k) => from + k);
}

/** 長方形範圍（兩個角的格子，含）裡、選中的可編輯圖層上有東西的格子 */
export function selectInRect(
  map: TileMap,
  layerIds: ReadonlySet<string>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number[] {
  const layers = editableOf(map, layerIds);
  if (!layers.length) return [];
  const cols = clippedRange(x0, x1, map.width);
  const hits = clippedRange(y0, y1, map.height).flatMap((row) =>
    cols.map((col) => row * map.width + col).filter((i) => layers.some((l) => l.cells[i])),
  );
  return expandInstances(layers, hits);
}

/** 外框：含兩端的左、上、右、下（格） */
interface Edges {
  l: number;
  t: number;
  r: number;
  b: number;
}

function edgesOf(width: number, height: number, indices: Iterable<number>): Edges | null {
  let e: Edges | null = null;
  for (const i of indices) {
    if (!Number.isInteger(i) || i < 0 || i >= width * height) continue;
    const x = i % width;
    const y = (i - x) / width;
    if (!e) e = { l: x, t: y, r: x, b: y };
    else {
      if (x < e.l) e.l = x;
      if (x > e.r) e.r = x;
      if (y < e.t) e.t = y;
      if (y > e.b) e.b = y;
    }
  }
  return e;
}

/** 選取的外框（格） */
export function selectionBounds(
  width: number,
  height: number,
  indices: Iterable<number>,
): { x: number; y: number; width: number; height: number } | null {
  const e = edgesOf(width, height, indices);
  return e && { x: e.l, y: e.t, width: e.r - e.l + 1, height: e.b - e.t + 1 };
}

const turn = (r: number): Turn => (((r % 4) + 4) % 4) as Turn;

/** 一種變換：舊位置 → 新位置，與那一格的圖塊怎麼變（刪除沒有新位置） */
interface Mover {
  to: (x: number, y: number) => [number, number];
  cell: (c: Placed) => Placed;
}

function moverFor(op: Exclude<SelectionOp, 'delete'>, e: Edges, dx: number, dy: number): Mover {
  switch (op) {
    /* 在外框裡順時針轉：左邊那一行變成最上面一列（外框的左上角不動） */
    case 'rotate':
      return {
        to: (x, y) => [e.l + (e.b - y), e.t + (x - e.l)],
        cell: (c) => ({ ...c, r: turn(c.r + 1) }),
      };
    /* 在外框裡左右對調；先翻轉再轉向，所以翻過來之後轉向變成反方向 */
    case 'flip':
      return { to: (x, y) => [e.l + e.r - x, y], cell: (c) => ({ ...c, r: turn(-c.r), f: !c.f }) };
    default:
      return { to: (x, y) => [x + dx, y + dy], cell: (c) => c };
  }
}

/**
 * 對選取做 op（搬動 dx、dy 格／轉 90°／左右翻轉／刪除）。回傳新地圖與新的選取；
 * 沒有可以編輯的選中圖層丟 MapError('no-layer')，會跑到地圖外丟 MapError('leave')。
 * 落點上原本有別的大圖塊時，那個大圖塊整個拿掉。
 */
export function transformSelection(
  map: TileMap,
  layerIds: ReadonlySet<string>,
  indices: Iterable<number>,
  op: SelectionOp,
  dx = 0,
  dy = 0,
): { map: TileMap; selection: number[] } {
  const layers = editableOf(map, layerIds);
  if (!layers.length) throw new MapError('no-layer');
  const W = map.width;
  /* 真的要動的格子：擴大到完整的大圖塊、在地圖裡、至少一個圖層上有東西 */
  const picked = expandInstances(layers, indices).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < W * map.height && layers.some((l) => l.cells[i]),
  );
  const edges = edgesOf(W, map.height, picked);
  if (!edges) return { map, selection: [] };

  /* 舊索引 → 新索引（刪除時是空的對照表：只清掉、不放回去） */
  const target = new Map<number, number>();
  let change = (c: Placed) => c;
  if (op !== 'delete') {
    const mover = moverFor(op, edges, dx, dy);
    for (const i of picked) {
      const [x, y] = mover.to(i % W, Math.floor(i / W));
      if (x < 0 || y < 0 || x >= W || y >= map.height) throw new MapError('leave');
      target.set(i, y * W + x);
    }
    change = mover.cell;
  }
  return {
    map: applyMoves(map, layers, picked, target, change),
    selection: [...new Set(target.values())],
  };
}

/** 每個圖層：先清掉選到的格子，落點上別的大圖塊整個拿掉，再把圖塊放到新位置 */
function applyMoves(
  map: TileMap,
  layers: readonly Layer[],
  picked: readonly number[],
  target: ReadonlyMap<number, number>,
  change: (c: Placed) => Placed,
): TileMap {
  const changed = new Map<string, Cell[]>();
  for (const layer of layers) {
    const before = layer.cells;
    const after = before.slice();
    const moving: [number, Placed][] = [];
    for (const i of picked) {
      const c = before[i];
      if (!c) continue;
      after[i] = null;
      const to = target.get(i);
      if (to !== undefined) moving.push([to, change(c)]);
    }
    const crushed = new Set<string>();
    for (const [to] of moving) {
      const id = after[to]?.i;
      if (id) crushed.add(id);
    }
    if (crushed.size)
      for (let k = 0; k < after.length; k++) {
        const id = after[k]?.i;
        if (id && crushed.has(id)) after[k] = null;
      }
    for (const [to, c] of moving) after[to] = c;
    changed.set(layer.id, after);
  }
  return {
    ...map,
    layers: map.layers.map((l) => {
      const cells = changed.get(l.id);
      return cells ? { ...l, cells } : l;
    }),
  };
}
