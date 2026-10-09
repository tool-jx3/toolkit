/**
 * 狀態與動作：
 * - useScratch：刮刮卡的內容（自動儲存、可以復原；文字欄從聚焦到離開算一步）；
 * - usePrefs：互動 HTML 的「上傳的圖片改成待填的網址」（自動儲存，不列入復原）；
 * - useUi：只在這次開頁有效的東西（抽了幾張、刮開了沒）；
 * - 圖片存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import type { ScratchHandle } from './engine';
import {
  assetIds,
  type ImageRef,
  initialState,
  LIMITS,
  normalizeState,
  randomSeed,
  type ScratchState,
} from './model';

export const TOOL_ID = 'scratch-card';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useScratch = createToolStore<ScratchState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  historyLimit: 150,
});

/**
 * 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄。
 * 第一次開頁（還沒有存檔）時把隨機的種子寫進去，重新整理後還是同一張。
 */
{
  const cur = useScratch.getState().data;
  const fixed = normalizeState(cur);
  let saved = true;
  try {
    saved =
      typeof localStorage === 'undefined' || localStorage.getItem(useScratch.storageKey) !== null;
  } catch {
    saved = true;
  }
  if (!saved || JSON.stringify(fixed) !== JSON.stringify(cur)) useScratch.getState().replace(fixed);
  useScratch.temporal.getState().clear();
}

/** 文字欄：從聚焦到離開算一步 */
export const gesture = historyGesture(useScratch);

export const assets = createAssetStore(TOOL_ID);

/** 整理圖片庫時保留的圖：狀態與復原紀錄裡用到的（這次開頁放進來的由 `gcStale` 保留） */
export function referencedImages(): Set<string> {
  return referencedAssetIds(useScratch, assetIds);
}

export const scratchNow = (): ScratchState => useScratch.getState().data;

export function edit(recipe: (d: ScratchState) => void): void {
  useScratch.getState().update((d) => {
    recipe(d as ScratchState);
  });
}

/** 復原／重做（文字欄打字中先結束這一步） */
export function historyStep(kind: 'undo' | 'redo'): void {
  if (useScratch.inGesture()) useScratch.endGesture();
  const t = useScratch.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/* ---------- 偏好（不列入復原） ---------- */

export interface Prefs {
  /** 互動 HTML：上傳的圖片改成待填的網址 */
  placeholders: boolean;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, { placeholders: false });

/* ---------- 這次開頁的狀態 ---------- */

export interface UiState {
  /** 這次開頁抽了幾張（開頁算 1） */
  draws: number;
  /** 預覽的卡片刮開了沒 */
  revealed: boolean;
}

export const useUi = create<UiState>(() => ({ draws: 1, revealed: false }));

const countDraw = () => useUi.setState((s) => ({ draws: s.draws + 1 }));

/** 預覽上掛著的刮刮卡（CardView 掛上時設定） */
let preview: ScratchHandle | null = null;
export const setPreviewHandle = (h: ScratchHandle | null): void => {
  preview = h;
};

/** 再蓋一次 */
export function recover(): void {
  preview?.recover();
  useUi.setState({ revealed: false });
}

/** 直接刮開 */
export function revealNow(): void {
  preview?.reveal();
}

/** 抽新的一張：沒有自己指定種子時換一個隨機種子；指定時用同一個種子（重新蓋上） */
export function newTicket(): void {
  if (!scratchNow().fixedSeed)
    edit((d) => {
      d.seed = randomSeed();
    });
  recover();
  countDraw();
}

/** 換一個種子（自己指定種子時的按鈕；立刻抽一張） */
export function shuffleSeed(): void {
  edit((d) => {
    d.seed = randomSeed();
  });
  recover();
  countDraw();
}

/* ---------- 圖片 ---------- */

/** 加在圖片清單最後（到上限）；回傳沒加進去的張數 */
export function appendImages(images: readonly ImageRef[]): number {
  const room = Math.max(0, LIMITS.images - scratchNow().images.length);
  const take = images.slice(0, room);
  if (take.length)
    edit((d) => {
      d.images.push(...take);
    });
  return images.length - take.length;
}

export function removeImage(index: number): void {
  edit((d) => {
    d.images.splice(index, 1);
  });
}

export function setBgImage(image: ImageRef | null): void {
  edit((d) => {
    d.bgImage = image;
  });
}

/* ---------- 讀檔、重設 ---------- */

/** 整份換掉（開啟專案檔、重設）；countAsDraw：開原作的設定檔算抽一張 */
export function replaceAll(next: ScratchState, { countAsDraw = false } = {}): void {
  useScratch.getState().replace(next);
  recover();
  if (countAsDraw) countDraw();
}
