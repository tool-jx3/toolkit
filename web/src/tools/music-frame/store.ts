/**
 * 狀態：
 * - useSettings：所有設定（曲目資訊、設計、動態、歌詞文字、匯出設定；封面與音樂只記資產庫的 id）——自動保存、復原／重做。
 * - useSession：這次開頁的狀態（處理好的封面、解碼後的音樂與波形、匯出中、字型、目前的分頁）。
 * - assets：封面圖片與音樂檔（IndexedDB）；player：音樂播放（Web Audio）。
 */
import { create } from 'zustand';
import { createAssetStore } from '@/core/assets';
import { createAudioPlayer, type PcmAudio } from '@/core/audio';
import { createToolStore } from '@/core/storage';
import { defaultSettings, normalizeSettings, type Settings, TOOL_ID } from './model';
import type { CoverArt } from './render';

export { TOOL_ID };
export const PROJECT_VERSION = 1;

export const assets = createAssetStore(TOOL_ID);
export const player = createAudioPlayer();

export const useSettings = createToolStore<Settings>(TOOL_ID, defaultSettings(), {
  version: PROJECT_VERSION,
  migrate: (persisted) => normalizeSettings(persisted),
});

/* 存檔裡的值不合法時（被改壞、舊版本）修正一次 */
{
  const d = useSettings.getState().data;
  const fixed = normalizeSettings(d);
  if (JSON.stringify(fixed) !== JSON.stringify(d)) {
    useSettings.temporal.getState().pause();
    useSettings.getState().replace(fixed);
    useSettings.temporal.getState().resume();
  }
  useSettings.temporal.getState().clear();
}

export const settingsNow = (): Settings => useSettings.getState().data;

/** 改設定（拖滑桿等連續的變更 0.4 秒內算一步） */
export function edit(recipe: (d: Settings) => void): void {
  useSettings.getState().update(recipe);
}

/** 一次完成的動作（按鈕、換檔案）：自己算一步 */
export function step(recipe: (d: Settings) => void): void {
  if (useSettings.inGesture()) {
    edit(recipe);
    return;
  }
  useSettings.beginGesture();
  try {
    edit(recipe);
  } finally {
    useSettings.endGesture();
  }
}

export interface LoadedAudio {
  /** 資產庫的 id */
  id: string;
  pcm: PcmAudio;
  duration: number;
  /** 整首的波形峰值（220 段） */
  peaks: Float32Array;
}

export type TabId = 'track' | 'design' | 'motion' | 'lyrics' | 'export';

export type MediaState = 'none' | 'loading' | 'ready' | 'missing' | 'error';

export interface Session {
  /** 目前的封面（示範封面或處理好的圖） */
  art: CoverArt | null;
  /** 封面的 id（處理好的是哪一張；示範封面是 null） */
  artId: string | null;
  coverState: MediaState;
  audio: LoadedAudio | null;
  audioState: MediaState;
  /** 匯出中（逐格或即時錄影） */
  exporting: boolean;
  /** 即時錄影中（預覽就是錄影的畫面） */
  recording: boolean;
  /** 字型載入完成的次數（量字的快取作廢用） */
  fontTick: number;
  /** 主要字型載入失敗 */
  fontFailed: boolean;
  tab: TabId;
}

export const useSession = create<Session>(() => ({
  art: null,
  artId: null,
  coverState: 'none',
  audio: null,
  audioState: 'none',
  exporting: false,
  recording: false,
  fontTick: 0,
  fontFailed: false,
  tab: 'track',
}));

export const setTab = (tab: TabId) => useSession.setState({ tab });
