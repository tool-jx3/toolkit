/**
 * 狀態：
 * - `useEdit`：這個模型的調整（參數、表情預設、背景、錨點位移、圖層設定），有復原／重做（最多 150 步），不自動存
 *   （「儲存調整」才存，依模型指紋分開；規格 F76、D5）。
 * - `useAuto`：自動動作的開關（存進模型的設定，但不列入復原；攝影機、麥克風不存）。
 * - `usePrefs`：每個瀏覽器一份的偏好設定（追蹤的靈敏度、匯出、收合的區塊、校正），自動存（第一次開啟時搬舊版的 anime25d.prefs）。
 * - `useSession`：畫面的狀態（模型資訊、讀入中、訊息、暫停、錨點編輯、錄影、攝影機…），不存。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import {
  type AnchorOffsets,
  AUTO_DEFAULTS,
  type AutoState,
  type BackgroundId,
  defaultParams,
  defaultPrefs,
  normalizePrefs,
  type Params,
  type Prefs,
  type PresetId,
  TOOL_ID,
} from './params';
import type { PartGroup, PartPhys, Side } from './rigger';
import type { RigWarning } from './rigText';
import type { LayerSetting } from './runtime';

/* ---------- 模型的調整（復原／重做） ---------- */

export interface EditState {
  params: Params;
  preset: PresetId | null;
  background: BackgroundId;
  anchors: AnchorOffsets;
  /** 繪製順序（第一個在最後面） */
  layers: LayerSetting[];
}

export const initialEdit = (): EditState => ({
  params: defaultParams(),
  preset: null,
  background: 'checker',
  anchors: {},
  layers: [],
});

export const useEdit = createToolStore<EditState>(TOOL_ID, initialEdit(), {
  persist: false,
  historyLimit: 150,
  coalesceMs: 0,
});

/** 一步復原的修改 */
export function edit(recipe: (d: EditState) => void): void {
  useEdit.getState().update(recipe);
}

/* ---------- 自動動作 ---------- */

export interface AutoStore extends AutoState {
  cam: boolean;
  mic: boolean;
}

export const useAuto = create<AutoStore>(() => ({ ...AUTO_DEFAULTS, cam: false, mic: false }));

/* ---------- 偏好設定 ---------- */

export const LEGACY_PREFS_KEY = 'anime25d.prefs';
export const PREFS_KEY = `trpg-toolkit:${TOOL_ID}:preview`;

/** 新版還沒有偏好設定、舊版有時，搬過來（規格 F85；舊的不刪） */
export function migrateLegacyPrefs(storage: Storage | null = safeLocalStorage()): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(PREFS_KEY) !== null) return false;
    const raw = storage.getItem(LEGACY_PREFS_KEY);
    if (!raw) return false;
    const prefs = normalizePrefs(JSON.parse(raw));
    storage.setItem(PREFS_KEY, JSON.stringify({ state: { data: prefs }, version: 1 }));
    return true;
  } catch {
    return false;
  }
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

migrateLegacyPrefs();

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, defaultPrefs());

export function setPrefs(partial: Partial<Prefs>): void {
  usePrefs.getState().patch(partial);
}

/* ---------- 畫面的狀態 ---------- */

/** 圖層清單用的部件資訊 */
export interface LayerInfo {
  id: string;
  name: string;
  source: string;
  bn: string;
  side: Side | null;
  group: PartGroup;
  phys: PartPhys | null;
  strands: number;
  synthetic: boolean;
  unknown: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 縮圖（data URL，最長 64 px） */
  thumb: string;
  defaultOpacity: number;
  defaultDepth: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: LayerInfo[];
  warnings: RigWarning[];
  noise: { noisy: number; layers: number } | null;
  hasTopwear: boolean;
  /** 眼睛的錨點（錨點編輯的閉眼位置用） */
  eyes: { L: boolean; R: boolean };
}

export type StatusTone = 'info' | 'success' | 'warning' | 'danger';
export type DeviceState = 'off' | 'loading' | 'on';

export interface SessionState {
  model: ModelInfo | null;
  /** 讀入中的進度訊息 */
  loading: string | null;
  status: { text: string; tone: StatusTone; id: number } | null;
  paused: boolean;
  anchorMode: boolean;
  /** 錄影中 */
  recording: { t: number; total: number } | null;
  pngBusy: boolean;
  /** 上次儲存（或讀入）時的設定（比對是否有未儲存的變更） */
  savedSnapshot: string | null;
  cam: DeviceState;
  mic: DeviceState;
  /** 攝影機有臉的追蹤值 */
  camLive: boolean;
  calibrating: boolean;
  /** 預覽標出範圍的圖層 */
  highlight: string | null;
  fps: number;
  /** 麥克風輸入（0～1） */
  micRaw: number;
  search: string;
  /** 「要先下載臉部追蹤模型」 */
  needFaceModel: boolean;
}

export const useSession = create<SessionState>(() => ({
  model: null,
  loading: null,
  status: null,
  paused: false,
  anchorMode: false,
  recording: null,
  pngBusy: false,
  savedSnapshot: null,
  cam: 'off',
  mic: 'off',
  camLive: false,
  calibrating: false,
  highlight: null,
  fps: 0,
  micRaw: 0,
  search: '',
  needFaceModel: false,
}));

let statusId = 0;

/** 狀態訊息（一般訊息 6 秒後淡出，錯誤保留；規格 F92） */
export function setStatus(text: string, tone: StatusTone = 'info'): void {
  useSession.setState({ status: { text, tone, id: ++statusId } });
}
