/**
 * 編輯操作（按鈕、快捷鍵、畫布共用）：改資料的一律經過 useDoc（一次操作＝一步復原）。
 */
import type { Draft } from 'immer';
import type { ConfirmOptions, ToastOptions } from '@/ui';
import type { Audience } from '../draw/render';
import { climateAt } from '../model/climate';
import {
  blankDoc,
  newNote,
  newObject,
  newPath,
  newRegion,
  REGION_COLORS,
  uid,
} from '../model/factory';
import { generateWorld, pickNewSeed } from '../model/generate';
import {
  centroid,
  clamp,
  clampShift,
  duplicateShift,
  innerWallPoints,
  polygonArea,
} from '../model/geometry';
import { nameKindFor, suggestName } from '../model/names';
import { type SampleId, sampleDoc } from '../model/samples';
import { decodeCells, gridOf } from '../model/terrain';
import {
  CELL,
  LIMITS,
  MAP_SIZES,
  type MapObject,
  type MapPath,
  type MapSizeId,
  type Note,
  type PathKind,
  type Pt,
  RANGES,
  type Region,
  type SelKind,
  type SelRef,
  type TravelMode,
  type WorldDoc,
} from '../model/types';
import { S } from '../strings';
import { editor } from './controller';
import { docNow, LINE_TOOLS, setEditor, type ToolId, useDoc, useEditor } from './store';

/* ---------- 通知與確認（App 設定） ---------- */

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

/* ---------- 工具 ---------- */

export function setTool(tool: ToolId): void {
  const st = useEditor.getState();
  if (st.audience === 'player' && tool !== 'select' && tool !== 'hand') {
    notify(S.msg.playerLocked, 'warning');
    return;
  }
  if (tool !== st.tool) editor.cancelDraft();
  setEditor({
    tool,
    ...(LINE_TOOLS.includes(tool) || tool === 'brush' || tool === 'erase' || tool === 'relief'
      ? { sel: null }
      : {}),
  });
}

export function armAsset(kind: string): void {
  if (useEditor.getState().audience === 'player') {
    notify(S.msg.playerLocked, 'warning');
    return;
  }
  editor.cancelDraft();
  setEditor({ tool: 'asset', asset: kind });
}

export function setAudience(a: Audience): void {
  editor.cancelDraft();
  setEditor({ audience: a, sel: null });
}

/* ---------- 取得、修改一個項目 ---------- */

const COLL: Record<SelKind, 'regions' | 'objects' | 'paths' | 'notes'> = {
  region: 'regions',
  object: 'objects',
  path: 'paths',
  note: 'notes',
};

type AnyItem = Region | MapObject | MapPath | Note;

export function getItem(doc: WorldDoc, ref: SelRef): AnyItem | undefined {
  return (doc[COLL[ref.kind]] as AnyItem[]).find((o) => o.id === ref.id);
}

export function selectedItem(): AnyItem | undefined {
  const sel = useEditor.getState().sel;
  return sel ? getItem(docNow(), sel) : undefined;
}

function updateItem(ref: SelRef, fn: (o: Draft<AnyItem>) => void): void {
  useDoc.getState().update((d) => {
    const o = (d[COLL[ref.kind]] as Draft<AnyItem>[]).find((v) => v.id === ref.id);
    if (o) fn(o);
  });
}

export function patchItem(ref: SelRef, patch: Record<string, unknown>): void {
  updateItem(ref, (o) => Object.assign(o, patch));
}

/** 換移動方式：每日距離回到那種方式的預設 */
export function setTravelMode(ref: SelRef, mode: TravelMode): void {
  updateItem(ref, (o) => {
    if ('simpleCalc' in o) {
      o.travelMode = mode;
      delete o.dailyKm;
    }
  });
}

export function mutatePoints(ref: SelRef, fn: (pts: Pt[]) => void): void {
  updateItem(ref, (o) => {
    if ('points' in o) fn(o.points as Pt[]);
  });
}

/** 拖曳移動：從拖曳開始時的位置算（整個留在地圖裡） */
export function moveItem(ref: SelRef, orig: unknown, dx: number, dy: number): void {
  const d = docNow();
  const W = d.cols * CELL;
  const H = d.rows * CELL;
  const o = orig as AnyItem;
  if ('points' in o) {
    const s = clampShift(o.points, dx, dy, W, H);
    updateItem(ref, (v) => {
      if ('points' in v) v.points = o.points.map((p) => ({ x: p.x + s.x, y: p.y + s.y }));
    });
  } else {
    const s = clampShift([o], dx, dy, W, H);
    updateItem(ref, (v) => {
      if ('x' in v) {
        v.x = o.x + s.x;
        v.y = o.y + s.y;
      }
    });
  }
}

/* ---------- 放東西 ---------- */

export function placeAsset(kind: string, p: Pt): void {
  const d = docNow();
  if (d.objects.length >= LIMITS.objects) {
    notify(S.msg.objectLimit, 'warning');
    return;
  }
  const o = newObject(kind, p.x, p.y);
  useDoc.getState().update((dd) => {
    dd.objects.push(o);
  });
  setEditor({ sel: { kind: 'object', id: o.id } });
}

/** 放下地名・備註之後回到選取，並把焦點移到屬性的文字欄（全選） */
export function placeNote(p: Pt): void {
  const d = docNow();
  if (d.notes.length >= LIMITS.notes) {
    notify(S.msg.noteLimit, 'warning');
    return;
  }
  const n = newNote(S.msg.newNote, p.x, p.y);
  useDoc.getState().update((dd) => {
    dd.notes.push(n);
  });
  setEditor({ sel: { kind: 'note', id: n.id }, tool: 'select' });
  requestAnimationFrame(() => {
    const input = document.querySelector<HTMLInputElement>('[data-testid="prop-text"]');
    input?.focus();
    input?.select();
  });
}

/** 完成畫到一半的線（回傳 true＝完成了） */
export function finishLine(tool: ToolId, pts: readonly Pt[]): boolean {
  const d = docNow();
  const region = tool === 'region';
  const min = region ? 3 : 2;
  if (pts.length < min) {
    notify(S.msg.minPoints(min), 'warning');
    return false;
  }
  if (region) {
    if (polygonArea(pts) < 36) {
      notify(S.msg.tooSmall, 'warning');
      return false;
    }
    if (d.regions.length >= LIMITS.regions) {
      notify(S.msg.regionLimit, 'warning');
      return false;
    }
    const r = newRegion(S.msg.newRegion, REGION_COLORS[d.regions.length % REGION_COLORS.length], [
      ...pts,
    ]);
    useDoc.getState().update((dd) => {
      dd.regions.push(r);
    });
    setEditor({ sel: { kind: 'region', id: r.id }, tool: 'select' });
  } else {
    if (d.paths.length >= LIMITS.paths) {
      notify(S.msg.pathLimit, 'warning');
      return false;
    }
    const p = newPath(tool as PathKind, [...pts]);
    useDoc.getState().update((dd) => {
      dd.paths.push(p);
    });
    setEditor({ sel: { kind: 'path', id: p.id }, tool: 'select' });
  }
  requestAnimationFrame(() => editor.canvas?.focus({ preventScroll: true }));
  return true;
}

/* ---------- 頂點 ---------- */

export function deleteVertex(ref: SelRef, index: number): void {
  if (useEditor.getState().audience === 'player') return;
  const o = getItem(docNow(), ref);
  if (!o || !('points' in o) || index < 0 || index >= o.points.length) return;
  const min = ref.kind === 'region' ? 3 : 2;
  if (o.points.length <= min) {
    notify(S.msg.minVertex(min), 'warning');
    return;
  }
  if (ref.kind === 'region' && polygonArea(o.points.filter((_, i) => i !== index)) < 36) {
    notify(S.msg.collapse, 'warning');
    return;
  }
  mutatePoints(ref, (pts) => pts.splice(index, 1));
}

/* ---------- 選取的東西 ---------- */

const LIMIT_OF: Record<SelKind, number> = {
  region: LIMITS.regions,
  path: LIMITS.paths,
  object: LIMITS.objects,
  note: LIMITS.notes,
};

export function duplicateSelected(): void {
  const st = useEditor.getState();
  if (st.audience === 'player' || !st.sel) return;
  const d = docNow();
  const ref = st.sel;
  const o = getItem(d, ref);
  if (!o) return;
  if ((d[COLL[ref.kind]] as AnyItem[]).length >= LIMIT_OF[ref.kind]) {
    notify(S.msg.limit, 'warning');
    return;
  }
  const W = d.cols * CELL;
  const H = d.rows * CELL;
  const copy = structuredClone(o) as AnyItem;
  copy.id = uid();
  if ('points' in copy) {
    const xs = copy.points.map((p) => p.x);
    const ys = copy.points.map((p) => p.y);
    const dx = duplicateShift(Math.min(...xs), Math.max(...xs), W);
    const dy = duplicateShift(Math.min(...ys), Math.max(...ys), H);
    copy.points = copy.points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  } else {
    copy.x += duplicateShift(copy.x, copy.x, W);
    copy.y += duplicateShift(copy.y, copy.y, H);
  }
  useDoc.getState().update((dd) => {
    (dd[COLL[ref.kind]] as AnyItem[]).push(copy);
  });
  setEditor({ sel: { kind: ref.kind, id: copy.id } });
  notify(S.msg.duplicated, 'success', { duration: 1500 });
}

export function deleteSelected(): void {
  const st = useEditor.getState();
  if (st.audience === 'player' || !st.sel) return;
  const ref = st.sel;
  if (!getItem(docNow(), ref)) return;
  useDoc.getState().update((dd) => {
    const list = dd[COLL[ref.kind]] as AnyItem[];
    const i = list.findIndex((o) => o.id === ref.id);
    if (i >= 0) list.splice(i, 1);
  });
  setEditor({ sel: null });
  notify(S.msg.deleted, 'info');
}

export function flipSelected(): void {
  const st = useEditor.getState();
  if (st.audience === 'player' || st.sel?.kind !== 'object') return;
  updateItem(st.sel, (o) => {
    if ('flip' in o) o.flip = !o.flip;
  });
}

/** 方向鍵：1 px（Shift 12 px），整個留在地圖裡 */
export function nudgeSelected(dx: number, dy: number): void {
  const st = useEditor.getState();
  if (st.audience === 'player' || !st.sel) return;
  const o = getItem(docNow(), st.sel);
  if (!o) return;
  moveItem(st.sel, o, dx, dy);
}

/* ---------- 名字的骰子 ---------- */

export function rollName(): void {
  const st = useEditor.getState();
  if (!st.sel) return;
  useDoc.endGesture();
  const d = docNow();
  const o = getItem(d, st.sel);
  if (!o) return;
  const kind = nameKindFor({
    kind: st.sel.kind,
    objectKind: 'kind' in o && st.sel.kind === 'object' ? o.kind : undefined,
    pathKind: 'kind' in o && st.sel.kind === 'path' ? o.kind : undefined,
  });
  const at = 'points' in o ? centroid(o.points) : o;
  const grid = gridOf(d);
  const name = suggestName(kind, Math.floor(Math.random() * 1e9), climateAt(grid, at.x, at.y));
  patchItem(st.sel, st.sel.kind === 'note' ? { text: name } : { name });
  /* 文字欄還在聚焦：之後打的字照樣「聚焦到離開」算一步 */
  if (document.activeElement?.matches('[data-testid="prop-name"],[data-testid="prop-text"]'))
    useDoc.beginGesture();
}

/* ---------- 城牆 ---------- */

export function addInnerWall(): void {
  const st = useEditor.getState();
  if (st.sel?.kind !== 'region') return;
  const d = docNow();
  const r = d.regions.find((v) => v.id === st.sel!.id);
  if (!r?.wall) return;
  if (d.regions.length >= LIMITS.regions) {
    notify(S.msg.regionLimit, 'warning');
    return;
  }
  const pts = innerWallPoints(r.points);
  if (!pts) {
    notify(S.msg.innerWallFailed, 'warning');
    return;
  }
  const inner = newRegion(S.msg.innerName(r.name), r.color, pts);
  inner.wall = true;
  inner.opacity = 0;
  inner.labelSize = Math.max(RANGES.regionLabel.min, Math.round(r.labelSize * 0.8));
  useDoc.getState().update((dd) => {
    dd.regions.push(inner);
  });
  setEditor({ sel: { kind: 'region', id: inner.id } });
  notify(S.msg.innerWallAdded, 'success');
}

/* ---------- 整張地圖 ---------- */

/** 換上新的地圖（一步復原；主題、畫法以外全部換掉）。畫面的倍率與工具不變。 */
function replaceDoc(next: WorldDoc): void {
  editor.cancelDraft();
  useDoc.getState().update(() => next);
  setEditor({ sel: null });
}

/**
 * 自動產生世界。size：換成那個尺寸（範本對話框；沒有時照目前的尺寸）。換了尺寸時畫面回到整張地圖。
 */
export function generate(rand: () => number = Math.random, size?: MapSizeId): void {
  const d = docNow();
  const dims = size ? MAP_SIZES[size] : { cols: d.cols, rows: d.rows };
  const resized = dims.cols !== d.cols || dims.rows !== d.rows;
  const { seed, terrain } = pickNewSeed(
    { seed: d.seed, terrain: decodeCells(d.terrain, d.cols * d.rows) },
    dims.cols,
    dims.rows,
    rand,
  );
  replaceDoc(generateWorld({ ...d, ...dims }, seed, terrain, uid));
  if (resized) editor.fitView();
  notify(S.msg.generated, 'success');
}

export function applySample(id: SampleId): void {
  replaceDoc(sampleDoc(id));
  setEditor({ samplesOpen: false, audience: 'gm' });
  editor.fitView();
  notify(S.samples.replaced(S.samples.items[id].name), 'success');
}

/** 空白的海（size：尺寸；沒有時照目前的尺寸）：主題留著，畫法一律方格・圓角（D5） */
export function newBlank(size?: MapSizeId): void {
  const d = docNow();
  const dims = size ? MAP_SIZES[size] : { cols: d.cols, rows: d.rows };
  const next = blankDoc(dims.cols, dims.rows);
  next.theme = d.theme;
  replaceDoc(next);
  setEditor({ samplesOpen: false, audience: 'gm', tool: 'brush' });
  editor.fitView();
}

/* ---------- 復原 ---------- */

/** 畫線時的「復原」先退一個點 */
export function undo(): void {
  if (editor.popDraftPoint()) return;
  useDoc.endGesture();
  useDoc.temporal.getState().undo();
  setEditor({ sel: null });
}

export function redo(): void {
  editor.cancelDraft();
  useDoc.endGesture();
  useDoc.temporal.getState().redo();
  setEditor({ sel: null });
}

export const clampKm = (v: number): number => clamp(v, RANGES.kmPer100.min, RANGES.kmPer100.max);
