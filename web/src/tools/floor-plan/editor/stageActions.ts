/**
 * 演出的操作（2026-11-09，F313～F328）：演出的開關、工具、藏起來與公開、移動路線、時間軸上的公開時機、自動產生、
 * 播放時的暫時公開。改演出的資料都經過 updateProject（一步復原）；改了之後演出的畫面回到準備的樣子（原作：編輯時回到準備時的狀態）。
 */
import { GROUND_CATS } from '../model/floorCopy';
import { uid } from '../model/geometry';
import { planRoute, roomKey, routeFromPath, splitRoomKey } from '../model/route';
import { roomHasPointClosed } from '../model/shape';
import {
  addStageRoutes,
  autoStage,
  clearStageHidden,
  clearStageRoutes,
  hideFloorRooms,
  isStageRoom,
  moveStageRoute,
  ROUTE_MIN_LEN,
  removeLastStageRoute,
  removeStageRoute,
  setStageFloor,
  setStageRoom,
  setStageWhen,
  stageRoomEntry,
  tidyStage,
  toggleStageRoom,
} from '../model/stage';
import type { Project, Room, StageWhen } from '../model/types';
import { S } from '../strings';
import { flushNudge, notify, undo, updateHint, updateProject } from './actions';
import { routeContextOf, type StageTool, setStage, timelineOf, useStage } from './stageStore';
import { setEditor, usePrefs, useProject } from './store';

/* ---------- 播放畫面與鏡頭（偏好，記在瀏覽器） ---------- */

export type StagePlayView = 'board' | 'stack' | 'keep';
export type StageCamera = 'follow' | 'fixed';

export const stagePlayView = (): StagePlayView => usePrefs.getState().data.stageView ?? 'board';
export const stageCamera = (): StageCamera => usePrefs.getState().data.stageCamera ?? 'follow';

export function setStagePlayView(v: StagePlayView): void {
  usePrefs.getState().update((d) => {
    d.stageView = v;
  });
}

export function setStageCameraMode(v: StageCamera): void {
  usePrefs.getState().update((d) => {
    d.stageCamera = v;
  });
}

/* ---------- 開關、工具 ---------- */

/** 演出的開關：打開時放下編輯的工具、清掉選取 */
export function setStageMode(on: boolean): void {
  if (useStage.getState().on === on) return;
  flushNudge();
  if (on) setEditor({ sel: [], tool: 'select', armed: null });
  stopPreview();
  setStage({ on, start: null, exportOpen: false });
  updateHint(false);
}

export function setStageTool(tool: StageTool): void {
  setStage({ tool, ...(tool !== 'route' ? { start: null } : {}) });
  updateHint(false);
}

/** 回到準備的樣子（播放、暫時公開都取消） */
export function stopPreview(): void {
  const s = useStage.getState();
  s.player?.reset();
  setStage({
    preview: false,
    time: 0,
    playing: false,
    openRooms: [],
    openFloors: [],
    revealAll: false,
  });
}

/* 地圖的樓層或演出改了（編輯、復原）：演出的畫面回到準備的樣子 */
useProject.subscribe((s, prev) => {
  const st = useStage.getState();
  if (!st.preview && !st.openRooms.length && !st.openFloors.length) return;
  if (s.data.floors !== prev.data.floors || s.data.stage !== prev.data.stage) stopPreview();
});

/** 改演出的資料（一步復原） */
function edit(fn: (p: Project) => void): void {
  updateProject((p) => {
    fn(p);
    tidyStage(p);
  });
}

const floorName = (p: Project, id: string) => p.floors.find((f) => f.id === id)?.name || '—';
const roomLabel = (r: Room) => r.name || S.stage.unnamed;

/* ---------- 藏起來與公開 ---------- */

/** 點了一間房（藏起來／公開、移動路線依工具） */
export function stageRoomClick(floor: string, room: Room): void {
  const tool = useStage.getState().tool;
  if (tool === 'route') routeClick(floor, room);
  else if (tool === 'hide') toggleHide(floor, room);
}

/** 可不可以藏（GM 專用的、地面不行）；不行時提醒 */
function canHide(room: Room): boolean {
  if (room.gm) {
    notify(S.stage.gmRoom, 'warning', { replace: true });
    return false;
  }
  if (GROUND_CATS.has(room.cat) || !isStageRoom(room)) {
    notify(S.stage.groundRoom, 'warning', { replace: true });
    return false;
  }
  return true;
}

export function toggleHide(floor: string, room: Room): void {
  if (!canHide(room)) return;
  let hidden = false;
  edit((p) => {
    hidden = toggleStageRoom(p, floor, room.id);
  });
  notify(hidden ? S.stage.hidden(roomLabel(room)) : S.stage.shown(roomLabel(room)), 'info', {
    replace: true,
  });
}

export function setHide(floor: string, room: Room, on: boolean): void {
  if (on && !canHide(room)) return;
  edit((p) => setStageRoom(p, floor, room.id, on));
}

export function setFloorHidden(floor: string, on: boolean): void {
  const p = useProject.getState().data;
  edit((d) => setStageFloor(d, floor, on));
  notify(on ? S.stage.floorHidden(floorName(p, floor)) : S.stage.floorShown(floorName(p, floor)));
}

/** 這一層全部藏起來 */
export function hideFloor(floor?: string): void {
  const p = useProject.getState().data;
  const id = floor ?? p.floors[p.active]?.id;
  if (!id) return;
  let n = 0;
  edit((d) => {
    n = hideFloorRooms(d, id);
  });
  notify(S.stage.hiddenFloorRooms(floorName(p, id), n));
}

export function clearHidden(): void {
  edit(clearStageHidden);
  notify(S.stage.cleared);
}

/* ---------- 移動路線 ---------- */

export function clearStart(): void {
  setStage({ start: null });
}

/** 移動路線工具點了一間房：出發地 → 下一間（連起來，經過門、走廊與樓梯） */
export function routeClick(floor: string, room: Room): void {
  const { start } = useStage.getState();
  if (!start) {
    setStage({ start: { floor, room: room.id } });
    notify(S.stage.startSet, 'info', { replace: true });
    return;
  }
  if (start.floor === floor && start.room === room.id) {
    setStage({ start: null });
    notify(S.stage.startCleared, 'info', { replace: true });
    return;
  }
  if (connectRooms(start, { floor, room: room.id })) setStage({ start: { floor, room: room.id } });
}

/** 兩間房之間加移動路線（每一層一條）；走不過去時提醒、回傳 false */
export function connectRooms(
  a: { floor: string; room: string },
  b: { floor: string; room: string },
): boolean {
  const p = useProject.getState().data;
  const ctx = routeContextOf(p);
  const ra = p.floors.find((f) => f.id === a.floor)?.rooms.find((r) => r.id === a.room);
  const rb = p.floors.find((f) => f.id === b.floor)?.rooms.find((r) => r.id === b.room);
  if (!ra || !rb) return false;
  const plan = planRoute(
    ctx,
    { level: ctx.levelOf(a.floor), room: ra },
    { level: ctx.levelOf(b.floor), room: rb },
  );
  if (!plan) {
    notify(S.stage.noRoute, 'warning', { replace: true });
    return false;
  }
  edit((d) =>
    addStageRoutes(
      d,
      plan.legs.map((leg) => routeFromPath(uid('a'), ctx.floors[leg.level].id, leg.pts)),
    ),
  );
  notify(S.stage.routeAdded(plan.legs.length), 'success', { replace: true });
  return true;
}

const r3 = (v: number) => Math.round(v * 1000) / 1000 + 0;

/** 在平面圖上拖曳畫的自由的箭頭（直線，之後拖小方塊彎曲）；終點所在的房間變成下一條的出發地 */
export function addFreeRoute(
  floor: string,
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  if (Math.hypot(b.x - a.x, b.y - a.y) < ROUTE_MIN_LEN) {
    notify(S.stage.tooShort, 'warning', { replace: true });
    return false;
  }
  edit((p) =>
    addStageRoutes(p, [
      {
        id: uid('a'),
        floor,
        x1: r3(a.x),
        y1: r3(a.y),
        cx: r3((a.x + b.x) / 2),
        cy: r3((a.y + b.y) / 2),
        x2: r3(b.x),
        y2: r3(b.y),
      },
    ]),
  );
  const p = useProject.getState().data;
  const f = p.floors.find((x) => x.id === floor);
  const end = f
    ? [...f.rooms].reverse().find((r) => roomHasPointClosed(r, b.x, b.y) && !GROUND_CATS.has(r.cat))
    : null;
  setStage({ start: end ? { floor, room: end.id } : null });
  notify(S.stage.drawn(p.stage?.routes?.length ?? 0), 'success', { replace: true });
  return true;
}

export function undoRoute(): void {
  if (!useProject.getState().data.stage?.routes?.length) return;
  edit(removeLastStageRoute);
  notify(S.stage.routeRemoved);
}

export function clearRoutes(): void {
  if (!useProject.getState().data.stage?.routes?.length) return;
  edit(clearStageRoutes);
  setStage({ start: null });
  notify(S.stage.routesCleared);
}

export function moveRoute(id: string, dir: -1 | 1): void {
  edit((p) => moveStageRoute(p, id, dir));
}

export function deleteRoute(id: string): void {
  edit((p) => removeStageRoute(p, id));
}

/* ---------- 公開的時機 ---------- */

export function setWhen(key: string, when: StageWhen | 'auto'): void {
  const { floor, room } = splitRoomKey(key);
  edit((p) => setStageWhen(p, floor, room, when));
}

/** 「所有路線之後」的房間的順序往前（−1）／往後（＋1） */
export function moveAfter(key: string, dir: -1 | 1): void {
  const p = useProject.getState().data;
  const tl = timelineOf(p);
  const after = tl.steps.filter((s) => s.kind === 'room').map((s) => s.revealRooms[0]);
  const i = after.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= after.length) return;
  [after[i], after[j]] = [after[j], after[i]];
  edit((d) => {
    after.forEach((k, order) => {
      const { floor, room } = splitRoomKey(k);
      const e = stageRoomEntry(d, floor, room);
      if (e) e.order = order;
    });
  });
}

export type StageDropTarget =
  | { kind: 'route'; id: string }
  | { kind: 'after'; before: string | null }
  | { kind: 'manual' };

/** 房間的晶片拖到時間軸的一步（原作：拖到別的 STEP 改公開的時機；還沒藏的先藏起來） */
export function dropRoom(key: string, target: StageDropTarget): void {
  const p = useProject.getState().data;
  const { floor, room } = splitRoomKey(key);
  const r = p.floors.find((f) => f.id === floor)?.rooms.find((x) => x.id === room);
  if (!r || !canHide(r)) return;
  const tl = timelineOf(p);
  const after = tl.steps
    .filter((s) => s.kind === 'room')
    .map((s) => s.revealRooms[0])
    .filter((k) => k !== key);
  edit((d) => {
    setStageRoom(d, floor, room, true);
    if (target.kind === 'route') setStageWhen(d, floor, room, `route:${target.id}`);
    else if (target.kind === 'manual') setStageWhen(d, floor, room, 'manual');
    else {
      setStageWhen(d, floor, room, 'after');
      const at = target.before ? after.indexOf(target.before) : -1;
      after.splice(at < 0 ? after.length : at, 0, key);
      after.forEach((k, order) => {
        const s = splitRoomKey(k);
        const e = stageRoomEntry(d, s.floor, s.room);
        if (e) e.order = order;
      });
    }
  });
  notify(S.stage.moved, 'info', { replace: true });
}

/* ---------- 自動產生 ---------- */

export function autoGenerate(): void {
  const p = useProject.getState().data;
  const r = autoStage(p, routeContextOf(p));
  if (!r) {
    notify(S.stage.autoNone, 'warning');
    return;
  }
  const level = p.floors.findIndex((f) => f.id === r.start);
  updateProject((d) => {
    if (r.stage) d.stage = r.stage;
    else delete d.stage;
    if (level >= 0) d.active = level;
  });
  setStage({ start: null });
  if (usePrefs.getState().data.view === 'plan' || !usePrefs.getState().data.view)
    usePrefs.getState().update((d) => {
      d.view = 'board';
    });
  notify(S.stage.autoDone(r.disconnected), 'success', {
    action: { label: S.undo, onClick: undo },
  });
}

/* ---------- 演出的畫面 ---------- */

/** 演出的畫面裡點了「？？？」：暫時公開（回到開頭時回到準備的樣子） */
export function revealTemp(key: string): void {
  const s = useStage.getState();
  if (s.openRooms.includes(key)) return;
  /* 播放中的畫面或 PL 檢視（開始前）都可以：畫的樓層不變（不另外開始播放） */
  setStage({ openRooms: [...s.openRooms, key] });
  const p = useProject.getState().data;
  const { floor, room } = splitRoomKey(key);
  const r = p.floors.find((f) => f.id === floor)?.rooms.find((x) => x.id === room);
  notify(S.stage.revealedTemp(r ? roomLabel(r) : S.stage.unnamed), 'info', { replace: true });
}

export function revealFloorTemp(id: string): void {
  const s = useStage.getState();
  if (s.openFloors.includes(id)) return;
  setStage({ openFloors: [...s.openFloors, id] });
  notify(S.stage.revealedTemp(floorName(useProject.getState().data, id)), 'info', {
    replace: true,
  });
}

export function revealAll(): void {
  const s = useStage.getState();
  const tl = timelineOf(useProject.getState().data);
  if (s.player) {
    s.player.pause();
    s.player.seek(tl.total);
  }
  setStage({ preview: true, revealAll: true });
}

export { roomKey };
