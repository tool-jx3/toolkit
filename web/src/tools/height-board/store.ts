/**
 * 立繪身高比較板的資料：角色清單（復原／重做、自動保存）＋圖片資產庫。
 *
 * - 角色資料很小，用 createToolStore 存 localStorage（鍵名 trpg-toolkit:height-board），但寫入延後約 0.4 秒
 *   （規格 F48：每次變更後約 0.4 秒保存）；離開頁面時立即寫入。
 * - 原始圖片存 IndexedDB（core/assets），角色只記圖片的 id。
 * - 寫不進去（瀏覽器不允許、空間不足）時記下原因、之後不再嘗試；工具其餘功能照常。
 */

import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { type ImageSaveFailure, imageOpaqueBounds, isQuotaError } from '@/core/image';
import { createToolStore } from '@/core/storage';
import {
  AUTOSAVE_DELAY_MS,
  type BoardData,
  EMPTY_BOARD,
  HISTORY_LIMIT,
  OPAQUE_THRESHOLD,
  type Rect,
} from './logic';

export const TOOL_ID = 'height-board';
/** 專案檔的資料版本 */
export const PROJECT_VERSION = 1;

/* ---------- 自動保存的狀態 ---------- */

export type SaveFailure = 'unavailable' | 'quota';

interface SaveState {
  savedAt: number | null;
  failure: SaveFailure | null;
}

export const useSaveState = create<SaveState>(() => ({ savedAt: null, failure: null }));

let disabled = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: { name: string; value: string } | null = null;

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 自動保存無法使用：記下原因，之後不再嘗試 */
export function disableAutosave(reason: ImageSaveFailure | SaveFailure | undefined): void {
  if (disabled) return;
  disabled = true;
  pending = null;
  clearTimeout(timer);
  useSaveState.setState({ failure: reason === 'quota' ? 'quota' : 'unavailable' });
}

export const autosaveDisabled = (): boolean => disabled;

/** 立即寫入還沒寫的變更 */
export function flushAutosave(): void {
  clearTimeout(timer);
  timer = undefined;
  const p = pending;
  pending = null;
  if (!p || disabled) return;
  const ls = local();
  if (!ls) {
    disableAutosave('unavailable');
    return;
  }
  try {
    ls.setItem(p.name, p.value);
    useSaveState.setState({ savedAt: Date.now() });
  } catch (e) {
    disableAutosave(isQuotaError(e) ? 'quota' : 'unavailable');
  }
}

/** 延後寫入的 localStorage（給 createToolStore） */
const delayedStorage: StateStorage = {
  getItem: (key) => {
    try {
      return local()?.getItem(key) ?? null;
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    if (disabled) return;
    pending = { name: key, value };
    clearTimeout(timer);
    timer = setTimeout(flushAutosave, AUTOSAVE_DELAY_MS);
  },
  removeItem: (key) => {
    try {
      local()?.removeItem(key);
    } catch {
      /* 不能刪就算了 */
    }
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAutosave);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAutosave();
  });
}

/** 角色清單（每個動作各自一步復原；連續動作用 beginGesture／endGesture 合成一步） */
export const useBoard = createToolStore<BoardData>(TOOL_ID, EMPTY_BOARD, {
  version: 1,
  historyLimit: HISTORY_LIMIT,
  coalesceMs: 0,
  storage: delayedStorage,
});

/* ---------- 圖片 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 這次開頁之後加進資產庫的圖（清理時一律保留，避免和進行中的加入互相干擾） */
const sessionIds = new Set<string>();

export interface PreparedImage {
  imageId: string;
  /** 去除透明留白後的範圍（門檻 16；整張透明時是整張圖） */
  crop: Rect;
  persisted: boolean;
  reason?: ImageSaveFailure;
}

/** 範圍：不透明度大於 16 的像素的外接矩形；整張透明時整張圖 */
export function cropOf(bmp: ImageBitmap): Rect {
  return (
    imageOpaqueBounds(bmp, OPAQUE_THRESHOLD) ?? { x: 0, y: 0, width: bmp.width, height: bmp.height }
  );
}

/** 存進資產庫並解碼、找出範圍；讀不了時丟錯 */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  const r = await assets.add(file);
  sessionIds.add(r.id);
  let bmp: ImageBitmap | undefined;
  try {
    bmp = await assets.bitmap(r.id);
  } catch {
    bmp = undefined;
  }
  if (!bmp?.width || !bmp.height) throw new Error('decode');
  return { imageId: r.id, crop: cropOf(bmp), persisted: r.persisted, reason: r.reason };
}

export const markSessionAsset = (id: string): void => {
  sessionIds.add(id);
};

/** 清掉沒有人用的圖（目前的角色＋復原／重做歷史＋這次開頁加入的都保留） */
export async function collectGarbage(): Promise<void> {
  const keep = referencedAssetIds(useBoard, (d) => d.characters.map((c) => c.imageId));
  for (const id of sessionIds) keep.add(id);
  try {
    await assets.gc(keep);
  } catch {
    /* 清不掉就下次再清 */
  }
}

/* ---------- 解碼後的圖與清單縮圖 ---------- */

let bitmapVersion = 0;
const bitmapListeners = new Set<() => void>();
const loading = new Set<string>();

/** 要畫某張圖：還沒解碼就開始解碼，好了通知重畫 */
export function requestBitmap(id: string): ImageBitmap | undefined {
  const hit = assets.peekBitmap(id);
  if (hit || loading.has(id)) return hit;
  loading.add(id);
  assets
    .bitmap(id)
    .catch(() => undefined)
    .finally(() => {
      loading.delete(id);
      bitmapVersion++;
      for (const f of bitmapListeners) f();
    });
  return undefined;
}

export function subscribeBitmaps(f: () => void): () => void {
  bitmapListeners.add(f);
  return () => bitmapListeners.delete(f);
}

export const getBitmapVersion = (): number => bitmapVersion;

const THUMB_BOX = { width: 120, height: 168 };
const thumbs = new Map<string, HTMLCanvasElement>();

/** 清單縮圖：去除留白後的圖，等比縮進 120 × 168（顯示 60 × 84 的兩倍） */
export function thumbnailOf(id: string, crop: Rect): HTMLCanvasElement | null {
  const key = `${id}|${crop.x},${crop.y},${crop.width},${crop.height}`;
  const hit = thumbs.get(key);
  if (hit) return hit;
  const bmp = requestBitmap(id);
  if (!bmp || typeof document === 'undefined') return null;
  const k = Math.min(1, THUMB_BOX.width / crop.width, THUMB_BOX.height / crop.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(crop.width * k));
  c.height = Math.max(1, Math.round(crop.height * k));
  const ctx = c.getContext('2d');
  if (!ctx) return null;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, crop.x, crop.y, crop.width, crop.height, 0, 0, c.width, c.height);
  thumbs.set(key, c);
  return c;
}
