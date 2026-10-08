/**
 * 格子圖層（規格 1.7、F093）：一個 Fabric 群組，`_cellEntries`（存檔）／`_cellData`（執行中的 Map）是真正的資料；
 * 群組裡的路徑只是畫出來的樣子——同一種填色的格子合成一個外框（evenodd）。
 * 畫筆、橡皮擦拖曳中先疊上暫時的一格（橡皮擦是 destination-out），放開時 commit 重建。
 * 填滿的規則（純資料）在 ../cellLogic.ts。
 */
import { type FabricObject, Group, Path, Rect } from 'fabric';
import { loopsToSvgPath, type MapGrid } from '@/core/grid';
import { type CellEntry, shiftedCells } from '../cellLogic';
import { type MapObj, snapshotWorldPosition } from './objects';
import { applyPatternTransform, patternFill } from './patterns';

/** 一格的填色 */
export function entryFill(e: CellEntry | undefined): string | ReturnType<typeof patternFill> {
  if (!e) return '#888888';
  if (e.mode === 'solid') return e.solidColor || '#888888';
  return patternFill(e.patternId ?? null, '#888888');
}

/** 新的空白格子圖層（群組；快取開著，橡皮擦的 destination-out 只作用在這一層） */
export function newCellGroup(flags: Partial<MapObj> = {}): MapObj {
  const g = new Group([], {
    selectable: false,
    evented: false,
    objectCaching: true,
    lockScalingX: true,
    lockScalingY: true,
    lockRotation: true,
    hasControls: false,
  }) as unknown as MapObj;
  Object.assign(g, { _isCellLayer: true, ...flags });
  initCellRuntime(g);
  return g;
}

export function initCellRuntime(layer: MapObj): void {
  if (!layer._cellData) layer._cellData = new Map();
  layer._pendingErase = new Set();
  layer._tempChildren = [];
  layer._tempByKey = new Map();
}

/** 存檔前：Map → 陣列 */
export function syncCellEntries(layer: MapObj): void {
  layer._cellEntries = layer._cellData ? [...layer._cellData.values()] : [];
}

/** 讀進來之後：陣列 → Map */
export function rebuildCellData(layer: MapObj, grid: MapGrid): void {
  layer._cellData = new Map();
  for (const e of layer._cellEntries ?? []) {
    if (typeof e?.col !== 'number' || typeof e?.row !== 'number') continue;
    layer._cellData.set(grid.cellKey(e.col, e.row), e);
  }
  initCellRuntime(layer);
}

/** 一格的形狀（暫時的；與 commit 後的同樣是 Path，圖樣對齊才一致） */
function cellShape(grid: MapGrid, col: number, row: number, fill: string | object): MapObj {
  const isPattern = typeof fill !== 'string';
  const p = new Path(grid.cellPath(col, row), {
    fill: fill as string,
    stroke: isPattern ? null : (fill as string),
    strokeWidth: isPattern ? 0 : 0.1,
    selectable: false,
    evented: false,
    objectCaching: false,
  }) as unknown as MapObj;
  return p;
}

function removeTemp(layer: MapObj, child: FabricObject): void {
  (layer as unknown as Group).remove(child);
  const list = layer._tempChildren ?? [];
  const i = list.indexOf(child);
  if (i >= 0) list.splice(i, 1);
  const key = (child as MapObj)._cellKey;
  if (key && layer._tempByKey?.get(key) === child) layer._tempByKey.delete(key);
}

/** 畫筆：這一格放上 entry（拖曳中同一格同一種填色不重複） */
export function addCell(
  layer: MapObj,
  grid: MapGrid,
  entry: CellEntry,
  tempFill: string | object,
): void {
  if (!layer._cellData) initCellRuntime(layer);
  const key = grid.cellKey(entry.col, entry.row);
  layer._pendingErase?.delete(key);
  const prev = layer._cellData?.get(key);
  const existing = layer._tempByKey?.get(key);
  if (existing && prev && prev.fillKey === entry.fillKey) return;
  if (existing) removeTemp(layer, existing);
  layer._cellData?.set(key, entry);
  const shape = cellShape(grid, entry.col, entry.row, tempFill);
  shape._temp = true;
  shape._cellKey = key;
  snapshotWorldPosition(shape);
  if (entry.mode === 'pattern')
    applyPatternTransform(shape, {
      offX: entry.patOffX ?? 0,
      offY: entry.patOffY ?? 0,
      deg: entry.patRot ?? 0,
      scale: entry.patScale ?? 1,
    });
  (layer as unknown as Group).add(shape);
  layer._tempChildren?.push(shape);
  layer._tempByKey?.set(key, shape);
}

/** 橡皮擦：預約刪除，先疊一格 destination-out 看起來像擦掉了 */
export function eraseCell(layer: MapObj, grid: MapGrid, col: number, row: number): void {
  if (!layer._cellData) initCellRuntime(layer);
  const key = grid.cellKey(col, row);
  if (!layer._cellData?.has(key) && !layer._tempByKey?.has(key)) return;
  const existing = layer._tempByKey?.get(key);
  if (existing) {
    if (existing.globalCompositeOperation === 'destination-out') {
      layer._pendingErase?.add(key);
      return;
    }
    removeTemp(layer, existing);
  }
  layer._pendingErase?.add(key);
  const shape = cellShape(grid, col, row, 'rgba(0,0,0,1)');
  shape._temp = true;
  shape._cellKey = key;
  shape.set({ globalCompositeOperation: 'destination-out' });
  snapshotWorldPosition(shape);
  (layer as unknown as Group).add(shape);
  layer._tempChildren?.push(shape);
  layer._tempByKey?.set(key, shape);
}

/**
 * 重建畫出來的樣子：暫時的格子拿掉、預約刪除的刪掉，同一種填色的格子合成一個路徑（evenodd）。
 * 一格都沒有時放一個 1 × 1 的透明矩形（空群組沒有大小）。
 */
export function commitCellLayer(layer: MapObj, grid: MapGrid): void {
  if (!layer._cellData) initCellRuntime(layer);
  const data = layer._cellData as Map<string, CellEntry>;
  for (const k of layer._pendingErase ?? []) data.delete(k);
  layer._pendingErase = new Set();
  const g = layer as unknown as Group;
  const old = g.getObjects().slice();
  if (old.length) g.remove(...old);
  layer._tempChildren = [];
  layer._tempByKey = new Map();
  const groups = new Map<string, { sample: CellEntry; cells: CellEntry[] }>();
  for (const e of data.values()) {
    let grp = groups.get(e.fillKey);
    if (!grp) {
      grp = { sample: e, cells: [] };
      groups.set(e.fillKey, grp);
    }
    grp.cells.push(e);
  }
  const paths: FabricObject[] = [];
  for (const grp of groups.values()) {
    const d = loopsToSvgPath(grid.outline(grp.cells));
    if (!d) continue;
    const path = new Path(d, {
      fill: entryFill(grp.sample) as string,
      stroke: null,
      strokeWidth: 0,
      objectCaching: false,
      selectable: false,
      evented: false,
      fillRule: 'evenodd',
    }) as unknown as MapObj;
    snapshotWorldPosition(path);
    if (grp.sample.mode === 'pattern')
      applyPatternTransform(path, {
        offX: grp.sample.patOffX ?? 0,
        offY: grp.sample.patOffY ?? 0,
        deg: grp.sample.patRot ?? 0,
        scale: grp.sample.patScale ?? 1,
      });
    paths.push(path);
  }
  if (!paths.length)
    paths.push(
      new Rect({
        left: 0.5,
        top: 0.5,
        width: 1,
        height: 1,
        fill: 'rgba(0,0,0,0)',
        strokeWidth: 0,
        selectable: false,
        evented: false,
      }),
    );
  g.add(...paths);
  layer.dirty = true;
}

/** 已塗的格子的外接範圍（欄、列） */
export function cellBounds(
  layer: MapObj,
): { minC: number; maxC: number; minR: number; maxR: number } | null {
  const data = layer._cellData;
  if (!data || data.size === 0) return null;
  let minC = Number.POSITIVE_INFINITY;
  let maxC = Number.NEGATIVE_INFINITY;
  let minR = Number.POSITIVE_INFINITY;
  let maxR = Number.NEGATIVE_INFINITY;
  for (const e of data.values()) {
    minC = Math.min(minC, e.col);
    maxC = Math.max(maxC, e.col);
    minR = Math.min(minR, e.row);
    maxR = Math.max(maxR, e.row);
  }
  return { minC, maxC, minR, maxR };
}

/** 整格移動後：每一格的位置加上位移、重建 Map */
export function shiftCells(layer: MapObj, grid: MapGrid, colDelta: number, rowDelta: number): void {
  layer._cellData = shiftedCells(layer._cellData ?? new Map(), grid, colDelta, rowDelta);
}
