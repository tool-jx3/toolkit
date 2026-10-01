/**
 * 「OBS 疊加」分頁的展示狀態：設定（可復原，示範手勢）＋預覽狀態（不列入復原）。不存檔（展示用）。
 */
import { create } from 'zustand';
import type { TextOutlineKind } from '@/core/css';
import type { FontValue } from '@/core/fonts';
import { createPreviewStore, createToolStore } from '@/core/storage';
import type { Anchor, PreviewBackground } from '@/ui';
import type { DemoSceneKind } from './scenes';

export interface ObsDemoSettings {
  room: string;
  color: string;
  font: FontValue;
  outline: TextOutlineKind;
  threshold: number;
  paper: boolean;
  brackets: boolean;
  buttons: 'hover' | 'always' | 'never';
  count: number;
  diceOnly: boolean;
  anchor: Anchor;
  bounce: boolean;
  dim: boolean;
  hideWhenAway: boolean;
  tachieUser: string;
  fileName: string;
}

export const OBS_DEMO_DEFAULTS: ObsDemoSettings = {
  room: '',
  color: '#e8604c',
  font: { source: 'google', family: 'Noto Sans TC', weight: 700 },
  outline: 'soft',
  threshold: 25,
  paper: false,
  brackets: true,
  buttons: 'hover',
  count: 3,
  diceOnly: false,
  anchor: 'bottom-left',
  bounce: true,
  dim: false,
  hideWhenAway: false,
  tachieUser: '123456789012345678',
  fileName: '示範',
};

/** 設定：可復原（滑桿用 historyGesture 放開才記一步） */
export const useObsSettings = createToolStore<ObsDemoSettings>('_gallery-obs', OBS_DEMO_DEFAULTS, {
  persist: false,
  coalesceMs: 0,
  historyLimit: 150,
});

export interface ObsDemoPreview {
  scene: DemoSceneKind;
  background: PreviewBackground;
  before: boolean;
  hover: boolean;
}

/** 預覽狀態：不列入復原 */
export const useObsPreview = createPreviewStore<ObsDemoPreview>(
  '_gallery-obs',
  { scene: 'character', background: { kind: 'checker' }, before: false, hover: false },
  { persist: false },
);

/** 量到的來源大小（狀態條示範用） */
export const useMeasured = create<{ size: { width: number; height: number } | null }>(() => ({
  size: null,
}));
