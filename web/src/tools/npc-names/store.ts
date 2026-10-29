/**
 * 狀態：
 * - useNames：設定與目前這一批（自動存檔 `trpg-toolkit:npc-names`、復原／重做——不小心換掉了一批，可以復原回上一批）。
 * - useHistory：最近產生的紀錄（`trpg-toolkit:npc-names:preview`，不列入復原）。
 */
import { createPreviewStore, createToolStore } from '@/core/storage';
import { type HistoryEntry, initialState, sanitizeState, TOOL_ID } from './logic';

export const useNames = createToolStore(TOOL_ID, initialState, {
  migrate: (persisted) => sanitizeState(persisted),
});

export const useHistory = createPreviewStore<{ history: HistoryEntry[] }>(TOOL_ID, {
  history: [],
});
