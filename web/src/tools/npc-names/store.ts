/**
 * 狀態：
 * - useNames：設定與目前這一批（自動存檔 `trpg-toolkit:npc-names`、復原／重做——不小心換掉了一批，可以復原回上一批）。
 * - useHistory：最近產生的紀錄（`trpg-toolkit:npc-names:preview`，不列入復原）。
 * - useSearch：查名字的字與篩選（不存檔、不列入復原：只是查一查，重新整理後回到空白）。
 */
import { create } from 'zustand';
import { type CorpusSearchFilters, DEFAULT_SEARCH_FILTERS } from '@/core/names/corpus';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { type HistoryEntry, initialState, sanitizeState, TOOL_ID } from './logic';

export const useNames = createToolStore(TOOL_ID, initialState, {
  migrate: (persisted) => sanitizeState(persisted),
});

export const useHistory = createPreviewStore<{ history: HistoryEntry[] }>(TOOL_ID, {
  history: [],
});

/** 查名字一次顯示幾筆（按「顯示更多」再多這麼多） */
export const SEARCH_PAGE = 50;

export interface SearchState {
  /** 輸入欄的字 */
  draft: string;
  /** 送出（按「搜尋」或 Enter）的字 */
  query: string;
  filters: CorpusSearchFilters;
  /** 顯示到第幾筆 */
  limit: number;
}

export const useSearch = create<SearchState>(() => ({
  draft: '',
  query: '',
  filters: DEFAULT_SEARCH_FILTERS,
  limit: SEARCH_PAGE,
}));
