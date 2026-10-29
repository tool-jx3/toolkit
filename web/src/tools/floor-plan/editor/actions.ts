/**
 * 編輯操作（按鈕、快捷鍵、畫布共用）：改資料的一律經過 useProject（一次操作＝一步復原）。
 */
import type { ChoiceOptions, ConfirmOptions, ToastOptions } from '@/ui';
import { arrangeRoom } from '../model/arrange';
import { ASSET, isAsset } from '../model/assets';
import {
  isTokenGridSize,
  ROOM_PRESETS,
  type RoomPresetId,
  WEAR_DEFAULT,
  WEAR_MIN,
  WEAR_SEEDS,
  wallThickness,
} from '../model/catalog';
import { compatCounts, hasCompatNotes } from '../model/compat';
import { connectRooms } from '../model/connect';
import { followRoomResize } from '../model/follow';
import {
  clamp,
  clueCount,
  emptyProject,
  floorBounds,
  round2,
  uid,
  visibleFloor,
} from '../model/geometry';
import { interiorFloor } from '../model/interior';
import { isLegacyMapFile, type NormalizeReport, normalizeProject } from '../model/normalize';
import { isRoomNumber, numberRooms } from '../model/numbering';
import {
  type AnyObj,
  cloneFloor,
  cloneObj,
  copyOffset,
  countContents,
  deepClone,
  deletionExtras,
  existingRefs,
  getObj,
  groundFloorIndex,
  movable,
  nextFloorName,
  refKey,
  reorder,
  rotateItem,
  rotateRoomsCW,
  translateObj,
  withContents,
} from '../model/ops';
import { defaultCut, fitCut, L_MIN } from '../model/shape';
import { itemGhost } from '../model/snap';
import { restingOn, SURFACES } from '../model/tabletop';
import {
  type Corner,
  type Floor,
  type Item,
  type ObjType,
  type Project,
  type Rect,
  type Room,
  type SelRef,
  TYPE_KEY,
} from '../model/types';
import type { WallRun } from '../model/walls';
import { S } from '../strings';
import { getTemplate, instantiateTemplate } from '../templates';
import { importNotice } from './ImportReport';
import {
  type Armed,
  currentFloor,
  editableFloor,
  setEditor,
  starterProject,
  type ToolId,
  useEditor,
  usePrefs,
  useProject,
} from './store';

/* ---------- 通知與確認（App 設定） ---------- */

type Notify = (o: ToastOptions) => void;
type Confirm = (o: ConfirmOptions) => Promise<boolean>;
type Choose = <V extends string>(o: ChoiceOptions<V>) => Promise<V | null>;
let toastFn: Notify | null = null;
let confirmFn: Confirm | null = null;
let chooseFn: Choose | null = null;
let viewFns: { fit: () => void; reset: () => void } | null = null;

export function bindUi(t: Notify | null, c: Confirm | null, ch: Choose | null = null): void {
  toastFn = t;
  confirmFn = c;
  chooseFn = ch;
}

/** 共用的確認對話框（App 還沒設定時當成同意） */
export function confirmUi(o: ConfirmOptions): Promise<boolean> {
  return confirmFn ? confirmFn(o) : Promise.resolve(true);
}

export function bindView(v: { fit: () => void; reset: () => void } | null): void {
  viewFns = v;
}

export function notify(
  title: string,
  tone: ToastOptions['tone'] = 'info',
  extra: Partial<ToastOptions> = {},
): void {
  toastFn?.({ title, tone, duration: tone === 'warning' ? 3600 : 2800, ...extra });
}

const undoAction = () => ({ label: S.undo, onClick: undo });

/* ---------- 基本 ---------- */

export const floorBox = (f: Floor): Rect | null => floorBounds(f);

/**
 * 改地圖（一步復原）。方向鍵移動的那一步還沒結束時先結束它，
 * 不然 0.7 秒內做的其他變更（例如 Ctrl＋D）會被併進方向鍵的那一步。
 */
export function updateProject(fn: (p: Project) => void): void {
  flushNudge();
  useProject.getState().update(fn);
}
const update = updateProject;
const cur = (p: Project) => p.floors[p.active];

export function addObject(type: ObjType, obj: AnyObj): void {
  update((p) => {
    (cur(p)[TYPE_KEY[type]] as AnyObj[]).push(obj);
  });
}

export function removeObjects(refs: readonly SelRef[]): void {
  const keys = new Set(refs.map(refKey));
  update((p) => {
    const f = cur(p);
    for (const type of ['room', 'item', 'opening', 'wall', 'text'] as const)
      (f[TYPE_KEY[type]] as AnyObj[]) = (f[TYPE_KEY[type]] as AnyObj[]).filter(
        (o) => !keys.has(`${type}:${o.id}`),
      );
  });
  const sel = useEditor.getState().sel.filter((s) => !keys.has(refKey(s)));
  setEditor({ sel });
}

/** 新的房間；lshape＝L 形（預設缺右上角、外框的一半；外框不到 2 × 2 時是長方形，2026-10-29） */
export function newRoom(rect: Rect, preset: RoomPresetId | null, lshape = false): Room {
  const p = preset ? ROOM_PRESETS[preset] : null;
  const cut = lshape ? defaultCut(rect.w, rect.h) : undefined;
  return {
    id: uid('r'),
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    name: p ? S.presets[p.id] : S.newRoom,
    cat: p ? p.cat : 'living',
    ...(cut ? { cut } : {}),
  };
}

export const wallKindThickness = (armed: Armed | null): number =>
  wallThickness(armed?.kind === 'wall' ? armed.type : 'int');

/** 選取中、但已經不存在（或看不到）的東西拿掉 */
export function dropMissingSelection(): void {
  const { sel, playerView } = useEditor.getState();
  if (!sel.length) return;
  const f = visibleFloor(editableFloor(), playerView, !usePrefs.getState().data.showClues);
  const next = sel.filter((s) => (f[TYPE_KEY[s.type]] as AnyObj[]).some((o) => o.id === s.id));
  if (next.length !== sel.length) setEditor({ sel: next });
}

export function focusField(name: string): void {
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      `[data-focus="${name}"]`,
    );
    if (!el) return;
    el.focus();
    if ('select' in el) el.select();
  });
}

/* ---------- 工具 ---------- */

export function setTool(tool: ToolId, armed?: Armed | null): void {
  let a: Armed | null = armed ?? null;
  if (armed === undefined) {
    const prev = useEditor.getState().armed;
    /* 房間與 L 形房間互換時，拿著的房間預設留著（2026-10-29） */
    if ((tool === 'room' || tool === 'lroom') && prev?.kind === 'room') a = prev;
    else if (tool === 'door') a = { kind: 'opening', type: 'door', hinge: 0 };
    else if (tool === 'window') a = { kind: 'opening', type: 'window', hinge: 0 };
    else if (tool === 'wall') a = { kind: 'wall', type: 'int' };
  }
  setEditor({ tool, armed: a });
  updateHint(false);
}

export function armedName(a: Armed | null): string {
  if (!a) return '';
  if (a.kind === 'opening') return S.openings[a.type];
  if (a.kind === 'item') return ASSET[a.t]?.name ?? '';
  if (a.kind === 'room') return S.presets[a.preset];
  return S.walls[a.type];
}

export function updateHint(warn: boolean): void {
  const { tool, armed, hint } = useEditor.getState();
  let text: string;
  if ((tool === 'room' || tool === 'lroom') && armed?.kind === 'room') {
    const p = ROOM_PRESETS[armed.preset];
    const size = `${round2(p.w / 2)}×${round2(p.h / 2)}m`;
    text =
      tool === 'lroom'
        ? S.hints.lroomPreset(armedName(armed), size)
        : S.hints.roomPreset(armedName(armed), size);
  } else if ((tool === 'door' || tool === 'window') && armed)
    text = warn ? S.hints.noWall : S.hints.opening(armedName(armed));
  else if (tool === 'place' && armed) text = S.hints.place(armedName(armed));
  else if (tool === 'wall' && armed?.kind === 'wall') text = S.hints.wall(armedName(armed));
  else if (
    tool === 'select' ||
    tool === 'hand' ||
    tool === 'room' ||
    tool === 'lroom' ||
    tool === 'text' ||
    tool === 'eraser'
  )
    text = S.hints[tool];
  else text = '';
  if (hint.text !== text || hint.warn !== warn) setEditor({ hint: { text, warn } });
}

/** 在素材面板點同一張卡片＝放下工具 */
export function toggleArmed(tool: ToolId, armed: Armed): void {
  const ed = useEditor.getState();
  const same =
    ed.tool === tool &&
    ed.armed?.kind === armed.kind &&
    JSON.stringify({ ...ed.armed, rot: 0, manual: false, hinge: 0 }) ===
      JSON.stringify({ ...armed, rot: 0, manual: false, hinge: 0 });
  if (same) setTool('select');
  else setTool(tool, armed);
}

/** R：要放的家具轉向、門窗的鉸鍊換邊；不然轉選取的東西 */
export function rotateKey(refresh: () => void): void {
  const { tool, armed } = useEditor.getState();
  if (tool === 'place' && armed?.kind === 'item') {
    setEditor({ armed: { ...armed, rot: (armed.rot + 90) % 360, manual: true } });
    refresh();
  } else if ((tool === 'door' || tool === 'window') && armed?.kind === 'opening') {
    setEditor({ armed: { ...armed, hinge: armed.hinge ? 0 : 1 } });
    refresh();
  } else rotateSelection();
}

/* ---------- 選取 ---------- */

function selected(): { type: ObjType; id: string; obj: AnyObj }[] {
  const f = currentFloor();
  return useEditor
    .getState()
    .sel.map((s) => ({ ...s, obj: getObj(f, s.type, s.id) as AnyObj }))
    .filter((s) => s.obj);
}

export function selectAll(): void {
  const { playerView } = useEditor.getState();
  const f = visibleFloor(editableFloor(), playerView, !usePrefs.getState().data.showClues);
  const sel: SelRef[] = [];
  for (const type of ['room', 'item', 'opening', 'wall', 'text'] as const)
    for (const o of f[TYPE_KEY[type]] as AnyObj[]) sel.push({ type, id: o.id });
  setEditor({ sel });
}

/**
 * 刪除選取的東西（Delete、屬性面板與迷你工具列的刪除）。鎖定的房間略過。
 * 選取的房間裡還有東西（家具、文字、門窗、牆、巢狀的房間）時先問：只刪房間／連裡面的東西一起刪／取消（F224）；
 * 一次刪除算一步復原。
 */
export async function deleteSelection(): Promise<void> {
  await deleteSelected(false);
}

/** 剪下用：房間連同裡面的東西一起刪（剪貼簿裡已經有它們，不必問） */
async function deleteSelected(withAll: boolean): Promise<void> {
  const all = selected();
  const entries = all.filter((e) => !(e.type === 'room' && (e.obj as Room).locked));
  if (entries.length < all.length) notify(S.msg.lockedSkip, 'warning');
  if (!entries.length) return;
  const hadRoom = entries.some((e) => e.type === 'room');
  let targets: SelRef[] = entries.map(({ type, id }) => ({ type, id }));
  if (hadRoom) {
    const extras = deletionExtras(currentFloor(), targets);
    if (extras.length) {
      if (withAll) targets = targets.concat(extras);
      else if (chooseFn) {
        const rooms = entries.filter((e) => e.type === 'room');
        const how = await chooseFn({
          title: S.del.title(rooms.length, (rooms[0].obj as Room).name),
          description: S.del.text(countContents(currentFloor(), extras)),
          choices: [
            { value: 'room', label: S.del.roomOnly, variant: 'secondary' },
            { value: 'all', label: S.del.withContents, variant: 'danger' },
          ],
        });
        if (!how) return;
        if (how === 'all') targets = targets.concat(deletionExtras(currentFloor(), targets));
      }
    }
  }
  /* 詢問期間地圖可能變了（房間被刪掉…）：只算現在還在的；什麼都沒刪就不通知、不記復原（7.10） */
  targets = existingRefs(currentFloor(), targets);
  if (!targets.length) return;
  removeObjects(targets);
  setEditor({ sel: [] });
  if (hadRoom || targets.length > 2)
    notify(S.msg.deleted(targets.length), 'info', { action: undoAction() });
}

export function duplicateSelection(): void {
  const { sel } = useEditor.getState();
  if (!sel.length) return;
  const f = currentFloor();
  const entries = withContents(f, sel);
  const { dx, dy } = copyOffset(f, entries);
  const top = new Set(sel.map(refKey));
  const clones = entries.map((e) => ({
    type: e.type,
    obj: cloneObj(e.type, getObj(f, e.type, e.id) as AnyObj, dx, dy),
    top: top.has(refKey(e)),
  }));
  update((p) => {
    for (const c of clones) (cur(p)[TYPE_KEY[c.type]] as AnyObj[]).push(c.obj);
  });
  setEditor({ sel: clones.filter((c) => c.top).map((c) => ({ type: c.type, id: c.obj.id })) });
}

export function copySelection(cut: boolean): void {
  const { sel } = useEditor.getState();
  if (!sel.length) return;
  const f = currentFloor();
  const entries = withContents(f, sel);
  const top = new Set(sel.map(refKey));
  setEditor({
    clipboard: {
      floorId: f.id,
      offset: copyOffset(f, entries),
      shift: 0,
      entries: entries.map((e) => ({
        type: e.type,
        obj: deepClone(getObj(f, e.type, e.id)),
        top: top.has(refKey(e)),
      })),
    },
  });
  if (cut) void deleteSelected(true);
}

export function paste(): void {
  const cb = useEditor.getState().clipboard;
  if (!cb?.entries.length) return;
  const f = currentFloor();
  const first = cb.entries[0];
  /* 同一層、原本的東西還在：每貼一次多錯開一次；別的樓層：貼在同樣的位置 */
  const sameFloor = cb.floorId === f.id && !!getObj(f, first.type, (first.obj as AnyObj).id);
  const shift = sameFloor ? cb.shift + 1 : cb.shift;
  const dx = sameFloor ? cb.offset.dx * shift : 0;
  const dy = sameFloor ? cb.offset.dy * shift : 0;
  const added: SelRef[] = [];
  const copies = cb.entries.map((e) => {
    const copy = cloneObj(e.type, e.obj as AnyObj, dx, dy);
    if (e.top) added.push({ type: e.type, id: copy.id });
    return { type: e.type, obj: copy };
  });
  update((p) => {
    for (const c of copies) (cur(p)[TYPE_KEY[c.type]] as AnyObj[]).push(c.obj);
  });
  setEditor({ sel: added, clipboard: { ...cb, shift } });
  notify(S.msg.pasted(cb.entries.length));
}

export function rotateSelection(): void {
  const entries = selected();
  if (!entries.length) return;
  if (entries.some((e) => e.type === 'room')) {
    const top = entries.filter((e) => !(e.type === 'room' && (e.obj as Room).locked));
    const rooms = top.filter((e) => e.type === 'room').map((e) => e.obj as Room);
    if (!rooms.length) {
      notify(S.msg.locked, 'warning');
      return;
    }
    if (top.length < entries.length) notify(S.msg.lockedSkip, 'warning');
    const f = currentFloor();
    const refs = movable(
      f,
      top.map((e) => ({ type: e.type, id: e.id })),
    );
    const ids = rooms.map((r) => r.id);
    update((p) => {
      const ff = cur(p);
      rotateRoomsCW(
        ff,
        ids.map((id) => getObj(ff, 'room', id) as Room),
        refs,
      );
    });
    return;
  }
  if (entries.some((e) => e.type === 'item')) {
    const ids = entries.filter((e) => e.type === 'item').map((e) => e.id);
    /* 放在選取的桌子上的小物繞著桌子的中心一起轉（2026-10-29，F255） */
    const f = currentFloor();
    const carried = new Map<string, Item>();
    for (const id of ids) {
      const s = getObj(f, 'item', id) as Item | null;
      if (s && SURFACES.has(s.t))
        for (const small of restingOn(s, f.items)) carried.set(small.id, s);
    }
    update((p) => {
      for (const id of ids) {
        if (carried.has(id)) continue;
        const it = getObj(cur(p), 'item', id);
        if (it) rotateItem(it as never, 90);
      }
      for (const [id, s] of carried) {
        const it = getObj(cur(p), 'item', id) as Item | null;
        if (!it) continue;
        const sx = s.x + s.w / 2;
        const sy = s.y + s.h / 2;
        const cx = it.x + it.w / 2;
        const cy = it.y + it.h / 2;
        rotateItem(it, 90);
        it.x = round2(sx - (cy - sy) - it.w / 2);
        it.y = round2(sy + (cx - sx) - it.h / 2);
      }
    });
  } else if (entries.length === 1 && entries[0].type === 'opening') flipHinge();
}

export function flipSelection(): void {
  const entries = selected();
  if (entries.some((e) => e.type === 'item')) {
    const ids = entries.filter((e) => e.type === 'item').map((e) => e.id);
    update((p) => {
      for (const id of ids) {
        const it = getObj(cur(p), 'item', id) as { flip?: boolean } | null;
        if (!it) continue;
        if (it.flip) delete it.flip;
        else it.flip = true;
      }
    });
  } else if (entries.length === 1 && entries[0].type === 'opening') flipSwing();
}

export function flipSwing(): void {
  const entries = selected();
  if (entries.length !== 1 || entries[0].type !== 'opening') return;
  const id = entries[0].id;
  update((p) => {
    const o = getObj(cur(p), 'opening', id) as { side: 1 | -1 } | null;
    if (o) o.side = o.side === -1 ? 1 : -1;
  });
}

export function flipHinge(): void {
  const entries = selected();
  if (entries.length !== 1 || entries[0].type !== 'opening') return;
  const id = entries[0].id;
  update((p) => {
    const o = getObj(cur(p), 'opening', id) as { hinge: 0 | 1 } | null;
    if (o) o.hinge = o.hinge ? 0 : 1;
  });
}

/** 切換旗標：全部都有 → 全部拿掉，否則全部加上 */
function toggleFlag(key: 'gm' | 'clue' | 'locked', refs: readonly SelRef[]): boolean {
  const f = currentFloor();
  const objs = refs
    .map((s) => getObj(f, s.type, s.id) as Record<string, unknown> | null)
    .filter(Boolean);
  const on = !objs.every((o) => o?.[key]);
  update((p) => {
    for (const s of refs) {
      const o = getObj(cur(p), s.type, s.id) as Record<string, unknown> | null;
      if (!o) continue;
      if (on) o[key] = true;
      else delete o[key];
    }
  });
  return on;
}

export function toggleGm(): void {
  const { sel } = useEditor.getState();
  if (!sel.length) return;
  toggleFlag('gm', sel);
  dropMissingSelection();
}

export function toggleClue(): void {
  const refs = useEditor.getState().sel.filter((s) => s.type === 'item' || s.type === 'text');
  if (!refs.length) return;
  toggleFlag('clue', refs);
  dropMissingSelection();
}

export function toggleLock(): void {
  const refs = useEditor.getState().sel.filter((s) => s.type === 'room');
  if (!refs.length) return;
  toggleFlag('locked', refs);
}

export function reorderSelection(toFront: boolean): void {
  const sel = useEditor.getState().sel.filter((s) => s.type === 'room' || s.type === 'item');
  if (!sel.length) return;
  update((p) => reorder(cur(p), sel, toFront));
}

/** 改一個欄位（屬性面板）：recipe 拿到目前樓層裡的那個東西 */
export function editObj<T extends AnyObj>(ref: SelRef, recipe: (o: T) => void): void {
  update((p) => {
    const o = getObj(cur(p), ref.type, ref.id) as T | null;
    if (o) recipe(o);
  });
}

/* ---------- 方向鍵（連按算一步） ---------- */

let nudgeTimer: ReturnType<typeof setTimeout> | null = null;

export function nudge(dx: number, dy: number, big: boolean): boolean {
  const { sel } = useEditor.getState();
  if (!sel.length) return false;
  const f = currentFloor();
  const refs = movable(f, sel);
  if (!refs.length) {
    if (sel.some((s) => s.type === 'room')) notify(S.msg.locked, 'warning');
    return true;
  }
  const hasRoom = refs.some((s) => s.type === 'room');
  const step = hasRoom ? (big ? 4 : 1) : big ? 1 : 0.25;
  useProject.beginGesture();
  useProject.getState().update((p) => {
    for (const r of refs) {
      const o = getObj(cur(p), r.type, r.id);
      if (o) translateObj(r.type, o, dx * step, dy * step);
    }
  });
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(flushNudge, 700);
  return true;
}

/** 結束方向鍵移動的那一步（沒有在移動時不動別的手勢，例如正在打字） */
export function flushNudge(): void {
  if (!nudgeTimer) return;
  clearTimeout(nudgeTimer);
  nudgeTimer = null;
  useProject.endGesture();
}

/* ---------- 復原 ---------- */

export function undo(): void {
  flushNudge();
  /* 滑桿、欄位聚焦中（手勢還開著）：裡面的變更先記成一步，再退那一步（7.10） */
  useProject.endGesture();
  const t = useProject.temporal.getState();
  if (!t.pastStates.length) {
    notify(S.msg.noUndo);
    return;
  }
  t.undo();
}

export function redo(): void {
  flushNudge();
  useProject.endGesture();
  useProject.temporal.getState().redo();
}

/* ---------- 檢視 ---------- */

export function setPlayerView(on: boolean): void {
  setEditor({ playerView: on });
  if (on) dropMissingSelection();
}

export function setShowClues(on: boolean, quiet = false): void {
  usePrefs.getState().update((d) => {
    d.showClues = on;
  });
  if (!on) dropMissingSelection();
  if (!quiet) {
    const n = clueCount(useProject.getState().data.floors);
    notify(on ? S.msg.cluesShown(n) : S.msg.cluesHidden(n));
  }
}

export function toggleGrid(): void {
  usePrefs.getState().update((d) => {
    d.grid = !d.grid;
  });
}

/* ---------- 樓層 ---------- */

export function switchFloor(index: number): void {
  const p = useProject.getState().data;
  if (index < 0 || index >= p.floors.length || index === p.active) return;
  flushNudge();
  setEditor({ sel: [] });
  /* 換樓層不算一步復原 */
  useProject.temporal.getState().pause();
  update((d) => {
    d.active = index;
  });
  useProject.temporal.getState().resume();
}

/**
 * 「顯示內部」沒寫 `inside`（或找不到）時疊的是「第一個別的樓層」：樓層的順序要變（左右移動、複製的複本插在前面）之前，
 * 先把實際疊著的那一層寫成 `inside`，順序變了也疊同一層，不突然換成疊別的樓層（F230、D41）。
 * `inside` 本來就對的、沒打開的外觀層不動。
 */
function pinInside(p: Project): void {
  for (const f of p.floors) {
    const target = interiorFloor(f, p.floors);
    if (target && f.inside !== target.id) f.inside = target.id;
  }
}

export function addFloor(): void {
  update((p) => {
    p.floors.push({
      id: uid('f'),
      name: nextFloorName(p.floors),
      rooms: [],
      walls: [],
      openings: [],
      items: [],
      texts: [],
    });
    p.active = p.floors.length - 1;
  });
  setEditor({ sel: [] });
}

export function duplicateFloor(): void {
  update((p) => {
    pinInside(p);
    const copy = cloneFloor(cur(p), nextFloorName(p.floors));
    p.floors.splice(p.active + 1, 0, copy);
    p.active += 1;
  });
  setEditor({ sel: [] });
}

export async function removeFloor(): Promise<void> {
  const p = useProject.getState().data;
  if (p.floors.length <= 1) return;
  const name = cur(p).name;
  const ok = confirmFn
    ? await confirmFn({
        title: S.floors.confirmTitle(name),
        description: S.floors.confirmText,
        confirmLabel: S.floors.remove,
        danger: true,
      })
    : true;
  if (!ok) return;
  update((d) => {
    const gone = d.floors[d.active];
    /* 「顯示內部」實際疊的那一層是刪掉的這一層（`inside` 沒寫或找不到時疊的是第一個別的樓層）：先算好再刪 */
    const coversGone = d.floors.filter((f) => interiorFloor(f, d.floors)?.id === gone.id);
    d.floors.splice(d.active, 1);
    d.active = clamp(d.active - 1, 0, d.floors.length - 1);
    /* 疊的是刪掉的那一層，或只剩一層時：關掉（不要突然換成疊別的樓層；F230、D41） */
    for (const f of d.floors)
      if (f.inside === gone.id || coversGone.includes(f) || d.floors.length < 2) {
        delete f.showInside;
        delete f.inside;
      }
  });
  setEditor({ sel: [] });
}

/** 外觀層的「顯示內部」（F230）：打開時疊上來的樓層沒設好就用第一個別的樓層；一步復原 */
export function setShowInside(on: boolean): void {
  update((p) => {
    const f = p.floors[p.active];
    const others = p.floors.filter((o) => o !== f);
    if (!on || !others.length) {
      delete f.showInside;
      return;
    }
    f.showInside = true;
    if (!others.some((o) => o.id === f.inside)) f.inside = others[0].id;
  });
  dropMissingSelection();
}

export function setInsideFloor(id: string): void {
  update((p) => {
    const f = p.floors[p.active];
    if (p.floors.some((o) => o !== f && o.id === id)) f.inside = id;
  });
  dropMissingSelection();
}

export function moveFloor(delta: number): void {
  const p = useProject.getState().data;
  const i = p.active;
  const j = i + delta;
  if (j < 0 || j >= p.floors.length) return;
  update((d) => {
    pinInside(d);
    [d.floors[i], d.floors[j]] = [d.floors[j], d.floors[i]];
    d.active = j;
  });
}

export function renameFloor(index: number, name: string): void {
  const value = name.trim().slice(0, 60);
  const p = useProject.getState().data;
  if (!value || !p.floors[index] || p.floors[index].name === value) return;
  update((d) => {
    d.floors[index].name = value;
  });
}

/* ---------- 整張地圖 ---------- */

/** 棋子方格的大小（格；0＝不顯示）。一步復原；地圖設定與匯出對話框共用 */
export function setTokenGrid(size: number): void {
  update((p) => {
    if (isTokenGridSize(size)) p.tokenGrid = size;
    else delete p.tokenGrid;
  });
}

/** 新的空白地圖：保留顯示樣式（恐怖調查換回彩色）、面積顯示、名字顯示、棋子方格；切到房間工具 */
export function newMap(): void {
  const p = useProject.getState().data;
  const next: Project = {
    ...emptyProject(S.newMapName),
    theme: p.theme === 'horror' ? 'clean' : p.theme,
    showSize: p.showSize,
    showNames: p.showNames !== false,
    ...(p.tokenGrid ? { tokenGrid: p.tokenGrid } : {}),
    ...(p.tokenGridColor ? { tokenGridColor: p.tokenGridColor } : {}),
    ...(p.tokenGridOpacity ? { tokenGridOpacity: p.tokenGridOpacity } : {}),
  };
  flushNudge();
  useProject.getState().replace(next);
  setEditor({ sel: [], templatesOpen: false });
  setTool('room');
  viewFns?.reset();
  notify(S.msg.newMap, 'success', { action: undoAction() });
}

export function loadTemplate(id: string, opts: { structureOnly: boolean; clues: boolean }): void {
  const tpl = getTemplate(id);
  const floors = tpl ? instantiateTemplate(id, opts) : null;
  if (!tpl || !floors) return;
  const p = useProject.getState().data;
  const theme =
    p.theme === 'clean' || p.theme === 'horror'
      ? tpl.theme === 'horror'
        ? 'horror'
        : 'clean'
      : p.theme;
  flushNudge();
  useProject
    .getState()
    .replace({ ...p, floors, active: groundFloorIndex(floors), name: tpl.name, theme });
  setEditor({ sel: [], templatesOpen: false });
  setTool('select');
  if (opts.clues && !usePrefs.getState().data.showClues) setShowClues(true, true);
  viewFns?.fit();
  notify(S.msg.templateLoaded(tpl.name), 'success', { action: undoAction() });
}

export type OpenResult = { ok: true; dropped: number } | { ok: false };

/** 開檔的通知有「詳細」與「復原」兩顆按鈕、要讀數字，顯示久一點（滑過或聚焦時暫停） */
const IMPORT_NOTICE_MS = 8000;

/** 資料的來源：本站的專案檔、原作的 .trpgmap.json、分享連結（完整／PL 用，F217） */
export type OpenSource = 'project' | 'legacy' | 'link' | 'link-pl';

const openedTitle = (source: OpenSource, name: string): string =>
  source === 'legacy'
    ? S.msg.imported(name)
    : source === 'link'
      ? S.share.opened(name)
      : source === 'link-pl'
        ? S.share.openedPl(name)
        : S.msg.opened(name);

/**
 * 讀進一份專案資料（本站的專案檔、原作的 .trpgmap.json、分享連結）：取代目前的地圖（可以復原）。
 * 原作新版的種類換成相近的、略過本工具沒有的東西時，「已匯入」的通知改成警告色，說明一行摘要＋「詳細」（F213、D25）。
 * PL 用連結打開後切到 PL 檢視（F216）。
 */
export function openProjectData(raw: unknown, source: OpenSource): OpenResult {
  const report: NormalizeReport = { droppedItems: 0 };
  const project = normalizeProject(raw, isAsset, report);
  if (!project) return { ok: false };
  flushNudge();
  useProject.getState().replace(project);
  setEditor({ sel: [], importReport: null, importReportOpen: false });
  setTool('select');
  if (source === 'link-pl') setPlayerView(true);
  viewFns?.fit();
  const name = project.name || S.untitled;
  const title = openedTitle(source, name);
  if (hasCompatNotes(report.compat)) {
    setEditor({
      importReport: report.compat,
      importSource: source === 'link' || source === 'link-pl' ? 'link' : 'file',
    });
    notify(title, 'warning', {
      description: importNotice(S.compat.summary(compatCounts(report.compat))),
      action: undoAction(),
      duration: IMPORT_NOTICE_MS,
    });
  } else notify(title, 'success', { action: undoAction() });
  return { ok: true, dropped: report.droppedItems };
}

export { isLegacyMapFile };

const withoutIds = (p: Project) => JSON.stringify(p, (k, v) => (k === 'id' ? undefined : v));

/**
 * 目前的地圖換掉也不會丟掉東西：每一層都是空的（新的空白地圖），或還是開頁時的範本、沒有改過（第一次打開這個工具）。
 * 打開分享連結時這兩種不必確認（F217、D29）。
 */
export function isDisposableMap(p: Project = useProject.getState().data): boolean {
  const empty = p.floors.every(
    (f) =>
      !f.rooms.length &&
      !f.walls.length &&
      !f.openings.length &&
      !f.items.length &&
      !f.texts.length,
  );
  if (empty) return true;
  const starter = normalizeProject(starterProject(), isAsset);
  return !!starter && withoutIds(normalizeProject(p, isAsset) ?? p) === withoutIds(starter);
}

/* ---------- 依序編號房間（F219） ---------- */

/**
 * 替目前這一層的房間放上 1、2、3…的圓標（原本的純數字圓標先拿掉）；一步復原。
 * 外觀層打開「顯示內部」時只編外觀層自己留下來、看得到的房間（和點選、框選一樣用 editableFloor；
 * 疊上來的室內房間、拿掉的屋頂不編，F230、7.13）。這一層的資料照原樣留著：看不到的一般文字不動，
 * 純數字的舊編號（包括拿掉的屋頂上看不到的）整批換成新的，不然關掉「顯示內部」時會冒出重複的舊號碼。
 */
export function numberRoomsOnFloor(): void {
  const r = numberRooms(editableFloor());
  if (!r) {
    notify(S.msg.noRoomsToNumber, 'warning');
    return;
  }
  const texts = [...currentFloor().texts.filter((t) => !isRoomNumber(t)), ...r.badges];
  update((p) => {
    cur(p).texts = texts;
  });
  const keep = new Set(texts.map((t) => t.id));
  setEditor({ sel: useEditor.getState().sel.filter((s) => s.type !== 'text' || keep.has(s.id)) });
  notify(S.msg.numbered(r.count, r.gm), 'success', { action: undoAction() });
}

/* ---------- 2026-10-29（參考 KIIN マップ制作スタジオ） ---------- */

/** 連接選取的兩間房間（F250～F252）：共用的牆放門，或畫一條走廊；一步復原 */
export function connectSelection(): void {
  const sel = useEditor.getState().sel;
  const rooms = sel.filter((s) => s.type === 'room');
  if (rooms.length !== 2 || sel.length !== 2) {
    notify(S.msg.connectFail.notTwo, 'warning');
    return;
  }
  const r = connectRooms(currentFloor(), rooms[0].id, rooms[1].id, S.msg.corridorName);
  if (!r.ok) {
    notify(S.msg.connectFail[r.reason], 'warning');
    if (r.reason === 'connected' && r.doorId)
      setEditor({ sel: [{ type: 'opening', id: r.doorId }] });
    return;
  }
  update((p) => {
    const f = cur(p);
    if (r.kind === 'corridor') f.rooms.push(r.room);
    f.openings.push(...r.openings);
  });
  if (r.kind === 'corridor') {
    setEditor({ sel: [{ type: 'room', id: r.room.id }] });
    notify(S.msg.connectedCorridor(r.length), 'success', { action: undoAction() });
  } else {
    setEditor({ sel: [{ type: 'opening', id: r.openings[0].id }] });
    notify(S.msg.connectedDoor, 'success', { action: undoAction() });
  }
}

/** 整理這間房的家具（F253）；一步復原 */
export function arrangeRoomFurniture(id: string): void {
  const f = currentFloor();
  const room = getObj(f, 'room', id) as Room | null;
  if (!room) return;
  const r = arrangeRoom(f, id);
  const name = room.name || S.newRoom;
  if (!r.ok) {
    notify(r.reason === 'empty' ? S.msg.arrangeEmpty : S.msg.arrangeFull(name), 'warning');
    return;
  }
  update((p) => {
    for (const it of cur(p).items) {
      const m = r.moves.get(it.id);
      if (m) Object.assign(it, m);
    }
  });
  if (r.pinned.length)
    notify(S.msg.arrangedPinned(name, r.count, r.pinned.length), 'warning', {
      action: undoAction(),
    });
  else notify(S.msg.arranged(name, r.count), 'success', { action: undoAction() });
}

/**
 * 房間的外框改成 next（屬性面板的數字欄；控制點在 controller）：缺角跟著夾到合法的範圍，
 * 家具跟著房間（地圖設定開著時，F254）。回傳放不下的家具組數。
 */
export function resizeRoom(id: string, next: Rect): number {
  const p0 = useProject.getState().data;
  const before = cur(p0);
  const orig = getObj(before, 'room', id) as Room | null;
  if (!orig) return 0;
  let misfit = 0;
  update((p) => {
    const f = cur(p);
    const r = getObj(f, 'room', id) as Room | null;
    if (!r) return;
    const cut = fitCut(orig.cut, next.w, next.h);
    const geo = { x: next.x, y: next.y, w: next.w, h: next.h, ...(cut ? { cut } : {}) };
    if (!p0.fixedFurniture) misfit = followRoomResize(before, orig, geo, f);
    Object.assign(r, { x: next.x, y: next.y, w: next.w, h: next.h });
    if (cut) r.cut = cut;
    else delete r.cut;
  });
  return misfit;
}

/** 房間的形狀：長方形／L 形（F259） */
export function setRoomShape(id: string, lshape: boolean): void {
  editObj<Room>({ type: 'room', id }, (r) => {
    if (!lshape) delete r.cut;
    else if (!r.cut) {
      const cut = defaultCut(r.w, r.h);
      if (cut) r.cut = cut;
    }
  });
}

/** L 形的缺角：角、寬、深（整格，夾在 1～外框減 1） */
export function setRoomCut(id: string, patch: { c?: Corner; w?: number; h?: number }): void {
  editObj<Room>({ type: 'room', id }, (r) => {
    if (!r.cut || r.w < L_MIN || r.h < L_MIN) return;
    const next = { ...r.cut, ...patch };
    r.cut = {
      c: next.c,
      w: clamp(Math.round(next.w), 1, r.w - 1),
      h: clamp(Math.round(next.h), 1, r.h - 1),
    };
  });
}

/** 地圖設定：改房間大小時家具跟著移動（F254；預設開） */
export function setFollowFurniture(on: boolean): void {
  update((p) => {
    if (on) delete p.fixedFurniture;
    else p.fixedFurniture = true;
  });
}

/** 地圖設定：座標標示（F264） */
export function setCoords(on: boolean): void {
  update((p) => {
    if (on) p.coords = true;
    else delete p.coords;
  });
}

const newWearSeed = (old?: number): number => {
  let s = Math.floor(Math.random() * WEAR_SEEDS);
  if (s === old) s = (s + 1) % WEAR_SEEDS;
  return s;
};

/** 地圖設定：紙的污漬與摺痕（F263）；打開時用原本的種子（沒有時新的） */
export function setWear(on: boolean): void {
  update((p) => {
    if (!on) {
      delete p.wear;
      return;
    }
    p.wear = WEAR_DEFAULT;
    if (p.wearSeed === undefined) p.wearSeed = newWearSeed();
  });
}

export function setWearStrength(v: number): void {
  useProject.getState().update((p) => {
    if (p.wear === undefined) return;
    p.wear = Math.round(clamp(v, WEAR_MIN, 1) * 100) / 100;
  });
}

/** 換一組污漬與摺痕的位置 */
export function shuffleWear(): void {
  update((p) => {
    p.wearSeed = newWearSeed(p.wearSeed);
  });
}

/* ---------- 從素材面板拖放 ---------- */

export function dropAsset(
  a: { kind: 'item'; t: string } | { kind: 'room'; preset: string },
  w: { x: number; y: number },
  alt: boolean,
  lines: readonly WallRun[],
): void {
  if (a.kind === 'item' && ASSET[a.t]) {
    const g = itemGhost(lines, w.x, w.y, { t: a.t, rot: 0 }, alt);
    const item = {
      id: uid('i'),
      t: g.t,
      x: round2(g.x),
      y: round2(g.y),
      w: g.w,
      h: g.h,
      rot: g.rot,
    };
    addObject('item', item);
    setTool('select');
    setEditor({ sel: [{ type: 'item', id: item.id }] });
  } else if (a.kind === 'room' && a.preset in ROOM_PRESETS) {
    const p = ROOM_PRESETS[a.preset as RoomPresetId];
    const room = newRoom(
      { x: Math.round(w.x - p.w / 2), y: Math.round(w.y - p.h / 2), w: p.w, h: p.h },
      p.id,
    );
    addObject('room', room);
    setTool('select');
    setEditor({ sel: [{ type: 'room', id: room.id }] });
  }
}

export { fileBase } from '../model/exportPlan';
export { floorBounds };
