/**
 * 狀態：
 * - useSettings：編輯區的格式樹、自訂色、效果的顏色（自動保存 `trpg-toolkit:discord-color`、復原／重做、專案檔）。
 *   讀回時整理（model.ts 的 sanitizeSettings），壞掉的欄位用預設值。
 * - useView：預覽主題、套用到文字／背景（`trpg-toolkit:discord-color:preview`，不列入復原）。
 * 原作的自訂色存在原作網站的 localStorage（不同網域），不搬移。
 */
import type { StateStorage } from 'zustand/middleware';
import { createPreviewStore, createToolStore } from '@/core/storage';
import {
  initialSettings,
  initialView,
  type Settings,
  sanitizeSettings,
  sanitizeView,
  TOOL_ID,
  type ViewSettings,
} from './model';

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 讀回時把 data 整理過；寫入照常（寫不進去時由 createToolStore 記下錯誤） */
function sanitizingStorage(clean: (raw: unknown) => unknown): StateStorage {
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
        const data = clean(parsed?.state?.data);
        return data ? JSON.stringify({ ...parsed, state: { ...parsed.state, data } }) : null;
      } catch {
        return null;
      }
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

export const useSettings = createToolStore<Settings>(TOOL_ID, initialSettings(), {
  storage: sanitizingStorage(sanitizeSettings),
});

export const useView = createPreviewStore<ViewSettings>(TOOL_ID, initialView(), {
  storage: sanitizingStorage(sanitizeView),
});

/** 套用格式、效果：一定是新的一步復原（不和剛才的打字合併） */
export function commitFormat(doc: Settings['doc']): void {
  useSettings.beginGesture();
  useSettings.getState().patch({ doc });
  useSettings.endGesture();
}
