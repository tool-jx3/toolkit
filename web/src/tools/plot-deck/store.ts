/**
 * 狀態：
 * - usePlot：劇本清單與目前的劇本（自動存檔 `trpg-toolkit:plot-deck`、復原／重做）。開頁時整理一次（sanitizeState）。
 * - usePrefs：畫面的選擇（分頁、卡片的顯示方式、卡片一覽的篩選與挑的卡、清單的搜尋；`…:preview`，不列入復原）。
 * - useUi：對話框（放大看、從清單挑；不存）。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore, sameData } from '@/core/storage';
import type { CardCat, DeckId } from './data';
import { initialState, type PlotDeckState, sanitizeState, TOOL_ID } from './model/project';

export const usePlot = createToolStore<PlotDeckState>(TOOL_ID, initialState, {
  migrate: (persisted) => sanitizeState(persisted),
});

/* 開頁時：壞掉或舊的資料整理成現在的樣子（不留成一步復原） */
{
  const raw = usePlot.getState().data;
  const clean = sanitizeState(raw);
  if (!sameData(raw, clean)) usePlot.getState().replace(clean);
  usePlot.temporal.getState().clear();
}

export type View = 'make' | 'library' | 'catalog';
export type DeskMode = 'cards' | 'rows';

export interface Prefs {
  view: View;
  deskMode: DeskMode;
  catalogDeck: DeckId;
  catalogCat: CardCat | 'all';
  catalogQuery: string;
  /** 卡片一覽挑的卡（種類 → 卡 id） */
  catalogPicks: Partial<Record<CardCat, string>>;
  libraryQuery: string;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  view: 'make',
  deskMode: 'cards',
  catalogDeck: 'modern',
  catalogCat: 'all',
  catalogQuery: '',
  catalogPicks: {},
  libraryQuery: '',
});

export interface UiState {
  /** 放大看的欄 */
  zoom: string | null;
  /** 從清單挑的欄 */
  picker: string | null;
  /** 剛換掉的欄（短暫標示） */
  flash: string[];
  /** 「變更題材與氣氛」的對話框 */
  mtOpen: boolean;
}

export const useUi = create<UiState>(() => ({
  zoom: null,
  picker: null,
  flash: [],
  mtOpen: false,
}));
export const setUi = (patch: Partial<UiState>): void => useUi.setState(patch);
