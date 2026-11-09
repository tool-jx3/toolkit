/**
 * 演出的資料的整理（2026-11-09，規格 F327、3.19.1）：讀檔、自動儲存、分享連結都會經過，所以放在主程式裡（輕的）；
 * 演出的計算與畫法（model/stage.ts、model/route.ts、draw/stage.ts）打開演出時才載入。
 *
 * 鍵的順序固定（`orderedStage`）：`{ rooms, floors, routes }`、房間 `{ floor, room, when, order }`、
 * 路線 `{ id, floor, x1, y1, cx, cy, x2, y2, pts, w }`。編輯之後也照這個順序重排，存了再開的 JSON 字串相同。
 */
import { uid } from './geometry';
import type { Floor, StagePlan, StageRoom, StageRoute, StageWhen } from './types';

/** 房間的鍵（樓層 id＋房間 id；中間是不會出現在 id 裡的控制字元） */
export const roomKey = (floor: string, room: string): string => `${floor}\u0001${room}`;

/** 鍵 → 樓層 id、房間 id */
export function splitRoomKey(key: string): { floor: string; room: string } {
  const i = key.indexOf('\u0001');
  return { floor: key.slice(0, i), room: key.slice(i + 1) };
}

/** 一間藏起來的房間，鍵照固定的順序 */
function orderedRoom(e: StageRoom): StageRoom {
  const out: StageRoom = { floor: e.floor, room: e.room };
  if (e.when !== undefined) out.when = e.when;
  if (e.order !== undefined) out.order = e.order;
  return out;
}

/** 一條路線，鍵照固定的順序 */
function orderedRoute(r: StageRoute): StageRoute {
  const out: StageRoute = {
    id: r.id,
    floor: r.floor,
    x1: r.x1,
    y1: r.y1,
    cx: r.cx,
    cy: r.cy,
    x2: r.x2,
    y2: r.y2,
  };
  if (r.pts) out.pts = r.pts.map(([x, y]) => [x, y]);
  if (r.w !== undefined) out.w = r.w;
  return out;
}

/** 演出照固定的鍵順序重排（空的欄位拿掉；全部空的時候 undefined） */
export function orderedStage(s: StagePlan | undefined): StagePlan | undefined {
  if (!s) return undefined;
  const out: StagePlan = {};
  if (s.rooms?.length) out.rooms = s.rooms.map(orderedRoom);
  if (s.floors?.length) out.floors = [...s.floors];
  if (s.routes?.length) out.routes = s.routes.map(orderedRoute);
  return out.rooms || out.floors || out.routes ? out : undefined;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clampCoord = (v: number) => Math.round(Math.max(-4096, Math.min(4096, v)) * 1000) / 1000 + 0;

/** 一條路線（樓層要存在、四個座標是數字；控制點沒有時取中點，折線 2～64 點，粗細 0.5～3） */
function readRoute(
  r: unknown,
  floorIds: ReadonlySet<string>,
  used: Set<string>,
): StageRoute | null {
  if (!isObj(r) || typeof r.floor !== 'string' || !floorIds.has(r.floor)) return null;
  if (![r.x1, r.y1, r.x2, r.y2].every(fin)) return null;
  const x1 = clampCoord(r.x1 as number);
  const y1 = clampCoord(r.y1 as number);
  const x2 = clampCoord(r.x2 as number);
  const y2 = clampCoord(r.y2 as number);
  let id = typeof r.id === 'string' && r.id ? r.id.slice(0, 80) : '';
  if (!id || used.has(id)) id = uid('a');
  used.add(id);
  const route: StageRoute = {
    id,
    floor: r.floor,
    x1,
    y1,
    cx: fin(r.cx) ? clampCoord(r.cx) : clampCoord((x1 + x2) / 2),
    cy: fin(r.cy) ? clampCoord(r.cy) : clampCoord((y1 + y2) / 2),
    x2,
    y2,
  };
  if (Array.isArray(r.pts)) {
    const pts = r.pts
      .filter((q): q is [number, number] => Array.isArray(q) && fin(q[0]) && fin(q[1]))
      .map(([x, y]) => [clampCoord(x), clampCoord(y)] as [number, number]);
    if (pts.length >= 2 && pts.length <= 64 && pts.length === r.pts.length) route.pts = pts;
  }
  if (fin(r.w) && r.w !== 1) route.w = Math.round(Math.max(0.5, Math.min(3, r.w)) * 100) / 100;
  return route;
}

/**
 * 演出的資料：房間、樓層要存在；路線的數字要是數字（範圍外的夾回來），折線 2～64 點；
 * 公開時機指到不存在的路線時改成「所有路線之後」（同原作：指定的路線不見了＝最後公開）。空的時候 undefined。
 */
export function normalizeStage(raw: unknown, floors: readonly Floor[]): StagePlan | undefined {
  if (!isObj(raw)) return undefined;
  const byId = new Map(floors.map((f) => [f.id, f]));
  const floorIds = new Set(byId.keys());
  const used = new Set<string>();
  const routes = (Array.isArray(raw.routes) ? raw.routes : [])
    .map((r) => readRoute(r, floorIds, used))
    .filter((r): r is StageRoute => !!r);
  const routeIds = new Set(routes.map((r) => `route:${r.id}`));
  const rooms: StageRoom[] = [];
  const seen = new Set<string>();
  for (const e of Array.isArray(raw.rooms) ? raw.rooms : []) {
    if (!isObj(e) || typeof e.floor !== 'string' || typeof e.room !== 'string') continue;
    if (!byId.get(e.floor)?.rooms.some((r) => r.id === e.room)) continue;
    const key = roomKey(e.floor, e.room);
    if (seen.has(key)) continue;
    seen.add(key);
    const entry: StageRoom = { floor: e.floor, room: e.room };
    const when = e.when;
    if (when === 'after' || when === 'manual') entry.when = when;
    else if (typeof when === 'string' && when.startsWith('route:'))
      entry.when = routeIds.has(when) ? (when as StageWhen) : 'after';
    if (fin(e.order)) entry.order = Math.max(0, Math.min(9999, Math.round(e.order)));
    rooms.push(entry);
  }
  const hiddenFloors = Array.isArray(raw.floors)
    ? [...new Set(raw.floors.filter((v): v is string => typeof v === 'string'))].filter((id) =>
        byId.has(id),
      )
    : [];
  return orderedStage({ rooms, floors: hiddenFloors, routes });
}
