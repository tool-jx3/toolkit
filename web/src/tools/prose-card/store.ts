/**
 * 狀態與動作：
 * - useDoc：版面、文字、本文（格式化文字）、背景、照片（自動儲存、可以復原；0.4 秒內連續的變更算一步）；
 * - usePrefs：分頁、輸出倍率、「我的顏色」（自動儲存，不列入復原）；
 * - 背景圖片與照片存在 IndexedDB 的資產庫（core/assets），狀態只記 id；自己加的字型存在 core/fonts 的字型庫。
 */
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import type { RichDoc } from '@/core/richtext';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { COLOR_PRESETS_MAX } from '@/ui';
import { initialState, normalizeState, type ProseState, stateAssetIds } from './model';

export const TOOL_ID = 'prose-card';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useDoc = createToolStore<ProseState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useDoc.getState().data;
  const fixed = normalizeState(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

export const docNow = (): ProseState => useDoc.getState().data;

/** 一次變更（0.4 秒內連續的變更合成一步復原） */
export function edit(recipe: (d: ProseState) => void): void {
  useDoc.getState().update((d) => {
    recipe(d as ProseState);
  });
}

export function setBody(doc: RichDoc): void {
  edit((d) => {
    d.body = doc;
  });
}

/** 復原／重做 */
export function historyStep(kind: 'undo' | 'redo'): void {
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/** 換掉整份內容（重設、開啟專案檔；可以復原） */
export function resetAll(next: ProseState = initialState()): void {
  useDoc.getState().replace(next);
}

/* ---------- 不列入復原的設定 ---------- */

export type TabId = 'text' | 'bg' | 'page';
export const TAB_IDS: readonly TabId[] = ['text', 'bg', 'page'];

export interface Prefs {
  tab: TabId;
  /** 輸出倍率（1＝1200 × 1600、2＝2400 × 3200） */
  scale: 1 | 2;
  /** 「我的顏色」：文字顏色、螢光筆 */
  textPresets: string[];
  highlightPresets: string[];
}

export const initialPrefs = (): Prefs => ({
  tab: 'text',
  scale: 2,
  textPresets: [],
  highlightPresets: [],
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

const presetList = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((c): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c))
            .map((c) => c.toLowerCase()),
        ),
      ].slice(0, COLOR_PRESETS_MAX)
    : [];

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const fixed: Prefs = {
    tab: TAB_IDS.includes(p.tab) ? p.tab : 'text',
    scale: p.scale === 1 ? 1 : 2,
    textPresets: presetList(p.textPresets),
    highlightPresets: presetList(p.highlightPresets),
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 目前的狀態與復原紀錄用到的圖（開頁的整理時保留） */
export function referencedImages(): Set<string> {
  return referencedAssetIds(useDoc, stateAssetIds);
}
