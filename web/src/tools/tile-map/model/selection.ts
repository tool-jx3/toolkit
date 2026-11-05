/**
 * 選取工具：選取的是「格子」（索引），範圍是選中的圖層裡可以編輯的（看得到、不透明度不是 0、沒鎖）。
 * 大圖塊選到一格就整個選進來（跨圖層的選取也一樣，選進來的格子又碰到別的大圖塊時繼續擴大）。
 * 搬動、轉 90°、左右翻轉、刪除在所有可以編輯的選中圖層上一起做，算一步。
 */
import { editableLayer, MapError } from './map';
import type { Cell, Layer, Placed, TileMap, Turn } from './types';

export type SelectionOp = 'move' | 'rotate' | 'flip' | 'delete';

const editableOf = (map: TileMap, layerIds: ReadonlySet<string>): Layer[] =>
  map.layers.filter((l) => layerIds.has(l.id) && editableLayer(l));

/** 選取擴大到完整的大圖塊（跨圖層、直到不再變化） */
export function expandInstances(layers: readonly Layer[], indices: Iterable<number>): number[] {
  const out = new Set(indices);
  let changed = true;
  while (changed) {
    changed = false;
    for (const l of layers) {
      const ids = new Set<string>();
      for (const i of out) {
        const id = l.cells[i]?.i;
        if (id) ids.add(id);
      }
      if (!ids.size) continue;
      l.cells.forEach((c, i) => {
        if (c?.i && ids.has(c.i) && !out.has(i)) {
          out.add(i);
          changed = true;
        }
      });
    }
  }
  return [...out];
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
  const out: number[] = [];
  const left = Math.max(0, Math.min(x0, x1));
  const right = Math.min(map.width - 1, Math.max(x0, x1));
  const top = Math.max(0, Math.min(y0, y1));
  const bottom = Math.min(map.height - 1, Math.max(y0, y1));
  for (let y = top; y <= bottom; y++)
    for (let x = left; x <= right; x++) {
      const i = y * map.width + x;
      if (layers.some((l) => l.cells[i])) out.push(i);
    }
  return expandInstances(layers, out);
}

/** 選取的外框（格） */
export function selectionBounds(
  width: number,
  height: number,
  indices: Iterable<number>,
): { x: number; y: number; width: number; height: number } | null {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const i of indices) {
    if (!Number.isInteger(i) || i < 0 || i >= width * height) continue;
    const x = i % width;
    const y = Math.floor(i / width);
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  if (!Number.isFinite(x0)) return null;
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

const turn = (r: number): Turn => (((r % 4) + 4) % 4) as Turn;

/** 一格轉 90°（順時針） */
function rotated(c: Placed): Placed {
  return { ...c, r: turn(c.r + 1) };
}

/** 一格左右翻轉（先翻轉再轉向：翻轉之後轉向變成反方向） */
function flipped(c: Placed): Placed {
  return { ...c, r: turn(-c.r), f: !c.f };
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
  const total = map.width * map.height;
  const active = expandInstances(layers, indices).filter(
    (i) => Number.isInteger(i) && i >= 0 && i < total && layers.some((l) => l.cells[i]),
  );
  const box = selectionBounds(map.width, map.height, active);
  if (!box) return { map, selection: [] };
  const plans = layers.map((layer) => {
    const own = active.filter((i) => layer.cells[i]);
    const moved =
      op === 'delete'
        ? []
        : own.map((i) => {
            const c = layer.cells[i] as Placed;
            const x = (i % map.width) - box.x;
            const y = Math.floor(i / map.width) - box.y;
            if (op === 'rotate')
              return { x: box.x + box.height - 1 - y, y: box.y + x, c: rotated(c) };
            if (op === 'flip') return { x: box.x + box.width - 1 - x, y: box.y + y, c: flipped(c) };
            return { x: box.x + x + dx, y: box.y + y + dy, c };
          });
    return { layer, own, moved };
  });
  if (
    plans.some((p) =>
      p.moved.some((m) => m.x < 0 || m.y < 0 || m.x >= map.width || m.y >= map.height),
    )
  )
    throw new MapError('leave');
  const next = new Map<string, Cell[]>();
  for (const { layer, own, moved } of plans) {
    const cells = layer.cells.slice();
    for (const i of own) cells[i] = null;
    /* 落點上別的大圖塊整個拿掉 */
    const hit = new Set<string>();
    for (const m of moved) {
      const id = cells[m.y * map.width + m.x]?.i;
      if (id) hit.add(id);
    }
    if (hit.size)
      for (let i = 0; i < cells.length; i++)
        if (cells[i]?.i && hit.has(cells[i]!.i!)) cells[i] = null;
    for (const m of moved) cells[m.y * map.width + m.x] = m.c;
    next.set(layer.id, cells);
  }
  const out: TileMap = {
    ...map,
    layers: map.layers.map((l) => (next.has(l.id) ? { ...l, cells: next.get(l.id)! } : l)),
  };
  const selection = [...new Set(plans.flatMap((p) => p.moved.map((m) => m.y * map.width + m.x)))];
  return { map: out, selection };
}
