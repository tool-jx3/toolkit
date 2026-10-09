/**
 * 狀態與動作：
 * - useReview：排列、圖片比例、個人資料、格子、心得標籤清單（自動儲存、可以復原；文字欄從聚焦到離開算一步）；
 * - usePrefs：匯出倍率（自動儲存，不列入復原）；
 * - useUi：只在這次開頁有效的東西（選取的格子、滑鼠指著預覽上的哪裡）；
 * - 圖片存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { moveItem } from '@/core/compose';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  addTagTo,
  type Cell,
  DEFAULT_TAGS,
  deleteTagIn,
  emptyCell,
  type ImageRatio,
  type ImageRef,
  imageIds,
  initialState,
  LIMITS,
  nextId,
  normalizeState,
  oneLine,
  planImageFill,
  type ReviewState,
  renameTagIn,
  type TagEditError,
  type TagToggle,
  toggleTag,
  type ViewMode,
} from './model';

export const TOOL_ID = 'review-grid';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useReview = createToolStore<ReviewState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useReview.getState().data;
  const fixed = normalizeState(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useReview.getState().replace(fixed);
  useReview.temporal.getState().clear();
}

/** 文字欄、拖曳：放開（離開）才記一步 */
export const gesture = historyGesture(useReview);

export const assets = createAssetStore(TOOL_ID);

/** 狀態與復原紀錄裡用到的圖片（gc 時保留） */
export const referencedImages = (): Set<string> => referencedAssetIds(useReview, imageIds);

export const reviewNow = (): ReviewState => useReview.getState().data;

/* ---------- 偏好（不列入復原） ---------- */

export type ExportScale = 1 | 2;

export interface Prefs {
  scale: ExportScale;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, { scale: 2 });

/* ---------- 介面狀態 ---------- */

/** 預覽上的目標：個人資料或某一格 */
export type Target = { kind: 'profile' } | { kind: 'cell'; id: string };

export interface UiState {
  /** 選取的格子（null：第一格） */
  selectedId: string | null;
  /** 滑鼠指著預覽上的哪裡（貼上圖片用） */
  hover: Target | null;
}

export const useUi = create<UiState>(() => ({ selectedId: null, hover: null }));

export const select = (id: string | null): void => useUi.setState({ selectedId: id });

/** 選取的格子（沒有選、選的已經不在時是第一格） */
export const selectedCellOf = (d: ReviewState, id: string | null): Cell =>
  d.cells.find((c) => c.id === id) ?? d.cells[0];

/* ---------- 編輯與復原 ---------- */

export function edit(recipe: (d: ReviewState) => void): void {
  useReview.getState().update((d) => {
    recipe(d as ReviewState);
  });
}

/** 復原／重做（拖曳中不做事） */
export function historyStep(kind: 'undo' | 'redo'): void {
  if (useReview.inGesture()) return;
  const t = useReview.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/* ---------- 版面 ---------- */

export const setView = (view: ViewMode): void =>
  edit((d) => {
    d.view = view;
  });

export const setRatio = (ratio: ImageRatio): void =>
  edit((d) => {
    d.ratio = ratio;
  });

/* ---------- 個人資料 ---------- */

export function patchProfile(patch: { name?: string; handle?: string }): void {
  edit((d) => {
    if (patch.name !== undefined) d.profile.name = oneLine(patch.name, LIMITS.name);
    if (patch.handle !== undefined) d.profile.handle = oneLine(patch.handle, LIMITS.handle);
  });
}

export function setProfileImage(image: ImageRef | null): void {
  edit((d) => {
    d.profile.image = image;
  });
}

/* ---------- 格子 ---------- */

export const canAddCell = (): boolean => reviewNow().cells.length < LIMITS.cells;

/** 加一格在最後並選取；回傳 id（到上限時 null） */
export function addCell(): string | null {
  if (!canAddCell()) return null;
  let id = '';
  edit((d) => {
    id = nextId('c', d.cells);
    d.cells.push(emptyCell(id));
  });
  select(id);
  return id;
}

/** 刪掉一格（至少留一格）；選取的是它時改選同一個位置的格子 */
export function removeCell(id: string): boolean {
  const d = reviewNow();
  const i = d.cells.findIndex((c) => c.id === id);
  if (i < 0 || d.cells.length <= 1) return false;
  edit((draft) => {
    draft.cells.splice(i, 1);
  });
  const ui = useUi.getState();
  if (ui.selectedId === id || !ui.selectedId) {
    const next = reviewNow().cells[Math.min(i, reviewNow().cells.length - 1)];
    select(next?.id ?? null);
  }
  return true;
}

export function moveCell(from: number, to: number): void {
  edit((d) => {
    d.cells = moveItem(d.cells, from, to);
  });
}

export type CellText = 'rule' | 'title' | 'writer' | 'comment';

const CELL_LIMITS: Record<CellText, number> = {
  rule: LIMITS.rule,
  title: LIMITS.title,
  writer: LIMITS.writer,
  comment: LIMITS.comment,
};

export function setCellText(id: string, key: CellText, value: string): void {
  edit((d) => {
    const c = d.cells.find((x) => x.id === id);
    if (!c) return;
    c[key] =
      key === 'comment'
        ? Array.from(value.replace(/\r\n?/g, '\n')).slice(0, CELL_LIMITS.comment).join('')
        : oneLine(value, CELL_LIMITS[key]);
  });
}

export function setCellImage(id: string, image: ImageRef | null): void {
  edit((d) => {
    const c = d.cells.find((x) => x.id === id);
    if (c) c.image = image;
  });
}

/** 一格的心得標籤：有就拿掉、沒有就加上（滿了時不變，回傳 'full'） */
export function toggleCellTag(id: string, tag: string): TagToggle {
  const c = reviewNow().cells.find((x) => x.id === id);
  if (!c) return 'full';
  const r = toggleTag(c.tags, tag);
  if (r.result !== 'full')
    edit((d) => {
      const cell = d.cells.find((x) => x.id === id);
      if (cell) cell.tags = r.tags;
    });
  return r.result;
}

/**
 * 好幾張圖片放進格子（規格 F14）：第一張放 start 那一格（null：從頭找沒有圖片的格子），其餘依序放進後面沒有圖片的格子，
 * 不夠時在最後加格子（到上限）。一步復原。回傳放進去的格子 id 與放不下的張數。
 */
export function fillImages(
  images: readonly ImageRef[],
  start: string | null,
): { ids: string[]; dropped: number } {
  const d = reviewNow();
  const startIndex = start ? d.cells.findIndex((c) => c.id === start) : -1;
  const plan = planImageFill(d.cells, images.length, startIndex >= 0 ? startIndex : null);
  const ids: string[] = [];
  edit((draft) => {
    let k = 0;
    for (const i of plan.targets) {
      draft.cells[i].image = images[k++];
      ids.push(draft.cells[i].id);
    }
    for (let n = 0; n < plan.added; n++) {
      const c = emptyCell(nextId('c', draft.cells));
      c.image = images[k++];
      draft.cells.push(c);
      ids.push(c.id);
    }
  });
  if (ids.length) select(ids[0]);
  return { ids, dropped: plan.dropped };
}

/* ---------- 心得標籤清單 ---------- */

export function addTag(text: string): TagEditError | null {
  const r = addTagTo(reviewNow().tags, text);
  if (typeof r === 'string') return r;
  edit((d) => {
    d.tags = r;
  });
  return null;
}

export function renameTag(index: number, text: string): Exclude<TagEditError, 'full'> | null {
  const r = renameTagIn(reviewNow(), index, text);
  if (typeof r === 'string') return r;
  if (r.tags[index] === reviewNow().tags[index]) return null;
  edit((d) => {
    d.tags = r.tags;
    d.cells = r.cells;
  });
  return null;
}

export function removeTag(index: number): void {
  const r = deleteTagIn(reviewNow(), index);
  edit((d) => {
    d.tags = r.tags;
    d.cells = r.cells;
  });
}

export function moveTag(from: number, to: number): void {
  edit((d) => {
    d.tags = moveItem(d.tags, from, to);
  });
}

/** 標籤清單回到預設（格子裡已經選的標籤留著） */
export function resetTags(): void {
  edit((d) => {
    d.tags = [...DEFAULT_TAGS];
  });
}

/* ---------- 讀檔、重設 ---------- */

export function replaceAll(next: ReviewState): void {
  useReview.getState().replace(next);
  useUi.setState({ selectedId: next.cells[0]?.id ?? null, hover: null });
}
