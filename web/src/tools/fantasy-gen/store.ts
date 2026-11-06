/**
 * 狀態：
 * - useGen：設定、目前的結果、我的清單、自訂產生器（自動存檔 `trpg-toolkit:fantasy-gen`、復原／重做）。
 *   讀的地方一律經過 sanitizeState（舊版或手改過的存檔）。
 * - useHistory：最近產生的紀錄（`trpg-toolkit:fantasy-gen:preview`，不列入復原）。
 */
import { createPreviewStore, createToolStore } from '@/core/storage';
import { type HistoryEntry, initialState, sanitizeState, TOOL_ID } from './logic';

export const useGen = createToolStore(TOOL_ID, initialState, {
  migrate: (persisted) => sanitizeState(persisted),
});

export const useHistory = createPreviewStore<{ history: HistoryEntry[] }>(TOOL_ID, {
  history: [],
});
