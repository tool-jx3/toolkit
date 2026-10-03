/**
 * 狀態（規格 1.6、2.2）：
 * - useDoc：內文、封面與概要、設定，自動存檔（`trpg-toolkit:coc-typesetter`）。新版沒有存檔時讀舊版的 `coc-typesetter:v2`（不刪）；
 *   都沒有時是範例劇本。讀回時整理（壞掉的當作沒有存檔），並做一次封面資訊自動讀入。
 * - useUiPrefs：窄畫面的收合狀態（設定列、格式按鈕；不列入復原）。新版沒有時讀舊版的 `coc-typesetter:ui`。
 */
import type { StateStorage } from 'zustand/middleware';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { defaultSettings, fromLegacy, restoreData, type TypesetData } from './model';
import { SAMPLE_META, SAMPLE_TEXT } from './sample';

export const TOOL_ID = 'coc-typesetter';
export const STORE_KEY = `trpg-toolkit:${TOOL_ID}`;
export const LEGACY_KEY = 'coc-typesetter:v2';
export const LEGACY_UI_KEY = 'coc-typesetter:ui';

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLocal(key: string): string | null {
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export const sampleData = (settings = defaultSettings()): TypesetData => ({
  text: SAMPLE_TEXT,
  meta: structuredClone(SAMPLE_META),
  settings,
});

/** 存檔：讀回時整理；新版沒有存檔時接收舊版的 */
function docStorage(): StateStorage {
  return {
    getItem: (name) => {
      const raw = readLocal(name);
      if (raw !== null) {
        try {
          const parsed = JSON.parse(raw) as { state?: { data?: unknown }; version?: number };
          const data = restoreData(parsed?.state?.data);
          if (data) return JSON.stringify({ ...parsed, state: { ...parsed.state, data } });
        } catch {
          /* 壞掉：當作沒有存檔 */
        }
      }
      const legacy = readLocal(LEGACY_KEY);
      const data = legacy === null ? null : fromLegacy(legacy);
      return data ? JSON.stringify({ state: { data }, version: 1 }) : null;
    },
    setItem: (name, value) => {
      const ls = local();
      if (!ls) throw new Error('localStorage 無法使用');
      ls.setItem(name, value);
    },
    removeItem: (name) => {
      try {
        local()?.removeItem(name);
      } catch {
        /* 刪不掉就算了 */
      }
    },
  };
}

export const useDoc = createToolStore<TypesetData>(TOOL_ID, sampleData(), {
  storage: docStorage(),
  historyLimit: 1,
});

export interface UiPrefs {
  /** 窄畫面時收起設定列 */
  foldBar: boolean;
  /** 窄畫面時收起格式按鈕 */
  foldIns: boolean;
}

function legacyUi(): UiPrefs {
  try {
    const raw = readLocal(LEGACY_UI_KEY);
    const ui = raw ? (JSON.parse(raw) as Record<string, unknown> | null) : null;
    return { foldBar: ui?.foldBar === true, foldIns: ui?.foldIns === true };
  } catch {
    return { foldBar: false, foldIns: false };
  }
}

/** 新版沒有收合狀態時，初始值取舊版的 */
const hasUi = readLocal(`${STORE_KEY}:preview`) !== null;
export const useUiPrefs = createPreviewStore<UiPrefs>(
  TOOL_ID,
  hasUi ? { foldBar: false, foldIns: false } : legacyUi(),
);

/* ---------- 操作 ---------- */

export const doc = (): TypesetData => useDoc.getState().data;
export const updateDoc = (recipe: (d: TypesetData) => void) => useDoc.getState().update(recipe);
