/**
 * 狀態：
 * - useCalc：隊伍、怪物、快速怪物、點數購買（自動儲存 `trpg-toolkit:5e-calc`、復原／重做、專案檔）；讀存檔時先整理。
 * - usePrefs：不列入復原的偏好（目前的分頁）。
 */
import type { StateStorage } from 'zustand/middleware';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { type CalcData, DATA_VERSION, initialData, sanitizeData, type Tab, TOOL_ID } from './model';

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function calcStorage(): StateStorage {
  return {
    getItem: (name) => {
      let raw: string | null = null;
      try {
        raw = local()?.getItem(name) ?? null;
      } catch {
        return null;
      }
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as { state?: { data?: unknown } };
        const data = sanitizeData(parsed?.state?.data);
        if (data) return JSON.stringify({ ...parsed, state: { ...parsed.state, data } });
      } catch {
        /* 壞掉：當作沒有存檔 */
      }
      return null;
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

export const useCalc = createToolStore<CalcData>(TOOL_ID, initialData(), {
  version: DATA_VERSION,
  storage: calcStorage(),
});

export const calc = (): CalcData => useCalc.getState().data;

export function edit(recipe: (d: CalcData) => void): void {
  useCalc.getState().update((d) => recipe(d as CalcData));
}

/** 一定算新的一步 */
export function step(recipe: (d: CalcData) => void): void {
  useCalc.beginGesture();
  edit(recipe);
  useCalc.endGesture();
}

export const usePrefs = createPreviewStore<{ tab: Tab }>(TOOL_ID, { tab: 'encounter' });
