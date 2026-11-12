/**
 * 編輯操作（按鈕、快捷鍵、畫布共用）：改資料的一律經過 useProject（一次操作＝一步復原）。
 */
import type { ChoiceOptions, ConfirmOptions, ToastOptions } from '@/ui';
import { arrangeRoom } from '../model/arrange';
import { ASSET, isAsset } from '../model/assets';
import {
  isTokenGridSize,
  NIGHT_MAX,
  NIGHT_MIN,
  ROOM_PRESETS,
  type RoomPresetId,
  WEAR_DEFAULT,
  WEAR_MIN,
  WEAR_SEEDS,
  wallThickness,
} from '../model/catalog';
import { arrangeRing, flipRing, partialRingIds, ringMembers } from '../model/circle';
import { compatCounts, hasCompatNotes } from '../model/compat';
import { connectRooms } from '../model/connect';
import { CURVE_MIN, hasRadius, radiusMax } from '../model/curve';
import {
  donorFloorIndex,
  type FloorCopyMode,
  floorCopy,
  floorShell,
  isBlankFloor,
  pasteFloorContent,
} from '../model/floorCopy';
import { resizeWithFollow } from '../model/follow';
import { FURNISH_PRESET, type FurnishPresetId, furnishRoom } from '../model/furnish';
import {
  clamp,
  clueCount,
  emptyProject,
  floorBounds,
  itemCorners,
  itemLocalSize,
  round2,
  swapsAxes,
  uid,
  visibleFloor,
} from '../model/geometry';
import { interiorFloor } from '../model/interior';
import { flipLine } from '../model/lines';
import { momentFloor, momentOf } from '../model/moment';
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
  objList,
  pushObj,
  refKey,
  reorder,
  roomContents,
  rotateItem,
  rotateRoomsCW,
  translateObj,
  withContents,
} from '../model/ops';
import { defaultCut, fitCut, L_MIN, roomHasPointClosed } from '../model/shape';
import { itemGhost } from '../model/snap';
import {
  clampCamera,
  isDefaultCamera,
  STACK_DEFAULT,
  STACK_ROTATE_STEP,
  stackCamera,
  stackLevels,
  wrapAngle,
} from '../model/stack';
import { restingOn, SURFACES } from '../model/tabletop';
import { type MapTransform, transformProject } from '../model/transform';
import {
  type Corner,
  type Floor,
  type FreeLine,
  type Item,
  type Moment,
  OBJ_TYPES,
  type ObjType,
  type Project,
  type Rect,
  type Room,
  type RoomShape,
  type SelRef,
  type StackCamera,
  TYPE_KEY,
} from '../model/types';
import { isDeckCat, type WallRun } from '../model/walls';
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
  type Underlay,
  useEditor,
  usePrefs,
  useProject,
  type ViewMode,
  veiledLocked,
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

/**
 * 新增一個東西。事件後的狀態（2026-11-12，F330）新增的家具、文字、自由線、手畫的牆、門窗只在事件後出現
 * （`only: 'after'`；房間不分狀態）。
 */
export function addObject(type: ObjType, obj: AnyObj): void {
  stampMoment(type, obj);
  update((p) => {
    pushObj(cur(p), type, obj);
  });
}

/** 事件後新增的東西標成只在事件後（已經有出現時機的、房間不動） */
function stampMoment(type: ObjType, obj: AnyObj): void {
  if (type === 'room' || momentOf(useProject.getState().data) !== 'after') return;
  const o = obj as { only?: Moment };
  if (!o.only) o.only = 'after';
}

export function removeObjects(refs: readonly SelRef[]): void {
  const keys = new Set(refs.map(refKey));
  update((p) => {
    const f = cur(p);
    for (const type of ['room', 'item', 'opening', 'wall', 'text'] as const)
      (f[TYPE_KEY[type]] as AnyObj[]) = (f[TYPE_KEY[type]] as AnyObj[]).filter(
        (o) => !keys.has(`${type}:${o.id}`),
      );
    /* 自由線（2026-11-05）：刪到沒有時拿掉這個欄位（存檔和以前一樣） */
    if (f.lines) {
      f.lines = f.lines.filter((l) => !keys.has(`line:${l.id}`));
      if (!f.lines.length) delete f.lines;
    }
  });
  const sel = useEditor.getState().sel.filter((s) => !keys.has(refKey(s)));
  setEditor({ sel });
}

/** 新的房間；lshape＝L 形（預設缺右上角、外框的一半；外框不到 2 × 2 時是長方形，2026-10-29） */
export function newRoom(rect: Rect, preset: RoomPresetId | null, lshape = false): Room {
  const p = preset ? ROOM_PRESETS[preset] : null;
  const cut = lshape ? defaultCut(rect.w, rect.h) : undefined;
  /* 曲線的房間的預設（2026-11-05）：外框至少 2 × 2 才是曲線；L 形房間工具（J）拿著時照樣是 L 形 */
  const shape =
    !cut && p?.shape && rect.w >= CURVE_MIN && rect.h >= CURVE_MIN ? p.shape : undefined;
  return {
    id: uid('r'),
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    name: p ? S.presets[p.id] : S.newRoom,
    cat: p ? p.cat : 'living',
    ...(cut ? { cut } : {}),
    ...(shape ? { shape } : {}),
    /* 新畫的甲板類房間：疊在戶外房間上時外圍是欄杆（F299、D102） */
    ...(isDeckCat(p ? p.cat : 'living') ? { deck: true } : {}),
    /* 榻榻米的鋪法（2026-11-12，F334；日式宅邸的座敷、佛間、離屋） */
    ...(p?.tatami ? { tatami: p.tatami } : {}),
  };
}

export const wallKindThickness = (armed: Armed | null): number =>
  wallThickness(armed?.kind === 'wall' ? armed.type : 'int');

/** 選取中、但已經不存在（或看不到）的東西拿掉 */
export function dropMissingSelection(): void {
  const { sel, playerView } = useEditor.getState();
  if (!sel.length) return;
  if (veiledLocked()) {
    setEditor({ sel: [] });
    return;
  }
  const f = visibleFloor(editableFloor(), playerView, !usePrefs.getState().data.showClues);
  const next = sel.filter((s) => objList(f as Floor, s.type).some((o) => o.id === s.id));
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

/** PL 檢視的祕密樓層是唯讀的（2026-11-09 驗證後修訂）：要改時提醒、回傳 true */
export function blockVeiled(): boolean {
  if (!veiledLocked()) return false;
  /* 連點時只留一則（replace：取代之前同一句提醒；驗證後複查 N2） */
  notify(S.secret.locked, 'warning', { replace: true });
  return true;
}

/* ---------- 工具 ---------- */

export function setTool(tool: ToolId, armed?: Armed | null): void {
  /* 立體樓層圖、樓層總覽（2026-11-09）：拿起工具＝回到平面編輯（選取工具除外） */
  if (tool !== 'select' && viewMode() !== 'plan') setViewMode('plan');
  let a: Armed | null = armed ?? null;
  if (armed === undefined) {
    const prev = useEditor.getState().armed;
    /* 房間與 L 形房間互換時，拿著的房間預設留著（2026-10-29） */
    if ((tool === 'room' || tool === 'lroom') && prev?.kind === 'room') a = prev;
    else if (tool === 'door') a = { kind: 'opening', type: 'door', hinge: 0 };
    else if (tool === 'window') a = { kind: 'opening', type: 'window', hinge: 0 };
    else if (tool === 'wall') a = { kind: 'wall', type: 'int' };
    else if (tool === 'line') a = { kind: 'line', type: 'rail' };
  }
  setEditor({ tool, armed: a });
  updateHint(false);
}

export function armedName(a: Armed | null): string {
  if (!a) return '';
  if (a.kind === 'opening') return S.openings[a.type];
  if (a.kind === 'item') return ASSET[a.t]?.name ?? '';
  if (a.kind === 'room') return S.presets[a.preset];
  if (a.kind === 'line') return S.lines[a.type];
  return S.walls[a.type];
}

export function updateHint(warn: boolean): void {
  const { tool, armed, hint } = useEditor.getState();
  let text: string;
  const mode = viewMode();
  if (mode !== 'plan') text = mode === 'stack' ? S.view3d.hintStack : S.view3d.hintBoard;
  else if ((tool === 'room' || tool === 'lroom') && armed?.kind === 'room') {
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
  else if (tool === 'line' && armed?.kind === 'line') text = S.hints.line(armedName(armed));
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
  /* 事件後（2026-11-12，F330）：新放的東西只在事件後出現，提示列先說一聲 */
  if (
    mode === 'plan' &&
    !warn &&
    tool !== 'select' &&
    tool !== 'hand' &&
    tool !== 'eraser' &&
    tool !== 'room' &&
    tool !== 'lroom' &&
    momentOf(useProject.getState().data) === 'after'
  )
    text = `${S.moment.placeNote}${text}`;
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

/**
 * R：要放的家具轉向、門窗的鉸鍊換邊；不然轉選取的東西。
 * 2026-11-05（F277）：`dir` −1＝反方向（Q）；`fine`＝每次 15°（Shift，只用在家具）。
 */
export function rotateKey(refresh: () => void, dir: 1 | -1 = 1, fine = false): void {
  const { tool, armed } = useEditor.getState();
  if (tool === 'place' && armed?.kind === 'item') {
    const step = (fine ? 15 : 90) * dir;
    setEditor({
      armed: { ...armed, rot: Math.round((((armed.rot + step) % 360) + 360) % 360), manual: true },
    });
    refresh();
  } else if ((tool === 'door' || tool === 'window') && armed?.kind === 'opening') {
    setEditor({ armed: { ...armed, hinge: armed.hinge ? 0 : 1 } });
    refresh();
  } else rotateSelection(dir, fine);
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
  /* PL 檢視的祕密樓層：什麼都選不到（2026-11-09 驗證後修訂） */
  if (veiledLocked()) {
    setEditor({ sel: [] });
    return;
  }
  const f = visibleFloor(editableFloor(), playerView, !usePrefs.getState().data.showClues);
  const sel: SelRef[] = [];
  for (const type of OBJ_TYPES)
    for (const o of objList(f as Floor, type)) sel.push({ type, id: o.id });
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
  regroupRings(f, entries, clones);
  update((p) => {
    for (const c of clones) pushObj(cur(p), c.type, c.obj);
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
  if (blockVeiled()) return;
  const f = currentFloor();
  const first = cb.entries[0];
  /* 同一層、原本的東西還在：每貼一次多錯開一次；別的樓層：貼在同樣的位置 */
  const sameFloor = cb.floorId === f.id && !!getObj(f, first.type, (first.obj as AnyObj).id);
  const shift = sameFloor ? cb.shift + 1 : cb.shift;
  const dx = sameFloor ? cb.offset.dx * shift : 0;
  const dy = sameFloor ? cb.offset.dy * shift : 0;
  const added: SelRef[] = [];
  const moment = momentOf(useProject.getState().data);
  const copies = cb.entries.map((e) => {
    const copy = cloneObj(e.type, e.obj as AnyObj, dx, dy);
    /* 事件前後（2026-11-12）：貼上的東西在這個狀態看不到時，改成這個狀態才有（不然貼了看不到） */
    const o = copy as { only?: Moment };
    if (e.top && o.only && o.only !== moment) o.only = moment;
    if (e.top) added.push({ type: e.type, id: copy.id });
    return { type: e.type, obj: copy };
  });
  regroupRings(
    useProject.getState().data.floors.find((fl) => fl.id === cb.floorId) ?? null,
    cb.entries.map((e) => ({ type: e.type, id: (e.obj as AnyObj).id })),
    copies,
  );
  update((p) => {
    for (const c of copies) pushObj(cur(p), c.type, c.obj);
  });
  setEditor({ sel: added, clipboard: { ...cb, shift } });
  notify(S.msg.pasted(cb.entries.length));
}

/**
 * 複製、貼上的圓形配置（F279）：整圈都複製的是新的一圈（新的群組 id），只複製一部分的離開群組
 * （KIIN：個別複製は元の円形グループから独立）。`floor` 是原本的東西所在的樓層。
 */
function regroupRings(
  floor: Floor | null,
  refs: readonly SelRef[],
  clones: readonly { type: ObjType; obj: AnyObj }[],
): void {
  const ids = new Set(refs.filter((r) => r.type === 'item').map((r) => r.id));
  /* 原本的樓層不在了（貼上時）：一律離開群組 */
  const partial = floor ? new Set(partialRingIds(floor, ids)) : ids;
  const fresh = new Map<string, string>();
  refs.forEach((r, i) => {
    const c = clones[i];
    if (r.type !== 'item' || !c || c.type !== 'item') return;
    const it = c.obj as Item;
    if (!it.ring) return;
    if (partial.has(r.id)) {
      delete it.ring;
      return;
    }
    const g = fresh.get(it.ring) ?? uid('g');
    fresh.set(it.ring, g);
    it.ring = g;
  });
}

/** 單獨移動的家具離開圓形配置（F279；在改資料的 recipe 裡呼叫） */
export function detachMovedRings(f: Floor, movedIds: ReadonlySet<string>): void {
  const ids = new Set(partialRingIds(f, movedIds));
  if (!ids.size) return;
  for (const it of f.items) if (ids.has(it.id)) delete it.ring;
}

/**
 * 旋轉選取的東西。`dir` −1＝反方向（Q，2026-11-05）；`fine`＝15°（Shift，只轉家具，F277）。
 * 房間：90°（反方向＝順時針轉三次）。家具：各自繞中心轉；放在選取的桌子上的小物繞桌子的中心一起轉。
 */
export function rotateSelection(dir: 1 | -1 = 1, fine = false): void {
  const entries = selected();
  if (!entries.length) return;
  if (fine && !entries.some((e) => e.type === 'item')) {
    notify(S.msg.fineRotateItemsOnly, 'warning');
    return;
  }
  if (!fine && entries.some((e) => e.type === 'room')) {
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
      for (let k = 0; k < (dir < 0 ? 3 : 1); k++)
        rotateRoomsCW(
          ff,
          ids.map((id) => getObj(ff, 'room', id) as Room),
          refs,
        );
    });
    return;
  }
  if (entries.some((e) => e.type === 'item')) {
    const deg = (fine ? 15 : 90) * dir;
    const rad = (deg * Math.PI) / 180;
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
        if (it) rotateItem(it as never, deg);
      }
      for (const [id, s] of carried) {
        const it = getObj(cur(p), 'item', id) as Item | null;
        if (!it) continue;
        const sx = s.x + s.w / 2;
        const sy = s.y + s.h / 2;
        const dx = it.x + it.w / 2 - sx;
        const dy = it.y + it.h / 2 - sy;
        rotateItem(it, deg);
        /* 繞桌子的中心轉（90° 時就是 (−dy, dx)） */
        const nx = Math.abs(deg) === 90 ? -dy * dir : dx * Math.cos(rad) - dy * Math.sin(rad);
        const ny = Math.abs(deg) === 90 ? dx * dir : dx * Math.sin(rad) + dy * Math.cos(rad);
        it.x = round2(sx + nx - it.w / 2);
        it.y = round2(sy + ny - it.h / 2);
      }
    });
  } else if (entries.length === 1 && entries[0].type === 'opening') flipHinge();
}

export function flipSelection(): void {
  const entries = selected();
  /* 自由線（2026-11-05，F286）：以兩端的中點左右反轉 */
  if (entries.some((e) => e.type === 'line')) flipLines('x');
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

/** 選取的自由線左右（x）或上下（y）反轉（F286） */
export function flipLines(axis: 'x' | 'y'): void {
  const ids = useEditor
    .getState()
    .sel.filter((s) => s.type === 'line')
    .map((s) => s.id);
  if (!ids.length) return;
  update((p) => {
    for (const id of ids) {
      const l = getObj(cur(p), 'line', id) as FreeLine | null;
      if (l) flipLine(l, axis);
    }
  });
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
    detachMovedRings(cur(p), new Set(refs.filter((r) => r.type === 'item').map((r) => r.id)));
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

/* ---------- 2026-11-05（參考 KIIN マップ制作スタジオ v2.0） ---------- */

/** 整張地圖轉 90°、左右反轉、上下反轉（F276；所有樓層一起，一步復原） */
export function transformMap(mode: MapTransform): void {
  let done = false;
  update((p) => {
    done = transformProject(p, mode);
  });
  if (!done) {
    notify(S.msg.transformEmpty, 'warning');
    return;
  }
  viewFns?.fit();
  notify(S.msg.transformed[mode], 'success', { action: undoAction() });
}

/** 夜的暗度（F273；0＝白天，拿掉這個欄位） */
export function setNight(v: number): void {
  useProject.getState().update((p) => {
    if (!(v > 0)) delete p.night;
    else p.night = Math.round(clamp(v, NIGHT_MIN, NIGHT_MAX) * 100) / 100;
  });
}

/* ---------- 2026-11-12（參考 KIIN マップ制作スタジオ v3.0）：事件前後 ---------- */

/** 目前的樓層在目前顯示的狀態的樣子（自動擺放、內裝、圓形配置只動這個狀態看得到的家具） */
const shownMomentFloor = (): Floor => {
  const p = useProject.getState().data;
  return momentFloor(cur(p), momentOf(p));
};

/**
 * 切換事件前／事件後（F330）：不算一步復原（同切換樓層）；這個狀態看不到的東西取消選取。
 */
export function setMoment(m: Moment): void {
  const p = useProject.getState().data;
  if (momentOf(p) === m) return;
  flushNudge();
  useProject.temporal.getState().pause();
  useProject.getState().update((d) => {
    if (m === 'after') d.moment = 'after';
    else delete d.moment;
  });
  useProject.temporal.getState().resume();
  dropMissingSelection();
  updateHint(false);
}

/** 事件後才停電（F332；一步復原） */
export function setBlackout(on: boolean): void {
  update((p) => {
    if (on) p.blackout = true;
    else delete p.blackout;
  });
}

/** 選取的東西的出現時機（F329；一步復原）：`null`＝兩種狀態都有。房間沒有出現時機（略過） */
export function setSelectionOnly(only: Moment | null): void {
  const sel = useEditor.getState().sel.filter((s) => s.type !== 'room');
  if (!sel.length) return;
  const keys = new Set(sel.map(refKey));
  update((p) => {
    const f = cur(p);
    for (const type of ['item', 'opening', 'wall', 'text', 'line'] as const)
      for (const o of objList(f, type) as { id: string; only?: Moment }[]) {
        if (!keys.has(`${type}:${o.id}`)) continue;
        if (only) o.only = only;
        else delete o.only;
      }
  });
  /* 設成另一個狀態才有的東西：這個狀態看不到了，取消選取並說一聲 */
  const m = momentOf(useProject.getState().data);
  if (only && only !== m) {
    dropMissingSelection();
    notify(S.moment.movedAway(S.moment.names[only]), 'info', { action: undoAction() });
  }
}

/** 房間的內裝預設（F275）：一步復原 */
export function furnishRoomPreset(roomId: string, preset: FurnishPresetId): void {
  /* 事件前後（2026-11-12）：只換這個狀態看得到的家具，另一個狀態才有的不動 */
  const f = shownMomentFloor();
  const room = getObj(f, 'room', roomId) as Room | null;
  const r = furnishRoom(f, roomId, preset);
  const name = room?.name || S.newRoom;
  const label = S.furnish[preset];
  if (!r.ok) {
    notify(
      r.reason === 'full'
        ? S.msg.furnishFail.full(name, label)
        : r.reason === 'kind'
          ? S.msg.furnishFail.kind
          : S.msg.furnishFail.noRoom,
      'warning',
    );
    return;
  }
  const gone = new Set(r.remove);
  for (const it of r.add) stampMoment('item', it);
  update((p) => {
    const ff = cur(p);
    ff.items = ff.items.filter((it) => !gone.has(it.id)).concat(r.add);
  });
  setEditor({ sel: useEditor.getState().sel.filter((s) => s.type !== 'item' || !gone.has(s.id)) });
  notify(S.msg.furnished(name, label, r.count, r.dropped), r.dropped ? 'warning' : 'success', {
    action: undoAction(),
  });
}

export { FURNISH_PRESET };

/** 圓形配置（F279）：以這一件為準排成 count 個一圈；一步復原 */
export function arrangeItemRing(itemId: string, count: number): void {
  const f = shownMomentFloor();
  const r = arrangeRing(f, itemId, count);
  if (!r.ok) {
    notify(S.msg.ringFail[r.reason], 'warning');
    return;
  }
  const gone = new Set(r.remove);
  const byId = new Map(r.items.map((it) => [it.id, it]));
  const fresh = r.items.filter((it) => !f.items.some((o) => o.id === it.id));
  for (const it of fresh) stampMoment('item', it);
  update((p) => {
    const ff = cur(p);
    ff.items = ff.items
      .filter((it) => !gone.has(it.id))
      .map((it) => {
        const n = byId.get(it.id);
        /* 事件前看不到 `upset`（momentFloor 拿掉了），換回來時留著 */
        return n ? (it.upset && !n.upset ? { ...n, upset: true } : n) : it;
      })
      .concat(fresh);
  });
  setEditor({ sel: [{ type: 'item', id: itemId }] });
  notify(S.msg.ringDone(r.items.length), 'success', { action: undoAction() });
}

/** 圓形配置的整圈內外反轉 */
export function flipItemRing(itemId: string): void {
  const rots = flipRing(shownMomentFloor(), itemId);
  if (!rots.size) return;
  update((p) => {
    for (const it of cur(p).items) {
      const r = rots.get(it.id);
      if (r !== undefined) it.rot = r;
    }
  });
  notify(S.msg.ringFlipped, 'success');
}

/** 選取整圈 */
export function selectItemRing(itemId: string): void {
  const f = shownMomentFloor();
  const it = getObj(f, 'item', itemId) as Item | null;
  if (!it) return;
  setEditor({ sel: ringMembers(f, it).map((m) => ({ type: 'item' as const, id: m.id })) });
}

export { ringMembers };

/** 家具的倍率（F278）：和預設大小相比（0.5～3），以中心為準 */
export function setItemScale(itemId: string, scale: number): void {
  editObj<Item>({ type: 'item', id: itemId }, (it) => {
    const a = ASSET[it.t];
    if (!a) return;
    const k = clamp(scale, 0.5, 3);
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    const lw = round2(a.w * k);
    const lh = round2(a.h * k);
    const swap = swapsAxes(it.rot);
    it.w = swap ? lh : lw;
    it.h = swap ? lw : lh;
    it.x = round2(cx - it.w / 2);
    it.y = round2(cy - it.h / 2);
  });
}

/** 家具現在的倍率（寬、深一樣比例時；不一樣時取寬的） */
export function itemScale(it: Item): number {
  const a = ASSET[it.t];
  if (!a) return 1;
  return round2(itemLocalSize(it).w / a.w);
}

/** 家具的角度（F277：0～359°，以中心為準） */
export function setItemAngle(itemId: string, deg: number): void {
  editObj<Item>({ type: 'item', id: itemId }, (it) => {
    const target = Math.round(((deg % 360) + 360) % 360) % 360;
    rotateItem(it, target - (it.rot || 0));
  });
}

/** 下繪圖（F283；只在這一頁） */
export function setUnderlay(patch: Partial<Underlay> | null): void {
  if (!patch) {
    setEditor({ underlay: null });
    return;
  }
  const cur0 = useEditor.getState().underlay;
  if (!cur0 && !patch.src) return;
  setEditor({ underlay: { ...(cur0 as Underlay), ...patch } });
}

/** 讀一張本機的圖片當下繪圖：預設放在地圖的中間、寬＝地圖的寬（沒有東西時 24 格） */
export function loadUnderlay(file: File): void {
  const ok = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type);
  if (!ok || file.size > 20_000_000) {
    notify(S.msg.underlayFailed, 'warning');
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    const prev = useEditor.getState().underlay;
    if (prev?.src.startsWith('blob:')) URL.revokeObjectURL(prev.src);
    const p = useProject.getState().data;
    const box = floorBounds(cur(p)) ?? { x: 0, y: 0, w: 24, h: 16 };
    setEditor({
      underlay: {
        src: url,
        aspect: (img.naturalHeight || 1) / (img.naturalWidth || 1),
        x: round2(box.x + box.w / 2),
        y: round2(box.y + box.h / 2),
        w: Math.max(4, Math.round(box.w)),
        opacity: 0.4,
        visible: true,
        name: file.name,
      },
    });
    notify(S.msg.underlayLoaded, 'success');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    notify(S.msg.underlayFailed, 'warning');
  };
  img.src = url;
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
  /* 事件前後（2026-11-12）：範本從事件前開始；事件後才停電照範本（沒設的拿掉） */
  const { moment: _m, blackout: _b, ...rest } = p;
  useProject.getState().replace({
    ...rest,
    floors,
    active: groundFloorIndex(floors),
    name: tpl.name,
    theme,
    ...(tpl.blackout ? { blackout: true } : {}),
  });
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
  if (blockVeiled()) return;
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

/** 自動擺放家具（F253）；一步復原 */
export function arrangeRoomFurniture(id: string): void {
  /* 事件前後（2026-11-12）：只排這個狀態看得到的家具 */
  const f = shownMomentFloor();
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

/** 改房間大小的一次手勢：開始時的那一層與房間（拖曳控制點、屬性面板的寬深欄位） */
export interface RoomResizeStart {
  before: Floor;
  orig: Room;
}

/**
 * 屬性面板的寬深欄位開始改（第一個按鍵）：之後到 `endRoomResize` 的變更記成一步復原，每一步都從這時的位置算
 * （打「14」先經過 1 也不會把家具擠在一起；2026-10-29 驗證後修訂）。
 */
export function beginRoomResize(id: string): RoomResizeStart | null {
  flushNudge();
  const before = currentFloor();
  const orig = getObj(before, 'room', id) as Room | null;
  if (!orig) return null;
  useProject.beginGesture();
  return { before, orig };
}

/** 欄位確定（Enter、離開欄位、方向鍵）：這一次的改變記成一步 */
export function endRoomResize(): void {
  queueMicrotask(() => useProject.endGesture());
}

/**
 * 改房間的位置與大小（屬性面板的寬深；F254：家具跟著房間）。`start`＝手勢開始時的狀態（沒有＝現在），
 * 家具、門窗、文字從那時的位置重算。回傳放不下的組數。
 */
export function resizeRoom(id: string, next: Rect, start?: RoomResizeStart): number {
  const p0 = useProject.getState().data;
  const before = start?.before ?? cur(p0);
  const orig = start?.orig ?? (getObj(before, 'room', id) as Room | null);
  if (!orig) return 0;
  let misfit = 0;
  update((p) => {
    const f = cur(p);
    const r = getObj(f, 'room', id) as Room | null;
    if (!r) return;
    const cut = fitCut(orig.cut, next.w, next.h);
    const geo = {
      x: next.x,
      y: next.y,
      w: next.w,
      h: next.h,
      ...(cut ? { cut } : {}),
      ...(orig.shape ? { shape: orig.shape, radius: orig.radius } : {}),
    };
    misfit = resizeWithFollow(f, before, orig, geo, !p0.fixedFurniture);
    Object.assign(r, { x: next.x, y: next.y, w: next.w, h: next.h });
    if (cut) r.cut = cut;
    else delete r.cut;
  });
  return misfit;
}

/**
 * 房間的形狀：長方形／L 形（F259）／曲線的形狀（2026-11-05，F289）。換成曲線的形狀時，這間房裡的家具有超出新外形的就
 * 不改（KIIN v2.0 的「家具がはみ出す変形は取り消されます」），回傳超出的件數；改成功回傳 0。
 */
export function setRoomShape(id: string, shape: 'rect' | 'l' | RoomShape): number {
  const f = currentFloor();
  const room = getObj(f, 'room', id) as Room | null;
  if (!room) return 0;
  if (shape !== 'rect' && shape !== 'l') {
    if (room.w < CURVE_MIN || room.h < CURVE_MIN) return 0;
    const next: Room = {
      ...room,
      cut: undefined,
      shape,
      radius: hasRadius(shape) ? room.radius : undefined,
    };
    const misfit = shapeMisfits(f, room, next);
    if (misfit) {
      notify(S.msg.shapeMisfit(misfit), 'warning');
      return misfit;
    }
  }
  editObj<Room>({ type: 'room', id }, (r) => {
    if (shape === 'rect') {
      delete r.cut;
      delete r.shape;
      delete r.radius;
    } else if (shape === 'l') {
      delete r.shape;
      delete r.radius;
      if (!r.cut) {
        const cut = defaultCut(r.w, r.h);
        if (cut) r.cut = cut;
      }
    } else {
      delete r.cut;
      r.shape = shape;
      if (!hasRadius(shape)) delete r.radius;
    }
  });
  return 0;
}

/** 圓角的半徑、八角形的倒角寬（格，0.5 一格；0＝預設）。家具會超出時不改 */
export function setRoomRadius(id: string, v: number): void {
  const f = currentFloor();
  const room = getObj(f, 'room', id) as Room | null;
  if (!room?.shape || !hasRadius(room.shape)) return;
  const radius = Math.min(radiusMax(room.w, room.h), Math.max(0, Math.round(v * 2) / 2));
  const next: Room = { ...room, radius: radius || undefined };
  const misfit = shapeMisfits(f, room, next);
  if (misfit) {
    notify(S.msg.shapeMisfit(misfit), 'warning');
    return;
  }
  editObj<Room>({ type: 'room', id }, (r) => {
    if (radius) r.radius = radius;
    else delete r.radius;
  });
}

/** 換了外形之後，這間房裡（改之前的外形）的家具有幾件超出新的外形（轉過的四個角都要在裡面） */
function shapeMisfits(f: Floor, room: Room, next: Room): number {
  const ids = new Set(
    roomContents(f, room)
      .filter((r) => r.type === 'item')
      .map((r) => r.id),
  );
  let n = 0;
  for (const it of f.items)
    if (ids.has(it.id) && !itemCorners(it).every((q) => roomHasPointClosed(next, q.x, q.y))) n++;
  return n;
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

/** 重新產生污漬與摺痕的位置 */
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
  if (blockVeiled()) return;
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

/* ---------- 2026-11-09（參考 KIIN「立体フロアガイド制作スタジオ」）：檢視方式、立體視角、祕密樓層、快速建立 ---------- */

/** 目前的檢視方式（F303） */
export const viewMode = (): ViewMode => usePrefs.getState().data.view ?? 'plan';

/**
 * 換檢視方式（F303）：記在瀏覽器（不算復原）。離開平面編輯時清掉選取、放下工具（立體圖不能編輯）；
 * 畫布的視角由 controller 跟著換（立體圖、總覽各自顯示全部，回到平面編輯時回到原本的視角）。
 */
export function setViewMode(mode: ViewMode): void {
  if (viewMode() === mode) return;
  flushNudge();
  if (mode !== 'plan') setEditor({ sel: [], tool: 'select', armed: null });
  usePrefs.getState().update((d) => {
    d.view = mode;
  });
  updateHint(false);
}

/** 改立體視角（F304）：存在地圖裡，但不算一步復原（同切換樓層）；和預設相同時拿掉欄位 */
export function setStackCamera(patch: Partial<StackCamera>): void {
  const p = useProject.getState().data;
  const next = clampCamera({ ...stackCamera(p), ...patch });
  const prev = p.stack ?? STACK_DEFAULT;
  if (
    next.angle === prev.angle &&
    next.pitch === prev.pitch &&
    next.gap === prev.gap &&
    next.rise === prev.rise
  )
    return;
  useProject.temporal.getState().pause();
  useProject.getState().update((d) => {
    if (isDefaultCamera(next)) delete d.stack;
    else d.stack = next;
  });
  useProject.temporal.getState().resume();
}

/** 左轉／右轉 45°（−180～180 繞回來） */
export function rotateStack(dir: 1 | -1): void {
  const cam = stackCamera(useProject.getState().data);
  setStackCamera({ angle: wrapAngle(cam.angle + dir * STACK_ROTATE_STEP) });
  viewFns?.fit();
}

export function resetStackCamera(): void {
  setStackCamera({ ...STACK_DEFAULT });
  viewFns?.fit();
}

/** 從立體圖、總覽點樓層：切到那一層的平面編輯（F303） */
export function jumpToFloor(index: number): void {
  const p = useProject.getState().data;
  if (!p.floors[index]) return;
  switchFloor(index);
  setViewMode('plan');
  notify(S.view3d.switched(p.floors[index].name || '—'));
}

/** 祕密樓層（F307）：這一層的開關，一步復原 */
export function setFloorSecret(on: boolean, index?: number): void {
  const p = useProject.getState().data;
  const i = index ?? p.active;
  const f = p.floors[i];
  if (!f || !!f.secret === on) return;
  update((d) => {
    if (on) d.floors[i].secret = true;
    else delete d.floors[i].secret;
  });
  dropMissingSelection();
  notify(on ? S.secret.on(f.name || '—') : S.secret.off(f.name || '—'));
}

/** 快速建立（F308）：目前的樓層從哪一層抄（沒有時 −1） */
export function quickDonor(): number {
  const p = useProject.getState().data;
  return donorFloorIndex(p.floors, p.active);
}

/** 快速建立：把別一層的外框與樓梯（或整層）抄進目前的樓層（原本的東西留著）；一步復原 */
export function quickFill(mode: FloorCopyMode, donor = quickDonor(), target?: number): boolean {
  const p = useProject.getState().data;
  const to = target ?? p.active;
  const src = p.floors[donor];
  if (!src || !p.floors[to] || donor === to) return false;
  if (!src.rooms.length) {
    notify(S.quick.noRooms, 'warning');
    return false;
  }
  update((d) => {
    pasteFloorContent(d.floors[to], floorCopy(d.floors[donor], mode));
  });
  setEditor({ sel: [] });
  const done = mode === 'shell' ? S.quick.doneShell : S.quick.doneFull;
  notify(done(src.name || '—', p.floors[to].name || '—'), 'success', { action: undoAction() });
  return true;
}

/** 快速建立的「從空白開始畫」：這一層不再顯示快速建立，打開「下一層」的淡影 */
export function quickSkip(): void {
  const f = currentFloor();
  setEditor({ quickSkip: [...useEditor.getState().quickSkip, f.id] });
  if (!usePrefs.getState().data.ghost)
    usePrefs.getState().update((d) => {
      d.ghost = true;
    });
}

/**
 * 把外框複製到上一層（F309）：上一層（右邊）是空的就抄進去；有東西時先問（取代，可以復原）；沒有上一層時在右邊新增一層。
 * 抄完切到那一層（平面編輯）。
 */
export async function copyShellUp(): Promise<void> {
  const p = useProject.getState().data;
  const from = p.active;
  const src = p.floors[from];
  if (!src?.rooms.length) {
    notify(S.quick.noRooms, 'warning');
    return;
  }
  const above = p.floors[from + 1];
  if (above && !isBlankFloor(above)) {
    const ok = confirmFn
      ? await confirmFn({
          title: S.quick.copyUpTitle(above.name || '—'),
          description: S.quick.copyUpText(above.name || '—'),
          confirmLabel: S.quick.copyUpConfirm,
          danger: true,
        })
      : true;
    if (!ok) return;
  }
  let name = '';
  update((d) => {
    let target = d.floors[from + 1];
    const replace = !!target && !isBlankFloor(target);
    if (!target) {
      pinInside(d);
      target = {
        id: uid('f'),
        name: nextFloorName(d.floors),
        rooms: [],
        walls: [],
        openings: [],
        items: [],
        texts: [],
      };
      d.floors.splice(from + 1, 0, target);
    }
    pasteFloorContent(target, floorShell(d.floors[from]), replace);
    name = target.name;
    d.active = from + 1;
  });
  setEditor({ sel: [] });
  setViewMode('plan');
  notify(S.quick.doneShell(src.name || '—', name || '—'), 'success', { action: undoAction() });
}

/**
 * 立體圖上的「＋」（F308）：立體圖的第 level 層是空的就沿用最近的有房間的樓層的外框與樓梯；
 * 比最上面還高（只有一層時的「增建」）就在最上面那一層的右邊新增一層。檢視方式不變。
 */
export function stackGhostFill(level: number): void {
  const p = useProject.getState().data;
  const levels = stackLevels(p.floors);
  if (level < levels.length) {
    const target = levels[level].index;
    const donor = donorFloorIndex(p.floors, target);
    if (donor < 0) return;
    quickFill('shell', donor, target);
    return;
  }
  const top = levels[levels.length - 1];
  if (!top?.floor.rooms.length) return;
  let name = '';
  update((d) => {
    pinInside(d);
    const target: Floor = {
      id: uid('f'),
      name: nextFloorName(d.floors),
      rooms: [],
      walls: [],
      openings: [],
      items: [],
      texts: [],
    };
    pasteFloorContent(target, floorShell(d.floors[top.index]));
    d.floors.splice(top.index + 1, 0, target);
    d.active = top.index + 1;
    name = target.name;
  });
  setEditor({ sel: [] });
  notify(S.quick.doneShell(top.floor.name || '—', name || '—'), 'success', {
    action: undoAction(),
  });
}

export { fileBase } from '../model/exportPlan';
export { floorBounds };
