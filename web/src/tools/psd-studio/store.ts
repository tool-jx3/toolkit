/**
 * 狀態：
 * - 設定（整體調色、匯出選項、曲線通道、格線）：createToolStore（localStorage 自動存檔＋復原／重做）。
 * - 自訂組合（F55～F58）：另一個 localStorage 鍵，不受「全部重設」「清除作業」影響。
 * - 作業內容（模式、素材、房間資料、選取、配置檢視的平移縮放）：zustand（圖片在記憶體；自動存到 IndexedDB 見 session.ts）。
 */
import { create } from 'zustand';
import { createToolStore } from '@/core/storage';
import {
  type AssetAdjust,
  CURVE_CHANNELS,
  type CurveChannel,
  defaultGlobalAdjust,
  type GlobalAdjust,
  sanitizeAdjust,
} from './adjust';
import { TARGET_CHOICES } from './compress';
import { type AssetLoopMode, type GlobalLoopMode, loopCount } from './naming';

export const TOOL_ID = 'psd-studio';

/* ---------- 設定 ---------- */

export interface Settings {
  global: GlobalAdjust;
  /** F50（整體的曲線通道） */
  curveChannel: CurveChannel;
  /** F84 */
  compress: boolean;
  /** F85（MB） */
  targetMb: number;
  /** F86 */
  frameSkip: boolean;
  /** F87 */
  compressStatic: boolean;
  /** F88 */
  loopMode: GlobalLoopMode;
  loopCount: number;
  /** F25 */
  showGrid: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  global: defaultGlobalAdjust(),
  curveChannel: 'all',
  compress: true,
  targetMb: 4.8,
  frameSkip: true,
  compressStatic: false,
  loopMode: 'keep',
  loopCount: 1,
  showGrid: true,
};

const LOOP_MODES: readonly GlobalLoopMode[] = ['keep', 'once', 'infinite', 'custom'];

/** 讀回的設定整理成合法的值 */
export function sanitizeSettings(v: Partial<Settings> | undefined): Settings {
  const s = { ...DEFAULT_SETTINGS, ...(v ?? {}) };
  return {
    global: sanitizeAdjust(s.global, 'global'),
    curveChannel: CURVE_CHANNELS.includes(s.curveChannel) ? s.curveChannel : 'all',
    compress: s.compress !== false,
    targetMb: TARGET_CHOICES.includes(Number(s.targetMb)) ? Number(s.targetMb) : 4.8,
    frameSkip: s.frameSkip !== false,
    compressStatic: !!s.compressStatic,
    loopMode: LOOP_MODES.includes(s.loopMode) ? s.loopMode : 'keep',
    loopCount: loopCount(s.loopCount),
    showGrid: s.showGrid !== false,
  };
}

export const useSettings = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS, {
  version: 1,
  coalesceMs: 400,
});

/* ---------- 自訂組合（F55～F58） ---------- */

export interface CustomPreset {
  id: string;
  name: string;
  global: GlobalAdjust;
}

export const usePresets = createToolStore<{ list: CustomPreset[] }>(
  `${TOOL_ID}-presets`,
  { list: [] },
  { version: 1, historyLimit: 1 },
);

export function sanitizePresets(v: unknown): CustomPreset[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((p): p is CustomPreset => !!p && typeof p === 'object' && typeof p.name === 'string')
    .map((p, i) => ({
      id: typeof p.id === 'string' && p.id ? p.id : `preset-${i}`,
      name: p.name,
      global: sanitizeAdjust(p.global, 'global'),
    }));
}

/* ---------- 作業內容 ---------- */

export type Mode = 'idle' | 'image' | 'psd' | 'room';
export type ViewTab = 'layout' | 'list';
export type SortKey = 'order' | 'name' | 'type' | 'role';

/** PSD 圖層的屬性（配置檢視依這些合成，第 7 節裁定） */
export interface PsdLayerMeta {
  left: number;
  top: number;
  /** 0～1（含上層群組） */
  opacity: number;
  blendMode: string;
  clipping: boolean;
}

export interface Asset {
  id: string;
  /**
   * 名稱（唯一）：圖片模式是相對路徑（資料夾載入時含資料夾）；ZIP 載入的是 ZIP 內路徑；PSD 是圖層的檔名（`名稱.png`）
   */
  name: string;
  /** 顯示的名稱：PSD 是圖層名（原字元）；其他是檔名（不含資料夾） */
  label: string;
  /** 從原 ZIP 讀進來的素材（name 就是 ZIP 內的路徑；匯出時以原 ZIP 為底換掉它） */
  inZip: boolean;
  /** 原檔還是 ZIP 裡的那一份（沒改過畫布尺寸；存檔時不必另存圖片） */
  zipIntact: boolean;
  /** 目前的原檔（改過畫布尺寸時是新的 PNG／APNG） */
  bytes: Uint8Array;
  width: number;
  height: number;
  apng: boolean;
  frames: number;
  delays: number[];
  /** 原檔的播放次數（0＝無限） */
  plays: number;
  layer: PsdLayerMeta | null;
  visible: boolean;
  solo: boolean;
  adjust: AssetAdjust | null;
  loopMode: AssetLoopMode;
  loopCount: number;
  /** 內容版本（換了原檔就加一，縮圖跟著重做） */
  rev: number;
}

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface SourceZip {
  /** 原 ZIP 檔（存檔用） */
  bytes: Uint8Array;
  entries: { name: string; data: Uint8Array }[];
  dataPath: string | null;
  json: unknown;
}

export interface Workspace {
  mode: Mode;
  assets: Asset[];
  /** 原名（F94） */
  origin: string | null;
  zip: SourceZip | null;
  /** 房間資料（JSON；還原後沒有原 ZIP 時仍保留） */
  roomJson: unknown;
  psd: { width: number; height: number } | null;
  selectedId: string | null;
  tab: ViewTab;
  camera: Camera;
  search: string;
  sort: SortKey;
  /** 存檔用的版本號（作業內容有變就加一） */
  revision: number;
}

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };

export const emptyWorkspace = (): Workspace => ({
  mode: 'idle',
  assets: [],
  origin: null,
  zip: null,
  roomJson: null,
  psd: null,
  selectedId: null,
  tab: 'layout',
  camera: { ...DEFAULT_CAMERA },
  search: '',
  sort: 'order',
  revision: 0,
});

interface WorkspaceState extends Workspace {
  /** 換掉整個作業（載入、還原、清除） */
  load: (w: Partial<Workspace>) => void;
  set: (patch: Partial<Workspace>) => void;
  updateAsset: (id: string, fn: (a: Asset) => Asset) => void;
  updateAssets: (fn: (a: Asset) => Asset) => void;
}

/** 不影響存檔的欄位（搜尋、排序） */
const TRANSIENT: readonly (keyof Workspace)[] = ['search', 'sort'];

export const useWorkspace = create<WorkspaceState>((set, get) => ({
  ...emptyWorkspace(),
  load: (w) => set({ ...emptyWorkspace(), ...w, revision: get().revision + 1 }),
  set: (patch) => {
    const transient = Object.keys(patch).every((k) => TRANSIENT.includes(k as keyof Workspace));
    set(transient ? patch : { ...patch, revision: get().revision + 1 });
  },
  updateAsset: (id, fn) =>
    set({
      assets: get().assets.map((a) => (a.id === id ? fn(a) : a)),
      revision: get().revision + 1,
    }),
  updateAssets: (fn) => set({ assets: get().assets.map(fn), revision: get().revision + 1 }),
}));

let idSeq = 0;
export const newAssetId = (): string => `a${Date.now().toString(36)}${(++idSeq).toString(36)}`;

/** 看得見（F35）：有人獨顯時只看獨顯的；沒有時看眼睛 */
export function visibilityOf(assets: readonly Asset[]): (a: Asset) => boolean {
  const anySolo = assets.some((a) => a.solo);
  return (a) => (anySolo ? a.solo : a.visible);
}
