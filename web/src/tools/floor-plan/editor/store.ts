/**
 * 狀態：
 * - useProject：地圖本身（自動存到 localStorage、可以復原）。拖曳、打字、連按方向鍵各算一步（手勢）。
 * - usePrefs：畫面與匯出的偏好（格線、下一層、隱藏線索的顯示、素材分頁、匯出設定）；自動存，但不列入復原。
 * - useEditor：只在這一頁的狀態（工具、選取、GM／PL 檢視、剪貼簿…），不存。
 */

import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { isAsset } from '../model/assets';
import type { RoomPresetId } from '../model/catalog';
import type { CompatReport } from '../model/compat';
import type { ExportSettings } from '../model/exportPlan';
import { normalizeProject } from '../model/normalize';
import type { ShareMode } from '../model/share';
import type { OpeningKind, Project, SelRef, WallKind } from '../model/types';
import { getTemplate, instantiateTemplate } from '../templates';

export const TOOL_ID = 'floor-plan';
/**
 * 存檔格式版本。2：文字多了圓標（`badge`，2026-10）。版本 1 的存檔與專案檔不必轉換（少了 badge 就是一般文字），
 * 讀進來一律經過 normalizeProject。
 */
export const DATA_VERSION = 2;

/** 開頁第一次（沒有存檔）時的地圖：第一個範本 */
export function starterProject(): Project {
  const tpl = getTemplate('studio');
  const floors = instantiateTemplate('studio') ?? [];
  return {
    name: tpl?.name ?? '',
    theme: 'clean',
    showSize: 'none',
    showNames: true,
    floors,
    active: 0,
  };
}

/**
 * 寫入 localStorage 延後一點（連續變更只寫最後一次），離開頁面或切到背景時立刻寫。
 * 地圖可能很大，拖曳時不必每一格都寫。
 */
export function deferredStorage(
  base: () => Storage | null,
  delayMs = 400,
  onError?: (e: unknown) => void,
): StateStorage & { flush: () => void } {
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const s = base();
    for (const [k, v] of pending) {
      try {
        s?.setItem(k, v);
      } catch (e) {
        onError?.(e);
      }
    }
    pending.clear();
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
  }
  return {
    getItem: (k) => pending.get(k) ?? base()?.getItem(k) ?? null,
    setItem: (k, v) => {
      pending.set(k, v);
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    removeItem: (k) => {
      pending.delete(k);
      base()?.removeItem(k);
    },
    flush,
  };
}

const localStore = (): Storage | null => {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
};

let persistErrorHandler: ((e: unknown) => void) | null = null;
/** 自動存檔失敗時的通知（App 設定） */
export function onPersistError(fn: ((e: unknown) => void) | null): void {
  persistErrorHandler = fn;
}

export const projectStorage = deferredStorage(localStore, 400, (e) => persistErrorHandler?.(e));

export const useProject = createToolStore<Project>(TOOL_ID, starterProject(), {
  version: DATA_VERSION,
  historyLimit: 120,
  coalesceMs: 0,
  storage: projectStorage,
  /* 版本 1 → 2：欄位只多不少，整理一次就好 */
  migrate: (persisted) => normalizeProject(persisted, isAsset) ?? starterProject(),
});

/* 讀進來的存檔整理一次（壞掉時換回開頁的地圖）；這一步不算復原紀錄 */
{
  const data = useProject.getState().data;
  const fixed = normalizeProject(data, isAsset);
  if (!fixed) useProject.getState().replace(starterProject());
  else if (JSON.stringify(fixed) !== JSON.stringify(data)) useProject.getState().replace(fixed);
  useProject.temporal.getState().clear();
}

export type LibTab = 'rooms' | 'openings' | 'furniture';

export interface Prefs {
  grid: boolean;
  ghost: boolean;
  showClues: boolean;
  libTab: LibTab;
  exp: ExportSettings;
  /** 分享連結的內容（F215；預設 PL 用） */
  share: ShareMode;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  grid: true,
  ghost: true,
  showClues: true,
  libTab: 'rooms',
  exp: { range: 'current', view: 'pl', clues: 'show', px: 48, grid: false, transparent: false },
  share: 'pl',
});

export type ToolId =
  | 'select'
  | 'hand'
  | 'room'
  | 'wall'
  | 'door'
  | 'window'
  | 'text'
  | 'eraser'
  | 'place';

export type Armed =
  | { kind: 'room'; preset: RoomPresetId }
  | { kind: 'opening'; type: OpeningKind; hinge: 0 | 1 }
  | { kind: 'wall'; type: WallKind }
  | { kind: 'item'; t: string; rot: number; manual?: boolean };

export interface Clipboard {
  floorId: string;
  offset: { dx: number; dy: number };
  /** 同一層連續貼上的次數（每次多錯開一個 offset） */
  shift: number;
  entries: { type: SelRef['type']; obj: unknown; top: boolean }[];
}

export interface EditorState {
  tool: ToolId;
  armed: Armed | null;
  sel: SelRef[];
  playerView: boolean;
  /** 畫面上顯示的倍率（%） */
  zoomPct: number;
  hint: { text: string; warn: boolean };
  templatesOpen: boolean;
  exportOpen: boolean;
  /** 上一次開檔時換掉與略過的東西（「詳細」對話框，F213） */
  importReport: CompatReport | null;
  /** 上一次開檔的來源（「詳細」對話框的說明用） */
  importSource: 'file' | 'link';
  importReportOpen: boolean;
  /** 分享連結的對話框（F215） */
  shareOpen: boolean;
  clipboard: Clipboard | null;
  /** 家具的搜尋與分類 */
  libQuery: string;
  libGroup: string;
}

export const useEditor = create<EditorState>(() => ({
  tool: 'select',
  armed: null,
  sel: [],
  playerView: false,
  zoomPct: 100,
  hint: { text: '', warn: false },
  templatesOpen: false,
  exportOpen: false,
  importReport: null,
  importSource: 'file',
  importReportOpen: false,
  shareOpen: false,
  clipboard: null,
  libQuery: '',
  libGroup: 'all',
}));

export const setEditor = (patch: Partial<EditorState>): void => useEditor.setState(patch);

/** 目前的樓層 */
export const currentFloor = () => {
  const p = useProject.getState().data;
  return p.floors[p.active] ?? p.floors[0];
};
