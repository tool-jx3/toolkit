/**
 * 狀態：
 * - useSettings：所有設定與角色清單（自動保存、復原／重做；圖片只記 id，原檔在 core/assets）。
 *   第一次開啟時是 8 個內建角色（規格 F15、5. D1）。
 * - useSession：這次開頁的狀態（目前的分頁、正在指定目標的玩家、解碼後的圖片、匯出中、預覽的指令）。
 */
import { create } from 'zustand';
import { createAssetStore } from '@/core/assets';
import { createToolStore } from '@/core/storage';
import { demoCharacters } from './demo';
import { createDefaultSettings, type Settings } from './model';
import { normalizeSettings, sanitize } from './sanitize';

export const TOOL_ID = 'character-select';
export const PROJECT_VERSION = 1;

export const assets = createAssetStore(TOOL_ID);

/** 預設值（內建角色） */
export function initialSettings(): Settings {
  const s = createDefaultSettings();
  s.characters = demoCharacters();
  sanitize(s);
  return s;
}

export const useSettings = createToolStore<Settings>(TOOL_ID, initialSettings(), {
  version: PROJECT_VERSION,
});

/* 存檔裡的值不合法時（被改壞、舊版本）修正一次 */
{
  const d = useSettings.getState().data;
  const fixed = normalizeSettings(d);
  if (JSON.stringify(fixed) !== JSON.stringify(d)) useSettings.getState().replace(fixed);
  useSettings.temporal.getState().clear();
}

/** 編輯設定：改完一律 sanitize（夾範圍、自動間距、目標與路徑） */
export function edit(recipe: (d: Settings) => void): void {
  useSettings.getState().update((d) => {
    recipe(d);
    sanitize(d);
  });
}

export const settingsNow = () => useSettings.getState().data;

export type TabId = 'characters' | 'appearance' | 'motion' | 'export';

/** 預覽的指令：restart＝從頭播放；rewind＝回到開頭並停住；seek＝停在某個時間（毫秒） */
export type PreviewCommand =
  | { kind: 'restart'; n: number }
  | { kind: 'rewind'; n: number }
  | { kind: 'seek'; time: number; n: number };

export interface Session {
  tab: TabId;
  /** 正在指定目標的玩家（0 起） */
  editingPlayer: number;
  /** 解碼後的圖片（圖片 id → 圖；讀不到時 null） */
  images: Record<string, ImageBitmap | null>;
  exporting: boolean;
  command: PreviewCommand | null;
  /** 字型載入完成的次數（預覽重畫用） */
  fontTick: number;
}

export const useSession = create<Session>(() => ({
  tab: 'characters',
  editingPlayer: 0,
  images: {},
  exporting: false,
  command: null,
  fontTick: 0,
}));

let commandSeq = 0;
/** 預覽：從頭播放 */
export const restartPreview = () =>
  useSession.setState({ command: { kind: 'restart', n: ++commandSeq } });
/** 預覽：回到開頭並停住 */
export const rewindPreview = () =>
  useSession.setState({ command: { kind: 'rewind', n: ++commandSeq } });
/** 預覽：停在 time 毫秒 */
export const seekPreview = (time: number) =>
  useSession.setState({ command: { kind: 'seek', time, n: ++commandSeq } });

export const setTab = (tab: TabId) => useSession.setState({ tab });
