/**
 * 畫布 → 面板的狀態：圖層清單的列（F160）、選取物件的資訊（F053～F057）、文字的樣式（F153）。
 * 引擎在選取、移動、記一步之後呼叫，結果寫進 useEditor。
 */
import { type Canvas, FabricImage, FabricText, Group, IText, Point, Rect } from 'fabric';
import { cssToHex8, styleOfDash } from '../geometry';
import type { LayerRow, SelectionInfo, TextStyleState } from '../stores';
import { boolCategory, isBooleanTarget } from './boolean';
import { isContainerLayer, type MapObj, mapLayers } from './objects';

/** 圖層列的種類（圖示用） */
export function kindOf(o: MapObj): LayerRow['kind'] {
  if (o._isCellLayer || o._isTerrainLayer) return 'cell';
  if (o._isFreehandLayer) return 'freehand';
  if (o._isRoomGroup) return 'room';
  if (o._isDecorLayer) return 'decor';
  if (o._isMapText || o instanceof FabricText) return 'text';
  if (o instanceof FabricImage) return 'image';
  if (o instanceof Group) return 'group';
  return 'shape';
}

/** 圖層清單（最上面的列＝最上層） */
export function layerRows(canvas: Canvas): LayerRow[] {
  return mapLayers(canvas)
    .reverse()
    .map((o) => ({
      id: o._layerId ?? -1,
      name: o._layerName ?? '',
      visible: o.visible !== false,
      locked: !!o.lockMovementX,
      kind: kindOf(o),
    }));
}

/** 選取物件裡能改圖樣的部分（地面、牆壁、房間的地面與牆；格子圖層除外；舊版 getEditablePatternTargets） */
export function patternTargets(
  active: readonly MapObj[],
): { target: MapObj; kind: 'ground' | 'wall' | 'room-ground' | 'room-wall' }[] {
  const out: { target: MapObj; kind: 'ground' | 'wall' | 'room-ground' | 'room-wall' }[] = [];
  for (const o of active) {
    if (o._isRoomGroup && o instanceof Group) {
      const children = o.getObjects() as MapObj[];
      const g = children.find((c) => c._isRoomGround);
      const w = children.find((c) => c._isRoomWall);
      if (g) out.push({ target: g, kind: 'room-ground' });
      if (w) out.push({ target: w, kind: 'room-wall' });
    } else if (o._isCellLayer || o._isTerrainLayer) {
      /* 格子圖層的圖樣是每一格各自的 */
    } else if (o._isGroundLayer) out.push({ target: o, kind: 'ground' });
    else if (o._isWallLayer) out.push({ target: o, kind: 'wall' });
  }
  return out;
}

/** 能改填色、描邊的物件（格子圖層除外；舊版選取時的對象） */
export function styleTargets(active: readonly MapObj[]): MapObj[] {
  return active.filter((o) => !o._isCellLayer && !o._isTerrainLayer);
}

/** 陰影的參考物件：房間取地面、沒有時取牆 */
export function shadowProbe(o: MapObj): MapObj {
  if (o._isRoomGroup && o instanceof Group) {
    const children = o.getObjects() as MapObj[];
    return children.find((c) => c._isRoomGround) ?? children.find((c) => c._isRoomWall) ?? o;
  }
  return o;
}

/** 物件（未旋轉時）左上角的位置（選取資訊的 X、Y；舊版的 left、top） */
export function topLeftOf(o: MapObj): { x: number; y: number } {
  const p = o.translateToOriginPoint(o.getCenterPoint(), 'left', 'top');
  return { x: p.x, y: p.y };
}

export function setTopLeft(o: MapObj, x: number, y: number): void {
  o.setPositionByOrigin(new Point(x, y), 'left', 'top');
  o.setCoords();
}

interface EngineView {
  readonly canvas: Canvas;
}

/** 選取物件的資訊；沒有選取時 null */
export function computeSelection(
  engine: EngineView,
  active: readonly MapObj[],
): SelectionInfo | null {
  if (!active.length) return null;
  const c = engine.canvas;
  const first = active[0];
  const styled = styleTargets(active);
  const s0 = styled[0] ?? first;
  const pos = active.length === 1 ? topLeftOf(first) : { x: 0, y: 0 };
  const ao = c.getActiveObject();
  let box: SelectionInfo['box'] = null;
  if (ao) {
    const v = c.viewportTransform;
    const pts = ao.getCoords();
    const xs = pts.map((p) => p.x * v[0] + v[4]);
    const ys = pts.map((p) => p.y * v[3] + v[5]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    box = { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
  }
  const sh = shadowProbe(first).shadow;
  const groupish = first instanceof Group && !isContainerLayer(first);
  const kinds = [...new Set(patternTargets(active).map((t) => t.kind))];
  const containers = active.some((o) => isContainerLayer(o));
  const bool = active.filter(isBooleanTarget);
  const cats = new Set(bool.map(boolCategory));
  return {
    count: active.length,
    name: first._layerName ?? '',
    left: Math.round(pos.x),
    top: Math.round(pos.y),
    width: Math.round((first.width ?? 0) * Math.abs(first.scaleX ?? 1)),
    height: Math.round((first.height ?? 0) * Math.abs(first.scaleY ?? 1)),
    angle: Math.round(first.angle ?? 0),
    fill: cssToHex8(s0.fill),
    stroke: cssToHex8(s0.stroke),
    strokeWidth: s0.strokeWidth ?? 0,
    strokeStyle: styleOfDash(s0.strokeDashArray),
    lineJoin: (s0.strokeLineJoin as SelectionInfo['lineJoin']) ?? 'miter',
    lineCap: (s0.strokeLineCap as SelectionInfo['lineCap']) ?? 'butt',
    hasRect: active.some((o) => o instanceof Rect),
    cornerRadius: (active.find((o) => o instanceof Rect) as Rect | undefined)?.rx ?? 0,
    styleable: styled.length > 0,
    patternKinds: kinds,
    opacity: first.opacity ?? 1,
    blend: (first.globalCompositeOperation as string) || 'source-over',
    locked: !!first.lockMovementX,
    visible: first.visible !== false,
    isGroup: active.length === 1 && groupish,
    canGroup: active.length >= 2 && !containers,
    canBoolean: active.length >= 2 && bool.length >= 2 && cats.size === 1,
    box,
    shadow: sh
      ? {
          color: cssToHex8(sh.color) ?? '#0000008c',
          blur: sh.blur ?? 0,
          offsetX: sh.offsetX ?? 0,
          offsetY: sh.offsetY ?? 0,
        }
      : null,
    isText: active.length === 1 && first instanceof IText,
  };
}

/** 文字的樣式（編輯中有選一段時看那一段的第一個字；否則整段；舊版 readTextStyle） */
export function textStyleOf(t: IText | null): TextStyleState | null {
  if (!t) return null;
  const sel = t.isEditing && t.selectionStart !== t.selectionEnd;
  const st = sel
    ? ((t.getSelectionStyles(t.selectionStart, t.selectionStart + 1)[0] ?? {}) as Record<
        string,
        unknown
      >)
    : {};
  const get = <
    K extends 'fontWeight' | 'fontStyle' | 'underline' | 'linethrough' | 'fontFamily' | 'fontSize',
  >(
    k: K,
  ) => (st[k] !== undefined ? st[k] : t[k]);
  const w = get('fontWeight');
  return {
    bold: w === 'bold' || Number(w) >= 600,
    italic: get('fontStyle') === 'italic',
    underline: !!get('underline'),
    linethrough: !!get('linethrough'),
    fontFamily: (get('fontFamily') as string) ?? null,
    fontSize: (get('fontSize') as number) ?? null,
  };
}
