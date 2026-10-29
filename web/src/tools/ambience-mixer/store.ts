/**
 * 狀態：
 * - useMix：混音（軌、音量、參數、總音量、匯出設定）。自動存檔 `trpg-toolkit:ambience-mixer`、可以復原／重做。
 * - useSaved：我的組合（`trpg-toolkit:ambience-mixer:preview`，不列入復原）。
 * - useRuntime：播放中、每一軌的準備狀態、定時停止、匯出的進度與結果、對話框（不存檔、不列入復原）。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { initialState, type MixState, type SynthTrack, sanitizeState, TOOL_ID } from './model';

export const useMix = createToolStore<MixState>(TOOL_ID, initialState, {
  migrate: (persisted) => sanitizeState(persisted),
});

/* 存檔是任何人都能改的輸入（也可能是之後的版本存的）：開頁時整理一次（不算一步復原） */
useMix.setState({ data: sanitizeState(useMix.getState().data) });
useMix.temporal.getState().clear();

export interface SavedMix {
  id: string;
  name: string;
  master: number;
  tracks: SynthTrack[];
}

/** 我的組合最多幾個 */
export const MAX_SAVED = 30;

export const useSaved = createPreviewStore<{ mixes: SavedMix[] }>(TOOL_ID, { mixes: [] });

export type TrackStatus = 'loading' | 'updating' | 'ready' | 'missing' | 'error';

export interface ExportResult {
  blob: Blob;
  name: string;
  bytes: number;
  seconds: number;
  sampleRate: number;
  channels: number;
  peakDb: number;
  ms: number;
}

export interface Runtime {
  playing: boolean;
  status: Record<string, TrackStatus>;
  /** 定時停止的時間（Date.now() 的毫秒；null＝沒有） */
  timerEnd: number | null;
  /** 定時停止選的分鐘數（0＝關） */
  timerMinutes: number;
  exporting: boolean;
  /** 0～1 */
  progress: number;
  stage: string;
  result: ExportResult | null;
  exportError: string;
  shareOpen: boolean;
}

export const useRuntime = create<Runtime>(() => ({
  playing: false,
  status: {},
  timerEnd: null,
  timerMinutes: 0,
  exporting: false,
  progress: 0,
  stage: '',
  result: null,
  exportError: '',
  shareOpen: false,
}));

export const mixNow = (): MixState => useMix.getState().data;
