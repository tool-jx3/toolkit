/**
 * 編輯操作（按鈕、快捷鍵、畫布共用）：改資料的一律經過 useProject（一次操作＝一步復原）。
 */
import type { ChoiceOptions, ConfirmOptions, ToastOptions } from '@/ui';
import { ASSET, isAsset } from '../model/assets';
import { isTokenGridSize, ROOM_PRESETS, type RoomPresetId, wallThickness } from '../model/catalog';
import { compatCounts, hasCompatNotes } from '../model/compat';
import {
  clamp,
  clueCount,
  emptyProject,
  floorBounds,
  round2,
  uid,
  visibleFloor,
} from '../model/geometry';
import { isLegacyMapFile, type NormalizeReport, normalizeProject } from '../model/normalize';
import { numberRooms } from '../model/numbering';
import {
  type AnyObj,
  cloneFloor,
  cloneObj,
  copyOffset,
  countRefs,
  deepClone,
  deletionExtras,
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
import { itemGhost } from '../model/snap';
import {
  type Floor,
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

export function newRoom(rect: Rect, preset: RoomPresetId | null): Room {
  const p = preset ? ROOM_PRESETS[preset] : null;
  return {
    id: uid('r'),
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    name: p ? S.presets[p.id] : S.newRoom,
    cat: p ? p.cat : 'living',
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
    if (tool === 'door') a = { kind: 'opening', type: 'door', hinge: 0 };
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
  if (tool === 'room' && armed?.kind === 'room') {
    const p = ROOM_PRESETS[armed.preset];
    text = S.hints.roomPreset(armedName(armed), `${round2(p.w / 2)}×${round2(p.h / 2)}m`);
  } else if ((tool === 'door' || tool === 'window') && armed)
    text = warn ? S.hints.noWall : S.hints.opening(armedName(armed));
  else if (tool === 'place' && armed) text = S.hints.place(armedName(armed));
  else if (tool === 'wall' && armed?.kind === 'wall') text = S.hints.wall(armedName(armed));
  else if (
    tool === 'select' ||
    tool === 'hand' ||
    tool === 'room' ||
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
          description: S.del.text(countRefs(extras)),
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
    update((p) => {
      for (const id of ids) {
        const it = getObj(cur(p), 'item', id);
        if (it) rotateItem(it as never, 90);
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
  const t = useProject.temporal.getState();
  if (!t.pastStates.length) {
    notify(S.msg.noUndo);
    return;
  }
  t.undo();
}

export function redo(): void {
  flushNudge();
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
    const [gone] = d.floors.splice(d.active, 1);
    d.active = clamp(d.active - 1, 0, d.floors.length - 1);
    /* 「顯示內部」疊的是刪掉的那一層，或只剩一層時：關掉（不要突然換成疊別的樓層；F230） */
    for (const f of d.floors)
      if (f.inside === gone.id || d.floors.length < 2) {
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

/** 替目前這一層的房間放上 1、2、3…的圓標（原本的純數字圓標先拿掉）；一步復原 */
export function numberRoomsOnFloor(): void {
  const r = numberRooms(currentFloor());
  if (!r) {
    notify(S.msg.noRoomsToNumber, 'warning');
    return;
  }
  update((p) => {
    cur(p).texts = r.texts;
  });
  const keep = new Set(r.texts.map((t) => t.id));
  setEditor({ sel: useEditor.getState().sel.filter((s) => s.type !== 'text' || keep.has(s.id)) });
  notify(S.msg.numbered(r.count, r.gm), 'success', { action: undoAction() });
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
