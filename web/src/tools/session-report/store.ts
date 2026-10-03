/**
 * 狀態：
 * - useReport：表單（自動存檔；讀回時用 restoreSettings 整理，損壞時當作第一次開啟）。
 * - usePreview：預覽文字、基準、有沒有手動編輯（自動存檔）；復原紀錄只放在記憶體（重新整理就沒有）。
 * 規格：docs/refactor/specs/session-report.md 3.8、3.9；自動存檔是新版的做法（5. D11）。
 */
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createToolStore } from '@/core/storage';
import { defaultSettings, type ReportSettings, restoreSettings } from './model';
import {
  applyGenerated,
  clearPreview,
  editPreview,
  emptyPreview,
  type PreviewState,
  pushHistory,
  redo,
  regenerate,
  undo,
} from './preview';

export const TOOL_ID = 'session-report';
const PREVIEW_KEY = `trpg-toolkit:${TOOL_ID}:preview`;

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readLocal(key: string): string | null {
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    local()?.setItem(key, value);
  } catch {
    /* 容量不足或被封鎖：只是不存 */
  }
}

function removeLocal(key: string): void {
  try {
    local()?.removeItem(key);
  } catch {
    /* 刪不掉就算了 */
  }
}

/** 表單的存檔：讀回時整理，損壞時刪掉、當作沒有存檔 */
function settingsStorage(): StateStorage {
  return {
    getItem: (name) => {
      const raw = readLocal(name);
      if (raw === null) return null;
      try {
        const parsed = JSON.parse(raw) as { state?: { data?: unknown }; version?: number };
        const data = restoreSettings(parsed?.state?.data);
        if (!data) throw new Error('broken');
        return JSON.stringify({ ...parsed, state: { ...parsed.state, data } });
      } catch {
        removeLocal(name);
        return null;
      }
    },
    setItem: (name, value) => {
      const ls = local();
      if (!ls) throw new Error('localStorage 無法使用');
      ls.setItem(name, value);
    },
    removeItem: (name) => removeLocal(name),
  };
}

export const useReport = createToolStore<ReportSettings>(TOOL_ID, defaultSettings(), {
  storage: settingsStorage(),
});

/* ---------- 預覽 ---------- */

interface SavedPreview {
  text: string;
  base: string;
  dirty: boolean;
}

function loadPreview(): PreviewState {
  const raw = readLocal(PREVIEW_KEY);
  if (!raw) return emptyPreview();
  try {
    const p = JSON.parse(raw) as Partial<SavedPreview> | null;
    if (!p || typeof p.text !== 'string' || typeof p.base !== 'string') throw new Error('broken');
    return { ...emptyPreview(), text: p.text, base: p.base, dirty: p.dirty === true };
  } catch {
    removeLocal(PREVIEW_KEY);
    return emptyPreview();
  }
}

export const usePreview = create<PreviewState>(() => loadPreview());

/* 預覽的文字與手動編輯狀態改變就存（復原紀錄不存） */
usePreview.subscribe((s, prev) => {
  if (s.text === prev.text && s.base === prev.base && s.dirty === prev.dirty) return;
  const saved: SavedPreview = { text: s.text, base: s.base, dirty: s.dirty };
  writeLocal(PREVIEW_KEY, JSON.stringify(saved));
});

const setPreview = (fn: (s: PreviewState) => PreviewState) =>
  usePreview.setState(fn(usePreview.getState()), true);

export const preview = {
  /** 輸入改變後的新團報（3.8） */
  generated: (next: string) => setPreview((s) => applyGenerated(s, next)),
  /** 使用者打字或插入裝飾 */
  edit: (text: string) => setPreview((s) => editPreview(s, text)),
  clear: () => setPreview(clearPreview),
  regenerate: (next: string) => setPreview((s) => regenerate(s, next)),
  /** 只記一步（快速切換列、讀入交接資料之前） */
  push: () => setPreview(pushHistory),
  undo: () => setPreview(undo),
  redo: () => setPreview(redo),
  /** 清除輸入：清空紀錄與手動編輯，預覽換成 next */
  reset: (next: string) => setPreview(() => ({ ...emptyPreview(), text: next, base: next })),
};

/* ---------- 表單的操作 ---------- */

export const updateReport = (recipe: (d: ReportSettings) => void) =>
  useReport.getState().update(recipe);

/** 改一個欄位 */
export const setField = <K extends keyof ReportSettings>(key: K, value: ReportSettings[K]) =>
  updateReport((d) => {
    d[key] = value;
  });
