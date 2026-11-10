/**
 * 資料（畫布、圖形庫、草稿）的 store：自動儲存（localStorage `trpg-toolkit:floria-veins`）＋復原／重做；
 * 每一次點擊、決定、取消、移動都是一步（coalesceMs 0），傷害格的一次拖曳是一步（手勢）。
 * 目前的畫布、畫法、顏色、顯示切換、匯出的選項放在不列入復原的預覽 store。
 */
import { createPreviewStore, createToolStore } from '@/core/storage';
import { clearCanvas, isEmptyCanvas, newCanvas } from './model/canvas';
import { defaultDoc, newId, nextName, sanitizeDoc } from './model/doc';
import {
  addCell,
  canShift,
  canTurn,
  clickPoint,
  commitDraft,
  emptyDraft,
  hasContent,
  isReady,
  mirrorDraft,
  pendingFigures,
  rotateDraft,
  shiftDraft,
  stepBack,
} from './model/draft';
import { fitInside } from './model/geometry';
import type { LegacyCanvas } from './model/legacy';
import { sampleDoc } from './model/sample';
import {
  CANVAS_MAX,
  type Cell,
  DATA_VERSION,
  type Doc,
  type Draft,
  type Figure,
  type Kind,
  NAME_MAX,
  PALETTE,
  type Pt,
  SIZE_CHARACTER,
  STAMP_MAX,
  TOOL_ID,
  type VeinCanvas,
} from './model/types';
import { ALL_LAYERS, type Layers } from './render';
import { S } from './strings';

export const useDoc = createToolStore<Doc>(TOOL_ID, defaultDoc(), {
  version: DATA_VERSION,
  coalesceMs: 0,
});

export type ExportTarget = 'one' | 'tiled' | 'each';
export type ExportScale = 1 | 2 | 3;
export const EXPORT_SCALES: readonly ExportScale[] = [1, 2, 3];

export interface Prefs {
  /** 目前的畫布（id） */
  active: string;
  /** 一張（編輯）或全員（一覽） */
  view: 'one' | 'all';
  kind: Kind;
  erase: boolean;
  /** 調色盤的第幾色 */
  color: number;
  layers: Layers;
  exportTarget: ExportTarget;
  exportScale: ExportScale;
  /** 匯出的背景：白（和畫面相同）或透明 */
  exportTransparent: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  active: '',
  view: 'one',
  kind: 'line',
  erase: false,
  color: 0,
  layers: ALL_LAYERS,
  exportTarget: 'one',
  exportScale: 1,
  exportTransparent: false,
};

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, DEFAULT_PREFS);

/* 自動儲存讀回來的資料整理一次（手改過、壞掉的資料），不列入復原 */
{
  const st = useDoc.getState();
  const clean = sanitizeDoc(st.data, { keepDraft: true }) ?? defaultDoc();
  if (JSON.stringify(clean) !== JSON.stringify(st.data)) {
    st.replace(clean);
    useDoc.temporal.getState().clear();
  }
  const p = usePrefs.getState();
  const prefs = p.data;
  const next: Partial<Prefs> = {};
  if (!Number.isInteger(prefs.color) || prefs.color < 0 || prefs.color >= PALETTE.length)
    next.color = 0;
  if (!['line', 'shape', 'fill', 'damage'].includes(prefs.kind)) next.kind = 'line';
  if (!EXPORT_SCALES.includes(prefs.exportScale)) next.exportScale = 1;
  if (!['one', 'tiled', 'each'].includes(prefs.exportTarget)) next.exportTarget = 'one';
  if (!prefs.layers || typeof prefs.layers !== 'object') next.layers = ALL_LAYERS;
  else next.layers = { ...ALL_LAYERS, ...prefs.layers };
  /* 留著草稿時，畫面切到草稿所在的畫布與畫法 */
  const d = clean.draft;
  if (hasContent(d)) Object.assign(next, { active: d.canvasId, kind: d.kind, erase: d.erase });
  p.patch(next);
}

/* ---------- 讀取 ---------- */

export const docNow = (): Doc => useDoc.getState().data;
export const prefsNow = (): Prefs => usePrefs.getState().data;

/** 目前的畫布（找不到時第一張） */
export function activeOf(doc: Doc, active: string): VeinCanvas {
  return doc.canvases.find((c) => c.id === active) ?? doc.canvases[0];
}
export const activeNow = (): VeinCanvas => activeOf(docNow(), prefsNow().active);

export function useActive(): VeinCanvas {
  const doc = useDoc((s) => s.data);
  const active = usePrefs((s) => s.data.active);
  return activeOf(doc, active);
}

/** 目前畫布、目前畫法的草稿（沒有時 null） */
export function draftOf(doc: Doc, prefs: Prefs): Draft | null {
  const d = doc.draft;
  const c = activeOf(doc, prefs.active);
  return d && d.canvasId === c.id && d.kind === prefs.kind && d.erase === prefs.erase ? d : null;
}
export const draftNow = (): Draft | null => draftOf(docNow(), prefsNow());

export function useDraft(): Draft | null {
  const doc = useDoc((s) => s.data);
  const prefs = usePrefs((s) => s.data);
  return draftOf(doc, prefs);
}

export const colorNow = (): string => PALETTE[prefsNow().color] ?? PALETTE[0];

/* ---------- 草稿 ---------- */

function setDraft(d: Draft | null): void {
  useDoc.getState().patch({ draft: d });
}

function draftOrEmpty(): Draft {
  const p = prefsNow();
  return draftNow() ?? emptyDraft(activeNow().id, p.kind, p.erase);
}

/** 還有別的草稿（別的畫布或畫法）時丟掉（一步復原；復原時回到那張畫布與畫法） */
function dropStaleDraft(): void {
  const d = docNow().draft;
  if (d && !draftNow()) setDraft(null);
}

/** 點一下（已經吸附好的點）；有作用時 true */
export function clickAt(p: Pt): boolean {
  dropStaleDraft();
  const next = clickPoint(draftOrEmpty(), p);
  if (!next) return false;
  setDraft(next);
  return true;
}

/** 傷害格：加一格 */
export function cellAt(cell: Cell): boolean {
  dropStaleDraft();
  const next = addCell(draftOrEmpty(), cell);
  if (!next) return false;
  setDraft(next);
  return true;
}

/** 拖曳中途取消（第二指放上去改成捏合）：草稿回到拖曳之前 */
export function restoreDraft(d: Draft | null): void {
  setDraft(d);
}

export function stepBackDraft(): boolean {
  const d = draftNow();
  if (!d) return false;
  const next = stepBack(d);
  if (!next) return false;
  setDraft(hasContent(next) ? next : null);
  return true;
}

export function cancelDraft(): boolean {
  if (!hasContent(docNow().draft)) return false;
  setDraft(null);
  return true;
}

export type CommitResult =
  | { kind: 'drawn' }
  | { kind: 'erased' }
  | { kind: 'nothing-to-erase' }
  | { kind: 'not-ready' };

/** 決定：畫上去或刪掉，草稿清空（一步復原） */
export function commit(): CommitResult {
  const d = draftNow();
  if (!d || !isReady(d)) return { kind: 'not-ready' };
  const c = activeNow();
  const next = commitDraft(c, d, colorNow());
  useDoc.getState().update((doc) => {
    doc.draft = null;
    if (next !== c) {
      const i = doc.canvases.findIndex((x) => x.id === c.id);
      if (i >= 0) doc.canvases[i] = next;
    }
  });
  if (!d.erase) return { kind: 'drawn' };
  return next === c ? { kind: 'nothing-to-erase' } : { kind: 'erased' };
}

export function shift(dx: number, dy: number): boolean {
  const d = draftNow();
  if (!canShift(d) || !d) return false;
  const next = shiftDraft(d, dx, dy, activeNow().size);
  if (!next) return false;
  setDraft(next);
  return true;
}

export function mirror(): boolean {
  const d = draftNow();
  if (!canTurn(d) || !d) return false;
  const next = mirrorDraft(d, activeNow().size);
  if (!next) return false;
  setDraft(next);
  return true;
}

export function rotate(): boolean {
  const d = draftNow();
  if (!canTurn(d) || !d) return false;
  const next = rotateDraft(d, activeNow().size);
  if (!next) return false;
  setDraft(next);
  return true;
}

/* ---------- 畫法、畫布的切換 ---------- */

/** 換畫法：草稿（有的話）丟掉（一步復原；和原作相同） */
export function setMode(kind: Kind, erase: boolean): void {
  const p = prefsNow();
  if (p.kind === kind && p.erase === erase) return;
  if (hasContent(docNow().draft)) setDraft(null);
  usePrefs.getState().patch({ kind, erase });
}

export function setColor(index: number): void {
  if (index >= 0 && index < PALETTE.length) usePrefs.getState().patch({ color: index });
}

/** 換畫布：別的畫布的草稿丟掉 */
export function selectCanvas(id: string): void {
  const d = docNow().draft;
  if (hasContent(d) && d.canvasId !== id) setDraft(null);
  usePrefs.getState().patch({ active: id, view: 'one' });
}

export function showAll(): void {
  usePrefs.getState().patch({ view: 'all' });
}

/* ---------- 畫布的管理 ---------- */

export function addCanvas(size: number): string | null {
  const doc = docNow();
  if (doc.canvases.length >= CANVAS_MAX) return null;
  const id = newId('c');
  const prefix = size === SIZE_CHARACTER ? S.canvas.prefixCharacter : S.canvas.prefixMinion;
  const c = newCanvas(id, nextName(doc.canvases, prefix), size);
  useDoc.getState().update((d) => {
    d.canvases.push(c);
    if (hasContent(d.draft)) d.draft = null;
  });
  usePrefs.getState().patch({ active: id, view: 'one' });
  return id;
}

export function renameCanvas(id: string, name: string): void {
  useDoc.getState().update((d) => {
    const c = d.canvases.find((x) => x.id === id);
    if (c) c.name = name.slice(0, NAME_MAX);
  });
}

/** 改格數：內容清空（呼叫端先確認） */
export function resizeCanvas(id: string, size: number): void {
  useDoc.getState().update((d) => {
    const c = d.canvases.find((x) => x.id === id);
    if (!c || c.size === size) return;
    c.size = size;
    c.lines = [];
    c.fills = [];
    c.damage = [];
    if (d.draft?.canvasId === id) d.draft = null;
  });
}

export function clearActive(): boolean {
  const c = activeNow();
  if (isEmptyCanvas(c)) return false;
  useDoc.getState().update((d) => {
    const i = d.canvases.findIndex((x) => x.id === c.id);
    if (i >= 0) d.canvases[i] = clearCanvas(c);
    if (d.draft?.canvasId === c.id) d.draft = null;
  });
  return true;
}

export function duplicateActive(): string | null {
  const doc = docNow();
  if (doc.canvases.length >= CANVAS_MAX) return null;
  const c = activeNow();
  const id = newId('c');
  const copy: VeinCanvas = {
    ...structuredClone(c),
    id,
    name: `${c.name}${S.canvas.copySuffix}`.slice(0, NAME_MAX),
  };
  useDoc.getState().update((d) => {
    const i = d.canvases.findIndex((x) => x.id === c.id);
    d.canvases.splice(i + 1, 0, copy);
  });
  usePrefs.getState().patch({ active: id, view: 'one' });
  return id;
}

export function deleteActive(): boolean {
  const doc = docNow();
  if (doc.canvases.length <= 1) return false;
  const c = activeNow();
  const i = doc.canvases.findIndex((x) => x.id === c.id);
  const neighbor = doc.canvases[i + 1] ?? doc.canvases[i - 1];
  useDoc.getState().update((d) => {
    d.canvases = d.canvases.filter((x) => x.id !== c.id);
    if (d.draft?.canvasId === c.id) d.draft = null;
  });
  usePrefs.getState().patch({ active: neighbor.id });
  return true;
}

/** 往前（−1）或往後（＋1）移一格 */
export function moveActive(dir: -1 | 1): boolean {
  const c = activeNow();
  const list = docNow().canvases;
  const i = list.findIndex((x) => x.id === c.id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return false;
  useDoc.getState().update((d) => {
    const [x] = d.canvases.splice(i, 1);
    d.canvases.splice(j, 0, x);
  });
  return true;
}

/* ---------- 圖形庫 ---------- */

/** 草稿裡可以存成圖形的線（直線、多角形的畫，正在畫的多角形 2 點以上也算） */
export function stampableFigures(d: Draft | null): Figure[] {
  if (!d || d.erase || (d.kind !== 'line' && d.kind !== 'shape')) return [];
  return pendingFigures(d).filter((f) => f.pts.length >= 2);
}

export function saveStamp(name: string): string | null {
  const figures = stampableFigures(draftNow());
  if (!figures.length || docNow().stamps.length >= STAMP_MAX) return null;
  const id = newId('s');
  useDoc.getState().update((d) => {
    d.stamps.push({ id, name: name.trim().slice(0, NAME_MAX), figures: structuredClone(figures) });
  });
  return id;
}

export type PlaceResult = 'ok' | 'too-big' | 'missing';

/** 放上去：放進草稿（原本的草稿換掉；多角形的畫法），超出畫布時移進來 */
export function placeStamp(id: string): PlaceResult {
  const s = docNow().stamps.find((x) => x.id === id);
  if (!s) return 'missing';
  const c = activeNow();
  const flat = s.figures.flatMap((f) => f.pts);
  const fitted = fitInside(flat, c.size);
  if (!fitted) return 'too-big';
  let i = 0;
  const figures = s.figures.map((f) => {
    const pts = fitted.slice(i, i + f.pts.length);
    i += f.pts.length;
    return { pts, closed: f.closed };
  });
  const p = prefsNow();
  const kind: Kind = !p.erase && (p.kind === 'line' || p.kind === 'shape') ? p.kind : 'shape';
  usePrefs.getState().patch({ kind, erase: false, view: 'one' });
  setDraft({ ...emptyDraft(c.id, kind, false), figures });
  return 'ok';
}

export function renameStamp(id: string, name: string): void {
  useDoc.getState().update((d) => {
    const s = d.stamps.find((x) => x.id === id);
    if (s) s.name = name.trim().slice(0, NAME_MAX);
  });
}

export function deleteStamp(id: string): void {
  useDoc.getState().update((d) => {
    d.stamps = d.stamps.filter((x) => x.id !== id);
  });
}

/* ---------- 讀入、範例、重設 ---------- */

/** 原作的資料加成一張新的畫布（排在最後、切換過去） */
export function addLegacyCanvas(r: LegacyCanvas): string | null {
  const doc = docNow();
  if (doc.canvases.length >= CANVAS_MAX) return null;
  const id = newId('c');
  const name = r.canvas.name || S.canvas.importedName;
  useDoc.getState().update((d) => {
    d.canvases.push({ ...structuredClone(r.canvas), id, name });
    if (hasContent(d.draft)) d.draft = null;
  });
  usePrefs.getState().patch({ active: id, view: 'one' });
  return id;
}

/** 換成整份新的資料（開啟專案檔、範例）；clearHistory：開檔時清空復原紀錄 */
export function replaceDoc(doc: Doc, { clearHistory }: { clearHistory: boolean }): void {
  useDoc.getState().replace(doc);
  if (clearHistory) useDoc.temporal.getState().clear();
  usePrefs.getState().patch({ active: doc.canvases[0].id, view: 'one' });
}

export function loadSample(): void {
  replaceDoc(sampleDoc(), { clearHistory: false });
  usePrefs.getState().patch({ view: 'all' });
}

export function resetAll(): void {
  replaceDoc(defaultDoc(), { clearHistory: true });
  const p = prefsNow();
  usePrefs
    .getState()
    .replace({ ...DEFAULT_PREFS, layers: p.layers, active: docNow().canvases[0].id });
}

/* ---------- 復原／重做：回到改到的畫布 ---------- */

/**
 * 復原、重做之後，畫面切到改到的地方：還原回來的草稿所在的畫布與畫法，或內容有變化的畫布。
 */
export function focusAfterHistory(before: Doc, after: Doc): void {
  const prefs = prefsNow();
  const d = after.draft;
  if (hasContent(d)) {
    usePrefs.getState().patch({ active: d.canvasId, kind: d.kind, erase: d.erase, view: 'one' });
    return;
  }
  const old = new Map(before.canvases.map((c) => [c.id, c]));
  const changed = after.canvases.find((c) => old.get(c.id) !== c);
  if (changed && changed.id !== prefs.active)
    usePrefs.getState().patch({ active: changed.id, view: 'one' });
}

export function undo(): void {
  useDoc.endGesture();
  const before = docNow();
  useDoc.temporal.getState().undo();
  focusAfterHistory(before, docNow());
}

export function redo(): void {
  useDoc.endGesture();
  const before = docNow();
  useDoc.temporal.getState().redo();
  focusAfterHistory(before, docNow());
}

declare global {
  interface Window {
    /** 測試與對等驗證用 */
    __floria?: unknown;
  }
}
