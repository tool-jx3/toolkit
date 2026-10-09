/**
 * 狀態：
 * - useRules：房規表本身（自動存檔 `trpg-toolkit:house-rules`、復原／重做、專案檔）。讀回時整理（壞掉的欄位用預設值、
 *   新版加的規則補上照規則書的值）。原作在別的網域，瀏覽器存檔不搬移。
 * - useView：不列入復原的畫面狀態（`trpg-toolkit:house-rules:preview`）：收合的分類、輸出的格式與選項。
 */
import type { StateStorage } from 'zustand/middleware';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { DATA_VERSION, type HouseRulesData, initialData, sanitizeData, TOOL_ID } from './model';
import type { PngLayoutKind, PngTheme } from './render';

export const STORE_KEY = `trpg-toolkit:${TOOL_ID}`;

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** 讀存檔時先整理（壞掉的存檔當作沒有存檔） */
function rulesStorage(): StateStorage {
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

export const useRules = createToolStore<HouseRulesData>(TOOL_ID, initialData(), {
  version: DATA_VERSION,
  storage: rulesStorage(),
});

export type OutputFormat = 'png' | 'txt' | 'md';

export interface ViewState {
  /** 收合的分類（`區塊:分類` → true） */
  collapsed: Record<string, boolean>;
  format: OutputFormat;
  theme: PngTheme;
  /** null＝還沒選過（第一次依畫面寬度決定） */
  layout: PngLayoutKind | null;
  notes: boolean;
  legend: boolean;
}

export const useView = createPreviewStore<ViewState>(TOOL_ID, {
  collapsed: {},
  format: 'png',
  theme: 'dark',
  layout: null,
  notes: true,
  legend: true,
});

/** 第一次（還沒選過版面）時：畫面寬 720 px 以下用直式 */
export function effectiveLayout(layout: PngLayoutKind | null): PngLayoutKind {
  if (layout) return layout;
  const narrow =
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(max-width: 720px)').matches;
  return narrow ? 'narrow' : 'wide';
}

export const collapseKey = (secId: string, catId: string) => `${secId}:${catId}`;
