/**
 * 狀態：設定與目前這一批（自動存檔 `trpg-toolkit:npc-names`、復原／重做——換了一批不小心，可以復原回上一批）。
 */
import { createToolStore } from '@/core/storage';
import { initialState, sanitizeState, TOOL_ID } from './logic';

export const useNames = createToolStore(TOOL_ID, initialState, {
  migrate: (persisted) => sanitizeState(persisted),
});
