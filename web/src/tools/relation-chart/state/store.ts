/**
 * 狀態：
 * - useProject：整份專案（分頁、角色、關係、設定；自動存到 localStorage、可以復原）。圖片存資產庫（IndexedDB），狀態只記 id。
 * - usePrefs：這台瀏覽器的偏好（依標籤分組、用檔名當角色名、小地圖、匯出設定）；不列入復原。
 * - useUi：只在這次開頁有效的東西（選取、聚焦、建立關係模式、右側面板、對話框、視角）。
 */
import type { Draft } from 'immer';
import { create } from 'zustand';
import type { StateStorage } from 'zustand/middleware';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import { sanitizeProjectRich } from '../logic/rich';
import { syncLibrary } from '../model/library';
import { initialProject, normalizeProject, projectAssetIds } from '../model/normalize';
import { autoKey } from '../model/timeline';
import type { ColorValue, Project, Sheet } from '../model/types';

export const TOOL_ID = 'relation-chart';
/**
 * 專案檔與自動儲存的資料版本（3：角色庫、關係庫、數值、頭像框、匯入字型、看法；4：便利貼、世界觀、備忘錄、便利貼庫、設定集；
 * 5：時間軸分頁、分頁庫）
 */
export const DATA_VERSION = 5;

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

/* 讀進來的存檔整理一次（壞掉時換回空白專案；角色資訊與世界觀重新淨化，7.10）；這一步不算復原 */
{
  const data = useProject.getState().data;
  const fixed = normalizeProject(data);
  if (fixed) sanitizeProjectRich(fixed);
  if (!fixed) useProject.getState().replace(initialProject());
  else if (JSON.stringify(fixed) !== JSON.stringify(data)) useProject.getState().replace(fixed);
  useProject.temporal.getState().clear();
}

/** 拖曳、滑桿、文字欄：放開（離開）才記一步 */
export const gesture = historyGesture(useProject);

/*
 * 改專案一律走 updateProject：拖曳或磁鐵跑著時，角色的位置暫時在編輯畫面的工作副本裡（editor/live），
 * 改之前先把那些位置放回專案，動作才會從畫面上的位置算起。
 */
type ProjectRecipe = (p: Draft<Project>) => void;
let beforeUpdate: ProjectRecipe | null = null;
let pendingLive: () => boolean = () => false;
export function setBeforeUpdate(fn: ProjectRecipe | null, pending?: () => boolean): void {
  beforeUpdate = fn;
  pendingLive = pending ?? (() => false);
}
/** 匯出、存檔之前：畫面上還在動的位置（拖曳、磁鐵）先放回專案 */
export function syncProject(): void {
  if (beforeUpdate && pendingLive()) updateProject(() => {});
}
export function updateProject(recipe: ProjectRecipe): void {
  const pre = beforeUpdate;
  const prev = useProject.getState().data;
  useProject.getState().update((p) => {
    pre?.(p);
    recipe(p);
    /* 角色的三層、關係類型與關係庫對齊（model/library） */
    syncLibrary(p as Project, prev);
    /* 時間軸分頁：在保持中的軌道改了東西＝這一格這一條變成關鍵影格（原作的 tlAutoKey） */
    const s = p.sheets[Math.min(p.sheets.length - 1, Math.max(0, p.active))];
    if (s?.tl) autoKey(s as Sheet);
  });
}

/**
 * 不記復原的改動（切影格＝檢視狀態，7.4 第 3 項；分頁庫的管理動作，7.4 第 14 項）。照樣自動儲存。
 * 手勢中（磁鐵、拖曳）呼叫時，這次改動會併進手勢那一步——呼叫端先結束手勢。
 */
export function untracked(fn: () => void): void {
  const t = useProject.temporal.getState();
  const was = t.isTracking;
  if (was) t.pause();
  try {
    fn();
  } finally {
    if (was) useProject.temporal.getState().resume();
  }
}

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

/**
 * 上次的匯出（再次匯出用；這台瀏覽器）：格式、範圍、勾選、部分分頁的分頁 id。
 * 格式多收第五批的 GIF、影片（原作匯出動畫後記憶被蓋掉、讀取時又不認，選單項消失；7.4 第 8 項）。
 */
export interface LastExport {
  fmt: ExportFormat | 'gif' | 'video';
  scope: ExportScope;
  checks: { transparent: boolean; slim: boolean; embed: boolean };
  sheetIds?: number[];
}

export interface Prefs {
  groupByLabel: boolean;
  /** 標籤清單依分頁分組（F181i） */
  labelsBySheet: boolean;
  /** 檔案庫：高度（null＝預設）、左欄寬、檢視層級與項目大小 */
  libH: number | null;
  libSideW: number;
  libLevel: 'min' | 'normal' | 'detail';
  libSize: 'sm' | 'md' | 'lg';
  /** 角色庫、關係庫依分頁分組（第三批） */
  libGroup: boolean;
  nameFromFile: boolean;
  minimap: boolean;
  exportFormat: ExportFormat;
  exportScope: ExportScope;
  transparent: boolean;
  /** 互動網頁：壓縮頭像、嵌入模式（第四批） */
  slim: boolean;
  embed: boolean;
  /** 再次匯出的記憶（沒有＝選單不出現） */
  lastExport: LastExport | null;
  /* ---- 第五批：時間軸的播放偏好（這台瀏覽器；原作的 crd-tween-off、crd-flip-anim、crd-note-fade） ---- */
  /** 補間關＝硬切換格 */
  tweenOff: boolean;
  /** 換變體時翻一次面（預設關） */
  flipAnim: boolean;
  /** 便利貼文字交叉淡化（預設開；關＝過半換字） */
  noteFade: boolean;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  groupByLabel: false,
  labelsBySheet: true,
  libH: null,
  libSideW: 240,
  libLevel: 'detail',
  libSize: 'sm',
  libGroup: true,
  nameFromFile: false,
  minimap: true,
  exportFormat: 'png',
  exportScope: 'cur',
  transparent: true,
  slim: true,
  embed: false,
  lastExport: null,
  tweenOff: false,
  flipAnim: false,
  noteFade: true,
});

export const setPrefs = (patch: Partial<Prefs>): void =>
  usePrefs.getState().update((d) => {
    Object.assign(d, patch);
  });

/* ---------- 只在這次開頁有效的狀態 ---------- */

/** 聚焦：角色、線、關係類型、標籤（第二批） */
export type FocusKind = 'node' | 'edge' | 'type' | 'label';
export interface FocusRef {
  kind: FocusKind;
  id: number;
}

/** 建立關係模式 */
export interface LinkMode {
  typeId: number;
  /** 起點：`C<角色 id>` 或 `L<標籤 id>`（標籤＝群體關係） */
  from: string | null;
  /** 這一輪建立的關係（再點同樣的兩人＝取消） */
  made: number[];
  /** 這一輪建立的群體關係 */
  madeG: number[];
  /** 橫幅的提示（一段時間後清掉） */
  flash: { text: string; ok: boolean } | null;
}

export type Panel =
  | { kind: 'char'; id: number }
  | { kind: 'rel'; id: number }
  | { kind: 'type'; id: number }
  | { kind: 'grel'; id: number }
  | { kind: 'coledge'; key: string }
  /** 角色資訊（第三批；id＝角色） */
  | { kind: 'info'; id: number }
  /** 第四批：便利貼／圖表節點的設定、世界觀、備忘錄、統計與尋路 */
  | { kind: 'note'; id: number }
  | { kind: 'lore' }
  | { kind: 'memo' }
  | { kind: 'stats' }
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
  /* 第三批 */
  | 'radarCompare'
  | 'radarTpl'
  | 'frames'
  | 'fonts'
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
  /** 檔案庫開著、目前的頁籤 */
  libOpen: boolean;
  libTab: LibTab;
  /** 目前頁籤的模式（null＝一般：點一項＝在左欄看它） */
  libMode: LibMode | null;
  /** 角色庫、關係庫左欄的條目 */
  libPick: number | null;
  /** 只看未使用的變體 */
  libUnused: boolean;
  /** 角色庫用標籤篩選（標籤 id）、挑選標籤中 */
  libLabelFilter: number | null;
  libLabelPick: boolean;
  /** 交換位置模式（pick＝挑起的角色） */
  swap: { pick: number | null } | null;
  /** 數值圖表：目前的範本、圖上隱藏的序列、比較的兩位角色 */
  radarTpl: number | null;
  radarHide: string[];
  compare: { a: number | null; b: number | null };
  /** 範本設定關掉時回到哪個對話框（從數值比較進去的＝回數值比較） */
  radarBack: DialogKind;
  /** 左欄設定中的標籤 */
  libSel: number | null;
  /** 編輯模式中載入的標籤 */
  libEdit: number | null;
  /** 標籤庫的調色盤（新增時套用；編輯模式載入標籤的顏色） */
  libColor: ColorValue;
  /* ---- 第四批 ---- */
  /** 正在就地編輯的便利貼 */
  noteEdit: number | null;
  /** 唯讀瀏覽模式（不存檔） */
  readonly: boolean;
  /** 統計與尋路的鎖定聚焦（一組角色＋一組線；關掉面板就解除） */
  statsFocus: { nodes: number[]; edges: number[] } | null;
  /** 遠近簡化目前的一檔（只在 60 位以上時生效；編輯畫面算） */
  lod: LodLevel;
  /** 設定集：左欄看的那一筆 */
  libPreset: number | null;
  /* ---- 第五批 ---- */
  /** 時間軸的預覽位置（影格單位；null＝編輯目前影格）：播放或拖過拖桿＝預覽，左鍵不能編輯 */
  tlPos: number | null;
  tlPlaying: boolean;
  /** 影格列的模式：點影格＝複製／刪除 */
  tlMode: 'copy' | 'del' | null;
  /** 影格列的縮放（0.4～3） */
  tlZoom: number;
  /** 快照頁籤：中間看的那一份 */
  snapPick: string | null;
}

export type LodLevel = 'near' | 'mid' | 'far';

export type LibTab =
  | 'chars'
  | 'rels'
  | 'labels'
  | 'sheets'
  | 'notes'
  | 'snaps'
  | 'table'
  | 'gsets';
/** 標籤庫：編輯、隱藏、引力、陣營框、刪除；角色庫與關係庫：匯入、複製、刪除；連線總表、便利貼庫：刪除；設定集：改名、最愛、刪除 */
export type LibMode =
  | 'edit'
  | 'hide'
  | 'pull'
  | 'zone'
  | 'del'
  | 'import'
  | 'copy'
  | 'rename'
  | 'fav';

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
  libOpen: false,
  libTab: 'chars',
  libMode: null,
  libPick: null,
  libUnused: false,
  libLabelFilter: null,
  libLabelPick: false,
  swap: null,
  radarTpl: null,
  radarHide: [],
  compare: { a: null, b: null },
  radarBack: null,
  libSel: null,
  libEdit: null,
  libColor: 'auto',
  noteEdit: null,
  readonly: false,
  statsFocus: null,
  lod: 'near',
  libPreset: null,
  tlPos: null,
  tlPlaying: false,
  tlMode: null,
  tlZoom: 1,
  snapPick: null,
}));

export const setUi = (patch: Partial<UiState>): void => useUi.setState(patch);
