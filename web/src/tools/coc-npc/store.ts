/**
 * 狀態：
 * - useNpcs：NPC 清單（自動存檔 `trpg-toolkit:coc-npc`、復原／重做）。新版還沒有存檔時讀舊版的
 *   `iklab_coc_npc_token_v1`（舊的不刪）；讀回時整理（壞掉的欄位用預設值）。
 * - useView：目前編輯的 NPC、輸出分頁（`trpg-toolkit:coc-npc:preview`，不列入復原：切換 NPC 不算一步）。
 */
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import type { Characteristic } from '@/core/coc';
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

const viewSaved = readLocal(VIEW_KEY) !== null;

export const useView = createPreviewStore<ViewState>(TOOL_ID, {
  currentId: viewSaved ? null : (legacy?.currentId ?? null),
  output: 'json',
});

/*
 * 搬舊存檔時，舊版選的 NPC 立刻寫進新版的存檔（規格 F30）：清單一改就存進新版、之後不再讀舊版，
 * 目前的 NPC 不能只放在初始值裡（否則重新整理後變成清單第一個）。
 */
if (!viewSaved && legacy?.currentId) useView.getState().patch({ currentId: legacy.currentId });

/**
 * 最近一次「全部擲骰」跳過（算式看不懂）的項目（不存檔）。按鈕、快捷鍵 R、擲骰並複製都經過
 * actions 的 rollAll，所以三條路的說明一致；畫面上只列出現在仍然看不懂的項目（規格 F13）。
 */
export const useRollNotice = create<{ npcId: string | null; stats: Characteristic[] }>(() => ({
  npcId: null,
  stats: [],
}));
