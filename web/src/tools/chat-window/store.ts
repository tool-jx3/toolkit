/**
 * 聊天視窗產生器的狀態：
 * - useChat：設定（自動存檔＋復原；滑桿放開、文字欄改完才記一步，最多 150 步）。
 * - usePreview：預覽分頁、預覽背景、目前的設定分頁（自動存檔，不列入復原）。
 * - useStatus：狀態列。
 * - useDrag：拖曳滑桿中（拖曳途中不改變設定列的顯示／隱藏）。
 */
import { create } from 'zustand';
import {
  createPreviewStore,
  createToolStore,
  historyGesture,
  resetToolStore,
} from '@/core/storage';
import type { PreviewBackground } from '@/ui';
import type { PreviewTab } from './samples';
import type { ChatSettings } from './settings';
import { initialSettings, normalizeChatSettings } from './templates';

export const TOOL_ID = 'chat-window';
export const PROJECT_VERSION = 1;

export const useChat = createToolStore<ChatSettings>(TOOL_ID, initialSettings(), {
  version: 1,
  coalesceMs: 0,
  historyLimit: 150,
  migrate: (persisted) => normalizeChatSettings(persisted),
});

/* 開頁時讀回的存檔：補齊、修正（範圍外、型別不符、未知的範本），不算一步復原 */
useChat.setState({ data: normalizeChatSettings(useChat.getState().data) });
useChat.temporal.getState().clear();

export type SettingsTab = 'basic' | 'window' | 'message' | 'text' | 'motion' | 'obs';
export const SETTINGS_TABS: readonly SettingsTab[] = [
  'basic',
  'window',
  'message',
  'text',
  'motion',
  'obs',
];

export interface PreviewState {
  tab: PreviewTab;
  background: PreviewBackground;
  settingsTab: SettingsTab;
}

export const PREVIEW_DEFAULTS: PreviewState = {
  tab: 'main',
  background: { kind: 'scene' },
  settingsTab: 'basic',
};

export const usePreview = createPreviewStore<PreviewState>(TOOL_ID, PREVIEW_DEFAULTS);
{
  /* 存檔裡的值不合法時回到預設 */
  const d = usePreview.getState().data;
  const fixed: PreviewState = {
    tab: d.tab === 'secret' ? 'secret' : 'main',
    background:
      d.background && ['scene', 'checker', 'dark', 'light'].includes(d.background.kind)
        ? { kind: d.background.kind }
        : PREVIEW_DEFAULTS.background,
    settingsTab: SETTINGS_TABS.includes(d.settingsTab) ? d.settingsTab : 'basic',
  };
  usePreview.setState({ data: fixed });
}

/* ---------- 狀態列 ---------- */

export type StatusTone = 'info' | 'success' | 'warning' | 'danger';
export interface StatusState {
  tone: StatusTone;
  text: string;
  /** 每次設定都不同，讓同樣的訊息也會重新朗讀 */
  seq: number;
}

export const useStatus = create<StatusState>(() => ({ tone: 'info', text: '', seq: 0 }));

export function setStatus(text: string, tone: StatusTone = 'info'): void {
  useStatus.setState((s) => ({ text, tone, seq: s.seq + 1 }));
}

/* ---------- 設定的寫入 ---------- */

/** 改一個設定（每次呼叫記一步復原，手勢中除外） */
export function setSetting<K extends keyof ChatSettings>(key: K, value: ChatSettings[K]): void {
  useChat.getState().update((d) => {
    (d as ChatSettings)[key] = value;
  });
}

export const setter =
  <K extends keyof ChatSettings>(key: K) =>
  (value: ChatSettings[K]): void =>
    setSetting(key, value);

/** 拖曳滑桿中（拖曳途中不改變設定列的顯示／隱藏，放開才更新） */
export const useDrag = create<{ dragging: boolean }>(() => ({ dragging: false }));

const g = historyGesture(useChat);

/** 滑桿、文字欄的「放開才記一步」 */
export const gesture = {
  begin: g.begin,
  commit: g.commit,
  /** 滑桿拖曳中的變更 */
  slide:
    <A extends unknown[]>(fn: (...args: A) => void) =>
    (...args: A): void => {
      if (!useDrag.getState().dragging) useDrag.setState({ dragging: true });
      g.live(fn)(...args);
    },
  /** 滑桿放開（或數字欄確定） */
  release: (): void => {
    g.commit();
    queueMicrotask(() => {
      if (useDrag.getState().dragging) useDrag.setState({ dragging: false });
    });
  },
};

/** 開啟專案檔、全部重來：取代全部設定並清空復原紀錄 */
export function replaceAll(data: ChatSettings): void {
  useChat.getState().replace(data);
  useChat.temporal.getState().clear();
}

export function resetAll(): void {
  resetToolStore(useChat);
  usePreview.getState().reset();
}
