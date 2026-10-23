/**
 * 狀態：
 * - useSettings：所有設定（歌詞、逐句調整、風格、畫面、匯出；音樂與背景圖只記資產庫的 id）——自動儲存、復原／重做。
 * - usePreview：不列入復原的（舞台的預覽底、自己存的配色預設、顯示避開區域）。
 * - useSession：這次開頁的狀態（解碼後的音樂、背景圖、匯出中、字型、框選避開區域）。
 * - assets：音樂與背景圖（IndexedDB）；player：音樂播放（Web Audio）。
 */
import { create } from 'zustand';
import { createAssetStore } from '@/core/assets';
import { createAudioPlayer, type PcmAudio } from '@/core/audio';
import type { LyricRegion } from '@/core/lyricfx';
import { createPreviewStore, createToolStore } from '@/core/storage';
import type { LyricUserPreset } from '@/ui';
import {
  defaultSettings,
  normalizeSettings,
  PROJECT_VERSION,
  type Settings,
  TOOL_ID,
} from './model';

export { PROJECT_VERSION, TOOL_ID };

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

export interface PreviewPrefs {
  /** 自己存的配色預設（依風格） */
  presets: Record<string, LyricUserPreset[]>;
  /** 在預覽上顯示避開區域 */
  showRegion: boolean;
  /** 舞台的預覽底（只供預覽；背景圖不記） */
  stage: { kind: 'checker' | 'dark' | 'light' | 'color'; color: string };
}

export const usePreview = createPreviewStore<PreviewPrefs>(TOOL_ID, {
  presets: {},
  showRegion: true,
  stage: { kind: 'dark', color: '#808080' },
});

export type MediaState = 'none' | 'loading' | 'ready' | 'missing' | 'error';
export type TabId = 'lyrics' | 'style' | 'canvas' | 'export';

export interface LoadedAudio {
  id: string;
  pcm: PcmAudio;
  duration: number;
}

export interface Session {
  audio: LoadedAudio | null;
  audioState: MediaState;
  /** 背景圖（解碼好的） */
  bg: ImageBitmap | null;
  bgId: string | null;
  bgState: MediaState;
  exporting: boolean;
  recording: boolean;
  /** 字型載入完成的次數（量字的快取作廢、重排用） */
  fontTick: number;
  fontFailed: boolean;
  tab: TabId;
  /** 框選避開區域中（pending＝畫好、還沒按完成的範圍） */
  regionEditing: boolean;
  regionPending: LyricRegion | null;
  /** 預覽的時間（沒有音樂時的時鐘；有音樂時看 player） */
  loopTime: number;
  /** 選取的句（預覽上點選、或逐句清單的「調整」；F76）：不列入復原、不存檔 */
  selected: string | null;
  /** 從預覽選取時加 1：逐句清單捲到那一句 */
  revealTick: number;
}

export const useSession = create<Session>(() => ({
  audio: null,
  audioState: 'none',
  bg: null,
  bgId: null,
  bgState: 'none',
  exporting: false,
  recording: false,
  fontTick: 0,
  fontFailed: false,
  tab: 'lyrics',
  regionEditing: false,
  regionPending: null,
  loopTime: 0,
  selected: null,
  revealTick: 0,
}));

export const setTab = (tab: TabId) => useSession.setState({ tab });
