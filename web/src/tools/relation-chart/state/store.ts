/**
 * 狀態：
 * - useProject：整份專案（分頁、角色、關係、設定；自動存到 localStorage、可以復原）。圖片存資產庫（IndexedDB），狀態只記 id。
 * - usePrefs：這台瀏覽器的偏好（依標籤分組、用檔名當角色名、小地圖、匯出設定）；不列入復原。
 * - useUi：只在這次開頁有效的東西（選取、聚焦、建立關係模式、右側面板、對話框、視角）。
 */
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import { initialProject, normalizeProject, projectAssetIds } from '../model/normalize';
import type { Project, Sheet } from '../model/types';

export const TOOL_ID = 'relation-chart';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

/** 寫入 localStorage 延後一點（連續變更只寫最後一次）；離開頁面、切到背景時立刻寫 */
function deferredStorage(delayMs = 400, onError?: (e: unknown) => void): StateStorage {
  const base = (): Storage | null => {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage;
    } catch {
      return null;
    }
  };
  const pending = new Map<string, string>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let since = 0;
  const flush = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    since = 0;
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
      /* 一直有變更（磁鐵、拖曳）時至少每 2 秒寫一次 */
      if (!since) since = Date.now();
      else if (Date.now() - since >= 2000) {
        flush();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    removeItem: (k) => {
      pending.delete(k);
      base()?.removeItem(k);
    },
  };
}

let persistErrorHandler: ((e: unknown) => void) | null = null;
/** 自動儲存失敗時的通知（App 設定） */
export function onPersistError(fn: ((e: unknown) => void) | null): void {
  persistErrorHandler = fn;
}

export const useProject = createToolStore<Project>(TOOL_ID, initialProject(), {
  version: DATA_VERSION,
  historyLimit: 150,
  coalesceMs: 0,
  storage: deferredStorage(400, (e) => persistErrorHandler?.(e)),
  migrate: (persisted) => normalizeProject(persisted) ?? initialProject(),
});

/* 讀進來的存檔整理一次（壞掉時換回空白專案）；這一步不算復原 */
{
  const data = useProject.getState().data;
  const fixed = normalizeProject(data);
  if (!fixed) useProject.getState().replace(initialProject());
  else if (JSON.stringify(fixed) !== JSON.stringify(data)) useProject.getState().replace(fixed);
  useProject.temporal.getState().clear();
}

/** 拖曳、滑桿、文字欄：放開（離開）才記一步 */
export const gesture = historyGesture(useProject);

/*
 * 好幾件事同時要「合成一步復原」時（磁鐵跑著、同時拖曳角色）：誰先開始誰開手勢，最後一個放開才結束。
 */
const holds = new Set<string>();
export function holdHistory(key: string): void {
  if (!holds.size) useProject.beginGesture();
  holds.add(key);
}
export function releaseHistory(key: string): void {
  if (!holds.delete(key)) return;
  if (!holds.size) useProject.endGesture();
}

export const assets = createAssetStore(TOOL_ID);

/** 狀態與復原紀錄裡用到的圖 */
export const referencedImages = (): Set<string> => referencedAssetIds(useProject, projectAssetIds);

export const projectNow = (): Project => useProject.getState().data;
export const activeIndex = (p: Project): number =>
  Math.min(p.sheets.length - 1, Math.max(0, p.active));
export const activeSheet = (p: Project = projectNow()): Sheet => p.sheets[activeIndex(p)];

/* ---------- 偏好（不列入復原） ---------- */

export type ExportFormat = 'png' | 'svg' | 'psd' | 'html';
export type ExportScope = 'cur' | 'all' | 'some';

export interface Prefs {
  groupByLabel: boolean;
  nameFromFile: boolean;
  minimap: boolean;
  exportFormat: ExportFormat;
  exportScope: ExportScope;
  transparent: boolean;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  groupByLabel: false,
  nameFromFile: false,
  minimap: true,
  exportFormat: 'png',
  exportScope: 'cur',
  transparent: true,
});

export const setPrefs = (patch: Partial<Prefs>): void =>
  usePrefs.getState().update((d) => {
    Object.assign(d, patch);
  });

/* ---------- 只在這次開頁有效的狀態 ---------- */

export type FocusKind = 'node' | 'edge' | 'type';
export interface FocusRef {
  kind: FocusKind;
  id: number;
}

/** 建立關係模式 */
export interface LinkMode {
  typeId: number;
  from: number | null;
  /** 這一輪建立的關係（再點同樣的兩人＝取消） */
  made: number[];
  /** 橫幅的提示（一段時間後清掉） */
  flash: { text: string; ok: boolean } | null;
}

export type Panel =
  | { kind: 'char'; id: number }
  | { kind: 'rel'; id: number }
  | { kind: 'type'; id: number }
  | null;

export type DialogKind =
  | 'batch'
  | 'paste'
  | 'copy'
  | 'layout'
  | 'align'
  | 'canvas'
  | 'export'
  | 'samples'
  | 'crop'
  | null;

export interface View {
  zoom: number;
  x: number;
  y: number;
}

export interface UiState {
  sel: number[];
  focus: FocusRef | null;
  hover: FocusRef | null;
  link: LinkMode | null;
  panel: Panel;
  dialog: DialogKind;
  /** 頭像調整範圍的對象 */
  cropFor: number | null;
  view: View;
  /** 視角要重新「符合畫面」（切分頁、開專案檔） */
  fitTick: number;
  /** 長按的進度環（畫面座標） */
  ring: { x: number; y: number; r: number } | null;
  /** 磁鐵正在跑 */
  simRunning: boolean;
  /** 分頁改名中 */
  renaming: number | null;
}

export const useUi = create<UiState>(() => ({
  sel: [],
  focus: null,
  hover: null,
  link: null,
  panel: null,
  dialog: null,
  cropFor: null,
  view: { zoom: 1, x: 0, y: 0 },
  fitTick: 0,
  ring: null,
  simRunning: false,
  renaming: null,
}));

export const setUi = (patch: Partial<UiState>): void => useUi.setState(patch);
