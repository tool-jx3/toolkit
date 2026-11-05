/**
 * 狀態：
 * - useDoc：地圖本身（自動存到 localStorage、可以復原）。一筆、一次拖曳、一次放開滑桿各算一步。
 * - usePrefs：不列入復原的偏好（筆刷大小、畫的地形、素材分類、匯出的寬與對象）；自動存。
 * - useEditor：只在這一頁的狀態（工具、選取、編輯用／公開預覽、對話框），不存。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { DEFAULT_EXPORT_WIDTH } from '../draw/export';
import type { Audience } from '../draw/render';
import type { AssetCategory } from '../model/assets';
import { normalizeDoc } from '../model/normalize';
import { sampleDoc } from '../model/samples';
import {
  type MapSizeId,
  type Paint,
  type PathKind,
  RANGES,
  type SelRef,
  type WorldDoc,
} from '../model/types';

export const TOOL_ID = 'world-map';
/**
 * 存檔格式版本。1：第一批。2：路線多了旅程的設定（`travelMode`、`dailyKm`、`difficulty`、`access`、`simpleCalc`）、
 * 地圖的尺寸多了 16:9、正方形、直式（`cols`／`rows`；2026-11-05 第二批）。版本 1 的資料讀進來一律經過 normalizeDoc（少了的欄位補預設）。
 */
export const DATA_VERSION = 2;

export const starterDoc = (): WorldDoc => sampleDoc('continent');

/** 寫入 localStorage 延後一點（連續變更只寫最後一次）；離開頁面或切到背景時立刻寫 */
function deferredLocal(onError: (e: unknown) => void, delayMs = 350) {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const base = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  };
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const s = base();
    for (const [k, v] of pending) s?.setItem(k, v);
    pending.clear();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => {
      try {
        flush();
      } catch (e) {
        onError(e);
      }
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        try {
          flush();
        } catch (e) {
          onError(e);
        }
      }
    });
  }
  return {
    getItem: (k: string) => pending.get(k) ?? base()?.getItem(k) ?? null,
    setItem: (k: string, v: string) => {
      pending.set(k, v);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          flush();
        } catch (e) {
          onError(e);
        }
      }, delayMs);
    },
    removeItem: (k: string) => {
      pending.delete(k);
      base()?.removeItem(k);
    },
    flush,
  };
}

let persistError: ((e: unknown) => void) | null = null;
/** 寫不進 localStorage（容量不足、被封鎖）時通知（Editor 設定；只通知一次） */
export const docStorage = deferredLocal((e) => persistError?.(e));

export function onPersistError(fn: ((e: unknown) => void) | null): void {
  persistError = fn;
}

export const useDoc = createToolStore<WorldDoc>(TOOL_ID, starterDoc(), {
  version: DATA_VERSION,
  historyLimit: 100,
  coalesceMs: 0,
  storage: docStorage,
  migrate: (persisted) => normalizeDoc(persisted) ?? starterDoc(),
  onPersistError: (e) => persistError?.(e),
});

/* 讀進來的存檔整理一次（壞掉時換回範本）；這一步不算復原紀錄 */
{
  const data = useDoc.getState().data;
  const fixed = normalizeDoc(data);
  if (!fixed) useDoc.getState().replace(starterDoc());
  else if (JSON.stringify(fixed) !== JSON.stringify(data)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

export const docNow = (): WorldDoc => useDoc.getState().data;

export type LeftTab = 'land' | 'routes' | 'assets' | 'finish';

export interface Prefs {
  brush: number;
  paint: Paint;
  category: AssetCategory | 'all';
  tab: LeftTab;
  exportWidth: number;
  exportAudience: Audience;
  /** 範本對話框裡「空白的海／自動產生」的尺寸 */
  mapSize: MapSizeId;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  brush: RANGES.brush.def,
  paint: 1,
  category: 'all',
  tab: 'land',
  exportWidth: DEFAULT_EXPORT_WIDTH,
  exportAudience: 'player',
  mapSize: 'wide',
});

export type ToolId =
  | 'select'
  | 'hand'
  | 'brush'
  | 'erase'
  | 'relief'
  | 'region'
  | PathKind
  | 'note'
  | 'asset';

export const LINE_TOOLS: readonly ToolId[] = ['region', 'wall', 'river', 'road', 'sea', 'border'];
export const BRUSH_TOOLS: readonly ToolId[] = ['brush', 'erase', 'relief'];

export interface EditorState {
  tool: ToolId;
  /** 配置素材工具的素材 */
  asset: string;
  sel: SelRef | null;
  audience: Audience;
  /** 畫到一半的線的點數（畫布在 controller 裡） */
  draftCount: number;
  zoomPct: number;
  exportOpen: boolean;
  samplesOpen: boolean;
  query: string;
}

export const useEditor = create<EditorState>(() => ({
  tool: 'brush',
  asset: 'town',
  sel: null,
  audience: 'gm',
  draftCount: 0,
  zoomPct: 100,
  exportOpen: false,
  samplesOpen: false,
  query: '',
}));

export const setEditor = (patch: Partial<EditorState>): void => useEditor.setState(patch);
