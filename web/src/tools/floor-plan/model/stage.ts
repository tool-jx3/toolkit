/**
 * 演出（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」的「04 演出」；規格 F313～F328、3.19）。純函式：
 * 演出的資料（藏起來的房間與樓層、移動路線）的整理與編輯、每一步公開什麼（時間軸）、某一個時間的畫面狀態、
 * 鏡頭跟隨、自動產生演出。畫法在 draw/stage.ts；路線怎麼走在 model/route.ts。
 *
 * 時間軸（原作的 buildStageFrames）：
 * 1. 開始前（0.8 秒）：藏起來的房間是「？？？」、整層藏起來的樓層只剩輪廓，路線都還沒出現。
 * 2. 每一條路線一步（1.7 秒）：前一條路線在別一層時先經過樓梯（0.7 秒；立體圖畫出走樓梯的線），
 *    樓梯兩端的房間、兩端的樓層、這條路線的樓層公開，再公開「這一條路線時公開」的房間，路線從起點畫到終點（0.88 秒）。
 * 3. 還藏著的樓層一層一步（1 秒）。
 * 4. 「所有路線之後」的房間一間一步（1 秒；順序小的先，一樣時下面的樓層先）。
 * 「點了才公開」的房間播放時不公開。每一步的頭 0.32 秒從前一步的畫面淡入。鏡頭跟隨：每一步 0.48 秒移到那一步的範圍
 * （緩停），最後一步的最後 0.4 秒回到全體。
 */
import { GROUND_CATS } from './floorCopy';
import { uid } from './geometry';
import {
  type BridgeHop,
  planRoute,
  type RouteContext,
  roomKey,
  routeContext,
  routeFocusRect,
  routeFromPath,
  routeTouchesRoom,
  splitRoomKey,
  stairBridge,
} from './route';
import type {
  Floor,
  Project,
  Rect,
  Room,
  StagePlan,
  StageRoom,
  StageRoute,
  StageWhen,
} from './types';
import { isDeckCat } from './walls';

/** 每一步的長度與轉場（秒；原作的 stageTiming 與動畫的長度） */
export const STAGE_TIMING = {
  intro: 0.8,
  bridge: 0.7,
  route: 1.7,
  reveal: 1,
  overview: 0.4,
  /** 走樓梯的線、路線畫出來的時間 */
  bridgeDraw: 0.68,
  routeDraw: 0.88,
  /** 從前一步淡入 */
  fade: 0.32,
  /** 鏡頭移到這一步的範圍 */
  camera: 0.48,
} as const;

/** 演出的影片：每秒格數（本站的慣例）與長邊（原作 1600 px） */
export const STAGE_FPS = 30;
export const STAGE_VIDEO_SIDE = 1600;
/** 逐步公開的 PNG、現在的畫面 PNG 的長邊（原作 2400 px） */
export const STAGE_IMAGE_SIDE = 2400;
/** 自由畫的路線最短（格；原作 0.4 m） */
export const ROUTE_MIN_LEN = 0.8;

/** 可以藏起來的房間：GM 專用的（PL 本來就看不到）、地面類的戶外房間、外觀層的屋頂以外 */
export const isStageRoom = (r: Room): boolean =>
  !r.gm && !GROUND_CATS.has(r.cat) && r.cat !== 'roof';

/** 自動產生演出時藏起來、走過去的房間（原作的「部屋」：走廊・樓梯、甲板類不算） */
const isAutoRoom = (r: Room) => isStageRoom(r) && r.cat !== 'hall' && !isDeckCat(r.cat);

/** 入口的房間（自動產生演出的出發點；原作：玄関・ホール・ロビー・受付・甲板） */
const ENTRY_NAME = /玄關|門廳|大廳|大堂|入口|櫃台|櫃檯|接待|甲板/;

export const stagePlanOf = (p: Pick<Project, 'stage'>): StagePlan => p.stage ?? {};

/** 演出有沒有東西（藏起來的房間、樓層或路線） */
export function hasStage(p: Pick<Project, 'stage'>): boolean {
  const s = p.stage;
  return !!(s && (s.rooms?.length || s.floors?.length || s.routes?.length));
}

export function stageRoomEntry(
  p: Pick<Project, 'stage'>,
  floor: string,
  room: string,
): StageRoom | undefined {
  return p.stage?.rooms?.find((e) => e.floor === floor && e.room === room);
}

export const isFloorStageHidden = (p: Pick<Project, 'stage'>, floor: string): boolean =>
  !!p.stage?.floors?.includes(floor);

/* ---------- 整理（讀檔、自動儲存、分享連結） ---------- */

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const fin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const clampCoord = (v: number) => Math.round(Math.max(-4096, Math.min(4096, v)) * 1000) / 1000 + 0;

/**
 * 演出的資料：房間、樓層要存在；路線的數字要是數字（範圍外的夾回來），折線 2～64 點；
 * 公開時機指到不存在的路線時改成「所有路線之後」（同原作：指定的路線不見了＝最後公開）。空的時候 undefined。
 */
export function normalizeStage(raw: unknown, floors: readonly Floor[]): StagePlan | undefined {
  if (!isObj(raw)) return undefined;
  const byId = new Map(floors.map((f) => [f.id, f]));
  const out: StagePlan = {};
  const routes: StageRoute[] = [];
  const seenRoute = new Set<string>();
  if (Array.isArray(raw.routes))
    for (const r of raw.routes) {
      if (!isObj(r) || typeof r.floor !== 'string' || !byId.has(r.floor)) continue;
      if (![r.x1, r.y1, r.x2, r.y2].every(fin)) continue;
      const x1 = clampCoord(r.x1 as number);
      const y1 = clampCoord(r.y1 as number);
      const x2 = clampCoord(r.x2 as number);
      const y2 = clampCoord(r.y2 as number);
      let id = typeof r.id === 'string' && r.id ? r.id.slice(0, 80) : '';
      if (!id || seenRoute.has(id)) id = uid('a');
      seenRoute.add(id);
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
      routes.push(route);
    }
  if (routes.length) out.routes = routes;
  const rooms: StageRoom[] = [];
  const seenRoom = new Set<string>();
  if (Array.isArray(raw.rooms))
    for (const e of raw.rooms) {
      if (!isObj(e) || typeof e.floor !== 'string' || typeof e.room !== 'string') continue;
      const f = byId.get(e.floor);
      if (!f?.rooms.some((r) => r.id === e.room)) continue;
      const key = roomKey(e.floor, e.room);
      if (seenRoom.has(key)) continue;
      seenRoom.add(key);
      const entry: StageRoom = { floor: e.floor, room: e.room };
      const when = e.when;
      if (when === 'after' || when === 'manual') entry.when = when;
      else if (typeof when === 'string' && when.startsWith('route:'))
        entry.when = routes.some((r) => `route:${r.id}` === when) ? (when as StageWhen) : 'after';
      if (fin(e.order)) entry.order = Math.max(0, Math.min(9999, Math.round(e.order)));
      rooms.push(entry);
    }
  if (rooms.length) out.rooms = rooms;
  if (Array.isArray(raw.floors)) {
    const list = [...new Set(raw.floors.filter((v): v is string => typeof v === 'string'))].filter(
      (id) => byId.has(id),
    );
    if (list.length) out.floors = list;
  }
  return out.rooms || out.floors || out.routes ? out : undefined;
}

/* ---------- 編輯（在地圖的草稿上改；一步復原由呼叫端決定） ---------- */

function plan(p: Project): StagePlan {
  if (!p.stage) p.stage = {};
  return p.stage;
}

/** 空的欄位與空的演出拿掉（存檔不留空陣列） */
export function tidyStage(p: Project): void {
  const s = p.stage;
  if (!s) return;
  if (!s.rooms?.length) delete s.rooms;
  if (!s.floors?.length) delete s.floors;
  if (!s.routes?.length) delete s.routes;
  if (!s.rooms && !s.floors && !s.routes) delete p.stage;
}

/** 藏起來／公開一間房（回傳之後是不是藏著） */
export function toggleStageRoom(p: Project, floor: string, room: string): boolean {
  const s = plan(p);
  const list = s.rooms ?? [];
  const i = list.findIndex((e) => e.floor === floor && e.room === room);
  if (i >= 0) list.splice(i, 1);
  else list.push({ floor, room });
  s.rooms = list;
  tidyStage(p);
  return i < 0;
}

export function setStageRoom(p: Project, floor: string, room: string, hidden: boolean): void {
  const on = !!stageRoomEntry(p, floor, room);
  if (on !== hidden) toggleStageRoom(p, floor, room);
}

/** 整層藏起來／公開 */
export function setStageFloor(p: Project, floor: string, hidden: boolean): void {
  const s = plan(p);
  const list = (s.floors ?? []).filter((id) => id !== floor);
  if (hidden) list.push(floor);
  s.floors = list;
  tidyStage(p);
}

/** 這一層可以藏起來的房間全部藏起來（已經藏著的不動）；回傳新藏起來的間數 */
export function hideFloorRooms(p: Project, floorId: string): number {
  const f = p.floors.find((x) => x.id === floorId);
  if (!f) return 0;
  const s = plan(p);
  const list = s.rooms ?? [];
  let n = 0;
  for (const r of f.rooms) {
    if (!isStageRoom(r) || list.some((e) => e.floor === f.id && e.room === r.id)) continue;
    list.push({ floor: f.id, room: r.id });
    n++;
  }
  s.rooms = list;
  tidyStage(p);
  return n;
}

/** 全部解除（房間、樓層都公開；路線留著） */
export function clearStageHidden(p: Project): void {
  if (!p.stage) return;
  delete p.stage.rooms;
  delete p.stage.floors;
  tidyStage(p);
}

/** 房間的公開時機（沒有＝自動） */
export function setStageWhen(
  p: Project,
  floor: string,
  room: string,
  when: StageWhen | 'auto',
): void {
  const e = stageRoomEntry(p, floor, room);
  if (!e) return;
  if (when === 'auto') delete e.when;
  else e.when = when;
}

/** 加路線（接在最後） */
export function addStageRoutes(p: Project, routes: readonly StageRoute[]): void {
  if (!routes.length) return;
  const s = plan(p);
  s.routes = [...(s.routes ?? []), ...routes];
}

/** 刪掉一條路線：指到它的公開時機改成「所有路線之後」 */
export function removeStageRoute(p: Project, id: string): void {
  const s = p.stage;
  if (!s?.routes) return;
  s.routes = s.routes.filter((r) => r.id !== id);
  for (const e of s.rooms ?? []) if (e.when === `route:${id}`) e.when = 'after';
  tidyStage(p);
}

export function removeLastStageRoute(p: Project): void {
  const list = p.stage?.routes;
  if (list?.length) removeStageRoute(p, list[list.length - 1].id);
}

export function clearStageRoutes(p: Project): void {
  for (const r of [...(p.stage?.routes ?? [])]) removeStageRoute(p, r.id);
}

/** 路線的順序往前（−1）或往後（＋1）換一格 */
export function moveStageRoute(p: Project, id: string, dir: -1 | 1): void {
  const list = p.stage?.routes;
  if (!list) return;
  const i = list.findIndex((r) => r.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

/* ---------- 公開的時機 ---------- */

export type RevealWhen =
  | { mode: 'route'; route: string; index: number; via: 'touch' | 'stairs' | 'set' }
  | { mode: 'after'; missing?: boolean; sequential?: boolean }
  | { mode: 'manual' };

/** 一張地圖的演出計算（路線、每條路線之前經過的樓梯、房間的公開時機） */
export interface StageContext {
  project: Project;
  route: RouteContext;
  /** 存在的路線（照順序） */
  routes: StageRoute[];
  /** 第 i 條路線之前經過的樓梯（前一條路線在別一層時；沒有時空的） */
  hops: BridgeHop[][];
  /** 藏起來的房間（存在而且可以藏的；照存的順序） */
  rooms: StageRoom[];
  floorById: Map<string, Floor>;
  roomOf: (floor: string, room: string) => Room | null;
}

/** `route`：同一組樓層的路線計算可以重用（編輯畫面用快取；沒有給時新建） */
export function stageContext(p: Project, route: RouteContext = routeContext(p)): StageContext {
  const floorById = new Map(p.floors.map((f) => [f.id, f]));
  const roomOf = (floor: string, room: string) =>
    floorById.get(floor)?.rooms.find((r) => r.id === room) ?? null;
  const s = stagePlanOf(p);
  const routes = (s.routes ?? []).filter((r) => floorById.has(r.floor));
  const hops = routes.map((r, i) => {
    if (!i) return [];
    const prev = routes[i - 1];
    if (prev.floor === r.floor) return [];
    return route.levelOf(prev.floor) < 0 || route.levelOf(r.floor) < 0
      ? []
      : stairBridgeFor(route, prev, r);
  });
  const rooms = (s.rooms ?? []).filter((e) => {
    const r = roomOf(e.floor, e.room);
    return !!r && isStageRoom(r);
  });
  return { project: p, route, routes, hops, rooms, floorById, roomOf };
}

function stairBridgeFor(ctx: RouteContext, prev: StageRoute, next: StageRoute): BridgeHop[] {
  return stairBridge(
    ctx,
    ctx.levelOf(prev.floor),
    ctx.levelOf(next.floor),
    { x: prev.x2, y: prev.y2 },
    { x: next.x1, y: next.y1 },
    !!(prev.pts || next.pts),
  );
}

/**
 * 藏起來的房間什麼時候公開（原作的 roomUnlockInfo）：手動、所有路線之後、指定的路線（不見了＝最後）；
 * 自動＝第一條在同一層、碰到這間房的路線，或前一條路線在別一層、經過這間房（樓梯間）的那一條路線；都沒有＝最後依序公開。
 */
export function revealInfo(ctx: StageContext, e: StageRoom): RevealWhen {
  const room = ctx.roomOf(e.floor, e.room);
  if (e.when === 'manual') return { mode: 'manual' };
  if (e.when === 'after') return { mode: 'after' };
  if (e.when?.startsWith('route:')) {
    const id = e.when.slice(6);
    const index = ctx.routes.findIndex((r) => r.id === id);
    return index >= 0
      ? { mode: 'route', route: id, index, via: 'set' }
      : { mode: 'after', missing: true };
  }
  const key = roomKey(e.floor, e.room);
  for (let i = 0; i < ctx.routes.length; i++) {
    const r = ctx.routes[i];
    if (room && r.floor === e.floor && routeTouchesRoom(r, room))
      return { mode: 'route', route: r.id, index: i, via: 'touch' };
    if (ctx.hops[i].some((h) => h.rooms.includes(key)))
      return { mode: 'route', route: r.id, index: i, via: 'stairs' };
  }
  return { mode: 'after', sequential: !ctx.routes.length };
}

/* ---------- 時間軸 ---------- */

export type StageStepKind = 'start' | 'route' | 'floor' | 'room';

export interface StageFocus {
  floor: string;
  /** 平面上的範圍（格） */
  rect: Rect;
}

export interface StageStep {
  kind: StageStepKind;
  /** 這一步看的樓層（平面圖畫這一層） */
  floor: string;
  route: StageRoute | null;
  /** 第幾條路線（從 0；不是路線的步驟 −1） */
  routeIndex: number;
  /** 這一步之前經過的樓梯 */
  hops: BridgeHop[];
  /** 有走樓梯的過場（0.7 秒）：經過的樓梯兩端的房間都看得到 */
  bridge: boolean;
  /** 這一步公開的房間（鍵）、樓層（id） */
  revealRooms: string[];
  revealFloors: string[];
  /** 這一步之後還藏著的房間、樓層 */
  hidden: ReadonlySet<string>;
  hiddenFloors: ReadonlySet<string>;
  /** 走樓梯的過場時還藏著的 */
  bridgeHidden: ReadonlySet<string> | null;
  bridgeHiddenFloors: ReadonlySet<string> | null;
  /** 這一步之後看得到的路線（id，照順序） */
  shown: readonly string[];
  focus: StageFocus | null;
  start: number;
  duration: number;
}

export interface StageTimeline {
  steps: StageStep[];
  total: number;
  /** 兩步以上，或有藏起來的房間（原作：沒有時提示先藏房間或畫路線） */
  playable: boolean;
  /** 「點了才公開」的房間（鍵） */
  manual: string[];
  ctx: StageContext;
  info: Map<string, RevealWhen>;
}

const keyOf = (e: Pick<StageRoom, 'floor' | 'room'>) => roomKey(e.floor, e.room);

function roomsRect(rooms: readonly Room[]): Rect | null {
  if (!rooms.length) return null;
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of rooms) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 一間房的範圍（鏡頭跟隨用：四周 max(2 格, 長邊 × 0.4)；手動公開時 max(2.4 格, 長邊 × 0.45)，原作） */
export function roomFocusRect(r: Room, manual = false): Rect {
  const pad = manual
    ? Math.max(2.4, Math.max(r.w, r.h) * 0.45)
    : Math.max(2, Math.max(r.w, r.h) * 0.4);
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

/** 時間軸（每一步公開什麼、從幾秒開始、多長） */
export function buildTimeline(p: Project, ctx: StageContext = stageContext(p)): StageTimeline {
  const info = new Map<string, RevealWhen>();
  for (const e of ctx.rooms) info.set(keyOf(e), revealInfo(ctx, e));
  const hidden = new Set(ctx.rooms.map(keyOf));
  const levelOrder = (floor: string) => {
    const l = ctx.route.levelOf(floor);
    return l < 0 ? 999 + p.floors.findIndex((f) => f.id === floor) : l;
  };
  const hiddenFloors = new Set(
    (stagePlanOf(p).floors ?? [])
      .filter((id) => ctx.floorById.has(id))
      .sort((a, b) => levelOrder(a) - levelOrder(b)),
  );
  const activeFloor = (p.floors[p.active] ?? p.floors[0])?.id ?? '';
  const steps: StageStep[] = [];
  const shown: string[] = [];
  const base = {
    route: null,
    routeIndex: -1,
    hops: [] as BridgeHop[],
    bridge: false,
    bridgeHidden: null,
    bridgeHiddenFloors: null,
    start: 0,
    duration: 0,
  };
  steps.push({
    ...base,
    kind: 'start',
    floor: ctx.routes[0]?.floor ?? activeFloor,
    revealRooms: [],
    revealFloors: [],
    hidden: new Set(hidden),
    hiddenFloors: new Set(hiddenFloors),
    shown: [],
    focus: null,
  });
  ctx.routes.forEach((route, i) => {
    const hops = ctx.hops[i];
    const revealRooms: string[] = [];
    const revealFloors: string[] = [];
    const unlock = (key: string) => {
      const w = info.get(key);
      if (hidden.has(key) && w?.mode === 'route' && w.route === route.id) {
        hidden.delete(key);
        revealRooms.push(key);
      }
    };
    const openFloor = (id: string) => {
      if (hiddenFloors.delete(id)) revealFloors.push(id);
    };
    for (const h of hops) {
      openFloor(ctx.route.floors[h.fromLevel].id);
      openFloor(ctx.route.floors[h.toLevel].id);
      for (const key of h.rooms) unlock(key);
    }
    openFloor(route.floor);
    const bridge = hops.length > 0 && hops.every((h) => h.rooms.every((k) => !hidden.has(k)));
    const bridgeHidden = hops.length ? new Set(hidden) : null;
    const bridgeHiddenFloors = hops.length ? new Set(hiddenFloors) : null;
    for (const key of [...hidden]) unlock(key);
    shown.push(route.id);
    steps.push({
      ...base,
      kind: 'route',
      floor: route.floor,
      route,
      routeIndex: i,
      hops,
      bridge,
      bridgeHidden,
      bridgeHiddenFloors,
      revealRooms,
      revealFloors,
      hidden: new Set(hidden),
      hiddenFloors: new Set(hiddenFloors),
      shown: [...shown],
      focus: { floor: route.floor, rect: routeFocusRect(route) },
    });
  });
  for (const id of [...hiddenFloors]) {
    hiddenFloors.delete(id);
    const rect = roomsRect(ctx.floorById.get(id)?.rooms ?? []);
    steps.push({
      ...base,
      kind: 'floor',
      floor: id,
      revealRooms: [],
      revealFloors: [id],
      hidden: new Set(hidden),
      hiddenFloors: new Set(hiddenFloors),
      shown: [...shown],
      focus: rect ? { floor: id, rect } : null,
    });
  }
  const orderOf = new Map(ctx.rooms.map((e) => [keyOf(e), e.order ?? 999]));
  const after = [...hidden]
    .filter((k) => info.get(k)?.mode !== 'manual')
    .sort(
      (a, b) =>
        (orderOf.get(a) ?? 999) - (orderOf.get(b) ?? 999) ||
        levelOrder(splitRoomKey(a).floor) - levelOrder(splitRoomKey(b).floor),
    );
  for (const key of after) {
    hidden.delete(key);
    const { floor, room } = splitRoomKey(key);
    const r = ctx.roomOf(floor, room);
    steps.push({
      ...base,
      kind: 'room',
      floor,
      revealRooms: [key],
      revealFloors: [],
      hidden: new Set(hidden),
      hiddenFloors: new Set(hiddenFloors),
      shown: [...shown],
      focus: r ? { floor, rect: roomFocusRect(r) } : null,
    });
  }
  /* 長度：開始前 0.8、路線 1.7（＋樓梯 0.7）、公開 1（只有一步時 0） */
  let t = 0;
  for (const [i, s] of steps.entries()) {
    s.start = t;
    s.duration =
      steps.length < 2
        ? 0
        : i === 0
          ? STAGE_TIMING.intro
          : s.kind === 'route'
            ? STAGE_TIMING.route + (s.bridge ? STAGE_TIMING.bridge : 0)
            : STAGE_TIMING.reveal;
    t += s.duration;
  }
  return {
    steps,
    total: Math.round(t * 1000) / 1000,
    playable: steps.length >= 2 || ctx.rooms.length > 0,
    manual: [...hidden],
    ctx,
    info,
  };
}

/** 第幾步（t 秒時；結尾＝最後一步） */
export function stepAt(tl: StageTimeline, t: number): number {
  let k = 0;
  for (let i = 0; i < tl.steps.length; i++) if (tl.steps[i].start <= t + 1e-9) k = i;
  return k;
}

/* ---------- 某一個時間的畫面 ---------- */

export interface RouteDraw {
  id: string;
  /** 畫到哪裡（0～1） */
  progress: number;
  head: boolean;
}

export interface StageState {
  /** 平面圖畫哪一層 */
  floor: string;
  hidden: ReadonlySet<string>;
  hiddenFloors: ReadonlySet<string>;
  /** 要畫的路線（照順序） */
  routes: RouteDraw[];
  /** 要畫的走樓梯的線：第 index 條路線之前的那一段 */
  bridges: (RouteDraw & { index: number })[];
}

const full = (id: string): RouteDraw => ({ id, progress: 1, head: true });

/** 第 k 步完成的樣子 */
export function stepState(tl: StageTimeline, k: number): StageState {
  const s = tl.steps[k];
  const shown = new Set(s.shown);
  return {
    floor: s.floor,
    hidden: s.hidden,
    hiddenFloors: s.hiddenFloors,
    routes: s.shown.map(full),
    bridges: tl.ctx.routes
      .map((r, i) => ({ ...full(r.id), index: i }))
      .filter((b) => b.index > 0 && tl.ctx.hops[b.index].length && shown.has(b.id)),
  };
}

export interface StageFrame {
  /** 第幾步 */
  step: number;
  /** 淡入時底下的畫面（沒有＝不淡入） */
  from: StageState | null;
  to: StageState;
  /** to 的不透明度（0～1） */
  alpha: number;
}

/**
 * t 秒時的畫面。`instant`（使用者設定「減少動態效果」的預覽）：不淡入、路線一次畫好。
 */
export function stageFrameAt(tl: StageTimeline, t: number, instant = false): StageFrame {
  const k = stepAt(tl, t);
  const s = tl.steps[k];
  const done = stepState(tl, k);
  if (k === 0 || instant) return { step: k, from: null, to: done, alpha: 1 };
  const T = STAGE_TIMING;
  const tau = Math.max(0, Math.min(s.duration, t - s.start));
  const prev = stepState(tl, k - 1);
  const fade = (x: number) => Math.min(1, x / T.fade);
  if (s.kind !== 'route' || !s.route) {
    const a = fade(tau);
    return { step: k, from: a < 1 ? prev : null, to: done, alpha: a };
  }
  const id = s.route.id;
  const bridgeOn = s.bridge;
  const bridgeState = (progress: number): StageState => ({
    floor: s.floor,
    hidden: s.bridgeHidden ?? prev.hidden,
    hiddenFloors: s.bridgeHiddenFloors ?? prev.hiddenFloors,
    routes: prev.routes,
    bridges: [...prev.bridges, { id, index: s.routeIndex, progress, head: progress >= 1 }],
  });
  if (bridgeOn && tau < T.bridge) {
    const q = Math.min(1, tau / T.bridgeDraw);
    const a = fade(tau);
    return { step: k, from: a < 1 ? prev : null, to: bridgeState(q), alpha: a };
  }
  const tr = bridgeOn ? tau - T.bridge : tau;
  const q = Math.min(1, tr / T.routeDraw);
  const to: StageState = {
    ...done,
    routes: done.routes.map((r) => (r.id === id ? { id, progress: q, head: q >= 1 } : r)),
  };
  const a = fade(tr);
  const under = bridgeOn ? bridgeState(1) : prev;
  return { step: k, from: a < 1 ? under : null, to, alpha: a };
}

/* ---------- 鏡頭 ---------- */

export type StageCameraMode = 'follow' | 'fixed';

const ease = (x: number) => 1 - (1 - x) ** 3;
export const lerpRect = (a: Rect, b: Rect, t: number): Rect =>
  t >= 1
    ? { ...b }
    : t <= 0
      ? { ...a }
      : {
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          w: a.w + (b.w - a.w) * t,
          h: a.h + (b.h - a.h) * t,
        };

/**
 * t 秒時的鏡頭（畫面上要放進來的範圍）：`fixed`＝全體；`follow`＝每一步 0.48 秒移到那一步的範圍（緩停），走樓梯的過場時
 * 不動，最後一步的最後 0.4 秒回到全體（原作的 animateView 與影片的運鏡）。`box`＝範圍在畫面上的位置、`whole`＝那一層看的全體；
 * `perFloor`（平面圖）：換樓層時先跳到那一層的全體。
 */
export function stageCameraAt(
  tl: StageTimeline,
  t: number,
  mode: StageCameraMode,
  box: (f: StageFocus) => Rect | null,
  whole: (floor: string) => Rect,
  perFloor: boolean,
): Rect {
  const k = stepAt(tl, t);
  if (mode === 'fixed' || tl.steps.length < 2) return whole(tl.steps[k].floor);
  const T = STAGE_TIMING;
  const n = tl.steps.length;
  let cam = whole(tl.steps[0].floor);
  for (let j = 1; j <= k; j++) {
    const s = tl.steps[j];
    const startCam = perFloor && s.floor !== tl.steps[j - 1].floor ? whole(s.floor) : cam;
    const target = (s.focus && box(s.focus)) || startCam;
    const last = j === n - 1;
    const end = last ? whole(s.floor) : target;
    if (j < k) {
      cam = end;
      continue;
    }
    const tau = Math.max(0, Math.min(s.duration, t - s.start));
    const delay = s.bridge ? T.bridge : 0;
    if (last && tau > s.duration - T.overview)
      return lerpRect(target, end, ease(Math.min(1, (tau - s.duration + T.overview) / T.overview)));
    if (tau < delay) return startCam;
    return lerpRect(startCam, target, ease(Math.min(1, (tau - delay) / T.camera)));
  }
  return cam;
}

/** 範圍放進寬高比 aspect 的畫面（短的那一邊放大；原作的 aspectBox） */
export function aspectRect(b: Rect, aspect: number): Rect {
  if (b.w / b.h < aspect) {
    const w = b.h * aspect;
    return { x: b.x - (w - b.w) / 2, y: b.y, w, h: b.h };
  }
  const h = b.w / aspect;
  return { x: b.x, y: b.y - (h - b.h) / 2, w: b.w, h };
}

/* ---------- 自動產生演出 ---------- */

export interface AutoStageResult {
  stage: StagePlan | undefined;
  /** 走不到的房間（最後公開） */
  disconnected: number;
  /** 從哪一層開始（樓層 id） */
  start: string;
}

/**
 * 自動產生演出（原作的おまかせ演出）：路線全部重做、房間的藏起來重做（整層藏起來的設定留著，出發的那一層除外）。
 * 1. 有房間的樓層（立體圖的樓層、不是祕密樓層）：從 1F（沒有時最下面）開始，往上，再往下。
 * 2. 每一層的房間（走廊・樓梯、甲板、地面類、GM 專用的不算）都藏起來，順序依序編號。
 * 3. 第一層：入口的房間（名字有玄關、門廳、大廳、入口、櫃台、甲板…，沒有時第一間）一開始就公開。
 * 4. 每一層最多走 3 次（第一層含入口）：從上一間走到這一層還藏著的、最近的那一間（照門、走廊、樓梯算），
 *    路線碰到的房間在那一條路線時公開；走不到的房間最後依序公開。
 * 只有一間房時那一間藏起來、最後公開。
 */
export function autoStage(p: Project, ctx: RouteContext = routeContext(p)): AutoStageResult | null {
  const levels = ctx.floors
    .map((f, level) => ({ f, level }))
    .filter(({ f }) => !f.secret && f.rooms.some(isAutoRoom));
  if (!levels.length) return null;
  const gi = levels.findIndex(({ f }) => /^1\s*F$|^1\s*樓$/i.test(f.name.trim()));
  const start = levels[gi >= 0 ? gi : 0];
  const ordered = [
    start,
    ...levels.filter((l) => l.level > start.level),
    ...levels.filter((l) => l.level < start.level).reverse(),
  ];
  const old = stagePlanOf(p);
  const rooms: StageRoom[] = [];
  const routes: StageRoute[] = [];
  let order = 0;
  let previous: { level: number; room: Room } | null = null;
  let disconnected = 0;
  const passed = new Set<string>();
  const total = levels.reduce((n, { f }) => n + f.rooms.filter(isAutoRoom).length, 0);
  for (const { f, level } of ordered) {
    const remaining = f.rooms.filter(isAutoRoom);
    const entries = new Map<string, StageRoom>();
    for (const r of remaining) {
      const e: StageRoom = { floor: f.id, room: r.id, order: order++ };
      entries.set(r.id, e);
      rooms.push(e);
    }
    let visits = 0;
    if (!previous) {
      const entry = remaining.find((r) => ENTRY_NAME.test(r.name)) ?? remaining[0];
      remaining.splice(remaining.indexOf(entry), 1);
      previous = { level, room: entry };
      const e = entries.get(entry.id);
      if (e) rooms.splice(rooms.indexOf(e), 1);
      visits++;
    }
    while (remaining.length && visits < 3) {
      let best: { room: Room; plan: NonNullable<ReturnType<typeof planRoute>> } | null = null;
      for (const r of remaining) {
        const cand = planRoute(ctx, previous, { level, room: r });
        if (cand && (!best || cand.cost < best.plan.cost)) best = { room: r, plan: cand };
      }
      if (!best) {
        disconnected += remaining.length;
        break;
      }
      for (const leg of best.plan.legs)
        routes.push(routeFromPath(uid('a'), ctx.floors[leg.level].id, leg.pts));
      for (const h of best.plan.hops) for (const k of h.rooms) passed.add(k);
      previous = { level, room: best.room };
      remaining.splice(remaining.indexOf(best.room), 1);
      visits++;
    }
  }
  /* 自動產生的房間以外，使用者藏起來的（走廊、樓梯間、甲板…）照舊；路線經過的樓梯間改成自動公開（原作） */
  const keep = (old.rooms ?? [])
    .filter((e) => {
      const r = p.floors.find((x) => x.id === e.floor)?.rooms.find((x) => x.id === e.room);
      return !!r && isStageRoom(r) && !isAutoRoom(r);
    })
    .map((e): StageRoom => {
      if (!passed.has(roomKey(e.floor, e.room))) return e;
      return { floor: e.floor, room: e.room };
    });
  const all: StageRoom[] = [...keep, ...rooms];
  if (total === 1 && previous)
    all.push({ floor: ctx.floors[previous.level].id, room: previous.room.id, when: 'after' });
  const floors = (old.floors ?? []).filter((id) => id !== start.f.id);
  const out: StagePlan = {};
  if (all.length) out.rooms = all;
  if (floors.length) out.floors = floors;
  if (routes.length) out.routes = routes;
  return {
    stage: out.rooms || out.floors || out.routes ? out : undefined,
    disconnected,
    start: start.f.id,
  };
}

/* ---------- 拖曳路線的控制點 ---------- */

export type RouteHandle = 'p1' | 'p2' | 'ctrl';

const straightRoute = (r: StageRoute) =>
  Math.hypot(r.cx - (r.x1 + r.x2) / 2, r.cy - (r.y1 + r.y2) / 2) < 0.16;
const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

/**
 * 拖曳路線的控制點（原作的 linepoint）：編號圓標（起點 p1）、終點（p2）移到 pos；同一層、端點接在一起的路線跟著動
 * （`alone`＝按住 Alt：只動這一條）；端點改了的路線照門與走廊重新算（自由的曲線保持彎曲；走不過去時變直線）。
 * 小方塊（ctrl）＝控制點：改成自由的曲線。回傳新的路線清單（不改 before）。
 */
export function dragRouteHandle(
  before: readonly StageRoute[],
  id: string,
  handle: RouteHandle,
  pos: { x: number; y: number },
  alone: boolean,
  nav: (
    floor: string,
  ) =>
    | ((
        a: { x: number; y: number },
        b: { x: number; y: number },
      ) => { x: number; y: number }[] | null)
    | null,
): StageRoute[] {
  const routes = before.map((r) => ({
    ...r,
    ...(r.pts ? { pts: r.pts.map((q) => [q[0], q[1]] as [number, number]) } : {}),
  }));
  const l = routes.find((r) => r.id === id);
  const orig = before.find((r) => r.id === id);
  if (!l || !orig) return routes;
  const x = r3(pos.x);
  const y = r3(pos.y);
  if (handle === 'ctrl') {
    l.cx = x;
    l.cy = y;
    delete l.pts;
    return routes;
  }
  const ox = handle === 'p1' ? orig.x1 : orig.x2;
  const oy = handle === 'p1' ? orig.y1 : orig.y2;
  const setEnd = (r: StageRoute, which: 'p1' | 'p2', was: StageRoute) => {
    if (which === 'p1') {
      r.x1 = x;
      r.y1 = y;
    } else {
      r.x2 = x;
      r.y2 = y;
    }
    if (straightRoute(was)) {
      r.cx = r3((r.x1 + r.x2) / 2);
      r.cy = r3((r.y1 + r.y2) / 2);
    }
  };
  setEnd(l, handle, orig);
  if (!alone)
    for (const other of routes) {
      if (other.id === id || other.floor !== orig.floor) continue;
      const was = before.find((r) => r.id === other.id);
      if (!was) continue;
      if (Math.hypot(was.x2 - ox, was.y2 - oy) < 0.24) setEnd(other, 'p2', was);
      else if (Math.hypot(was.x1 - ox, was.y1 - oy) < 0.24) setEnd(other, 'p1', was);
    }
  for (const r of routes) {
    const was = before.find((b) => b.id === r.id);
    if (!was || (was.x1 === r.x1 && was.y1 === r.y1 && was.x2 === r.x2 && was.y2 === r.y2))
      continue;
    if (!was.pts && !straightRoute(was)) continue;
    const pts = nav(r.floor)?.({ x: r.x1, y: r.y1 }, { x: r.x2, y: r.y2 }) ?? null;
    if (pts) {
      const next = routeFromPath(r.id, r.floor, pts);
      r.pts = next.pts;
      r.cx = next.cx;
      r.cy = next.cy;
      r.x1 = next.x1;
      r.y1 = next.y1;
      r.x2 = next.x2;
      r.y2 = next.y2;
    } else {
      delete r.pts;
      r.cx = r3((r.x1 + r.x2) / 2);
      r.cy = r3((r.y1 + r.y2) / 2);
    }
  }
  return routes;
}
