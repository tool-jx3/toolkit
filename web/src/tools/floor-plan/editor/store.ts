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
import { composedFloor, ownFloor } from '../model/interior';
import { normalizeProject } from '../model/normalize';
import type { ShareMode } from '../model/share';
import type { LineKind, OpeningKind, Project, SelRef, WallKind } from '../model/types';
import { getTemplate, instantiateTemplate } from '../templates';

export const TOOL_ID = 'floor-plan';
/**
 * 存檔格式版本。2：文字多了圓標（`badge`，2026-10）。3：地圖多了棋子方格（`tokenGrid`、`tokenGridColor`、
 * `tokenGridOpacity`，2026-10 第一批）。4：新的房間、門窗、牆種類，房間的牆種類（`rooms[].wall`），
 * 外觀層的「顯示內部」（`floors[].showInside`、`inside`）（2026-10 第二批）。5：新的家具 238 種
 * （`items[].t` 的代號，2026-10 第三批；欄位不變）。6：新的門窗種類（雙開拉門）與新的家具 8 種（2026-10-29 跟進原作 v1.15；欄位不變）。
 * 7：L 形房間（`rooms[].cut`）、樣式 `noir`／`terminal`、紙的污漬與摺痕（`wear`、`wearSeed`）、座標標示（`coords`）、
 * 家具不跟著房間（`fixedFurniture`）、桌上的小物 2 種（2026-10-29 參考 KIIN マップ制作スタジオ；D79）。
 * 8：夜的暗度（`night`）、自由線（`floors[].lines`）、房間的地板（`rooms[].floor`）、家具的細角度（`items[].rot` 任何整數度）
 * 與圓形配置的群組（`items[].ring`）、新的家具（2026-11-05 參考 KIIN v2.0；D88）。
 * 9：曲線的房間（`rooms[].shape`、`rooms[].radius`，2026-11-05 跟進 KIIN v2.0 第二批；D98）。
 * 10：立體樓層圖的視角（`stack`）、祕密樓層（`floors[].secret`）（2026-11-09 參考 KIIN 立体フロアガイド；D110）。
 * 舊版本的存檔與專案檔不必轉換（少了欄位就是沒有圓標、沒有方格、牆照規則、不顯示內部、長方形的房間…），讀進來一律經過 normalizeProject。
 */
export const DATA_VERSION = 10;

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
  /* 版本 1 → … → 10：欄位只多不少，整理一次就好 */
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

/** 檢視方式（2026-11-09，F303）：平面編輯／立體樓層圖／樓層總覽 */
export type ViewMode = 'plan' | 'stack' | 'board';

export interface Prefs {
  /** 檢視方式（2026-11-09，F303；記在瀏覽器，不列入復原） */
  view?: ViewMode;
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
  exp: {
    range: 'current',
    view: 'pl',
    clues: 'show',
    px: 48,
    grid: false,
    transparent: false,
    mode: 'image',
    vttPx: 100,
    noise: true,
  },
  share: 'pl',
});

export type ToolId =
  | 'select'
  | 'hand'
  | 'room'
  /* L 形房間（2026-10-29，F258） */
  | 'lroom'
  | 'wall'
  | 'door'
  | 'window'
  | 'text'
  | 'eraser'
  | 'place'
  /* 自由線（2026-11-05，F285） */
  | 'line';

export type Armed =
  | { kind: 'room'; preset: RoomPresetId }
  | { kind: 'opening'; type: OpeningKind; hinge: 0 | 1 }
  | { kind: 'wall'; type: WallKind }
  | { kind: 'item'; t: string; rot: number; manual?: boolean }
  /* 自由線的種類（2026-11-05，F285） */
  | { kind: 'line'; type: LineKind };

/**
 * 下繪圖（2026-11-05，參考 KIIN v2.0 的「下絵」，F283）：本機的圖片疊在編輯畫面上描圖用。
 * 只在這一頁（不存進專案檔、自動儲存，也不畫進匯出的圖）。位置是圖的中心（格）、寬（格）。
 */
export interface Underlay {
  src: string;
  /** 圖的高 ÷ 寬 */
  aspect: number;
  x: number;
  y: number;
  w: number;
  /** 不透明度（0.1～0.9） */
  opacity: number;
  visible: boolean;
  name: string;
}

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
  /** 下繪圖（F283；只在這一頁） */
  underlay: Underlay | null;
  /** 快速建立（F308）選了「從空白開始畫」的樓層（id；只在這一頁，不再顯示快速建立） */
  quickSkip: string[];
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
  underlay: null,
  quickSkip: [],
}));

export const setEditor = (patch: Partial<EditorState>): void => useEditor.setState(patch);

/** 目前的樓層 */
export const currentFloor = () => {
  const p = useProject.getState().data;
  return p.floors[p.active] ?? p.floors[0];
};

/**
 * 外觀層打開「顯示內部」時（F230）：畫的是疊好的樓層（drawnFloor），點得到、選得到、能編號的只有外觀層自己留下來的東西（editableFloor）。
 * 沒有打開時兩個都是 currentFloor()。
 */
export const drawnFloor = () => composedFloor(currentFloor(), useProject.getState().data.floors);
export const editableFloor = () => ownFloor(currentFloor(), useProject.getState().data.floors);

/**
 * PL 檢視的祕密樓層（2026-11-09 驗證後修訂，F307）：唯讀——什麼都選不到、不能畫、不能貼上或放素材
 * （非祕密樓層的 GM 專用房間照舊：PL 檢視時選得到牆框）。
 */
export const veiledLocked = (): boolean =>
  useEditor.getState().playerView && !!currentFloor().secret;
