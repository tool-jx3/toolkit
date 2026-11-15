/**
 * 狀態：
 * - usePlot：我的劇本（清單）與目前的劇本（自動存檔 `trpg-toolkit:plot-deck`、復原／重做）。開頁時整理一次（sanitizeState），
 *   這一版的卡組裡找不到的卡記在 startupMissing。
 * - usePrefs：畫面的選擇（分頁、卡片的排法、卡庫的篩選與放進去的卡、清單的搜尋；`…:preview`，不列入復原）。
 * - useUi：對話框（放大看、自己挑、改題材與氣氛；不存）與打開它們的元素（關閉後焦點還給它）。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore, sameData } from '@/core/storage';
import type { CardCat, DeckId } from './data';
import { initialState, type PlotDeckState, sanitizeState, TOOL_ID } from './model/project';

/** 開頁時讀到、這一版的卡組裡找不到的卡（已經拿掉；App 開頁時通知一次，通知完清空） */
export const startupMissing: string[] = [];

export const usePlot = createToolStore<PlotDeckState>(TOOL_ID, initialState, {
  migrate: (persisted) => sanitizeState(persisted, startupMissing),
});

/* 開頁時：壞掉或舊的資料整理成現在的樣子（不留成一步復原） */
{
  const raw = usePlot.getState().data;
  const clean = sanitizeState(raw, startupMissing);
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
  /** 卡庫的題材、氣氛篩選（'all'＝不限；標了「全部都合」的卡也算合） */
  catalogMission: string;
  catalogTone: string;
  catalogQuery: string;
  /** 卡庫放進去的卡（種類 → 卡 id） */
  catalogPicks: Partial<Record<CardCat, string>>;
  libraryQuery: string;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  view: 'make',
  deskMode: 'cards',
  catalogDeck: 'modern',
  catalogCat: 'all',
  catalogMission: 'all',
  catalogTone: 'all',
  catalogQuery: '',
  catalogPicks: {},
  libraryQuery: '',
});

export interface UiState {
  /** 放大看的欄 */
  zoom: string | null;
  /** 自己挑的欄 */
  picker: string | null;
  /** 剛換掉的欄（短暫標示） */
  flash: string[];
  /** 「改題材與氣氛」的對話框 */
  mtOpen: boolean;
}

export const useUi = create<UiState>(() => ({
  zoom: null,
  picker: null,
  flash: [],
  mtOpen: false,
}));
export const setUi = (patch: Partial<UiState>): void => useUi.setState(patch);

export type DialogKind = 'zoom' | 'picker' | 'mt';
const openers: Partial<Record<DialogKind, HTMLElement | null>> = {};
const FOCUSABLE = 'button, a[href], input, select, textarea, [tabindex]';

/**
 * 打開對話框，記住打開它的元素（`from`；沒給時用目前的焦點）。對話框裡的按鈕（例如放大看裡的「自己挑」）
 * 與不能聚焦的元素（點卡片的空白處）不記，關閉時改用 openerOf 的備用位置。
 */
export function openDialog(
  kind: DialogKind,
  patch: Partial<UiState>,
  from?: EventTarget | null,
): void {
  const el =
    from instanceof HTMLElement
      ? from
      : typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  openers[kind] = el?.matches(FOCUSABLE) && !el.closest('[role="dialog"]') ? el : null;
  setUi(patch);
}

/** 關閉後焦點要回去的元素：打開它的元素還在頁面上就是它，不然照順序找備用的（跳過停用的按鈕） */
export function openerOf(kind: DialogKind, fallbacks: readonly string[] = []): HTMLElement | null {
  const el = openers[kind];
  if (el?.isConnected) return el;
  if (typeof document === 'undefined') return null;
  for (const sel of fallbacks) {
    const hit = [...document.querySelectorAll<HTMLElement>(sel)].find(
      (x) => !x.closest('[role="dialog"]') && !(x as HTMLButtonElement).disabled,
    );
    if (hit) return hit;
  }
  return null;
}
