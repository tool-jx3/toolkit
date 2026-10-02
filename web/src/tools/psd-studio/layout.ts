/**
 * 配置檢視的資料（F21、F22、F28、F30）：房間依 CCFOLIA 盤面的座標、PSD 依圖層位置。純函式。
 *
 * - 房間：背景（最下）、前景（最上）是盤面大小、置中；`room.markers`、`items`、`characters` 以「左上角座標＋寬高（格）」放置，
 *   依 z 由小到大畫（相同時依 JSON 的順序），照 angle 繞自己的中心旋轉；被引用但 ZIP 裡找不到圖的略過。
 *   缺 z、寬高時用 CCFOLIA 新建物件的預設值（@/ccfolia 的 createMarker／createItem／createRoomCharacter）。
 * - 點擊（第 7 節裁定）：看不見的不算、依旋轉後的範圍判斷、透明處穿透（找下一個）。
 */
import {
  createItem,
  createMarker,
  createRoom,
  createRoomCharacter,
  listRoomImageRefs,
  matchRoomImage,
  type RoomImageRef,
  type RoomImageRefKind,
  resolveRoomData,
} from '@/ccfolia';
import { basename } from './naming';

/** 縮放 1 倍時房間 1 格的螢幕大小（F22：約 50 px） */
export const ROOM_CELL_PX = 50;

export interface RoomObject {
  /** JSON 裡的位置（同一張圖被幾個物件用就有幾個） */
  key: string;
  assetId: string;
  kind: RoomImageRefKind;
  /** 左上角（格） */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 背景 −Infinity、前景 Infinity（固定最下、最上） */
  z: number;
  /** 度 */
  angle: number;
  /** JSON 中的順序 */
  order: number;
  /** 物件名（沒有時空字串） */
  name: string;
}

export interface RoomLayout {
  /** 畫的順序（z 由小到大） */
  objects: RoomObject[];
  field: { width: number; height: number };
  /** 房間資料裡有帶圖片的物件（沒有時只顯示一行文字，不畫格線） */
  hasObjects: boolean;
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const DEFAULTS: Partial<Record<RoomImageRefKind, { z: number; width: number; height: number }>> = {
  marker: { z: createMarker().z, width: createMarker().width, height: createMarker().height },
  item: { z: createItem().z, width: createItem().width, height: createItem().height },
  character: {
    z: createRoomCharacter().z,
    width: createRoomCharacter().width,
    height: createRoomCharacter().height,
  },
};

function objectName(ref: RoomImageRef): string {
  const o = ref.object;
  if (!o) return '';
  for (const k of ['name', 'text', 'memo']) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim().split('\n')[0];
  }
  return '';
}

/** 房間 JSON＋素材（ZIP 內的路徑）→ 配置檢視要畫的物件 */
export function buildRoomLayout(
  json: unknown,
  assets: readonly { id: string; name: string }[],
): RoomLayout {
  const room = resolveRoomData(json).room;
  const base = createRoom();
  const field = {
    width: Math.max(1, num(room?.fieldWidth, base.fieldWidth)),
    height: Math.max(1, num(room?.fieldHeight, base.fieldHeight)),
  };
  const refs = listRoomImageRefs(json).filter((r) => r.layout);
  const paths = assets.map((a) => a.name);
  const byPath = new Map(assets.map((a) => [a.name, a.id]));
  const objects: RoomObject[] = [];
  refs.forEach((ref, order) => {
    const path = matchRoomImage(ref.value, paths);
    if (!path) return;
    const assetId = byPath.get(path)!;
    const key = ref.path.join('/');
    if (ref.kind === 'background' || ref.kind === 'foreground') {
      objects.push({
        key,
        assetId,
        kind: ref.kind,
        x: -field.width / 2,
        y: -field.height / 2,
        width: field.width,
        height: field.height,
        z: ref.kind === 'background' ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY,
        angle: 0,
        order,
        name: '',
      });
      return;
    }
    const d = DEFAULTS[ref.kind] ?? { z: 0, width: 4, height: 4 };
    const o = ref.object ?? {};
    objects.push({
      key,
      assetId,
      kind: ref.kind,
      x: num(o.x, 0),
      y: num(o.y, 0),
      width: num(o.width, d.width),
      height: num(o.height, d.height),
      z: num(o.z, d.z),
      angle: num(o.angle, 0),
      order,
      name: objectName(ref),
    });
  });
  objects.sort((a, b) => (a.z !== b.z ? a.z - b.z : a.order - b.order));
  return { objects, field, hasObjects: refs.length > 0 };
}

/** 世界座標（格）的點落在物件裡時，回傳物件內的相對位置（0～1）；考慮旋轉 */
export function localPoint(o: RoomObject, wx: number, wy: number): { u: number; v: number } | null {
  const cx = o.x + o.width / 2;
  const cy = o.y + o.height / 2;
  const rad = (-o.angle * Math.PI) / 180;
  const dx = wx - cx;
  const dy = wy - cy;
  const lx = dx * Math.cos(rad) - dy * Math.sin(rad);
  const ly = dx * Math.sin(rad) + dy * Math.cos(rad);
  if (Math.abs(lx) > o.width / 2 || Math.abs(ly) > o.height / 2) return null;
  return { u: (lx + o.width / 2) / o.width, v: (ly + o.height / 2) / o.height };
}

/** 縮圖在相對位置 (u, v) 的不透明度 */
export function alphaAt(
  thumb: { width: number; height: number; rgba: ArrayLike<number> },
  u: number,
  v: number,
): number {
  const x = Math.min(thumb.width - 1, Math.max(0, Math.floor(u * thumb.width)));
  const y = Math.min(thumb.height - 1, Math.max(0, Math.floor(v * thumb.height)));
  return thumb.rgba[(y * thumb.width + x) * 4 + 3];
}

/** 透明到可以穿透的門檻（縮圖的不透明度） */
export const HIT_ALPHA = 8;

/**
 * 房間的點擊（第 7 節裁定）：z 由大到小找第一個「看得見、旋轉後的範圍包含這一點、而且那裡不透明」的物件。
 */
export function hitRoom(
  objects: readonly RoomObject[],
  wx: number,
  wy: number,
  visible: (assetId: string) => boolean,
  alpha: (assetId: string, u: number, v: number) => number,
): RoomObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const o = objects[i];
    if (!visible(o.assetId)) continue;
    const p = localPoint(o, wx, wy);
    if (!p) continue;
    if (alpha(o.assetId, p.u, p.v) < HIT_ALPHA) continue;
    return o;
  }
  return null;
}

export interface PsdPlaced {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * PSD 的點擊：由上到下（list 是由上到下的順序）找第一個看得見、範圍包含這一點、而且那裡不透明的圖層（文件座標，px）。
 */
export function hitPsd(
  list: readonly PsdPlaced[],
  x: number,
  y: number,
  visible: (id: string) => boolean,
  alpha: (id: string, u: number, v: number) => number,
): PsdPlaced | null {
  for (const l of list) {
    if (!visible(l.id)) continue;
    if (x < l.left || y < l.top || x >= l.left + l.width || y >= l.top + l.height) continue;
    if (alpha(l.id, (x - l.left) / l.width, (y - l.top) / l.height) < HIT_ALPHA) continue;
    return l;
  }
  return null;
}

/* ---------- 浮動面板與排序 ---------- */

export interface PanelRow {
  key: string;
  assetId: string;
  /** 房間：物件；沒被引用的素材 'asset'；PSD：'layer' */
  kind: RoomImageRefKind | 'asset' | 'layer';
  name: string;
  z?: number;
}

/**
 * 房間的面板（F30）：先列出房間裡每個帶圖片的物件，z 大的在上（同一張圖被幾個物件用就出現幾次）；
 * 接著列出沒被任何物件引用的圖。
 */
export function roomPanelRows(
  layout: RoomLayout,
  assets: readonly { id: string; name: string }[],
): PanelRow[] {
  const rows: PanelRow[] = [...layout.objects]
    .sort((a, b) => (a.z !== b.z ? b.z - a.z : b.order - a.order))
    .map((o) => ({ key: o.key, assetId: o.assetId, kind: o.kind, name: o.name, z: o.z }));
  const used = new Set(layout.objects.map((o) => o.assetId));
  for (const a of assets) {
    if (!used.has(a.id))
      rows.push({ key: `asset:${a.id}`, assetId: a.id, kind: 'asset', name: '' });
  }
  return rows;
}

/** 排序「在房間中的角色」（第 7 節裁定：排序選單）：背景、前景、マーカー、物件、角色、其他引用、沒被引用 */
const ROLE_RANK: Record<RoomImageRefKind, number> = {
  background: 0,
  foreground: 1,
  marker: 2,
  item: 3,
  'item-cover': 3,
  character: 4,
  face: 4,
  'scene-background': 5,
  'scene-foreground': 5,
  'scene-marker': 5,
  effect: 6,
  note: 7,
  other: 8,
};

/** 每個素材在房間中的角色（越前面越小；沒被引用 9） */
export function roomRoleRanks(
  json: unknown,
  assets: readonly { id: string; name: string }[],
): Map<string, number> {
  const out = new Map<string, number>();
  const paths = assets.map((a) => a.name);
  const byPath = new Map(assets.map((a) => [a.name, a.id]));
  for (const ref of listRoomImageRefs(json)) {
    const path = matchRoomImage(ref.value, paths);
    if (!path) continue;
    const id = byPath.get(path)!;
    out.set(id, Math.min(out.get(id) ?? 9, ROLE_RANK[ref.kind]));
  }
  for (const a of assets) if (!out.has(a.id)) out.set(a.id, 9);
  return out;
}

/** 顯示用的檔名（不含資料夾） */
export const fileLabel = (name: string): string => basename(name);
