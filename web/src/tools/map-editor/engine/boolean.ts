/**
 * 布林運算的對象判斷與圖形 → 世界座標的環（規格 F170、3.4；舊版 isBooleanTarget、boolCategory、shapeToWorldRings）。
 * 運算本身（polygon-clipping）與環的取樣在 ../boolLogic.ts（純函式）。
 */
import {
  Circle,
  Ellipse,
  type FabricObject,
  Group,
  Path,
  Point,
  Polyline,
  Rect,
  util,
} from 'fabric';
import { ellipseRing, pathRings, type Ring } from '../boolLogic';
import type { MapObj } from './objects';

export type BoolCategory = 'simple' | 'ground' | 'wall' | 'room';

export function boolCategory(o: MapObj): BoolCategory {
  if (o._isRoomGroup) return 'room';
  if (o._isWallLayer) return 'wall';
  if (o._isGroundLayer) return 'ground';
  return 'simple';
}

/** 可以做布林運算的圖形（文字、圖片、格子、手繪、一般群組不行；房間可以） */
export function isBooleanTarget(o: MapObj): boolean {
  if (o._isCellLayer || o._isTerrainLayer || o._isFreehandLayer || o._isMapText) return false;
  if (o._isRoomGroup) return true;
  return (
    o instanceof Rect ||
    o instanceof Ellipse ||
    o instanceof Circle ||
    o instanceof Polyline ||
    o instanceof Path
  );
}

/** 圖形 → 世界座標的環（房間取裡面的地面）；不能轉換時 null */
export function shapeToWorldRings(obj: FabricObject): Ring[] | null {
  const o = obj as MapObj;
  if (o._isRoomGroup && obj instanceof Group) {
    const ground = obj.getObjects().find((c) => (c as MapObj)._isRoomGround);
    return ground ? shapeToWorldRings(ground) : null;
  }
  const m = obj.calcTransformMatrix();
  const apply = (lx: number, ly: number): [number, number] => {
    const p = util.transformPoint(new Point(lx, ly), m);
    return [p.x, p.y];
  };
  if (obj instanceof Rect) {
    const w2 = (obj.width ?? 0) / 2;
    const h2 = (obj.height ?? 0) / 2;
    return [[apply(-w2, -h2), apply(w2, -h2), apply(w2, h2), apply(-w2, h2)]];
  }
  if (obj instanceof Ellipse) return [ellipseRing(obj.rx ?? 0, obj.ry ?? 0, apply)];
  if (obj instanceof Circle) return [ellipseRing(obj.radius ?? 0, obj.radius ?? 0, apply)];
  if (obj instanceof Polyline) {
    const off = obj.pathOffset ?? { x: 0, y: 0 };
    return [(obj.points ?? []).map((p) => apply(p.x - off.x, p.y - off.y))];
  }
  if (obj instanceof Path) {
    const off = obj.pathOffset ?? { x: 0, y: 0 };
    return pathRings((obj.path ?? []) as unknown as (string | number)[][], off, apply);
  }
  return null;
}
