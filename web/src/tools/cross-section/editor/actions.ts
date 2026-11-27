/**
 * 編輯操作（按鈕、快捷鍵、畫布共用）：改資料的一律經過 useDoc（一次操作＝一步復原）。
 */
import type { Draft } from 'immer';
import type { ConfirmOptions, ToastOptions } from '@/ui';
import { fixtureDef } from '../model/catalog';
import { blankDoc } from '../model/factory';
import { layoutOf, roomAt } from '../model/layout';
import {
  addFloor,
  addShaft,
  applyUse,
  clamp,
  clampCab,
  makeFixture,
  makeNote,
  mergeFloor,
  placeNote,
  removeFloor,
  removeShaft,
  setShaftKind,
  settle,
  splitFloor,
  uid,
} from '../model/ops';
import { type SampleId, sampleDoc } from '../model/samples';
import {
  type EnvId,
  type Fixture,
  floorCode,
  LIMITS,
  type Note,
  RANGES,
  type Room,
  type RoomUse,
  type SectionDoc,
  type SelRef,
  type Shaft,
  type ShaftKind,
} from '../model/types';
import { S } from '../strings';
import { editor } from './controller';
import { docNow, setEditor, type ToolId, useDoc, useEditor, usePrefs } from './store';

/* ---------- 通知與確認（Editor 設定） ---------- */

type Notify = (o: ToastOptions) => void;
type Confirm = (o: ConfirmOptions) => Promise<boolean>;
let toastFn: Notify | null = null;
let confirmFn: Confirm | null = null;

export function bindUi(t: Notify | null, c: Confirm | null): void {
  toastFn = t;
  confirmFn = c;
}

export function notify(
  title: string,
  tone: ToastOptions['tone'] = 'info',
  extra: Partial<ToastOptions> = {},
): void {
  toastFn?.({ title, tone, duration: 3000, ...extra });
}

export const confirmUi = (o: ConfirmOptions): Promise<boolean> =>
  confirmFn ? confirmFn(o) : Promise.resolve(true);

const edit = (fn: (d: Draft<SectionDoc>) => void): void => useDoc.getState().update(fn);

/* ---------- 工具、檢視 ---------- */

const locked = (): boolean => {
  if (useEditor.getState().audience !== 'player') return false;
  notify(S.msg.playerLocked, 'warning');
  return true;
};

export function setTool(tool: ToolId): void {
  if (tool !== 'select' && tool !== 'hand' && locked()) return;
  setEditor({ tool });
}

export function armFixture(kind: string): void {
  if (locked()) return;
  setEditor({ tool: 'place', kind });
}

export function setAudience(a: 'gm' | 'player'): void {
  setEditor({
    audience: a,
    sel: a === 'player' ? null : useEditor.getState().sel,
    tool: a === 'player' ? 'select' : useEditor.getState().tool,
  });
}

export const toggleAudience = (): void =>
  setAudience(useEditor.getState().audience === 'gm' ? 'player' : 'gm');

export function setEnv(env: EnvId): void {
  if (docNow().env === env) return;
  edit((d) => {
    d.env = env;
  });
}

export function toggleFlood(): void {
  edit((d) => {
    d.flood = !d.flood;
    if (d.flood && !d.floodLevel) d.floodLevel = RANGES.flood.def;
  });
}

export const select = (sel: SelRef | null): void => setEditor({ sel });

/* ---------- 取得 ---------- */

export function findRoom(doc: SectionDoc, id: string): { room: Room; floorId: string } | null {
  for (const f of doc.building.floors) {
    const room = f.rooms.find((r) => r.id === id);
    if (room) return { room, floorId: f.id };
  }
  return null;
}

/* ---------- 樓層、區域 ---------- */

/** 建築寬：區域與通道的位置照比例換算，再排成整數格 */
export function setWidth(width: number): void {
  const from = docNow().building.width;
  if (width === from || locked()) return;
  edit((d) => {
    d.building.width = width;
    const k = width / from;
    for (const f of d.building.floors)
      for (const r of f.rooms) {
        r.x0 = Math.round(r.x0 * k);
        r.x1 = Math.round(r.x1 * k);
      }
    for (const s of d.building.shafts) s.x = Math.round(s.x * k);
    settle(d);
  });
  editor.fitView();
}

export function addFloorAt(where: 'above' | 'below'): void {
  if (locked()) return;
  if (docNow().building.floors.length >= 12) {
    notify(S.msg.floorMax, 'warning');
    return;
  }
  let code = '';
  edit((d) => {
    const f = addFloor(d, where);
    if (f) code = floorCode(f.level);
  });
  if (code) notify(S.msg.floorAdded(code), 'success', { duration: 1800 });
  editor.fitView();
}

export async function deleteFloor(id: string): Promise<void> {
  if (locked()) return;
  const doc = docNow();
  if (doc.building.floors.length <= 1) {
    notify(S.msg.lastFloor, 'warning');
    return;
  }
  edit((d) => {
    removeFloor(d, id);
  });
  setEditor({ sel: null });
  editor.fitView();
}

export function splitFloorRooms(floorId: string): void {
  if (locked()) return;
  const res: { r: ReturnType<typeof splitFloor> } = { r: 'narrow' };
  edit((d) => {
    res.r = splitFloor(d, floorId);
  });
  const r = res.r;
  if (r === 'max') notify(S.msg.roomMax, 'warning');
  else if (r === 'narrow') notify(S.msg.roomNarrow, 'warning');
}

export function mergeFloorRooms(floorId: string): void {
  if (locked()) return;
  const box = { res: { ok: false, leaked: false } };
  edit((d) => {
    box.res = mergeFloor(d, floorId);
  });
  const res = box.res;
  if (!res.ok) notify(S.msg.roomOne, 'warning');
  else if (res.leaked) notify(S.msg.leaked, 'warning', { duration: 5000 });
  const sel = useEditor.getState().sel;
  if (sel?.kind === 'room' && !findRoom(docNow(), sel.id)) setEditor({ sel: null });
}

export function patchRoom(id: string, patch: Partial<Room>): void {
  edit((d) => {
    const hit = d.building.floors.flatMap((f) => f.rooms).find((r) => r.id === id);
    if (hit) Object.assign(hit, patch);
  });
}

export function setRoomSecret(id: string, secret: boolean): void {
  edit((d) => {
    const hit = d.building.floors.flatMap((f) => f.rooms).find((r) => r.id === id);
    if (!hit) return;
    hit.secret = secret;
    /* 祕密區域一開始一定蓋著（第二批的 CCFOLIA 房間 ZIP 用） */
    if (secret) delete hit.open;
  });
}

export function patchFloorName(floorId: string, name: string): void {
  edit((d) => {
    const f = d.building.floors.find((v) => v.id === floorId);
    if (f) f.name = name.slice(0, LIMITS.name);
  });
}

export function applyRoomUse(id: string, use: RoomUse): void {
  edit((d) => {
    const hit = d.building.floors.flatMap((f) => f.rooms).find((r) => r.id === id);
    if (hit) applyUse(d, hit, use);
  });
}

export function clearRoomItems(id: string): void {
  edit((d) => {
    d.items = d.items.filter((it) => it.room !== id);
  });
}

/* ---------- 通道 ---------- */

export function addShaftOf(kind: ShaftKind): void {
  if (locked()) return;
  let id: string | null = null;
  edit((d) => {
    id = addShaft(d, kind)?.id ?? null;
  });
  if (!id) notify(S.msg.noShaftSpace, 'warning');
  else setEditor({ sel: { kind: 'shaft', id } });
}

export function deleteShaft(id: string): void {
  edit((d) => {
    removeShaft(d, id);
  });
  if (useEditor.getState().sel?.id === id) setEditor({ sel: null });
}

export function updateShaft(id: string, fn: (s: Draft<Shaft>, d: Draft<SectionDoc>) => void): void {
  edit((d) => {
    const s = d.building.shafts.find((v) => v.id === id);
    if (!s) return;
    fn(s, d);
    clampCab(d, s);
    settle(d);
  });
}

export const changeShaftKind = (id: string, kind: ShaftKind): void =>
  updateShaft(id, (s, d) => setShaftKind(d, s, kind));

/* ---------- 設備 ---------- */

export function placeFixtureAt(x: number, y: number): boolean {
  const doc = docNow();
  const st = useEditor.getState();
  const hit = roomAt(layoutOf(doc), x, y);
  if (!hit) {
    notify(S.msg.placeRoom, 'warning', { duration: 1800 });
    return false;
  }
  if (doc.items.length >= LIMITS.items) {
    notify(S.msg.dupLimit, 'warning');
    return false;
  }
  const def = fixtureDef(st.kind);
  if (!def) return false;
  const usable = Math.max(0.8, hit.w - 0.64);
  const rx = clamp((x - (hit.x + 0.32)) / usable, 0.08, 0.92);
  const ry = clamp((y - (hit.y + 0.54)) / Math.max(0.8, hit.h - 0.88), 0.2, 0.8);
  const phase = usePrefs.getState().data.phase;
  const it = makeFixture(hit.room.id, st.kind, {
    rx,
    ry,
    only: phase === 'auto' ? undefined : phase,
  });
  edit((d) => {
    d.items.push(it);
  });
  setEditor({
    sel: { kind: 'item', id: it.id },
    tool: usePrefs.getState().data.repeat ? 'place' : 'select',
  });
  return true;
}

export function patchItem(id: string, patch: Partial<Fixture>): void {
  edit((d) => {
    const it = d.items.find((v) => v.id === id);
    if (!it) return;
    Object.assign(it, patch);
    for (const k of ['only', 'variant', 'upset', 'smashed', 'secret'] as const)
      if (k in patch && !patch[k]) delete it[k];
  });
}

export function duplicateItem(id: string): void {
  const doc = docNow();
  const it = doc.items.find((v) => v.id === id);
  if (!it) return;
  if (doc.items.length >= LIMITS.items) {
    notify(S.msg.dupLimit, 'warning');
    return;
  }
  const copy: Fixture = {
    ...it,
    id: uid('it'),
    rx: clamp(it.rx + 0.12, RANGES.rx.min, RANGES.rx.max),
  };
  edit((d) => {
    d.items.push(copy);
  });
  setEditor({ sel: { kind: 'item', id: copy.id } });
}

/* ---------- 備註 ---------- */

export function placeNoteAt(x: number, y: number): void {
  const doc = docNow();
  if (doc.notes.length >= LIMITS.notes) {
    notify(S.msg.noteLimit, 'warning');
    return;
  }
  const n = makeNote(S.inspector.noteDefault);
  const phase = usePrefs.getState().data.phase;
  if (phase === 'before' || phase === 'after') n.only = phase;
  edit((d) => {
    placeNote(d, n, x, y);
    d.notes.push(n);
  });
  setEditor({ sel: { kind: 'note', id: n.id }, tool: 'select' });
  /* 屬性欄的文字欄出現後選起來，直接打字就換掉 */
  requestAnimationFrame(() => {
    const el = document.querySelector<HTMLInputElement>('[data-testid="note-text"]');
    el?.focus();
    el?.select();
  });
}

export function patchNote(id: string, patch: Partial<Note>): void {
  edit((d) => {
    const n = d.notes.find((v) => v.id === id);
    if (!n) return;
    Object.assign(n, patch);
    for (const k of ['only', 'secret'] as const) if (k in patch && !patch[k]) delete n[k];
  });
}

/* ---------- 選取的東西 ---------- */

export function deleteSelected(): void {
  const sel = useEditor.getState().sel;
  if (!sel) return;
  if (sel.kind === 'item')
    edit((d) => {
      d.items = d.items.filter((v) => v.id !== sel.id);
    });
  else if (sel.kind === 'note')
    edit((d) => {
      d.notes = d.notes.filter((v) => v.id !== sel.id);
    });
  else if (sel.kind === 'shaft') deleteShaft(sel.id);
  else return;
  setEditor({ sel: null });
}

/** 方向鍵：設備左右（牆上的也上下）、備註、通道 */
export function nudgeSelected(dx: number, dy: number, big: boolean): void {
  const sel = useEditor.getState().sel;
  if (!sel) return;
  if (sel.kind === 'item')
    edit((d) => {
      const it = d.items.find((v) => v.id === sel.id);
      if (!it) return;
      const step = big ? 0.05 : 0.01;
      it.rx = Math.round(clamp(it.rx + dx * step, RANGES.rx.min, RANGES.rx.max) * 1000) / 1000;
      if (dy && fixtureDef(it.kind)?.hang === 'wall')
        it.ry = Math.round(clamp(it.ry + dy * step, RANGES.ry.min, RANGES.ry.max) * 1000) / 1000;
    });
  else if (sel.kind === 'note') {
    const L = layoutOf(docNow());
    const n = docNow().notes.find((v) => v.id === sel.id);
    if (!n) return;
    const owner = n.room ? L.rooms.find((r) => r.room.id === n.room) : null;
    const x = (owner ? owner.x + n.rx * owner.w : n.x) + dx * (big ? 1 : 0.25);
    const y = (owner ? owner.y + n.ry * owner.h : n.y) + dy * (big ? 1 : 0.25);
    edit((d) => {
      const m = d.notes.find((v) => v.id === sel.id);
      if (m) placeNote(d, m, x, y);
    });
  } else if (sel.kind === 'shaft' && dx)
    updateShaft(sel.id, (s, d) => {
      s.x = clamp(s.x + dx, 0, Math.max(0, d.building.width - 1));
    });
}

/* ---------- 換整份 ---------- */

function load(doc: SectionDoc): void {
  useDoc.endGesture();
  useDoc.getState().update(() => doc);
  setEditor({ sel: null, tool: 'select', startOpen: false });
  editor.fitView();
}

export const newBlank = (): void => load(blankDoc());
export const applySample = (id: SampleId): void => load(sampleDoc(id));
export const loadDoc = load;

export function undo(): void {
  useDoc.endGesture();
  useDoc.temporal.getState().undo();
  setEditor({ sel: null });
}

export function redo(): void {
  useDoc.endGesture();
  useDoc.temporal.getState().redo();
  setEditor({ sel: null });
}

export function reseed(): void {
  edit((d) => {
    d.seed = Math.floor(Math.random() * 9_999_999);
  });
}
