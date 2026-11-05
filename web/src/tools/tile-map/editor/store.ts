/**
 * 狀態：
 * - useMap：地圖本身（可以復原；自動存檔在 IndexedDB，見 persist.ts——地圖可能很大、放不進 localStorage）。
 * - usePrefs：畫面與匯出的偏好（格線、調色盤的圖塊組與分類、圖形、匯出設定）；存在 localStorage，不列入復原。
 * - useEditor：只在這一頁的狀態（工具、畫筆、圖層的選擇、選取、對話框…），不存。
 * - useLibrary：圖庫（自訂圖塊組；存在 IndexedDB，見 persist.ts），不列入復原。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import { emptyLibrary, type Library } from '../model/library';
import type { PrintSettings } from '../model/print';
import type { ShapeKind } from '../model/shapes';
import { LIMITS, type TileMap, type Turn } from '../model/types';
import { sampleMap } from '../sample';
import { DEFAULT_TILE } from '../tiles/builtin';

export const TOOL_ID = 'tile-map';
/** 專案檔的資料版本 */
export const DATA_VERSION = 1;

export const useMap = createToolStore<TileMap>(TOOL_ID, sampleMap(), {
  persist: false,
  historyLimit: LIMITS.history,
  coalesceMs: 0,
});

export const mapNow = (): TileMap => useMap.getState().data;

/** 換上新的地圖（一步復原；沒有變就不記） */
export function commitMap(next: TileMap): boolean {
  if (next === mapNow()) return false;
  useMap.getState().replace(next);
  return true;
}

export interface PngSettings {
  /** 每格幾 px（8～512） */
  px: number;
  grid: boolean;
  transparent: boolean;
}

export interface Prefs {
  grid: boolean;
  /** 調色盤選的圖塊組（'all'＝全部） */
  set: string;
  /** 分類（'all'＝全部） */
  cat: string;
  shape: ShapeKind;
  outline: boolean;
  /** 「設定大小」放圖形的寬高 */
  shapeW: number;
  shapeH: number;
  png: PngSettings;
  print: PrintSettings;
  /** 匯出的格式 */
  format: 'png' | 'pdf';
}

export const DEFAULT_PNG: PngSettings = { px: 64, grid: true, transparent: false };
export const DEFAULT_PRINT: PrintSettings = {
  cellInches: 1,
  dpi: 150,
  paper: 'a4',
  orientation: 'portrait',
  grid: true,
  background: false,
};

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  grid: true,
  set: 'all',
  cat: 'all',
  shape: 'rect',
  outline: false,
  shapeW: 3,
  shapeH: 3,
  png: DEFAULT_PNG,
  print: DEFAULT_PRINT,
  format: 'png',
});

export type ToolId = 'select' | 'brush' | 'eraser' | 'fill' | 'shape' | 'picker' | 'move-map';

export interface EditorState {
  /** 開頁的整理（讀上次的地圖、圖庫、圖片）做完了沒 */
  ready: boolean;
  tool: ToolId;
  /** 畫筆 */
  tile: string | null;
  r: Turn;
  f: boolean;
  /** 畫的圖層 */
  active: string;
  /** 選中的圖層（選取工具一起作用；至少有 active） */
  layers: string[];
  /** Shift 選圖層的起點 */
  layerAnchor: string;
  /** 選取的格子 */
  selection: number[];
  /** 畫面上的倍率（1 ＝ 每格 64 px） */
  zoom: number;
  /** 調色盤裡 Ctrl／Shift 選的圖塊（排序用） */
  organize: string[];
  organizeAnchor: string | null;
  /** 對話框 */
  dialog:
    | null
    | 'new'
    | 'settings'
    | 'export'
    | 'sets'
    | 'import'
    | { kind: 'shape'; x: number; y: number }
    | { kind: 'move'; dx: number; dy: number; count: number }
    | { kind: 'rename-layer'; id: string };
  /** 匯入對話框先帶的檔案（拖放到畫布上的圖片） */
  importFiles: File[];
  /** 匯入、管理時選的自訂圖塊組 */
  managed: string | null;
  /** 存檔狀態 */
  savedAt: number | null;
  saveError: boolean;
}

export const useEditor = create<EditorState>(() => ({
  ready: false,
  tool: 'brush',
  tile: DEFAULT_TILE,
  r: 0,
  f: false,
  active: 'layer-0',
  layers: ['layer-0'],
  layerAnchor: 'layer-0',
  selection: [],
  zoom: 0.5,
  organize: [],
  organizeAnchor: null,
  dialog: null,
  importFiles: [],
  managed: null,
  savedAt: null,
  saveError: false,
}));

export const editorNow = () => useEditor.getState();
export const setEditor = (patch: Partial<EditorState>) => useEditor.setState(patch);

export const useLibrary = create<{ lib: Library; loaded: boolean }>(() => ({
  lib: emptyLibrary(),
  loaded: false,
}));
export const libraryNow = (): Library => useLibrary.getState().lib;
