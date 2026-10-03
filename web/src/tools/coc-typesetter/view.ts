/**
 * 畫面的暫時狀態（不存檔）：窄畫面顯示哪一區、編輯區的分頁、排版的結果（狀態列），
 * 以及文字欄與紙面之間的呼叫（游標同步、點紙面跳到內文）。
 */
import { create } from 'zustand';
import type { PaperId } from './model';

export type Pane = 'edit' | 'preview';
export type SubTab = 'text' | 'meta';

export interface LayoutStatus {
  chars: number;
  chapters: number;
  scenes: number;
  pages: number;
  over: number;
  paper: PaperId;
}

interface ViewState {
  pane: Pane;
  sub: SubTab;
  status: LayoutStatus | null;
  error: string | null;
}

export const useView = create<ViewState>(() => ({
  pane: 'edit',
  sub: 'text',
  status: null,
  error: null,
}));

export const setView = (p: Partial<ViewState>) => useView.setState(p);

/** 文字欄提供的動作（Editor 掛載時換成真的） */
export const editorApi = {
  /** 跳到第 n 行（0 起算）：切到內文、游標放在行首、捲動並閃一下 */
  jumpToLine: (_n: number): void => undefined,
  /** 目前游標所在的行 */
  caretLine: (): number => 0,
  /** 文字欄有沒有焦點 */
  focused: (): boolean => false,
  /** 文字欄捲回最上面 */
  scrollTop: (): void => undefined,
};

/** 紙面提供的動作（Preview 掛載時換成真的） */
export const previewApi = {
  /** 游標所在的行對應的區塊加外框；scroll：看不到時捲過去 */
  syncCaret: (_line: number, _scroll: boolean): void => undefined,
  /** 有排到一半的變更就立刻排好；回傳排好的 .book（還沒排過時 null） */
  flush: (): HTMLElement | null => null,
  /** 紙面捲回最上面 */
  scrollTop: (): void => undefined,
};

/** 封面與概要的標題欄 */
export const metaApi = {
  focusTitle: (): void => undefined,
};
