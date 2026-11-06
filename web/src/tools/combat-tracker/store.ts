/**
 * 狀態：
 * - useCombat：參戰者、回合、輪數、選項、自訂狀態（自動儲存 `trpg-toolkit:combat-tracker`、復原／重做、專案檔）。
 *   讀存檔時先整理（model.sanitizeData）。同一個瀏覽器開了兩個戰鬥追蹤的分頁時，一邊改了另一邊跟著更新
 *   （storage 事件；跟著更新不列入復原、會清掉那一邊的復原紀錄），從 5e 速查計算送來的參戰者才不會被舊分頁的自動儲存蓋掉。
 * - useUi：不存檔的畫面狀態（勾選的參戰者、加狀態的對話框）。
 */

import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createToolStore } from '@/core/storage';
import { type CombatData, DATA_VERSION, initialData, sanitizeData, TOOL_ID } from './model';

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 讀存檔時先整理（壞掉的存檔當作沒有存檔） */
function combatStorage(): StateStorage {
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
        const parsed = JSON.parse(raw) as { state?: { data?: unknown }; version?: number };
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

export const useCombat = createToolStore<CombatData>(TOOL_ID, initialData(), {
  version: DATA_VERSION,
  storage: combatStorage(),
});

export const data = (): CombatData => useCombat.getState().data;

/** 改一下資料（一步復原；連續 0.4 秒內的變更合成一步，共用 store 的規則） */
export function edit(recipe: (d: CombatData) => void): void {
  useCombat.getState().update((d) => recipe(d as CombatData));
}

/** 一定算新的一步（緊接著的兩個動作不合併：例如加入參戰者、下一位） */
export function step(recipe: (d: CombatData) => void): void {
  useCombat.beginGesture();
  edit(recipe);
  useCombat.endGesture();
}

/** 另一個分頁改了存檔：讀進來（不列入復原、清掉這一邊的復原紀錄） */
export function applyRemote(newValue: string | null): boolean {
  if (!newValue) return false;
  try {
    const parsed = JSON.parse(newValue) as { state?: { data?: unknown } };
    const next = sanitizeData(parsed?.state?.data);
    if (!next) return false;
    const t = useCombat.temporal.getState();
    t.pause();
    useCombat.getState().replace(next);
    t.resume();
    t.clear();
    return true;
  } catch {
    return false;
  }
}

let syncing = false;
/** 開始跟著別的分頁更新（App 掛上時呼叫一次） */
export function startTabSync(): () => void {
  if (syncing || typeof window === 'undefined') return () => {};
  syncing = true;
  const on = (e: StorageEvent) => {
    if (e.key === useCombat.storageKey && e.storageArea === local()) applyRemote(e.newValue);
  };
  window.addEventListener('storage', on);
  return () => {
    syncing = false;
    window.removeEventListener('storage', on);
  };
}

export interface UiState {
  /** 勾選的參戰者（傷害與治療、狀態一起套用） */
  selected: string[];
  /** 加狀態的對話框：要加給誰（null＝關閉）、編輯哪一個狀態 */
  condFor: { id: string; condId: string | null } | null;
}

export const useUi = create<UiState>(() => ({ selected: [], condFor: null }));

export function toggleSelected(id: string, on?: boolean): void {
  useUi.setState((s) => {
    const has = s.selected.includes(id);
    const want = on ?? !has;
    if (want === has) return s;
    return { selected: want ? [...s.selected, id] : s.selected.filter((x) => x !== id) };
  });
}

/** 清掉已經不在清單裡的勾選 */
export function pruneSelected(ids: readonly string[]): void {
  const keep = new Set(ids);
  useUi.setState((s) => {
    const next = s.selected.filter((x) => keep.has(x));
    return next.length === s.selected.length ? s : { selected: next };
  });
}
