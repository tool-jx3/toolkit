/**
 * 狀態：
 * - useMix：混音（軌、音量、參數、總音量、匯出設定）。自動存檔 `trpg-toolkit:ambience-mixer`、可以復原／重做。
 * - useSaved：我的組合（`trpg-toolkit:ambience-mixer:preview`，不列入復原）。
 * - useRuntime：播放中、每一軌的準備狀態、定時停止、匯出的進度與結果、對話框（不存檔、不列入復原）。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import {
  type ExportSettings,
  initialState,
  type MixState,
  type SynthTrack,
  sanitizeState,
  TOOL_ID,
} from './model';

/**
 * 存檔的版本：2（2026-10-29：匯出設定加了格式與 MP3 的位元率）。1 版的存檔照讀（沒有的欄位用預設值，見 sanitizeExport）。
 */
export const MIX_STORE_VERSION = 2;

export const useMix = createToolStore<MixState>(TOOL_ID, initialState, {
  version: MIX_STORE_VERSION,
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

/**
 * 一軌的準備狀態：loading（第一次合成／解碼，音檔在排隊時也是）、updating（換參數，先播舊的）、ready；
 * 音檔沒有載入的原因：missing（找不到）、error（解不開）、tooLong（超過 15 分鐘）、overTotal（加起來超過 30 分鐘）
 */
export type TrackStatus =
  | 'loading'
  | 'updating'
  | 'ready'
  | 'missing'
  | 'error'
  | 'tooLong'
  | 'overTotal';

/** 音檔沒有載入（也不會混進匯出）的原因 */
export type FileProblem = 'missing' | 'error' | 'tooLong' | 'overTotal';
export const isFileProblem = (s: TrackStatus | undefined): s is FileProblem =>
  s === 'missing' || s === 'error' || s === 'tooLong' || s === 'overTotal';

export interface ExportResult {
  blob: Blob;
  name: string;
  /** 匯出時的設定（和目前的不同時結果就清掉） */
  settings: ExportSettings;
  format: 'mp3' | 'wav';
  /** MP3 的位元率（WAV 時 0） */
  kbps: number;
  bytes: number;
  seconds: number;
  sampleRate: number;
  channels: number;
  peakDb: number;
  ms: number;
  /** 沒有混進去的音檔（找不到、解不開、太長、超過總長度） */
  skipped: { key: string; name: string; reason: FileProblem }[];
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
  /** 正在讀取（檢查長度、解碼）的音檔名稱 */
  reading: string | null;
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
  reading: null,
}));

export const mixNow = (): MixState => useMix.getState().data;
