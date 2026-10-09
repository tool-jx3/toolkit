/**
 * 狀態（規格 3.3）：
 * - useSheets：所有角色卡（自動存檔 `trpg-toolkit:coc-sheet`、復原／重做）。新版還沒有存檔時讀舊版的
 *   `coc7_charasheet`、`coc7_autosave`（舊的不刪），搬來的內容立刻寫進新版的存檔。
 * - useView：目前的角色卡、分頁、顯示比例、PNG 的頁面（`trpg-toolkit:coc-sheet:preview`，不列入復原）。
 * - assets：頭像圖片（IndexedDB `trpg-toolkit:tool:coc-sheet:assets`），角色卡只存 id。
 */
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import type { ImageSaveFailure } from '@/core/image';
import { createPreviewStore, createToolStore } from '@/core/storage';
import {
  LEGACY_AUTOSAVE_KEY,
  LEGACY_SAVES_KEY,
  type LegacyMigration,
  migrateLegacy,
} from './legacy';
import {
  DATA_VERSION,
  initialData,
  type PngPages,
  portraitIds,
  type SheetData,
  sanitizeData,
  TOOL_ID,
} from './model';

export const STORE_KEY = `trpg-toolkit:${TOOL_ID}`;
export const VIEW_KEY = `${STORE_KEY}:preview`;

function local(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

export function readLocal(key: string): string | null {
  try {
    return local()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export const assets = createAssetStore(TOOL_ID);

/** 頭像存不進瀏覽器（只在這次開啟時有效）的原因 */
export const usePortraitWarning = create<{ reason: ImageSaveFailure | null }>(() => ({
  reason: null,
}));

function readLegacy(): LegacyMigration | null {
  if (readLocal(STORE_KEY) !== null) return null;
  const saves = readLocal(LEGACY_SAVES_KEY);
  const auto = readLocal(LEGACY_AUTOSAVE_KEY);
  if (!saves && !auto) return null;
  try {
    return migrateLegacy(saves, auto);
  } catch {
    return null;
  }
}

/** 新版沒有存檔時一次讀好舊版（角色卡、目前的角色卡、頭像都要用） */
const legacy = readLegacy();

/* 頭像先放進資產庫（記憶體裡立刻就有，IndexedDB 之後寫好） */
if (legacy)
  for (const p of legacy.portraits)
    void assets
      .put(p.assetId, new Blob([p.bytes as Uint8Array<ArrayBuffer>], { type: p.mime }))
      .then((r) => {
        if (!r.persisted) usePortraitWarning.setState({ reason: r.reason ?? 'unavailable' });
      });

function sheetStorage(): StateStorage {
  return {
    getItem: (name) => {
      const raw = readLocal(name);
      if (raw !== null) {
        try {
          const parsed = JSON.parse(raw) as { state?: { data?: unknown }; version?: number };
          const data = sanitizeData(parsed?.state?.data);
          if (data) return JSON.stringify({ ...parsed, state: { ...parsed.state, data } });
        } catch {
          /* 壞掉：當作沒有存檔 */
        }
        return null;
      }
      return legacy
        ? JSON.stringify({ state: { data: { sheets: legacy.sheets } }, version: DATA_VERSION })
        : null;
    },
    setItem: (name, value) => {
      const ls = local();
      if (!ls) throw new Error('localStorage 無法使用');
      ls.setItem(name, value);
    },
    removeItem: (name) => {
      try {
        local()?.removeItem(name);
      } catch {
        /* 刪不掉就算了 */
      }
    },
  };
}

export const useSheets = createToolStore<SheetData>(TOOL_ID, initialData(), {
  version: DATA_VERSION,
  storage: sheetStorage(),
});

export type EditorTab = 'info' | 'stats' | 'skills' | 'combat' | 'story';

export interface ViewState {
  currentId: string | null;
  tab: EditorTab;
  /** 顯示比例：'fit'＝配合寬度 */
  zoom: number | 'fit';
  pngPages: PngPages;
  pngScale: number;
}

const viewSaved = readLocal(VIEW_KEY) !== null;

export const useView = createPreviewStore<ViewState>(TOOL_ID, {
  currentId: null,
  tab: 'info',
  zoom: 'fit',
  pngPages: '1',
  pngScale: 2,
});

/** 搬舊存檔後的說明（不存檔：只在搬過來的那次開啟時顯示） */
export const useMigrationNotice = create<{
  shown: boolean;
  titles: string[];
  skipped: { title: string; items: string[] }[];
}>(() => ({ shown: false, titles: [], skipped: [] }));

if (legacy) {
  /*
   * 搬來的角色卡與目前的角色卡立刻寫進新版的存檔（之後不再讀舊版；id 也固定下來）。
   * setState 不改內容：不會多一步復原。
   */
  useSheets.setState({});
  if (!viewSaved || !useView.getState().data.currentId)
    useView.getState().patch({ currentId: legacy.currentId });
  useMigrationNotice.setState({
    shown: true,
    titles: legacy.sheets.map((s) => s.title),
    skipped: legacy.skipped,
  });
}

/**
 * 開頁的整理：刪掉以前留下、沒有角色卡用到的頭像（目前的狀態＋復原歷史都算有用到；
 * 這次開頁放進來的不刪——assets.gcStale）
 */
export async function collectPortraits(): Promise<void> {
  try {
    await assets.gcStale(referencedAssetIds(useSheets, portraitIds));
  } catch {
    /* IndexedDB 不能用：不清 */
  }
}
