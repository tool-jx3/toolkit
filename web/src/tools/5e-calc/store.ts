/**
 * 狀態：
 * - useCalc：隊伍、怪物、快速怪物、點數購買（自動儲存 `trpg-toolkit:5e-calc`、復原／重做、專案檔）；讀存檔時先整理。
 * - usePrefs：不列入復原的偏好（目前的分頁）。
 */
import type { StateStorage } from 'zustand/middleware';
import type { Cr } from '@/core/srd5/cr';
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

interface PersistApi {
  persist?: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void };
}

/** 存檔讀進來之後才做（之後才讀進來的舊存檔不會蓋掉） */
function afterHydration(store: unknown, fn: () => void): void {
  const p = (store as PersistApi).persist;
  if (!p || p.hasHydrated()) {
    fn();
    return;
  }
  const off = p.onFinishHydration(() => {
    off();
    fn();
  });
}

/**
 * 網址帶 `?cr=`（F22）：切到快速怪物數值的那一級（不列入復原）。main.tsx 在第一次畫面之前呼叫，
 * 所以快速怪物分頁不會先把存檔裡的 CR 寫回網址；存檔讀進來之後才套用，網址的值優先。
 */
export function applyCrFromUrl(cr: Cr | null): void {
  if (!cr) return;
  afterHydration(useCalc, () => {
    const t = useCalc.temporal.getState();
    t.pause();
    useCalc.getState().update((d) => {
      d.quick.cr = cr;
    });
    t.resume();
  });
  afterHydration(usePrefs, () => usePrefs.getState().patch({ tab: 'monster' }));
}
