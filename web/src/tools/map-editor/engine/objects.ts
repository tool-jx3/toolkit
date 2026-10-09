/**
 * Fabric 物件加上地圖編輯器的自訂欄位（規格 3.1）的型別與小工具。
 */
import {
  ActiveSelection,
  type Canvas,
  type FabricObject,
  FabricObject as FO,
  Group,
  InteractiveFabricObject,
  Point,
} from 'fabric';
import type { CellEntry } from '../cellLogic';
import { CUSTOM_PROPS, LOCK_PROPS } from '../model';

export type { CellEntry };

export interface MapProps {
  _layerId?: number;
  _isMapLayer?: boolean;
  _layerName?: string;
  _isCellLayer?: boolean;
  _isTerrainLayer?: boolean;
  _isMapText?: boolean;
  _isFreehandLayer?: boolean;
  _isGroundLayer?: boolean;
  _isWallLayer?: boolean;
  _isRoomGroup?: boolean;
  _isRoomGround?: boolean;
  _isRoomWall?: boolean;
  _isDecorLayer?: boolean;
  _decorId?: string;
  _decorIsSvg?: boolean;
  _decorScale?: number;
  _decorFlipX?: boolean;
  _decorFlipY?: boolean;
  _decorFill?: string | null;
  _decorStroke?: string | null;
  _terrainId?: string;
  _worldLeft?: number;
  _worldTop?: number;
  _cellEntries?: CellEntry[];
  _patternOffsetX?: number;
  _patternOffsetY?: number;
  _patternRotation?: number;
  _patternScale?: number;
  _patternState?: { mode: string; id: string | null; genreId?: string; solidColor?: string };
  /* 執行中才有（不存檔） */
  isPreview?: boolean;
  _cellData?: Map<string, CellEntry>;
  _pendingErase?: Set<string>;
  _tempChildren?: FabricObject[];
  _tempByKey?: Map<string, FabricObject>;
  _temp?: boolean;
  _cellKey?: string;
  _snapStart?: { left: number; top: number };
  _snapAccum?: { colDelta: number; rowDelta: number };
  _isEraser?: boolean;
}

export type MapObj = FabricObject & MapProps;

export const asMap = (o: FabricObject | null | undefined): MapObj | null =>
  o ? (o as MapObj) : null;

let setup = false;

/**
 * 一次性的 Fabric 設定：存檔帶自訂欄位、選取框與控制點的外觀（舊版 setupSelectionControls）。
 */
export function setupFabric(accent = '#0099ff'): void {
  if (!setup) {
    setup = true;
    FO.customProperties = [...CUSTOM_PROPS, ...LOCK_PROPS];
  }
  Object.assign(InteractiveFabricObject.ownDefaults, {
    borderColor: accent,
    cornerColor: '#ffffff',
    cornerStrokeColor: accent,
    cornerSize: 13,
    touchCornerSize: 26,
    transparentCorners: false,
    borderScaleFactor: 2,
  });
}

/** 圖層面板上的物件（畫布直下、有 `_isMapLayer`） */
export function mapLayers(canvas: Canvas): MapObj[] {
  return canvas.getObjects().filter((o) => (o as MapObj)._isMapLayer) as MapObj[];
}

export const isContainerLayer = (o: MapObj | null | undefined): boolean =>
  !!o && !!(o._isCellLayer || o._isTerrainLayer || o._isFreehandLayer);

export const isGroup = (o: FabricObject | null | undefined): o is Group => o instanceof Group;

export const isActiveSelection = (o: FabricObject | null | undefined): o is ActiveSelection =>
  o instanceof ActiveSelection;

/**
 * 物件外接框（未旋轉、未縮放時）左上角的世界座標＝舊版 originX／Y 為 left／top 時的 left、top。
 * 圖樣的世界對齊用（3.4）。群組裡的子物件用建立時記下的 `_worldLeft`／`_worldTop`。
 */
export function worldTopLeft(o: MapObj): { x: number; y: number } {
  if (o._worldLeft !== undefined && o._worldTop !== undefined)
    return { x: o._worldLeft, y: o._worldTop };
  if (o.originX === 'left' && o.originY === 'top') return { x: o.left ?? 0, y: o.top ?? 0 };
  const p = o.translateToOriginPoint(o.getCenterPoint(), 'left', 'top');
  return { x: p.x, y: p.y };
}

/** 記下目前的世界座標（加進群組前；舊版 snapshotWorldPosition） */
export function snapshotWorldPosition(o: MapObj): void {
  o._worldLeft = undefined;
  o._worldTop = undefined;
  const p = worldTopLeft(o);
  o._worldLeft = p.x;
  o._worldTop = p.y;
}

export const pt = (x: number, y: number) => new Point(x, y);
