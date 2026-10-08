/**
 * 狀態：
 * - useNpcs：NPC 清單（自動存檔 `trpg-toolkit:coc-npc`、復原／重做）。新版還沒有存檔時讀舊版的
 *   `iklab_coc_npc_token_v1`（舊的不刪）；讀回時整理（壞掉的欄位用預設值）。
 * - useView：目前編輯的 NPC、輸出分頁（`trpg-toolkit:coc-npc:preview`，不列入復原：切換 NPC 不算一步）。
 */
import type { StateStorage } from 'zustand/middleware';
import { createPreviewStore, createToolStore } from '@/core/storage';
import {
  fromLegacy,
  initialData,
  LEGACY_KEY,
  type NpcData,
  type OutputKind,
  sanitizeNpcData,
  TOOL_ID,
} from './logic';

export const STORE_KEY = `trpg-toolkit:${TOOL_ID}`;
export const VIEW_KEY = `${STORE_KEY}:preview`;

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

/** 新版沒有存檔時一次讀好舊版（清單與目前的 NPC 都要用） */
const legacy = readLocal(STORE_KEY) === null ? fromLegacy(readLocal(LEGACY_KEY)) : null;

function npcStorage(): StateStorage {
  return {
    getItem: (name) => {
      const raw = readLocal(name);
      if (raw !== null) {
        try {
          const parsed = JSON.parse(raw) as { state?: { data?: unknown }; version?: number };
          const data = sanitizeNpcData(parsed?.state?.data);
          if (data) return JSON.stringify({ ...parsed, state: { ...parsed.state, data } });
        } catch {
          /* 壞掉：當作沒有存檔 */
        }
        return null;
      }
      return legacy ? JSON.stringify({ state: { data: legacy.data }, version: 1 }) : null;
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

export const useNpcs = createToolStore<NpcData>(TOOL_ID, initialData(), {
  storage: npcStorage(),
});

export interface ViewState {
  currentId: string | null;
  output: OutputKind;
}

export const useView = createPreviewStore<ViewState>(TOOL_ID, {
  currentId: readLocal(VIEW_KEY) === null ? (legacy?.currentId ?? null) : null,
  output: 'json',
});
