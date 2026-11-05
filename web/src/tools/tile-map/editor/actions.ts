/**
 * 介面的動作（按鈕、快捷鍵、選單共用）：工具與畫筆、圖層、選取、地圖大小與整張移動、復原。
 * 地圖的變更一律算出新的地圖再 commitMap（一步復原）。
 */
import type { useConfirm, useToast } from '@/ui';
import { spanOf } from '../model/large';
import {
  addDefs,
  addLayer as addLayerTo,
  copyLayerName,
  createMap,
  deleteLayer,
  duplicateLayer,
  editableLayer,
  filledCount,
  type LayerPatch,
  MapError,
  moveLayer as moveLayerTo,
  nextLayerName,
  resizeMap,
  setLayer,
  shiftMap,
} from '../model/map';
import { type SelectionOp, selectInRect, transformSelection } from '../model/selection';
import { LIMITS, type TileMap } from '../model/types';
import { sampleMap } from '../sample';
import { S } from '../strings';
import { commitMap, editorNow, mapNow, setEditor, type ToolId, useMap, usePrefs } from './store';
import { isBuiltinTile, tileDef } from './tiles';

type Toast = ReturnType<typeof useToast>;
type Confirm = ReturnType<typeof useConfirm>;

let toastFn: Toast | null = null;
let confirmFn: Confirm | null = null;

export function bindUi(t: Toast | null, c: Confirm | null): void {
  toastFn = t;
  confirmFn = c;
}

export function notify(
  title: string,
  tone: 'info' | 'success' | 'warning' | 'danger' = 'info',
  more: { description?: string; duration?: number } = {},
): void {
  toastFn?.({ title, tone, ...more });
}

export const confirmUi = (o: Parameters<Confirm>[0]): Promise<boolean> =>
  confirmFn ? confirmFn(o) : Promise.resolve(false);

/** MapError → 介面文字 */
export function mapErrorText(e: unknown): string {
  if (!(e instanceof MapError)) return S.exp.failed;
  switch (e.code) {
    case 'layers-max':
      return S.msg.layerMax(LIMITS.maxLayers);
    case 'layers-min':
      return S.msg.layerMin;
    case 'name':
      return S.msg.nameBad;
    case 'no-layer':
      return S.canvas.noSelectLayer;
    case 'leave':
      return S.canvas.leave;
    case 'size':
      return S.settings.badSize;
    default:
      return S.exp.failed;
  }
}

function tryCommit(fn: () => TileMap): boolean {
  try {
    return commitMap(fn());
  } catch (e) {
    notify(mapErrorText(e), 'warning');
    return false;
  }
}

/* ---------- 工具與畫筆 ---------- */

export function setTool(tool: ToolId): void {
  const ed = editorNow();
  setEditor({ tool, selection: tool === 'select' ? ed.selection : [] });
}

/** 調色盤點一下：換畫筆（轉向、翻轉歸零）；不是畫的工具時換成畫筆 */
export function chooseTile(id: string): void {
  const ed = editorNow();
  setEditor({
    tile: id,
    r: 0,
    f: false,
    organize: [],
    organizeAnchor: id,
    tool: ed.tool === 'brush' || ed.tool === 'fill' || ed.tool === 'shape' ? ed.tool : 'brush',
    selection: [],
  });
}

/** R：選取工具有選取時轉選取，否則轉畫筆 */
export function rotate(): void {
  const ed = editorNow();
  if (ed.tool === 'select') {
    if (ed.selection.length) applySelection('rotate');
    return;
  }
  setEditor({ r: ((ed.r + 1) % 4) as 0 | 1 | 2 | 3 });
}

/** F：選取工具有選取時翻轉選取，否則翻轉畫筆 */
export function flip(): void {
  const ed = editorNow();
  if (ed.tool === 'select') {
    if (ed.selection.length) applySelection('flip');
    return;
  }
  setEditor({ f: !ed.f });
}

/** 畫筆的定義與佔的格數 */
export function brushNow() {
  const ed = editorNow();
  const def = tileDef(ed.tile);
  if (!def || !ed.tile) return null;
  return { def, brush: { t: ed.tile, r: ed.r, f: ed.f, span: spanOf(def) } };
}

/** 畫筆用到自訂圖塊時，地圖要記它的定義 */
export function brushDefs(): ReturnType<typeof tileDef>[] {
  const b = brushNow();
  return b && !isBuiltinTile(b.def.id) ? [b.def] : [];
}

/* ---------- 圖層 ---------- */

export function activeIndex(map: TileMap = mapNow()): number {
  const i = map.layers.findIndex((l) => l.id === editorNow().active);
  return i < 0 ? 0 : i;
}

/** 上一次知道的「畫的圖層」的位置（那一層被刪掉時，換成同一個位置的圖層） */
let lastActiveIndex = 0;

/** 復原、刪除之後：選中的圖層只留還在的，畫的圖層不在了就換一個 */
export function syncLayers(): void {
  const map = mapNow();
  const ed = editorNow();
  const ids = map.layers.map((l) => l.id);
  let layers = ed.layers.filter((id) => ids.includes(id));
  const active = ids.includes(ed.active)
    ? ed.active
    : (layers.at(-1) ?? ids[Math.min(lastActiveIndex, ids.length - 1)] ?? ids[0]);
  if (!layers.includes(active)) layers = [...layers, active];
  lastActiveIndex = ids.indexOf(active);
  setEditor({
    active,
    layers,
    layerAnchor: ids.includes(ed.layerAnchor) ? ed.layerAnchor : active,
  });
}

/** 點圖層：一般＝只選這層；Ctrl／⌘＝加選或取消；Shift＝從上次點的到這層 */
export function selectLayer(
  id: string,
  mod: { ctrl?: boolean; shift?: boolean; keep?: boolean } = {},
): void {
  const map = mapNow();
  const ed = editorNow();
  let layers = ed.layers;
  let anchor = ed.layerAnchor;
  if (mod.shift && map.layers.some((l) => l.id === anchor)) {
    const a = map.layers.findIndex((l) => l.id === anchor);
    const b = map.layers.findIndex((l) => l.id === id);
    const range = map.layers.slice(Math.min(a, b), Math.max(a, b) + 1).map((l) => l.id);
    layers = [...new Set([...(mod.ctrl ? layers : []), ...range])];
  } else if (mod.ctrl) {
    if (layers.includes(id) && layers.length > 1) layers = layers.filter((x) => x !== id);
    else layers = [...layers.filter((x) => x !== id), id];
    anchor = id;
  } else if (!mod.keep || !layers.includes(id)) {
    layers = [id];
    anchor = id;
  }
  const active = layers.includes(id) ? id : (layers.at(-1) ?? id);
  const changed = layers.join('|') !== ed.layers.join('|');
  lastActiveIndex = Math.max(
    0,
    map.layers.findIndex((l) => l.id === active),
  );
  setEditor({ layers, layerAnchor: anchor, active, ...(changed ? { selection: [] } : {}) });
}

export function addLayer(): void {
  const map = mapNow();
  try {
    const r = addLayerTo(map, nextLayerName(map, S.layerN));
    commitMap(r.map);
    setEditor({ active: r.id, layers: [r.id], layerAnchor: r.id, selection: [] });
  } catch (e) {
    notify(mapErrorText(e), 'warning');
  }
}

export function duplicate(id: string): void {
  const map = mapNow();
  const src = map.layers.find((l) => l.id === id);
  if (!src) return;
  try {
    const r = duplicateLayer(map, id, copyLayerName(map, src.name, S.layerCopy));
    commitMap(r.map);
    setEditor({ active: r.id, layers: [r.id], layerAnchor: r.id, selection: [] });
  } catch (e) {
    notify(mapErrorText(e), 'warning');
  }
}

/** 刪除圖層：有圖塊時先確認 */
export async function removeLayer(id: string): Promise<void> {
  const map = mapNow();
  const layer = map.layers.find((l) => l.id === id);
  if (!layer) return;
  if (map.layers.length <= 1) {
    notify(S.msg.layerMin, 'warning');
    return;
  }
  const n = filledCount(layer);
  if (
    n &&
    !(await confirmUi({
      title: S.layers.deleteTitle,
      description: S.layers.deleteDesc(layer.name, n),
      confirmLabel: S.layers.remove,
      danger: true,
    }))
  )
    return;
  if (tryCommit(() => deleteLayer(mapNow(), id))) {
    setEditor({ selection: [] });
    syncLayers();
  }
}

export function patchLayer(id: string, patch: LayerPatch): boolean {
  return tryCommit(() => setLayer(mapNow(), id, patch));
}

/** 把圖層移到第 to 個位置（0＝最下面） */
export function moveLayer(id: string, to: number): void {
  tryCommit(() => moveLayerTo(mapNow(), id, to));
}

/* ---------- 選取 ---------- */

export function applySelection(op: SelectionOp, dx = 0, dy = 0): boolean {
  const ed = editorNow();
  try {
    const r = transformSelection(mapNow(), new Set(ed.layers), ed.selection, op, dx, dy);
    commitMap(r.map);
    setEditor({ selection: r.selection });
    return true;
  } catch (e) {
    notify(mapErrorText(e), 'warning');
    return false;
  }
}

export function selectAll(): void {
  const map = mapNow();
  setEditor({
    tool: 'select',
    selection: selectInRect(map, new Set(editorNow().layers), 0, 0, map.width - 1, map.height - 1),
  });
}

export const clearSelection = () => setEditor({ selection: [] });

/* ---------- 滴管 ---------- */

/** 拿最上面看得到的那一格當畫筆，畫的圖層換成那一層 */
export function pickAt(x: number, y: number): boolean {
  const map = mapNow();
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return false;
  for (let li = map.layers.length - 1; li >= 0; li--) {
    const l = map.layers[li];
    if (!l.visible || l.opacity === 0) continue;
    const c = l.cells[y * map.width + x];
    if (!c || !tileDef(c.t)) continue;
    setEditor({
      tile: c.t,
      r: 0,
      f: false,
      tool: 'brush',
      active: l.id,
      layers: [l.id],
      layerAnchor: l.id,
      selection: [],
    });
    const def = tileDef(c.t);
    if (def) {
      const p = usePrefs.getState();
      const visibleSet = p.data.set === 'all' || p.data.set === def.set;
      if (!visibleSet) p.patch({ set: def.set, cat: 'all' });
    }
    return true;
  }
  return false;
}

/* ---------- 地圖 ---------- */

/** 開新地圖（一步復原） */
export function newMap(name: string, width: number, height: number): boolean {
  const ok = tryCommit(() => createMap(width, height, name.trim(), S.layerNames));
  if (ok) {
    setEditor({ selection: [] });
    syncLayers();
  }
  return ok;
}

export function resetToSample(): void {
  commitMap(sampleMap());
  setEditor({ selection: [] });
  syncLayers();
}

/** 地圖設定：大小（左上角不動）與背景色，算一步 */
export function applySettings(
  width: number,
  height: number,
  background: string,
  allowCrop: boolean,
): boolean {
  return tryCommit(() => {
    const resized = resizeMap(mapNow(), width, height, allowCrop);
    return resized.background === background ? resized : { ...resized, background };
  });
}

/** 整張移動：會裁掉圖塊時先問 */
export function shiftWithConfirm(dx: number, dy: number): void {
  if (!dx && !dy) return;
  try {
    commitMap(shiftMap(mapNow(), dx, dy));
    setEditor({ selection: [] });
  } catch (e) {
    if (e instanceof MapError && e.code === 'crop')
      setEditor({ dialog: { kind: 'move', dx, dy, count: e.count } });
    else notify(mapErrorText(e), 'warning');
  }
}

export function confirmShift(dx: number, dy: number): void {
  tryCommit(() => shiftMap(mapNow(), dx, dy, true));
  setEditor({ dialog: null, selection: [] });
}

export function renameMap(name: string): void {
  const map = mapNow();
  const n = Array.from(name).slice(0, LIMITS.maxName).join('');
  if (n === map.name) return;
  commitMap({ ...map, name: n });
}

/** 換上新的一層格子（畫筆、填滿、圖形的結果），連同畫筆的定義 */
export function commitLayerCells(
  index: number,
  cells: TileMap['layers'][number]['cells'],
): boolean {
  const map = mapNow();
  const layer = map.layers[index];
  if (!layer) return false;
  const next: TileMap = {
    ...map,
    layers: map.layers.map((l, i) => (i === index ? { ...l, cells } : l)),
  };
  return commitMap(
    addDefs(
      next,
      brushDefs().filter((d): d is NonNullable<typeof d> => !!d),
    ),
  );
}

/* ---------- 復原 ---------- */

export function undo(): void {
  const t = useMap.temporal.getState();
  if (!t.pastStates.length) return;
  useMap.endGesture();
  t.undo();
  setEditor({ selection: [] });
  syncLayers();
}

export function redo(): void {
  const t = useMap.temporal.getState();
  if (!t.futureStates.length) return;
  useMap.endGesture();
  t.redo();
  setEditor({ selection: [] });
  syncLayers();
}

/** 這一層能不能畫 */
export function canPaint(map: TileMap = mapNow()): boolean {
  const l = map.layers[activeIndex(map)];
  return !!l && editableLayer(l);
}
