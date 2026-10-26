/**
 * 狀態與動作（共用的 createFxStore，core/imagefx/store.ts）：內容（自動儲存、可以復原）、偏好（不列入復原）、
 * 選取與編輯區（不儲存）。地圖演出另外有「點選建立路線」「編輯路線的點」的狀態（usePoints，不儲存）與
 * 房間遮罩 ZIP 的「1 格幾 px」（偏好）。
 */
import { create } from 'zustand';
import {
  createFxStore,
  type FxPrefsBase,
  newFrameId,
  STAGE_BGS,
  type StageBg,
  snapTo,
} from '@/core/imagefx';
import type { ExportSettings } from '@/ui';
import {
  applyRect,
  canFinishPoints,
  DEFAULT_GRID,
  duplicateFrame,
  type Frame,
  type FrameDefaults,
  type FrameKind,
  initialDefaults,
  initialState,
  insertPoint,
  isPathStyle,
  type MapState,
  makeFrame,
  makePointRoute,
  normalizeDefaults,
  normalizeState,
  type Point,
  type RouteFrame,
  removePoint,
  setRoutePoints,
  snapRange,
  stateAssetIds,
  toPointRoute,
  VIDEO_FPS,
} from './model';
import {
  clampDoorAt,
  clampRoomRect,
  normalizeWalk,
  nudgeDoorAt,
  roomsFromMasks,
  type Side,
  WALK_LIMITS,
  WALK_RANGES,
  type WalkKind,
  type WalkRoom,
  type WalkState,
  wallOf,
} from './walk';

export { type PointerTool, STAGE_BGS, type StageBg } from '@/core/imagefx';

export const TOOL_ID = 'map-fx';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

/* ---------- 不列入復原的設定 ---------- */

export interface Prefs extends FxPrefsBase<FrameKind, FrameDefaults> {
  export: ExportSettings;
  /** 房間遮罩 ZIP：1 格幾 px */
  grid: number;
}

export const initialExport = (): ExportSettings => ({
  format: 'png',
  fps: 30,
  plays: 0,
  scale: 1,
  quantize: false,
  colors: 128,
});

export const initialPrefs = (): Prefs => ({
  tool: 'zoom',
  defaults: initialDefaults(),
  guides: true,
  loop: true,
  export: initialExport(),
  stageBg: 'checker',
  grid: DEFAULT_GRID,
});

export const EXPORT_FORMATS = [
  'png',
  'apng',
  'video',
  'xmp4',
  'rooms',
  'steps',
  'layers',
  'sequence',
] as const;
export const APNG_COLORS: readonly number[] = [0, 256, 128, 64];

export function normalizePrefs(raw: unknown): Prefs {
  const d = initialPrefs();
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Prefs>;
  const e = (
    typeof p.export === 'object' && p.export !== null ? p.export : {}
  ) as Partial<ExportSettings>;
  return {
    tool: (['zoom', 'route', 'redact'] as const).includes(p.tool as FrameKind)
      ? (p.tool as FrameKind)
      : d.tool,
    defaults: normalizeDefaults(p.defaults),
    guides: typeof p.guides === 'boolean' ? p.guides : d.guides,
    loop: typeof p.loop === 'boolean' ? p.loop : d.loop,
    export: {
      format: (EXPORT_FORMATS as readonly string[]).includes(e.format as string)
        ? (e.format as string)
        : d.export.format,
      fps: VIDEO_FPS.includes(e.fps as number) ? (e.fps as number) : d.export.fps,
      plays:
        typeof e.plays === 'number' && Number.isFinite(e.plays)
          ? Math.max(0, Math.min(99, Math.round(e.plays)))
          : d.export.plays,
      scale: 1,
      quantize: false,
      colors: APNG_COLORS.includes(e.colors as number) ? (e.colors as number) : d.export.colors,
    },
    stageBg: STAGE_BGS.includes(p.stageBg as StageBg) ? (p.stageBg as StageBg) : d.stageBg,
    grid: snapRange('grid', p.grid, d.grid),
  };
}

export type PanelTab = 'image' | 'frames' | 'timing' | 'walk';

export const fx = createFxStore<Frame, MapState, Prefs, PanelTab>({
  toolId: TOOL_ID,
  version: DATA_VERSION,
  initialState,
  normalizeState,
  initialPrefs,
  normalizePrefs,
  makeFrame,
  duplicateFrame,
  applyRect,
  assetIds: stateAssetIds,
  tabs: { initial: 'image', frames: 'frames' },
  /* 換圖、拿掉圖：3D 的房間、入口、路線清空（牆高等設定留著）；示範演出時換上範例的 3D 設定 */
  resetForImage: (d, tool) => {
    d.walk = normalizeWalk(tool ?? { ...d.walk, rooms: [], doors: [], path: [] }, d.image);
    useWalk.setState({ selected: null, camera: 'orbit' });
  },
});

export const {
  useDoc,
  gesture,
  docNow,
  edit,
  editMerged,
  historyStep,
  usePrefs,
  prefsNow,
  setPrefs,
  setDefaults,
  useLive,
  requestSeek,
  select,
  assets,
  referencedImages,
  dropMissingImage,
  setImage,
  clearImage,
  frameById,
  insertFrame,
  addFrame,
  updateFrame,
  setFrameRect,
  removeFrame,
  clearFrames,
  duplicate,
  moveFrame,
  resetAll,
} = fx;

/* ---------- 點選建立路線、編輯路線的點（不儲存） ---------- */

export type PointMode =
  | { mode: 'create'; points: Point[] }
  | { mode: 'edit'; id: string; active: number | null };

export const usePoints = create<{ draft: PointMode | null }>(() => ({ draft: null }));

/** 開始點選建立路線（工具換成路線・地點、取消選取） */
export function startPointRoute(): void {
  if (!docNow().image) return;
  select(null);
  setPrefs({ tool: 'route' });
  useLive.setState({ pointer: 'edit' });
  usePoints.setState({ draft: { mode: 'create', points: [] } });
}

/** 點一下加一個點（同一點可以再點：U 字、往返） */
export function addDraftPoint(p: Point): void {
  const d = usePoints.getState().draft;
  if (d?.mode !== 'create') return;
  usePoints.setState({ draft: { mode: 'create', points: [...d.points, { ...p }].slice(0, 64) } });
}

/** 退回上一點 */
export function undoDraftPoint(): void {
  const d = usePoints.getState().draft;
  if (d?.mode !== 'create') return;
  usePoints.setState({ draft: { mode: 'create', points: d.points.slice(0, -1) } });
}

/** 結束（取消建立、結束編輯） */
export function endPointMode(): void {
  usePoints.setState({ draft: null });
}

/** 確定：點夠了就做成一條路線（一步復原），回傳 id */
export function finishPointRoute(): string | null {
  const d = usePoints.getState().draft;
  const s = docNow();
  if (d?.mode !== 'create' || !s.image) return null;
  const route = makePointRoute(
    d.points,
    prefsNow().defaults,
    s.image,
    newFrameId(s.frames.map((f) => f.id)),
  );
  if (!canFinishPoints(route.points)) return null;
  const id = insertFrame(route);
  endPointMode();
  return id;
}

/** 編輯選取的路線的點（拖曳畫出的路線換成點選的） */
export function startEditPoints(id: string): void {
  const { frames, image } = docNow();
  const f = frames.find((x) => x.id === id);
  if (f?.kind !== 'route' || !image) return;
  if (f.shape !== 'points' && !isPathStyle(f.style)) return;
  if (f.shape !== 'points') {
    const pr = toPointRoute(f, image);
    edit((d) => {
      const x = d.frames.find((y) => y.id === id) as RouteFrame | undefined;
      if (x) setRoutePoints(x, pr.points, image);
    });
  }
  select(id, true);
  useLive.setState({ pointer: 'edit' });
  usePoints.setState({ draft: { mode: 'edit', id, active: null } });
}

/** 改點（拖曳中在手勢裡，放開記一步；其他一次一步） */
export function setPoints(id: string, points: Point[]): void {
  const image = docNow().image;
  if (!image) return;
  edit((d) => {
    const f = d.frames.find((x) => x.id === id);
    if (f?.kind === 'route') setRoutePoints(f, points, image);
  });
}

export function routeById(id: string): RouteFrame | null {
  const f = frameById(id);
  return f?.kind === 'route' ? f : null;
}

/** 拿掉一個點（至少留兩個） */
export function deletePoint(id: string, i: number): void {
  const f = routeById(id);
  if (!f || f.points.length <= 2) return;
  setPoints(id, removePoint(f.points, i));
  const d = usePoints.getState().draft;
  if (d?.mode === 'edit') usePoints.setState({ draft: { ...d, active: null } });
}

/** 在第 index 段中間插入一點 */
export function addPointOnSegment(id: string, index: number, p: Point): void {
  const f = routeById(id);
  if (!f) return;
  setPoints(id, insertPoint(f.points, index, p));
  const d = usePoints.getState().draft;
  if (d?.mode === 'edit') usePoints.setState({ draft: { ...d, active: index + 1 } });
}

/* ---------- 進階 3D（規格 1.11、3.12）：房間與走廊、入口、移動路線 ---------- */

/** 平面圖的工具：房間、走廊（拖曳框出）、入口（在牆上點）、路線（依序點） */
export type WalkTool = 'room' | 'hall' | 'door' | 'path';
export const WALK_TOOLS: readonly WalkTool[] = ['room', 'hall', 'door', 'path'];
export type WalkSelection =
  | { kind: 'room' | 'door'; id: string }
  | { kind: 'point'; index: number }
  | null;
/** 3D 的鏡頭：俯瞰（拖曳轉動）／沿路線（播放、拖時間軸） */
export type WalkCamera = 'orbit' | 'walk';

export const useWalk = create<{ tool: WalkTool; selected: WalkSelection; camera: WalkCamera }>(
  () => ({ tool: 'room', selected: null, camera: 'orbit' }),
);

export const walkNow = (): WalkState => docNow().walk;

const walkIds = (w: WalkState) => [...w.rooms.map((r) => r.id), ...w.doors.map((d) => d.id)];

/** 選取中的房間／入口／路線的點（被復原掉、刪掉時 null） */
export function walkSelected(w: WalkState, sel: WalkSelection) {
  if (!sel) return null;
  if (sel.kind === 'point') {
    const point = w.path[sel.index];
    return point ? { kind: 'point' as const, index: sel.index, point } : null;
  }
  if (sel.kind === 'room') {
    const room = w.rooms.find((r) => r.id === sel.id);
    return room ? { kind: 'room' as const, room } : null;
  }
  const door = w.doors.find((d) => d.id === sel.id);
  return door ? { kind: 'door' as const, door } : null;
}

export const selectWalk = (selected: WalkSelection): void => useWalk.setState({ selected });

/** 框出一個房間或走廊（一步復原）；到上限、沒有地圖時 null */
export function addRoom(kind: WalkKind, rect: { x: number; y: number; w: number; h: number }) {
  const s = docNow();
  if (!s.image || s.walk.rooms.length >= WALK_LIMITS.rooms) return null;
  const id = newFrameId(walkIds(s.walk));
  const r = clampRoomRect(rect, s.image);
  edit((d) => {
    d.walk.rooms.push({ id, kind, ...r, name: '' });
  });
  selectWalk({ kind: 'room', id });
  return id;
}

/** 改房間的範圍（拖曳中在手勢裡；merge：方向鍵連按） */
export function setRoomRect(
  id: string,
  rect: { x: number; y: number; w: number; h: number },
  merge = false,
): void {
  const s = docNow();
  const room = s.walk.rooms.find((r) => r.id === id);
  if (!room || !s.image) return;
  const r = clampRoomRect(rect, s.image);
  if (r.x === room.x && r.y === room.y && r.w === room.w && r.h === room.h) return;
  (merge ? editMerged : edit)((d) => {
    const x = d.walk.rooms.find((y) => y.id === id);
    if (x) Object.assign(x, r);
  });
}

/** 改房名、種類（文字欄：連續打字併成一步） */
export function updateRoom(
  id: string,
  patch: Partial<Pick<WalkRoom, 'name' | 'kind'>>,
  merge = false,
): void {
  (merge ? editMerged : edit)((d) => {
    const x = d.walk.rooms.find((y) => y.id === id);
    if (x) Object.assign(x, patch);
  });
}

/** 刪掉房間（放在它牆上的入口一起） */
export function removeRoom(id: string): void {
  edit((d) => {
    d.walk.rooms = d.walk.rooms.filter((r) => r.id !== id);
    d.walk.doors = d.walk.doors.filter((o) => o.room !== id);
  });
  const sel = useWalk.getState().selected;
  if (sel && sel.kind !== 'point' && sel.id === id) selectWalk(null);
}

/** 在牆上放入口（到上限時 null） */
export function addDoor(room: string, side: Side, at: number): string | null {
  const w = walkNow();
  const r = w.rooms.find((x) => x.id === room);
  if (!r || w.doors.length >= WALK_LIMITS.doors) return null;
  const id = newFrameId(walkIds(w));
  const a = clampDoorAt(wallOf(r, side), at, w.door);
  edit((d) => {
    d.walk.doors.push({ id, room, side, at: Math.round(a * 10000) / 10000 });
  });
  selectWalk({ kind: 'door', id });
  return id;
}

/** 移動入口（可以換到別的牆；拖曳中在手勢裡） */
export function moveDoor(id: string, room: string, side: Side, at: number, merge = false): void {
  const w = walkNow();
  const r = w.rooms.find((x) => x.id === room);
  const cur = w.doors.find((x) => x.id === id);
  if (!r || !cur) return;
  const a = Math.round(clampDoorAt(wallOf(r, side), at, w.door) * 10000) / 10000;
  if (cur.room === room && cur.side === side && cur.at === a) return;
  (merge ? editMerged : edit)((d) => {
    const x = d.walk.doors.find((y) => y.id === id);
    if (x) Object.assign(x, { room, side, at: a });
  });
}

export function removeDoor(id: string): void {
  edit((d) => {
    d.walk.doors = d.walk.doors.filter((o) => o.id !== id);
  });
  const sel = useWalk.getState().selected;
  if (sel?.kind === 'door' && sel.id === id) selectWalk(null);
}

export function clearDoors(): void {
  if (!walkNow().doors.length) return;
  edit((d) => {
    d.walk.doors = [];
  });
  if (useWalk.getState().selected?.kind === 'door') selectWalk(null);
}

/** 刪掉選取的房間或入口 */
export function removeWalkSelected(): boolean {
  const sel = walkSelected(walkNow(), useWalk.getState().selected);
  if (!sel) return false;
  if (sel.kind === 'room') removeRoom(sel.room.id);
  else if (sel.kind === 'door') removeDoor(sel.door.id);
  else {
    edit((d) => {
      d.walk.path.splice(sel.index, 1);
    });
    selectWalk(null);
  }
  return true;
}

/** 路線：依序點出現在位置、轉角、目的地（一點一步復原；到上限為止） */
export function addPathPoint(p: { x: number; y: number }): void {
  const s = docNow();
  if (!s.image || s.walk.path.length >= WALK_LIMITS.path) return;
  const x = Math.round(Math.min(s.image.width, Math.max(0, p.x)) * 10) / 10;
  const y = Math.round(Math.min(s.image.height, Math.max(0, p.y)) * 10) / 10;
  edit((d) => {
    d.walk.path.push({ x, y });
  });
}

/** 移動路線上的一點（拖曳中在手勢裡） */
export function setPathPoint(i: number, p: { x: number; y: number }, merge = false): void {
  const s = docNow();
  if (!s.image || !s.walk.path[i]) return;
  const x = Math.round(Math.min(s.image.width, Math.max(0, p.x)) * 10) / 10;
  const y = Math.round(Math.min(s.image.height, Math.max(0, p.y)) * 10) / 10;
  (merge ? editMerged : edit)((d) => {
    d.walk.path[i] = { x, y };
  });
}

export function undoPathPoint(): void {
  if (!walkNow().path.length) return;
  edit((d) => {
    d.walk.path.pop();
  });
}

export function clearPath(): void {
  if (!walkNow().path.length) return;
  edit((d) => {
    d.walk.path = [];
  });
}

/** 牆高、入口寬、秒數、房名顯示、地圖鋪在地上 */
/** 牆高、入口寬、秒數、房名顯示、地圖鋪在地上（數值立刻夾住並吸附到間隔：預覽與存檔一致） */
export function setWalkOptions(
  patch: Partial<Pick<WalkState, 'names' | 'floor' | 'wall' | 'door' | 'duration'>>,
): void {
  const cur = walkNow();
  const next = { ...patch };
  for (const k of ['wall', 'door', 'duration'] as const)
    if (next[k] !== undefined) next[k] = snapTo(WALK_RANGES[k], next[k], cur[k]);
  edit((d) => {
    Object.assign(d.walk, next);
  });
}

/**
 * 方向鍵移動選取的房間、入口（沿牆）或路線的點：1 px（Shift 10 px）；0.4 秒內連按併成一步復原。
 * 回傳有沒有東西可以移。
 */
export function nudgeWalkSelected(dx: number, dy: number): boolean {
  const w = walkNow();
  const sel = walkSelected(w, useWalk.getState().selected);
  if (!sel) return false;
  if (sel.kind === 'room') {
    const r = sel.room;
    setRoomRect(r.id, { x: r.x + dx, y: r.y + dy, w: r.w, h: r.h }, true);
  } else if (sel.kind === 'door') {
    const room = w.rooms.find((x) => x.id === sel.door.room);
    if (!room) return false;
    const along = sel.door.side === 'n' || sel.door.side === 's' ? dx : dy;
    if (!along) return true;
    moveDoor(sel.door.id, room.id, sel.door.side, nudgeDoorAt(room, sel.door, along, w.door), true);
  } else setPathPoint(sel.index, { x: sel.point.x + dx, y: sel.point.y + dy }, true);
  return true;
}

/** 房間遮罩當草稿：清單裡的房間遮罩做成房間（房名照抄、範圍相同的不重複加）；回傳加了幾個 */
export function roomsFromRedacts(): number {
  const s = docNow();
  if (!s.image) return 0;
  const masks = s.frames.filter((f) => f.kind === 'redact');
  const image = s.image;
  const add = roomsFromMasks(masks, s.walk.rooms, image, (taken) => newFrameId(taken));
  if (!add.length) return 0;
  edit((d) => {
    d.walk.rooms.push(...add);
  });
  return add.length;
}
