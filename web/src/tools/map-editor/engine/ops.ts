/**
 * 選取物件與圖層的操作（規格 1.4、1.12、1.13）：群組、解散、布林運算、複製、顯示、鎖定、疊放順序、刪除、
 * 重新命名、圖層的選取與排序，以及選取工具時改樣式、陰影、圖樣、不透明度、混合模式、文字樣式。
 * 每個操作記一步復原（連續的修改用 pushDebounced）。
 */
import {
  ActiveSelection,
  type FabricObject,
  Group,
  IText,
  Path,
  Pattern,
  Rect,
  Shadow,
} from 'fabric';
import { type BoolOp, booleanOp, multiPolygonPath } from '../boolLogic';
import { shiftedCells } from '../cellLogic';
import { dashArray, nextRotateStop, rgbaOf, splitAlpha, styleOfDash } from '../geometry';
import type { LineCap, LineJoin, PatternState, StrokeStyle } from '../model';
import { flashStatus, setEditor, useEditor } from '../stores';
import { S } from '../strings';
import { boolCategory, isBooleanTarget, shapeToWorldRings } from './boolean';
import { commitCellLayer, rebuildCellData, syncCellEntries } from './cells';
import type { MapEngine } from './engine';
import { isContainerLayer, type MapObj, mapLayers } from './objects';
import {
  applyPatternOrigin,
  applyPatternStateToTarget,
  defScale,
  patternDef,
  strokePatternFill,
} from './patterns';
import {
  patternTargets,
  setTopLeft,
  shadowProbe,
  styleTargets,
  textStyleOf,
  topLeftOf,
} from './sync';

/* ---------- 共用 ---------- */

/** 選取中的圖層物件（依疊放順序，由下而上） */
export function selected(eng: MapEngine): MapObj[] {
  const all = eng.canvas.getObjects();
  return (eng.canvas.getActiveObjects() as MapObj[])
    .filter((o) => o._isMapLayer)
    .sort((a, b) => all.indexOf(a) - all.indexOf(b));
}

export function findLayer(eng: MapEngine, id: number): MapObj | null {
  return mapLayers(eng.canvas).find((o) => o._layerId === id) ?? null;
}

/** 選取這些物件（1 個直接選、2 個以上用 ActiveSelection） */
export function selectObjects(eng: MapEngine, objs: readonly FabricObject[]): void {
  const c = eng.canvas;
  c.discardActiveObject();
  if (objs.length === 1) c.setActiveObject(objs[0]);
  else if (objs.length > 1) c.setActiveObject(new ActiveSelection([...objs], { canvas: c }));
  c.requestRenderAll();
  eng.queueSync();
}

const LOCK_KEYS = [
  'lockMovementX',
  'lockMovementY',
  'lockScalingX',
  'lockScalingY',
  'lockRotation',
] as const;

function setLocked(o: MapObj, lock: boolean): void {
  if (o._isCellLayer || o._isTerrainLayer) {
    /* 格子圖層本來就不能縮放、旋轉，只切換移動 */
    o.set({ lockMovementX: lock, lockMovementY: lock, hasControls: false });
    return;
  }
  const props: Record<string, boolean> = { hasControls: !lock };
  for (const k of LOCK_KEYS) props[k] = lock;
  o.set(props);
}

/* ---------- 群組（F168、F169） ---------- */

export function groupSelected(eng: MapEngine): void {
  const c = eng.canvas;
  const items = selected(eng);
  if (items.length < 2) {
    flashStatus(S.status.selectTwo);
    return;
  }
  if (items.some((o) => isContainerLayer(o))) {
    flashStatus(S.status.cannotGroup);
    return;
  }
  c.discardActiveObject();
  const all = c.getObjects();
  const top = all.indexOf(items[items.length - 1]);
  const index = top - (items.length - 1);
  c.remove(...items);
  const group = new Group(items, { objectCaching: true }) as unknown as MapObj;
  eng.addLayerObject(S.layer.group, group, { skipHistory: true, plain: true, index });
  c.setActiveObject(group);
  setEditor({ selectedIds: [group._layerId ?? -1] });
  c.requestRenderAll();
  eng.push(S.hist.group);
}

export function ungroupSelected(eng: MapEngine): void {
  const c = eng.canvas;
  const ao = c.getActiveObject() as MapObj | undefined;
  if (!ao || !(ao instanceof Group) || ao instanceof ActiveSelection) {
    flashStatus(S.status.selectGroup);
    return;
  }
  if (isContainerLayer(ao)) {
    flashStatus(S.status.cannotUngroup);
    return;
  }
  const group = ao as unknown as Group;
  c.discardActiveObject();
  const index = c.getObjects().indexOf(group);
  const items = group.removeAll() as MapObj[];
  c.remove(group);
  items.forEach((o, i) => {
    if (!o._layerId) {
      o._layerId = eng.nextLayerId++;
      const t = S.layer.ungrouped;
      eng.layerCounters[t] = (eng.layerCounters[t] || 0) + 1;
      o._layerName = `${t}${eng.layerCounters[t]}`;
    }
    o._isMapLayer = true;
    o.set({ selectable: true, evented: true });
    o.setCoords();
    c.insertAt(index + i, o);
  });
  selectObjects(eng, items);
  setEditor({ selectedIds: items.map((o) => o._layerId ?? -1) });
  eng.push(S.hist.ungroup);
}

/* ---------- 布林運算（F170） ---------- */

/** 圖樣的填色或線條複製一份（同一個 Pattern 物件不能兩個物件共用：對齊的位移不同） */
function clonePaint(v: unknown): unknown {
  if (v instanceof Pattern)
    return new Pattern({
      source: v.source,
      repeat: v.repeat,
      offsetX: v.offsetX,
      offsetY: v.offsetY,
    });
  return v;
}

function copyPatternProps(from: MapObj, to: MapObj): void {
  to._patternOffsetX = from._patternOffsetX;
  to._patternOffsetY = from._patternOffsetY;
  to._patternRotation = from._patternRotation;
  to._patternScale = from._patternScale;
  to._patternState = from._patternState ? { ...from._patternState } : undefined;
}

export function booleanSelected(eng: MapEngine, op: BoolOp): void {
  const c = eng.canvas;
  const objs = selected(eng).filter(isBooleanTarget);
  if (objs.length < 2) {
    flashStatus(S.status.selectTwoBool);
    return;
  }
  /* 第一個選取的物件（選取順序）：樣式與位置的來源 */
  const order = c.getActiveObjects() as MapObj[];
  const src = order.find((o) => objs.includes(o)) ?? objs[0];
  const cat = boolCategory(src);
  if (!objs.every((o) => boolCategory(o) === cat)) {
    flashStatus(S.status.sameKind);
    return;
  }
  const ordered = [src, ...objs.filter((o) => o !== src)];
  const rings = ordered
    .map((o) => shapeToWorldRings(o))
    .filter((r): r is NonNullable<typeof r> => !!r?.length);
  if (rings.length < 2) {
    flashStatus(cat === 'room' ? S.status.notEnoughRooms : S.status.notEnoughShapes);
    return;
  }
  let d = '';
  try {
    d = multiPolygonPath(booleanOp(op, rings));
  } catch {
    flashStatus(S.status.boolFailed);
    return;
  }
  if (!d) {
    flashStatus(S.status.emptyResult);
    return;
  }
  c.discardActiveObject();
  const all = c.getObjects();
  const srcIndex = all.indexOf(src);
  const below = objs.filter((o) => all.indexOf(o) < srcIndex).length;
  const index = srcIndex - below;
  const label = S.bool[op];
  let result: MapObj;
  let name: string;
  if (cat === 'room') {
    const sg = (src as unknown as Group).getObjects().find((o) => (o as MapObj)._isRoomGround) as
      | MapObj
      | undefined;
    const sw = (src as unknown as Group).getObjects().find((o) => (o as MapObj)._isRoomWall) as
      | MapObj
      | undefined;
    const ground = new Path(d, {
      fill: clonePaint(sg?.fill ?? '#888888') as string,
      stroke: null,
      strokeWidth: 0,
      shadow: sg?.shadow ? new Shadow(sg.shadow) : null,
      opacity: sg?.opacity ?? 1,
      objectCaching: false,
      fillRule: 'evenodd',
    }) as unknown as MapObj;
    ground._isRoomGround = true;
    if (sg) copyPatternProps(sg, ground);
    const wall = new Path(d, {
      fill: '',
      stroke: clonePaint(sw?.stroke ?? '#333333') as string,
      strokeWidth: sw?.strokeWidth ?? 12,
      strokeDashArray: sw?.strokeDashArray ?? null,
      strokeLineJoin: sw?.strokeLineJoin ?? 'miter',
      strokeLineCap: sw?.strokeLineCap ?? 'butt',
      shadow: sw?.shadow ? new Shadow(sw.shadow) : null,
      opacity: sw?.opacity ?? 1,
      objectCaching: false,
      fillRule: 'evenodd',
    }) as unknown as MapObj;
    wall._isRoomWall = true;
    if (sw) copyPatternProps(sw, wall);
    for (const part of [ground, wall]) {
      part._worldLeft = undefined;
      part._worldTop = undefined;
      const p = part.translateToOriginPoint(part.getCenterPoint(), 'left', 'top');
      part._worldLeft = p.x;
      part._worldTop = p.y;
      applyPatternOrigin(part);
    }
    result = new Group([ground, wall], {
      objectCaching: false,
      subTargetCheck: false,
    }) as unknown as MapObj;
    result._isRoomGroup = true;
    name = S.layer.boolRoom(label);
  } else {
    result = new Path(d, {
      fill: clonePaint(src.fill) as string,
      stroke: clonePaint(src.stroke) as string,
      strokeWidth: src.strokeWidth,
      strokeDashArray: src.strokeDashArray,
      strokeLineJoin: src.strokeLineJoin,
      strokeLineCap: src.strokeLineCap,
      shadow: src.shadow ? new Shadow(src.shadow) : null,
      opacity: src.opacity,
      objectCaching: false,
      fillRule: 'evenodd',
    }) as unknown as MapObj;
    if (src._isGroundLayer) result._isGroundLayer = true;
    if (src._isWallLayer) result._isWallLayer = true;
    copyPatternProps(src, result);
    applyPatternOrigin(result);
    name = label;
  }
  c.remove(...objs);
  eng.addLayerObject(name, result, { skipHistory: true, plain: true, index: Math.max(0, index) });
  c.setActiveObject(result);
  c.requestRenderAll();
  eng.push(cat === 'room' ? S.hist.boolRoom(label) : S.hist.bool(label));
}

/* ---------- 動作列（F057～F062） ---------- */

/** 複製（F058）：半格右下、放在原物件的正上一層、帶自訂欄位；格子圖層整格移動 */
export async function duplicateSelected(eng: MapEngine): Promise<void> {
  const c = eng.canvas;
  const targets = selected(eng);
  if (!targets.length) return;
  c.discardActiveObject();
  const half = eng.cellSize / 2;
  const made: MapObj[] = [];
  for (const o of targets) {
    if (o._isCellLayer) syncCellEntries(o);
    const clone = (await o.clone()) as MapObj;
    if (clone._isCellLayer || clone._isTerrainLayer) {
      rebuildCellData(clone, eng.grid);
      const s = eng.grid.snapDelta(half, half);
      clone._cellData = shiftedCells(
        clone._cellData ?? new Map(),
        eng.grid,
        s.colDelta,
        s.rowDelta,
      );
      commitCellLayer(clone, eng.grid);
    } else {
      clone.set({ left: (clone.left ?? 0) + half, top: (clone.top ?? 0) + half });
      if (clone._isRoomGroup && clone instanceof Group) {
        clone.set({ objectCaching: false, subTargetCheck: false });
        for (const ch of clone.getObjects()) ch.set({ objectCaching: false });
      }
      applyPatternOrigin(clone);
    }
    clone.setCoords();
    const index = c.getObjects().indexOf(o) + 1;
    eng.addLayerObject(S.layer.copyOf(o._layerName || S.layer.object), clone, {
      skipHistory: true,
      plain: true,
      index,
    });
    made.push(clone);
  }
  if (eng.activeTool === 'select') selectObjects(eng, made);
  eng.push(targets.length === 1 ? S.hist.duplicate : S.hist.duplicateN(targets.length));
}

export function toggleVisibilitySelected(eng: MapEngine): void {
  const targets = selected(eng);
  if (!targets.length) return;
  const vis = !targets.every((o) => o.visible !== false);
  for (const o of targets) o.set({ visible: vis });
  if (!vis) {
    eng.canvas.discardActiveObject();
    setEditor({ selectedIds: [] });
  }
  eng.canvas.requestRenderAll();
  eng.push(vis ? S.hist.show : S.hist.hide);
}

export function toggleLockSelected(eng: MapEngine): void {
  const c = eng.canvas;
  const targets = selected(eng);
  if (!targets.length) return;
  const lock = !targets[0].lockMovementX;
  for (const o of targets) setLocked(o, lock);
  const ao = c.getActiveObject();
  if (ao instanceof ActiveSelection) {
    const props: Record<string, boolean> = { hasControls: !lock };
    for (const k of LOCK_KEYS) props[k] = lock;
    ao.set(props);
  }
  c.requestRenderAll();
  eng.push(lock ? S.hist.lock : S.hist.unlock);
}

export function bringSelectedToFront(eng: MapEngine): void {
  const c = eng.canvas;
  const targets = selected(eng);
  if (!targets.length) return;
  for (const o of targets) c.bringObjectToFront(o);
  c.requestRenderAll();
  eng.push(S.hist.front);
}

export function sendSelectedToBack(eng: MapEngine): void {
  const c = eng.canvas;
  const targets = selected(eng);
  if (!targets.length) return;
  for (const o of [...targets].reverse()) c.sendObjectToBack(o);
  c.requestRenderAll();
  eng.push(S.hist.back);
}

export function deleteSelected(eng: MapEngine): void {
  const c = eng.canvas;
  const targets = selected(eng);
  if (!targets.length) return;
  c.discardActiveObject();
  c.remove(...targets);
  setEditor({ selectedIds: [] });
  c.requestRenderAll();
  eng.push(
    targets.length === 1
      ? S.hist.delete(targets[0]._layerName || S.layer.object)
      : S.hist.deleteN(targets.length),
  );
}

/** R／Shift＋R（F064）：選取的物件轉到下一個角度（以中心為軸；鎖定旋轉的不轉） */
export function rotateSelected(eng: MapEngine, reverse: boolean): boolean {
  const c = eng.canvas;
  const ao = c.getActiveObject() as MapObj | undefined;
  if (!ao || ao.lockRotation) return false;
  const center = ao.getCenterPoint();
  ao.rotate(nextRotateStop(ao.angle ?? 0, reverse));
  ao.setPositionByOrigin(center, 'center', 'center');
  ao.setCoords();
  if (ao instanceof ActiveSelection) for (const o of ao.getObjects()) applyPatternOrigin(o);
  else applyPatternOrigin(ao);
  c.requestRenderAll();
  eng.queueSync();
  eng.push(S.hist.rotate);
  return true;
}

/** 方向鍵微調（F052）：1 px、Shift 10 px；格子圖層一次一格 */
export function nudgeSelected(eng: MapEngine, dx: number, dy: number, big: boolean): boolean {
  const c = eng.canvas;
  const ao = c.getActiveObject() as MapObj | undefined;
  if (!ao || ao.lockMovementX) return false;
  const targets = selected(eng);
  if (!targets.length) return false;
  if (targets.length === 1 && (ao._isCellLayer || ao._isTerrainLayer)) {
    const g = eng.grid;
    const step = g.snapDelta(dx * eng.cellSize, dy * eng.cellSize);
    const colDelta = step.colDelta;
    const rowDelta = step.rowDelta;
    if (!colDelta && !rowDelta) return false;
    if (!ao._cellData) rebuildCellData(ao, g);
    ao._cellData = shiftedCells(ao._cellData ?? new Map(), g, colDelta, rowDelta);
    commitCellLayer(ao, g);
    ao.setCoords();
  } else {
    const k = big ? 10 : 1;
    ao.set({ left: (ao.left ?? 0) + dx * k, top: (ao.top ?? 0) + dy * k });
    ao.setCoords();
    if (ao instanceof ActiveSelection) for (const o of ao.getObjects()) applyPatternOrigin(o);
    else applyPatternOrigin(ao);
  }
  c.requestRenderAll();
  eng.queueSync();
  eng.pushDebounced(S.hist.modify((ao as MapObj)._layerName || S.layer.object));
  return true;
}

/** 選取資訊的 X、Y（F053） */
export function setSelectedPosition(eng: MapEngine, axis: 'x' | 'y', value: number): void {
  const targets = selected(eng);
  if (targets.length !== 1) return;
  const o = targets[0];
  if (o._isCellLayer || o._isTerrainLayer) return;
  const p = topLeftOf(o);
  setTopLeft(o, axis === 'x' ? value : p.x, axis === 'y' ? value : p.y);
  applyPatternOrigin(o);
  eng.canvas.requestRenderAll();
  eng.queueSync();
  eng.push(axis === 'x' ? S.hist.moveX(o._layerName ?? '') : S.hist.moveY(o._layerName ?? ''));
}

/* ---------- 圖層面板（F160～F167） ---------- */

/** 圖層的選取（F161）：選取工具以外時切到選取工具（格子、手繪工具點自己的圖層只換對象） */
export function selectLayers(eng: MapEngine, ids: readonly number[]): void {
  const objs = ids.map((id) => findLayer(eng, id)).filter((o): o is MapObj => !!o);
  const tool = eng.activeTool;
  if (objs.length === 1) {
    const o = objs[0];
    const ground = tool === 'ground' && eng.subtool() === 'cell';
    if (
      (tool === 'cell' && o._isCellLayer && !o._isGroundLayer) ||
      (ground && o._isCellLayer && o._isGroundLayer)
    ) {
      setEditor({ selectedIds: [o._layerId ?? -1] });
      return;
    }
    if (tool === 'freehand' && o._isFreehandLayer) {
      setEditor({ selectedIds: [o._layerId ?? -1] });
      return;
    }
  }
  if (tool !== 'select') eng.setTool('select');
  if (!objs.length) {
    eng.canvas.discardActiveObject();
    eng.canvas.requestRenderAll();
    setEditor({ selectedIds: [] });
    eng.queueSync();
    return;
  }
  selectObjects(eng, objs);
  setEditor({ selectedIds: objs.map((o) => o._layerId ?? -1) });
}

export function renameLayer(eng: MapEngine, id: number, name: string): void {
  const o = findLayer(eng, id);
  const next = name.trim();
  if (!o || !next || next === o._layerName) return;
  const old = o._layerName ?? '';
  o._layerName = next;
  eng.queueSync();
  eng.push(S.hist.rename(old, next));
}

export function setLayerVisible(eng: MapEngine, id: number, visible: boolean): void {
  const o = findLayer(eng, id);
  if (!o) return;
  o.set({ visible });
  if (!visible && eng.canvas.getActiveObjects().includes(o)) eng.canvas.discardActiveObject();
  eng.canvas.requestRenderAll();
  eng.push(visible ? S.hist.showLayer(o._layerName ?? '') : S.hist.hideLayer(o._layerName ?? ''));
}

export function unlockLayer(eng: MapEngine, id: number): void {
  const o = findLayer(eng, id);
  if (!o) return;
  setLocked(o, false);
  eng.canvas.requestRenderAll();
  eng.push(S.hist.unlockLayer(o._layerName ?? ''));
}

/**
 * 拖曳排序（F163）：rows 是由上而下的 id。from 列（選了多列且 from 在其中時一起）移到 to 列
 * （往下拖落在它後面、往上拖落在它前面）。
 */
export function reorderLayers(eng: MapEngine, from: number, to: number): void {
  const c = eng.canvas;
  const layers = mapLayers(c).reverse();
  const fromObj = layers[from];
  const anchor = layers[to];
  if (!fromObj || !anchor) return;
  const sel = new Set(useEditor.getState().selectedIds);
  const moving =
    sel.has(fromObj._layerId ?? -1) && sel.size > 1
      ? layers.filter((o) => sel.has(o._layerId ?? -1))
      : [fromObj];
  if (moving.includes(anchor)) return;
  const rest = layers.filter((o) => !moving.includes(o));
  let at = rest.indexOf(anchor);
  if (to > from) at += 1;
  rest.splice(at, 0, ...moving);
  const bottomUp = rest.reverse();
  bottomUp.forEach((o, i) => {
    c.moveObjectTo(o, i);
  });
  c.requestRenderAll();
  eng.queueSync();
  eng.push(S.hist.reorder);
}

/** 新增圖層（F165；空的群組） */
export function addEmptyLayer(eng: MapEngine): void {
  const g = new Group([], { objectCaching: true }) as unknown as MapObj;
  eng.addLayerObject(S.layer.layer, g, { plain: true });
  if (eng.activeTool === 'select') {
    eng.canvas.setActiveObject(g);
    setEditor({ selectedIds: [g._layerId ?? -1] });
  }
  eng.queueSync();
}

/* ---------- 選取工具：樣式（F054～F056、F166、F167） ---------- */

export function setSelectedFill(eng: MapEngine, hex8: string): void {
  const { hex, alpha } = splitAlpha(hex8);
  const targets = styleTargets(selected(eng));
  if (!targets.length) return;
  for (const o of targets) o.set({ fill: rgbaOf(hex, alpha), dirty: true });
  eng.canvas.requestRenderAll();
  eng.pushDebounced(S.hist.fillColor);
}

export function setSelectedStroke(eng: MapEngine, hex8: string): void {
  const { hex, alpha } = splitAlpha(hex8);
  const targets = styleTargets(selected(eng));
  if (!targets.length) return;
  for (const o of targets) o.set({ stroke: rgbaOf(hex, alpha), dirty: true });
  eng.canvas.requestRenderAll();
  eng.pushDebounced(S.hist.strokeColor);
}

export function setSelectedStrokeWidth(eng: MapEngine, w: number): void {
  const targets = styleTargets(selected(eng));
  if (!targets.length) return;
  for (const o of targets) {
    o.set({ strokeWidth: w, strokeDashArray: dashArray(styleOfDash(o.strokeDashArray), w) });
    o.setCoords();
  }
  eng.canvas.requestRenderAll();
  eng.queueSync();
  eng.pushDebounced(S.hist.strokeWidth);
}

export function setSelectedStrokeStyle(eng: MapEngine, style: StrokeStyle): void {
  const targets = styleTargets(selected(eng));
  if (!targets.length) return;
  for (const o of targets)
    o.set({ strokeDashArray: dashArray(style, o.strokeWidth ?? 0), dirty: true });
  eng.canvas.requestRenderAll();
  eng.queueSync();
  eng.push(S.hist.lineStyle);
}

export function setSelectedJoinCap(
  eng: MapEngine,
  prop: 'strokeLineJoin' | 'strokeLineCap',
  v: LineJoin | LineCap,
): void {
  const targets = styleTargets(selected(eng));
  if (!targets.length) return;
  for (const o of targets) o.set({ [prop]: v, dirty: true });
  eng.canvas.requestRenderAll();
  eng.queueSync();
  eng.pushDebounced(prop === 'strokeLineJoin' ? S.hist.lineJoin : S.hist.lineCap);
}

export function setSelectedCornerRadius(eng: MapEngine, r: number): void {
  const targets = selected(eng).filter((o) => o instanceof Rect);
  if (!targets.length) return;
  for (const o of targets) o.set({ rx: r, ry: r, dirty: true });
  eng.canvas.requestRenderAll();
  eng.queueSync();
  eng.pushDebounced(S.hist.cornerRadius);
}

export function setSelectedOpacity(eng: MapEngine, v: number): void {
  const targets = selected(eng);
  if (!targets.length) return;
  for (const o of targets) o.set({ opacity: v });
  eng.canvas.requestRenderAll();
  eng.queueSync();
  eng.pushDebounced(S.hist.opacity);
}

export function setSelectedBlend(eng: MapEngine, v: string): void {
  const targets = selected(eng);
  if (!targets.length) return;
  for (const o of targets) o.set({ globalCompositeOperation: v as GlobalCompositeOperation });
  eng.canvas.requestRenderAll();
  eng.queueSync();
  eng.push(S.hist.blend);
}

export interface ShadowValue {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

/** 陰影（F056）：房間套到裡面的地面與牆 */
export function setSelectedShadow(eng: MapEngine, v: ShadowValue): void {
  const targets = selected(eng);
  if (!targets.length) return;
  const make = () =>
    v.enabled
      ? new Shadow({
          color: v.color,
          blur: v.blur,
          offsetX: v.offsetX,
          offsetY: v.offsetY,
          affectStroke: true,
        })
      : null;
  for (const o of targets) {
    if (o._isRoomGroup && o instanceof Group) {
      for (const ch of o.getObjects() as MapObj[])
        if (ch._isRoomGround || ch._isRoomWall) ch.set({ shadow: make(), dirty: true });
    } else o.set({ shadow: make() });
    o.dirty = true;
  }
  eng.canvas.requestRenderAll();
  eng.queueSync();
  eng.pushDebounced(S.hist.shadow);
}

export function selectedShadowSource(eng: MapEngine): MapObj | null {
  const t = selected(eng)[0];
  return t ? shadowProbe(t) : null;
}

/* ---------- 選取工具：地面、牆壁的圖樣（F055） ---------- */

export type PatternKind = 'ground' | 'wall' | 'room-ground' | 'room-wall';

export function patternEntries(eng: MapEngine, kind: PatternKind): MapObj[] {
  return patternTargets(selected(eng))
    .filter((t) => t.kind === kind)
    .map((t) => t.target);
}

const isFillKind = (k: PatternKind) => k === 'ground' || k === 'room-ground';

/** 第一個物件的圖樣與細節（顯示用；縮放是使用者的倍率） */
export function patternInfo(
  eng: MapEngine,
  kind: PatternKind,
): { state: PatternState; offX: number; offY: number; rot: number; scalePct: number } | null {
  const first = patternEntries(eng, kind)[0];
  if (!first) return null;
  const def = isFillKind(kind) ? '#888888' : '#333333';
  const st = first._patternState;
  const state: PatternState = {
    mode: st?.mode === 'pattern' && patternDef(st.id) ? 'pattern' : 'solid',
    id: st?.id ?? null,
    genreId: st?.genreId ?? 'all',
    solidColor: st?.solidColor ?? def,
  };
  const ds = state.mode === 'pattern' ? defScale(state.id) : 1;
  return {
    state,
    offX: first._patternOffsetX || 0,
    offY: first._patternOffsetY || 0,
    rot: first._patternRotation || 0,
    scalePct: Math.round(((first._patternScale ?? 1) / ds) * 100),
  };
}

export function setSelectedPattern(
  eng: MapEngine,
  kind: PatternKind,
  state: PatternState,
  label: string,
): void {
  const entries = patternEntries(eng, kind);
  if (!entries.length) return;
  for (const t of entries) applyPatternStateToTarget(t, isFillKind(kind), state);
  eng.canvas.requestRenderAll();
  eng.pushDebounced(S.hist.selPattern(label));
}

export function setSelectedPatternDetail(
  eng: MapEngine,
  kind: PatternKind,
  field: 'offX' | 'offY' | 'rot' | 'scale',
  value: number,
  label: string,
): void {
  const entries = patternEntries(eng, kind);
  if (!entries.length) return;
  for (const t of entries) {
    if (field === 'offX') t._patternOffsetX = value;
    else if (field === 'offY') t._patternOffsetY = value;
    else if (field === 'rot') t._patternRotation = value;
    else {
      const st = t._patternState;
      const userScale = value / 100;
      t._patternScale = (st?.mode === 'pattern' ? defScale(st.id) : 1) * userScale;
      /* 線條的縮放是縮放圖片本身（3.4），要重做線條的圖樣 */
      if (!isFillKind(kind) && st?.mode === 'pattern' && t.stroke instanceof Pattern)
        t.set('stroke', strokePatternFill(st.id ?? null, st.solidColor ?? '#333333', userScale));
    }
    applyPatternOrigin(t);
  }
  eng.canvas.requestRenderAll();
  const name =
    field === 'offX'
      ? S.hist.selOffsetX(label)
      : field === 'offY'
        ? S.hist.selOffsetY(label)
        : field === 'rot'
          ? S.hist.selRotation(label)
          : S.hist.selScale(label);
  eng.pushDebounced(name);
}

/* ---------- 文字（F151～F154） ---------- */

/** 樣式的對象：選取中或編輯中的文字（編輯中有選一段時只有那一段） */
export function textTarget(
  eng: MapEngine,
): { obj: IText & MapObj; start?: number; end?: number } | null {
  const a = eng.canvas.getActiveObject() as (IText & MapObj) | undefined;
  if (!a || !(a instanceof IText) || !a._isMapText) return null;
  if (a.isEditing && a.selectionStart !== a.selectionEnd)
    return { obj: a, start: a.selectionStart, end: a.selectionEnd };
  return { obj: a };
}

function applyText(eng: MapEngine, style: Record<string, unknown>, hist: string): boolean {
  const t = textTarget(eng);
  if (!t) return false;
  if (t.start !== undefined) t.obj.setSelectionStyles(style, t.start, t.end);
  else t.obj.set(style);
  t.obj.initDimensions();
  t.obj.setCoords();
  t.obj.dirty = true;
  eng.canvas.requestRenderAll();
  void eng.ensureTextFonts(t.obj);
  setEditor({ textStyle: textStyleOf(t.obj) });
  eng.queueSync();
  eng.pushDebounced(hist);
  return true;
}

export function toggleTextStyle(
  eng: MapEngine,
  s: 'bold' | 'italic' | 'underline' | 'linethrough',
): boolean {
  const cur = textStyleOf(textTarget(eng)?.obj ?? null);
  if (!cur) return false;
  const style =
    s === 'bold'
      ? { fontWeight: cur.bold ? 'normal' : 'bold' }
      : s === 'italic'
        ? { fontStyle: cur.italic ? 'normal' : 'italic' }
        : s === 'underline'
          ? { underline: !cur.underline }
          : { linethrough: !cur.linethrough };
  return applyText(eng, style, S.hist.textStyle);
}

export function setTextFont(eng: MapEngine, family: string): boolean {
  return applyText(eng, { fontFamily: family }, S.hist.font);
}

export function setTextSize(eng: MapEngine, size: number): boolean {
  return applyText(eng, { fontSize: size }, S.hist.fontSize);
}

/** 文字的顏色與描邊（地圖的設定）→ 編輯中或選取中的文字 */
export function applyTextLook(
  eng: MapEngine,
  look: {
    fill: string;
    fillOpacity: number;
    stroke: string;
    strokeOpacity: number;
    strokeWidth: number;
  },
): boolean {
  return applyText(
    eng,
    {
      fill: rgbaOf(look.fill, look.fillOpacity),
      stroke: look.strokeWidth > 0 ? rgbaOf(look.stroke, look.strokeOpacity) : null,
      strokeWidth: look.strokeWidth > 0 ? look.strokeWidth : 0,
    },
    S.hist.textLook,
  );
}

/* ---------- 其他 ---------- */

/** 右鍵、圖層面板的對象（還沒選取時先選取它） */
export function ensureSelected(eng: MapEngine, o: MapObj): void {
  if (eng.canvas.getActiveObjects().includes(o)) return;
  if (eng.activeTool !== 'select') eng.setTool('select');
  selectObjects(eng, [o]);
  setEditor({ selectedIds: [o._layerId ?? -1] });
}
