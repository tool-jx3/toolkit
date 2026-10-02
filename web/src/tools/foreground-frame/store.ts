/**
 * 狀態：
 * - useFrame：設計本身（自動存檔、可復原；滑桿放開、文字欄離開才記一步，最多 150 步）
 * - usePreview：設定分頁、預覽背景、背景圖、格線、目前差分（自動存檔，不列入復原：第 7 節裁定，比照 G4）
 * - useSession：只在這次開頁有效的東西（選取、狀態列、圖片與字型讀好後重畫的計數）
 */
import { create } from 'zustand';
import { createAssetStore } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import { defaultState, type FrameState, normalizeState, TOOL_ID } from './model';

export type TabId = 'frame' | 'deco' | 'layers' | 'variants' | 'project';
export const TAB_IDS: readonly TabId[] = ['frame', 'deco', 'layers', 'variants', 'project'];
export type PreviewBg = 'scenery' | 'checker' | 'dark' | 'light' | 'image';
export const PREVIEW_BGS: readonly PreviewBg[] = ['scenery', 'checker', 'dark', 'light', 'image'];

export interface PreviewData {
  tab: TabId;
  bg: PreviewBg;
  grid: boolean;
  /** 預覽背景圖（資產 id；不畫進輸出） */
  bgAsset: string | null;
  /** 目前編輯與預覽的差分 */
  current: string | null;
}

export const DEFAULT_PREVIEW: PreviewData = {
  tab: 'frame',
  bg: 'scenery',
  grid: false,
  bgAsset: null,
  current: null,
};

function storageWorks(): boolean {
  try {
    const k = '__trpg-toolkit-probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/** 這個瀏覽器能不能自動存檔（localStorage 被封鎖時不能） */
export const AUTOSAVE_OK = typeof localStorage !== 'undefined' && storageWorks();

/** 開頁時有沒有上次的存檔（在建立 store 之前讀） */
export const HAD_SAVED = (() => {
  try {
    return AUTOSAVE_OK && localStorage.getItem(`trpg-toolkit:${TOOL_ID}`) !== null;
  } catch {
    return false;
  }
})();

export const useFrame = createToolStore<FrameState>(TOOL_ID, defaultState(), {
  version: 1,
  migrate: (persisted) => normalizeState(persisted),
  coalesceMs: 0,
  historyLimit: 150,
});

export const usePreview = createPreviewStore<PreviewData>(TOOL_ID, DEFAULT_PREVIEW);

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useFrame.getState().data;
  const fixed = normalizeState(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useFrame.getState().replace(fixed);
  useFrame.temporal.getState().clear();
  const p = usePreview.getState().data;
  const fp: PreviewData = {
    tab: TAB_IDS.includes(p.tab) ? p.tab : 'frame',
    bg: PREVIEW_BGS.includes(p.bg) ? p.bg : 'scenery',
    grid: !!p.grid,
    bgAsset: typeof p.bgAsset === 'string' && p.bgAsset ? p.bgAsset : null,
    current: typeof p.current === 'string' ? p.current : null,
  };
  if (JSON.stringify(fp) !== JSON.stringify(p)) usePreview.getState().replace(fp);
}

/** 滑桿、文字欄、色彩欄的「放開才記一步」 */
export const gesture = historyGesture(useFrame);

/** 改設定（一次變更＝一步復原，手勢中除外） */
export function edit(recipe: (d: FrameState) => void): void {
  useFrame.getState().update((d) => {
    recipe(d as FrameState);
  });
}

export const frameNow = (): FrameState => useFrame.getState().data;

/** 圖片資產庫（圖片圖層、自訂圖示、預覽背景圖） */
export const assets = createAssetStore(TOOL_ID);

export type StatusTone = 'info' | 'success' | 'warning' | 'danger' | 'progress';

export interface Session {
  /** 選取中的圖層 id 或 'indicator'（差分標籤） */
  selected: string | null;
  /** 選取中的裝飾 */
  decoSelected: string | null;
  status: { tone: StatusTone; text: string; id: number };
  /** 圖片解碼完、字型載入完時加 1（重畫預覽） */
  tick: number;
  /** 正在匯出 */
  exporting: boolean;
}

export const useSession = create<Session>(() => ({
  selected: null,
  decoSelected: null,
  status: { tone: 'info', text: '', id: 0 },
  tick: 0,
  exporting: false,
}));

export function setStatus(text: string, tone: StatusTone = 'info'): void {
  useSession.setState((s) => ({ status: { tone, text, id: s.status.id + 1 } }));
}

export const bump = (): void => useSession.setState((s) => ({ tick: s.tick + 1 }));

export const select = (id: string | null): void => useSession.setState({ selected: id });
export const selectDeco = (id: string | null): void => useSession.setState({ decoSelected: id });
