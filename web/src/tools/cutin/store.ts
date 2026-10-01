/**
 * 狀態：
 * - useSettings：所有設定（自動存檔、復原／重做）。
 * - usePrefs：不列入復原的偏好（是否有進行中的編輯，給範本一覽的「繼續編輯」）。
 * - useUi：這次開頁的畫面狀態（一覽／編輯、匯出進度、結果、檢查清單上方的訊息、致命錯誤），不存檔。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import type { ExportResult } from '@/core/timeline';
import type { ExportProgress } from './exporter';
import { type CutinFormat, type CutinSettings, TOOL_ID } from './model';
import { DEFAULT_SETTINGS, normalizeSettings } from './settings';

export const useSettings = createToolStore<CutinSettings>(TOOL_ID, DEFAULT_SETTINGS, {
  version: 1,
  migrate: (persisted) => normalizeSettings(persisted),
});

/* 存檔可能缺欄位或被改壞：開頁時修正一次（沒有變化時不寫回），復原紀錄從空的開始 */
{
  const cur = useSettings.getState().data;
  const fixed = normalizeSettings(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useSettings.getState().replace(fixed);
  useSettings.temporal.getState().clear();
}

export interface CutinPrefs {
  /** 有進行中的編輯（套用過範本或開過分享連結） */
  started: boolean;
}

export const usePrefs = createPreviewStore<CutinPrefs>(TOOL_ID, { started: false });

export type Screen = 'gallery' | 'editor';

export interface ExportOutcome {
  result: ExportResult;
  url: string;
  format: CutinFormat;
  /** 匯出當時的用途 */
  target: CutinSettings['target'];
  /** 匯出當時的文字（切入名稱的範例詞） */
  text: string;
}

export type Notice = { tone: 'error' | 'info' | 'success'; message: string } | null;

export interface UiState {
  screen: Screen;
  exporting: { format: CutinFormat; progress: ExportProgress } | null;
  outcome: ExportOutcome | null;
  resultOpen: boolean;
  /** 上次匯出的大小（檢查清單：超過上限時一直顯示到下次匯出） */
  lastBytes: number | null;
  /** 檢查清單上方的一則訊息（匯出失敗、已複製、自動縮小） */
  notice: Notice;
  /** 自動縮小這次降了什麼（結果對話框裡顯示） */
  shrinkNote: string | null;
  fatal: Error | null;
}

export const useUi = create<UiState>(() => ({
  screen: 'gallery',
  exporting: null,
  outcome: null,
  resultOpen: false,
  lastBytes: null,
  notice: null,
  shrinkNote: null,
  fatal: null,
}));

export const setNotice = (notice: Notice): void => useUi.setState({ notice });

/** 設定的快速修改（Immer 寫法以外的整份換掉） */
export const setSettings = (fn: (s: CutinSettings) => CutinSettings): void => {
  const cur = useSettings.getState().data;
  const next = fn(cur);
  if (next !== cur) useSettings.getState().replace(next);
};
