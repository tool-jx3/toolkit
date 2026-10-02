/**
 * 狀態：設定（自動存檔＋復原，放開滑桿才記一步）、預覽設定（自動存檔、不列入復原）、狀態列與介面暫存。
 */
import { useRef, useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import type { PreviewBackground } from '@/ui';
import { DEFAULT_SETTINGS, type MbSettings, normalizeSettings, TOOL_ID } from './settings';
import { isKnownTemplate } from './templates';

export const useSettings = createToolStore<MbSettings>(TOOL_ID, DEFAULT_SETTINGS, {
  version: 1,
  migrate: (persisted) => normalizeSettings(persisted, isKnownTemplate),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時修正一次（沒有變化時不寫回），復原紀錄從空的開始 */
{
  const cur = useSettings.getState().data;
  const fixed = normalizeSettings(cur, isKnownTemplate);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useSettings.getState().replace(fixed);
  useSettings.temporal.getState().clear();
}

/** 放開才記一步（滑桿、文字欄、調色盤） */
export const gesture = historyGesture(useSettings);

export type PortraitShape = 'full' | 'half';

export interface MbPreview {
  /** 套用前（F55） */
  before: boolean;
  /** 預覽背景（F57） */
  background: PreviewBackground;
  /** 範例立繪形狀（F58） */
  shape: PortraitShape;
  /** 模擬滑鼠在頁面上（OBS 的「互動」視窗） */
  hover: boolean;
  /** 上次開著的設定分頁（F77） */
  tab: string;
  /** 範本選單目前選的（還沒套用的）範本 */
  pick: string;
}

export const PREVIEW_DEFAULTS: MbPreview = {
  before: false,
  background: { kind: 'scene' },
  shape: 'full',
  hover: false,
  tab: 'basic',
  pick: 'classic',
};

export const usePreview = createPreviewStore<MbPreview>(TOOL_ID, PREVIEW_DEFAULTS);

/** 把預覽設定修正成合法的值（存檔、專案檔） */
export function normalizePreview(raw: unknown): MbPreview {
  const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<MbPreview>;
  const kinds = ['checker', 'dark', 'light', 'scene'];
  const bg = p.background && kinds.includes(p.background.kind) ? p.background : { kind: 'scene' };
  return {
    before: typeof p.before === 'boolean' ? p.before : false,
    background: { kind: bg.kind } as PreviewBackground,
    shape: p.shape === 'half' ? 'half' : 'full',
    hover: typeof p.hover === 'boolean' ? p.hover : false,
    tab: typeof p.tab === 'string' ? p.tab : PREVIEW_DEFAULTS.tab,
    pick: typeof p.pick === 'string' && isKnownTemplate(p.pick) ? p.pick : PREVIEW_DEFAULTS.pick,
  };
}

{
  const cur = usePreview.getState().data;
  const fixed = normalizePreview(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) usePreview.getState().replace(fixed);
}

/* ---------- 狀態列（F74） ---------- */

export type StatusTone = 'info' | 'success' | 'warning' | 'danger';

export interface StatusState {
  tone: StatusTone;
  text: string;
}

export const useStatus = create<StatusState>(() => ({ tone: 'info', text: '' }));

export const setStatus = (text: string, tone: StatusTone = 'info'): void =>
  useStatus.setState({ text, tone });

/* ---------- 「確定後」的設定 ---------- */

/**
 * 依設定出現／隱藏的控制項在**放開滑桿時**才更新（規格 4.1）：拖曳中回傳拖曳前的設定，手勢結束後才換成新的。
 */
export function useCommittedSettings(): MbSettings {
  const last = useRef(useSettings.getState().data);
  return useSyncExternalStore(
    (cb) => {
      const a = useSettings.subscribe(cb);
      const b = useSettings.temporal.subscribe(cb);
      return () => {
        a();
        b();
      };
    },
    () => {
      if (!useSettings.inGesture()) last.current = useSettings.getState().data;
      return last.current;
    },
  );
}
