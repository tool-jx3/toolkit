/**
 * 編輯操作（按鈕、快捷鍵、畫布共用）：改資料的一律經過 useProject（一次操作＝一步復原）。
 */
import type { ConfirmOptions, ToastOptions } from '@/ui';
import { ASSET, isAsset } from '../model/assets';
import { ROOM_PRESETS, type RoomPresetId, wallThickness } from '../model/catalog';
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
import {
  type AnyObj,
  cloneFloor,
  cloneObj,
  copyOffset,
  deepClone,
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
import {
  type Armed,
  currentFloor,
  setEditor,
  type ToolId,
  useEditor,
  usePrefs,
  useProject,
} from './store';

/* ---------- 通知與確認（App 設定） ---------- */

type Notify = (o: ToastOptions) => void;
type Confirm = (o: ConfirmOptions) => Promise<boolean>;
let toastFn: Notify | null = null;
let confirmFn: Confirm | null = null;
let viewFns: { fit: () => void; reset: () => void } | null = null;

export function bindUi(t: Notify | null, c: Confirm | null): void {
  toastFn = t;
  confirmFn = c;
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

const update = (fn: (p: Project) => void) => useProject.getState().update(fn);
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
  const f = visibleFloor(currentFloor(), playerView, !usePrefs.getState().data.showClues);
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
  const f = visibleFloor(currentFloor(), playerView, !usePrefs.getState().data.showClues);
  const sel: SelRef[] = [];
  for (const type of ['room', 'item', 'opening', 'wall', 'text'] as const)
    for (const o of f[TYPE_KEY[type]] as AnyObj[]) sel.push({ type, id: o.id });
  setEditor({ sel });
}

export function deleteSelection(): void {
  const all = selected();
  const entries = all.filter((e) => !(e.type === 'room' && (e.obj as Room).locked));
  if (entries.length < all.length) notify(S.msg.lockedSkip, 'warning');
  if (!entries.length) return;
  const hadRoom = entries.some((e) => e.type === 'room');
  removeObjects(entries);
  setEditor({ sel: [] });
  if (hadRoom || entries.length > 2)
    notify(S.msg.deleted(entries.length), 'info', { action: undoAction() });
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
  if (cut) deleteSelection();
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
  update((p) => {
    for (const r of refs) {
      const o = getObj(cur(p), r.type, r.id);
      if (o) translateObj(r.type, o, dx * step, dy * step);
    }
  });
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(flushNudge, 700);
  return true;
}

export function flushNudge(): void {
  if (nudgeTimer) clearTimeout(nudgeTimer);
  nudgeTimer = null;
  if (useProject.inGesture()) useProject.endGesture();
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
    d.floors.splice(d.active, 1);
    d.active = clamp(d.active - 1, 0, d.floors.length - 1);
  });
  setEditor({ sel: [] });
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

/** 新的空白地圖：保留顯示樣式（恐怖調查換回彩色）、面積顯示、名字顯示；切到房間工具 */
export function newMap(): void {
  const p = useProject.getState().data;
  const next: Project = {
    ...emptyProject(S.newMapName),
    theme: p.theme === 'horror' ? 'clean' : p.theme,
    showSize: p.showSize,
    showNames: p.showNames !== false,
  };
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

/** 讀進一份專案資料（本站的專案檔、原作的 .trpgmap.json） */
export function openProjectData(raw: unknown, source: 'project' | 'legacy'): OpenResult {
  const report: NormalizeReport = { droppedItems: 0 };
  const project = normalizeProject(raw, isAsset, report);
  if (!project) return { ok: false };
  useProject.getState().replace(project);
  setEditor({ sel: [] });
  setTool('select');
  viewFns?.fit();
  const name = project.name || S.untitled;
  notify(source === 'legacy' ? S.msg.imported(name) : S.msg.opened(name), 'success', {
    action: undoAction(),
  });
  if (report.droppedItems) notify(S.msg.droppedItems(report.droppedItems), 'warning');
  return { ok: true, dropped: report.droppedItems };
}

export { isLegacyMapFile };

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
