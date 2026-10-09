/**
 * 狀態：
 * - usePrefs：作圖用的設定（所有地圖共用，記在 localStorage `trpg-toolkit:map-editor:preview`；規格 F089）。
 * - useMapPrefs：跟著每張地圖儲存的設定（3.1；開啟地圖時換成那張的值）。
 * - useEditor：編輯畫面的狀態（目前的工具、圖層清單、選取、儲存狀態…；不保存）。
 * 復原／重做只管畫布上的物件（engine/history.ts），這些設定不列入（D10）。
 */
import { create } from 'zustand';
import type { MapGridType } from '@/core/grid';
import { createPreviewStore } from '@/core/storage';
import {
  DEFAULT_MAP_PREFS,
  type LineCap,
  type LineJoin,
  type MapPrefs,
  type StrokeStyle,
} from './model';

/* ---------- 工具 ---------- */

export type ToolName =
  | 'select'
  | 'cell'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'path'
  | 'polygon'
  | 'curve'
  | 'curve-closed'
  | 'ground'
  | 'wall'
  | 'room'
  | 'decor'
  | 'freehand'
  | 'text';

export const TOOL_NAMES: readonly ToolName[] = [
  'select',
  'cell',
  'rect',
  'ellipse',
  'line',
  'path',
  'polygon',
  'curve',
  'curve-closed',
  'ground',
  'wall',
  'room',
  'decor',
  'freehand',
  'text',
];

/** 實際的作圖種類（地面、牆壁、房間的子工具） */
export type Subtool =
  | 'select'
  | 'cell'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'path'
  | 'polygon'
  | 'curve'
  | 'curve-closed'
  | 'decor'
  | 'freehand'
  | 'text';

export type CellMode = 'pen' | 'eraser' | 'fill';

/* ---------- 作圖設定（共用、保存） ---------- */

export interface Prefs {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  lineJoin: LineJoin;
  lineCap: LineCap;
  cornerRadius: number;
  ellipseMode: 'bbox' | 'center';
  shadowSimple: boolean;
  shadowGround: boolean;
  shadowWall: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  snapEnabled: boolean;
  snapIntersection: boolean;
  snapCenter: boolean;
  snapMidpoint: boolean;
  textFont: string;
  textSize: number;
  cellMode: CellMode;
  exportFormat: 'png' | 'jpeg' | 'svg';
  exportBg: 'transparent' | 'white';
  exportGrid: boolean;
  /** 屬性面板的分頁 */
  panelTab: 'props' | 'layers' | 'settings';
}

export const DEFAULT_PREFS: Prefs = {
  fill: '#4a90c4ff',
  stroke: '#000000ff',
  strokeWidth: 4,
  strokeStyle: 'solid',
  lineJoin: 'miter',
  lineCap: 'butt',
  cornerRadius: 0,
  ellipseMode: 'bbox',
  shadowSimple: false,
  shadowGround: false,
  shadowWall: true,
  shadowColor: '#0000008c',
  shadowBlur: 8,
  shadowOffsetX: 0,
  shadowOffsetY: 0,
  snapEnabled: true,
  snapIntersection: true,
  snapCenter: true,
  snapMidpoint: true,
  textFont: 'Noto Sans TC',
  textSize: 48,
  cellMode: 'pen',
  exportFormat: 'png',
  exportBg: 'transparent',
  exportGrid: true,
  panelTab: 'props',
};

export const usePrefs = createPreviewStore<Prefs>('map-editor', DEFAULT_PREFS);

/* ---------- 自動儲存的開關（沿用舊版的鍵 trpg_autoSaveEnabled；F173） ---------- */

export const AUTOSAVE_KEY = 'trpg_autoSaveEnabled';

function readAutoSave(): boolean {
  try {
    const v = localStorage.getItem(AUTOSAVE_KEY);
    return v === null ? true : v === 'true';
  } catch {
    return true;
  }
}

export const useAutoSave = create<{ enabled: boolean; set: (v: boolean) => void }>((set) => ({
  enabled: readAutoSave(),
  set: (v) => {
    try {
      localStorage.setItem(AUTOSAVE_KEY, String(v));
    } catch {
      /* 存不進去就只在這一頁有效 */
    }
    set({ enabled: v });
  },
}));

/* ---------- 跟著地圖儲存的設定 ---------- */

export const useMapPrefs = create<MapPrefs & { replace: (p: MapPrefs) => void }>((set) => ({
  ...structuredClone(DEFAULT_MAP_PREFS),
  replace: (p) => set({ ...p }),
}));

export function mapPrefsNow(): MapPrefs {
  const { replace: _, ...rest } = useMapPrefs.getState();
  return rest;
}

export function setMapPrefs(patch: Partial<MapPrefs>): void {
  useMapPrefs.setState(patch);
}

/* ---------- 編輯畫面的狀態 ---------- */

export type SaveStatus = 'saved' | 'dirty' | 'saving' | 'error';

/** 圖層面板的一列 */
export interface LayerRow {
  id: number;
  name: string;
  visible: boolean;
  locked: boolean;
  kind: 'cell' | 'freehand' | 'group' | 'text' | 'image' | 'decor' | 'room' | 'shape';
}

/** 選取物件的資訊（屬性面板用） */
export interface SelectionInfo {
  count: number;
  /** 只選一個時 */
  name: string;
  left: number;
  top: number;
  width: number;
  height: number;
  angle: number;
  /** 第一個（能改填色的）物件的樣式 */
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  lineJoin: LineJoin;
  lineCap: LineCap;
  hasRect: boolean;
  cornerRadius: number;
  /** 有沒有可以改填色、描邊的物件（格子圖層除外） */
  styleable: boolean;
  /** 有沒有地面、牆壁、房間（圖樣） */
  patternKinds: ('ground' | 'wall' | 'room-ground' | 'room-wall')[];
  opacity: number;
  blend: string;
  locked: boolean;
  visible: boolean;
  isGroup: boolean;
  canGroup: boolean;
  canBoolean: boolean;
  /** 選取框（螢幕 px，相對於畫布左上角） */
  box: { x: number; y: number; w: number; h: number } | null;
  /** 選取框加上看得到的控制點（含旋轉控制點）的範圍：動作列放在這個範圍外，不擋住控制點（F051） */
  controlsBox: { x: number; y: number; w: number; h: number } | null;
  /** 陰影（第一個物件；房間取地面或牆壁） */
  shadow: { color: string; blur: number; offsetX: number; offsetY: number } | null;
  /** 文字（選到一段文字時） */
  isText: boolean;
}

export interface TextStyleState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  linethrough: boolean;
  fontFamily: string | null;
  fontSize: number | null;
}

export interface EditorState {
  /** 開著的地圖 */
  mapId: string | null;
  mapName: string;
  gridType: MapGridType;
  tool: ToolName;
  saveStatus: SaveStatus;
  canUndo: boolean;
  canRedo: boolean;
  /** 狀態列：最後的操作 */
  lastAction: string;
  /** 狀態列：暫時訊息（2.5 秒） */
  transient: string | null;
  zoom: number;
  pointer: { col: number; row: number } | null;
  layers: LayerRow[];
  selectedIds: number[];
  selection: SelectionInfo | null;
  /** 多點作圖中（確定／取消列） */
  finish: { active: boolean; canFinish: boolean };
  /** 匯出：選範圍中、對話框 */
  exportMode: 'off' | 'pick' | 'dialog';
  exportRect: { x: number; y: number; w: number; h: number } | null;
  textStyle: TextStyleState | null;
  /** 圖層清單上次點的列（Shift＋點的範圍選取） */
  lastClickedLayer: number | null;
  /** 圖層清單上正在改名的列 */
  renamingId: number | null;
}

export const INITIAL_EDITOR: EditorState = {
  mapId: null,
  mapName: '',
  gridType: 'square',
  tool: 'select',
  saveStatus: 'saved',
  canUndo: false,
  canRedo: false,
  lastAction: '',
  transient: null,
  zoom: 1,
  pointer: null,
  layers: [],
  selectedIds: [],
  selection: null,
  finish: { active: false, canFinish: false },
  exportMode: 'off',
  exportRect: null,
  textStyle: null,
  lastClickedLayer: null,
  renamingId: null,
};

export const useEditor = create<EditorState>(() => ({ ...INITIAL_EDITOR }));

export function setEditor(patch: Partial<EditorState>): void {
  useEditor.setState(patch);
}

let transientTimer: ReturnType<typeof setTimeout> | null = null;

/** 狀態列的暫時訊息（2.5 秒後回到最後的操作） */
export function flashStatus(text: string): void {
  if (transientTimer) clearTimeout(transientTimer);
  setEditor({ transient: text });
  transientTimer = setTimeout(() => {
    transientTimer = null;
    setEditor({ transient: null });
  }, 2500);
}

/** 目前工具的作圖種類（地面、牆壁、房間 → 子工具；舊版 activeSubtool） */
export function subtoolOf(tool: ToolName, p: MapPrefs): Subtool {
  if (tool === 'ground') return p.groundTool;
  if (tool === 'wall') return p.wallTool;
  if (tool === 'room') return p.roomTool;
  return tool;
}
