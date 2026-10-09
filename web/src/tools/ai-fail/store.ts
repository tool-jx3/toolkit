/**
 * 狀態與動作：
 * - useMeme：照片、比例、放大與位置、框、標籤字型（自動儲存、可復原；拖曳、滑桿放開才記一步）；
 * - useUi：只在這次開頁有效的東西（選取的框、模式、畫到一半的框、照片的讀取狀態）；
 * - 照片存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import type { Box } from '@/core/layout';
import { createToolStore, historyGesture } from '@/core/storage';
import {
  type AspectId,
  bigEnough,
  canvasSize,
  centeredView,
  createBox,
  initialState,
  type MemeBox,
  type MemeState,
  moveLayer,
  nextBoxId,
  normalizeState,
  type PhotoView,
  panView,
  scaleBoxes,
  zoomView,
} from './model';
import type { Mode } from './strings';

export const TOOL_ID = 'ai-fail';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useMeme = createToolStore<MemeState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useMeme.getState().data;
  const fixed = normalizeState(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useMeme.getState().replace(fixed);
  useMeme.temporal.getState().clear();
}

/** 拖曳、滑桿、文字欄：放開（離開）才記一步 */
export const gesture = historyGesture(useMeme);

export const assets = createAssetStore(TOOL_ID);

/** 狀態與復原紀錄裡用到的照片（gc 時保留） */
export const referencedPhotos = (): Set<string> =>
  referencedAssetIds(useMeme, (d) => [d.photo?.id]);

/* ---------- 介面狀態 ---------- */

export interface UiState {
  selectedId: string | null;
  mode: Mode;
  /** 畫到一半的框（畫布 px；Esc 取消時清掉） */
  drawing: Box | null;
}

export const useUi = create<UiState>(() => ({ selectedId: null, mode: 'select', drawing: null }));

export const select = (id: string | null): void => useUi.setState({ selectedId: id });
export const setMode = (mode: Mode): void => useUi.setState({ mode, drawing: null });

export const memeNow = (): MemeState => useMeme.getState().data;

/** 一次變更＝一步復原（手勢中除外） */
export function edit(recipe: (d: MemeState) => void): void {
  useMeme.getState().update((d) => {
    recipe(d as MemeState);
  });
}

/* ---------- 照片 ---------- */

/** 放進新照片：清掉所有框與選取，依目前的比例重算畫布、照片置中（規格 F07） */
export function applyPhoto(photo: { id: string; name: string; width: number; height: number }) {
  edit((d) => {
    d.photo = { ...photo };
    d.boxes = [];
    d.view = centeredView(canvasSize(d.aspect, photo), photo);
  });
  useUi.setState({ selectedId: null, drawing: null });
}

export function setZoom(zoom: number): void {
  edit((d) => {
    if (!d.photo) return;
    d.view = zoomView(canvasSize(d.aspect, d.photo), d.photo, d.view, zoom);
  });
}

export function resetView(): void {
  edit((d) => {
    if (!d.photo) return;
    d.view = centeredView(canvasSize(d.aspect, d.photo), d.photo);
  });
}

/** 平移（從按下時的位置 start 加上位移） */
export function panPhoto(start: PhotoView, dx: number, dy: number): void {
  edit((d) => {
    if (!d.photo) return;
    d.view = panView(canvasSize(d.aspect, d.photo), d.photo, start, dx, dy);
  });
}

/* ---------- 比例 ---------- */

/** 換比例：框跟著縮放、照片回到置中（規格 F13）；選目前的比例不做事（D7） */
export function setAspect(aspect: AspectId): void {
  edit((d) => {
    if (d.aspect === aspect) return;
    const from = canvasSize(d.aspect, d.photo);
    const to = canvasSize(aspect, d.photo);
    d.aspect = aspect;
    d.boxes = scaleBoxes(d.boxes, from, to);
    if (d.photo) d.view = centeredView(to, d.photo);
  });
}

/* ---------- 框 ---------- */

/** 畫好的框：夠大才建立，選取它並回到選取模式（規格 F16～F18）；回傳是否建立 */
export function addBox(rect: Box): boolean {
  if (!bigEnough(rect) || !memeNow().photo) return false;
  const id = nextBoxId(memeNow().boxes);
  edit((d) => {
    d.boxes.push(createBox(rect, id));
  });
  useUi.setState({ selectedId: id, mode: 'select', drawing: null });
  return true;
}

export function patchBox(id: string, patch: Partial<Omit<MemeBox, 'id'>>): void {
  edit((d) => {
    const b = d.boxes.find((x) => x.id === id);
    if (b) Object.assign(b, patch);
  });
}

export function removeBox(id: string): void {
  edit((d) => {
    d.boxes = d.boxes.filter((b) => b.id !== id);
  });
  if (useUi.getState().selectedId === id) select(null);
}

/** 調整上下層（畫的順序的索引；同一個框保持選取） */
export function moveBoxLayer(from: number, to: number): void {
  edit((d) => {
    d.boxes = moveLayer(d.boxes, from, to);
  });
}

/** 選取的框往前（+1）或往後（-1）一層 */
export function stepLayer(dir: 1 | -1): void {
  const id = useUi.getState().selectedId;
  const i = memeNow().boxes.findIndex((b) => b.id === id);
  if (i < 0) return;
  moveBoxLayer(i, i + dir);
}

/* 方向鍵：連按（停頓 0.5 秒以內）算一步復原 */
let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
export function nudgeSelected(dx: number, dy: number): void {
  const id = useUi.getState().selectedId;
  const b = memeNow().boxes.find((x) => x.id === id);
  if (!b) return;
  useMeme.beginGesture();
  patchBox(b.id, { x: b.x + dx, y: b.y + dy });
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(flushNudge, 500);
}

/** 結束方向鍵的連按（開始拖曳等別的手勢之前呼叫，兩者不會併成一步） */
export function flushNudge(): void {
  if (nudgeTimer === undefined) return;
  clearTimeout(nudgeTimer);
  nudgeTimer = undefined;
  useMeme.endGesture();
}

/** 選取的框（找不到時 null；例如復原之後） */
export function selectedBox(d: MemeState, id: string | null): MemeBox | null {
  return (id && d.boxes.find((b) => b.id === id)) || null;
}
