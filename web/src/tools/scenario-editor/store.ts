/**
 * 劇本排版台的狀態：
 * - useDoc：目前作品的原稿（createToolStore：不寫 localStorage〔作品存在 IndexedDB，見 library.ts〕、
 *   復原／重做 60 步、0.7 秒內的連續變更合成一步，F019）。
 * - useUi：這次開頁的介面狀態（選取、目標儲存格、對話框、狀態列、縮放、分頁結果…）。
 * - usePrefs：記在瀏覽器的介面偏好（頁面一覽的開關與縮圖寬、設定欄保持開著；不列入復原）。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { allBlocks, findBlock } from './model/blocks';
import { blankDoc, keepNotEmpty } from './model/doc';
import type { Block, Doc } from './model/types';

export const TOOL_ID = 'scenario-editor';
export const HISTORY_LIMIT = 60;
export const HISTORY_COALESCE_MS = 700;

export const useDoc = createToolStore<Doc>(TOOL_ID, blankDoc(), {
  persist: false,
  historyLimit: HISTORY_LIMIT,
  coalesceMs: HISTORY_COALESCE_MS,
});

export const doc = (): Doc => useDoc.getState().data;

/** 修改原稿（Immer）：之後本文一定至少有一個段落、每一格至少有一個段落 */
export function edit(recipe: (d: Doc) => void): void {
  useDoc.getState().update((draft) => {
    const d = draft as Doc;
    recipe(d);
    keepNotEmpty(d);
  });
}

/** 修改一個段落（找不到就不動） */
export function editBlock(id: string, recipe: (b: Block, d: Doc) => void): void {
  edit((d) => {
    const f = findBlock(d, id);
    if (f) recipe(f.b, d);
  });
}

export function blockById(id: string | null | undefined): Block | null {
  return findBlock(doc(), id)?.b ?? null;
}

/* ---------- 介面狀態 ---------- */

export type StatusTone = 'ok' | 'warn' | 'err' | 'info';

export interface CellTarget {
  /** 表格段落的 id */
  tbl: string;
  r: number;
  c: number;
}

export interface Layout {
  /** 每一頁放了哪些段落（本文的 id） */
  pages: string[][];
  /** 段落（含巢狀；換頁＝結束的那一頁）→ 頁（0 起算） */
  pageOf: Record<string, number>;
  /** 超出所在頁版心的 NPC 卡 */
  over: string[];
}

export type SideTab = 'block' | 'pages' | 'doc';
export type OutputKind = 'print' | 'export' | 'pdf';

export interface UiState {
  sel: string[];
  /** 選取的頁面圖片（2026-10；與段落的選取互斥） */
  pimgSel: string | null;
  /** Shift 範圍選取的起點 */
  anchor: string | null;
  /** 正在文字欄輸入的段落 */
  focusId: string | null;
  /** 目標儲存格（F053） */
  cell: CellTarget | null;
  /** 對話框 */
  popEdit: string | null;
  flowEdit: string | null;
  npcEdit: string | null;
  tableWide: string | null;
  preview: string | null;
  output: OutputKind | null;
  libraryOpen: boolean;
  /** hold：欄位還錯著時的錯誤（自動儲存的訊息不蓋掉它；7.3） */
  status: { text: string; tone: StatusTone; at: number; hold?: string } | null;
  view: 'all' | 'pages';
  zoom: number;
  /** 頁面分頁勾選的頁（0 起算） */
  pageSel: number[];
  layout: Layout;
  /** 「複製區塊」記下的段落 */
  clip: Block[] | null;
  /** 紙面閃一下的段落 */
  flash: { id: string; n: number } | null;
  /** 文字欄捲到這個段落 */
  reveal: { id: string; n: number } | null;
  /** 文字欄聚焦到這個段落（游標位置；-1＝結尾） */
  focusReq: { id: string; at: number; n: number; field?: 'cap' } | null;
  sideTab: SideTab;
  /** 窄畫面：目前顯示的欄 */
  pane: 'source' | 'paper' | 'side';
  /** 頁面數（分頁之後） */
  total: number;
}

const EMPTY_LAYOUT: Layout = { pages: [[]], pageOf: {}, over: [] };

export const useUi = create<UiState>(() => ({
  sel: [],
  pimgSel: null,
  anchor: null,
  focusId: null,
  cell: null,
  popEdit: null,
  flowEdit: null,
  npcEdit: null,
  tableWide: null,
  preview: null,
  output: null,
  libraryOpen: false,
  status: null,
  view: 'all',
  zoom: 1,
  pageSel: [],
  layout: EMPTY_LAYOUT,
  clip: null,
  flash: null,
  reveal: null,
  focusReq: null,
  sideTab: 'block',
  pane: 'source',
  total: 1,
}));

export const ui = (): UiState => useUi.getState();

/* 選取的頁面圖片不在原稿裡了（復原、刪除頁面…）：取消選取（同原作 renderProps；7.5 的 T2） */
useDoc.subscribe((s) => {
  const p = useUi.getState().pimgSel;
  if (p && !(s.data.pageImgs ?? []).some((x) => x.id === p)) useUi.setState({ pimgSel: null });
});
export const setUi = (p: Partial<UiState>): void => useUi.setState(p);

let seq = 0;
const next = () => ++seq;

/** 狀態列（F020） */
export function say(text: string, tone: StatusTone = 'ok'): void {
  useUi.setState({ status: { text, tone, at: Date.now() } });
}

/**
 * 欄位還是錯的時候的錯誤訊息（例如手冊的編號、變數的名稱）：自動儲存的「已自動儲存」不蓋掉它，
 * 其他操作的訊息照常取代。key 是哪一個欄位；欄位改對、離開或不見時呼叫 releaseStatus（7.3）。
 */
export function holdStatus(key: string, text: string): void {
  useUi.setState({ status: { text, tone: 'err', at: Date.now(), hold: key } });
}

/** 放開 holdStatus（訊息留著，之後的自動儲存可以蓋掉它） */
export function releaseStatus(key: string): void {
  const s = ui().status;
  if (s?.hold === key) useUi.setState({ status: { text: s.text, tone: s.tone, at: s.at } });
}

/** 狀態列正顯示著欄位的錯誤（自動儲存的訊息不要蓋掉） */
export const statusHeld = (): boolean => !!ui().status?.hold;

/** 選取段落（紙面捲過去並閃一下） */
export function select(
  ids: readonly string[],
  opts: { scroll?: boolean; anchor?: string | null } = {},
): void {
  const uniq = [...new Set(ids)];
  const first = uniq[0] ?? null;
  useUi.setState((s) => ({
    sel: uniq,
    pimgSel: uniq.length ? null : s.pimgSel,
    anchor: opts.anchor === undefined ? (uniq.length === 1 ? first : s.anchor) : opts.anchor,
    flash: opts.scroll !== false && first ? { id: first, n: next() } : s.flash,
  }));
}

/** 取消選取（段落與頁面圖片） */
export function clearSelection(): void {
  useUi.setState({ sel: [], anchor: null, pimgSel: null });
}

/** 選取頁面圖片（段落的選取取消；scroll：紙面捲過去並閃一下） */
export function selectPimg(id: string, scroll = true): void {
  useUi.setState((s) => ({
    sel: [],
    anchor: null,
    focusId: null,
    pimgSel: id,
    flash: scroll ? { id, n: next() } : s.flash,
  }));
}

export function revealSource(id: string): void {
  useUi.setState({ reveal: { id, n: next() } });
}

export function focusBlock(id: string, at = -1, field?: 'cap'): void {
  useUi.setState({ focusReq: { id, at, n: next(), field } });
}

export function flashBlock(id: string): void {
  useUi.setState({ flash: { id, n: next() } });
}

/**
 * 選取的段落（依原稿順序，找不到的略過）。外面那段也選取著的段落裡的段落不重複算（外面那段已經含它）
 */
export function selectedBlocks(): Block[] {
  const ids = new Set(ui().sel);
  if (!ids.size) return [];
  const all = allBlocks(doc());
  const inner = new Set<string>();
  const mark = (bs: readonly Block[] | undefined) => {
    for (const b of bs ?? []) {
      inner.add(b.id);
      mark(b.kids);
    }
  };
  for (const b of all) if (ids.has(b.id)) mark(b.kids);
  return all.filter((b) => ids.has(b.id) && !inner.has(b.id));
}

/* ---------- 偏好（記在瀏覽器） ---------- */

export interface Prefs {
  overview: boolean;
  overviewMode: 'thumbs' | 'heads';
  thumbW: number;
  /** 沒有選取時設定欄也保持開著（F082） */
  sidePinned: boolean;
  /** 匯出閱覽 HTML 的形式：page＝逐頁（A4）、flow＝不分頁的一張（F285） */
  exportShape: 'page' | 'flow';
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  overview: false,
  overviewMode: 'thumbs',
  thumbW: 130,
  sidePinned: false,
  exportShape: 'page',
});
