/**
 * 狀態與動作：
 * - useDoc：內容、大小、QR code 設定、樣式、中間的圖（自動儲存、可以復原；文字欄從聚焦到離開、滑桿放開才記一步）；
 * - usePrefs：分頁、匯出的格式與倍率、檔名（自動儲存，不列入復原）；
 * - 中間的圖存在 IndexedDB 的資產庫（core/assets），狀態只記 id 與大小。
 */
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import { type DocState, docAssetIds, initialDoc, normalizeDoc } from './model';

export const TOOL_ID = 'qr-maker';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useDoc = createToolStore<DocState>(TOOL_ID, initialDoc(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeDoc(persisted),
  historyLimit: 100,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useDoc.getState().data;
  const fixed = normalizeDoc(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

export const assets = createAssetStore(TOOL_ID);

/** 滑桿、文字欄：放開（離開）才記一步 */
export const gesture = historyGesture(useDoc);

export const docNow = (): DocState => useDoc.getState().data;

/** 一次變更＝一步復原（手勢中除外；0.4 秒內連續的變更合成一步） */
export function edit(recipe: (d: DocState) => void): void {
  useDoc.getState().update((d) => {
    recipe(d as DocState);
  });
}

/** 復原／重做（先結束進行中的手勢） */
export function historyStep(kind: 'undo' | 'redo'): void {
  useDoc.endGesture();
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/** 換掉整份內容（開啟專案檔、重設；可以復原） */
export function resetAll(next: DocState = initialDoc()): void {
  useDoc.getState().replace(next);
}

/** 目前的狀態與復原紀錄用到的圖（開頁的整理不刪它們） */
export const referencedImages = (): Set<string> => referencedAssetIds(useDoc, docAssetIds);

/* ---------- 不列入復原的設定 ---------- */

export type TabId = 'content' | 'style' | 'image' | 'export';
export const TAB_IDS: readonly TabId[] = ['content', 'style', 'image', 'export'];
export const EXPORT_FORMATS = ['png', 'jpeg', 'webp', 'svg'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const EXPORT_SCALES = [1, 2, 3, 4] as const;

export interface Prefs {
  tab: TabId;
  format: ExportFormat;
  scale: number;
  /** 檔名（不含副檔名） */
  fileName: string;
}

export const initialPrefs = (): Prefs => ({
  tab: 'content',
  format: 'png',
  scale: 1,
  fileName: 'qr',
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const fixed: Prefs = {
    tab: TAB_IDS.includes(p.tab) ? p.tab : 'content',
    format: (EXPORT_FORMATS as readonly string[]).includes(p.format) ? p.format : 'png',
    scale: (EXPORT_SCALES as readonly number[]).includes(p.scale) ? p.scale : 1,
    fileName: typeof p.fileName === 'string' ? p.fileName.slice(0, 80) : 'qr',
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);
