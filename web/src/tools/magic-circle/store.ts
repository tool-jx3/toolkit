/**
 * 狀態：
 * - useProject：作品（復原／重做、自動儲存到 localStorage `trpg-toolkit:magic-circle`）。
 * - usePrefs：播放頭、輔助線、工具選項、匯出設定（自動儲存，不列入復原；規格 5. D4）。
 * - useUi：目前的工具、選取、正在畫的東西、狀態列訊息、分頁（不儲存）。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import type { Draft, SnapMarker, ToolId } from './editorDraw';
import type { ExportFormatId } from './exportRules';
import type { AlignReference } from './layout';
import { classicTemplate, type McElement, type McProject, type McStyle, TOOL_ID } from './model';
import type { RuneSetId } from './runes';
import { S } from './strings';

export const PROJECT_VERSION = 1;
export const STORAGE_KEY = `trpg-toolkit:${TOOL_ID}`;

/** 開頁前瀏覽器裡有沒有新版的存檔（沒有時才帶入舊版的自動儲存） */
export const hadSavedProject: boolean = (() => {
  try {
    return typeof localStorage !== 'undefined' && localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
})();

const initial = classicTemplate();
/** 開頁時的選取：沒有存檔時選範本指定的元素 */
const startSelection = hadSavedProject ? null : initial.selectedId;

export const useProject = createToolStore<McProject>(TOOL_ID, initial.project, {
  version: 1,
  historyLimit: 60,
});

export interface Prefs {
  /** 播放頭（秒） */
  playhead: number;
  showGuides: boolean;
  freehandTolerance: number;
  polygonSides: number;
  starPoints: number;
  starInner: number;
  fontPreset: string;
  exportFormat: ExportFormatId;
  exportScale: number;
  webpQuality: number;
  quantize: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  playhead: 4,
  showGuides: true,
  freehandTolerance: 2.2,
  polygonSides: 6,
  starPoints: 5,
  starInner: 0.46,
  fontPreset: 'serif',
  exportFormat: 'png',
  exportScale: 1,
  webpQuality: 90,
  quantize: false,
};

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, DEFAULT_PREFS);

export type PanelTab = 'layers' | 'style' | 'geometry' | 'motion' | 'canvas';

export interface UiState {
  tool: ToolId;
  /** 已選的 id（加入的順序） */
  selected: string[];
  /** 基準元素 */
  primary: string | null;
  /** 範圍選取的錨點 */
  anchor: string | null;
  /** 選取的節點 */
  node: { id: string; index: number } | null;
  draft: Draft | null;
  snap: SnapMarker | null;
  status: string;
  tab: PanelTab;
  clipboardStyle: McStyle | null;
  timelineCollapsed: boolean;
  alignRef: AlignReference;
  runeSet: RuneSetId;
  /** 文字內容欄的游標（盧恩插入用） */
  textSel: { id: string; start: number; end: number } | null;
}

export const useUi = create<UiState>(() => ({
  tool: 'select',
  selected: startSelection ? [startSelection] : [],
  primary: startSelection,
  anchor: startSelection,
  node: null,
  draft: null,
  snap: null,
  status: S.status.ready,
  tab: 'layers',
  clipboardStyle: null,
  timelineCollapsed: false,
  alignRef: 'canvas',
  runeSet: 'elder',
  textSel: null,
}));

/** 游標的畫布座標（狀態列；獨立的 store，移動滑鼠時不重畫編輯畫面） */
export const useCursor = create<{ x: number; y: number }>(() => ({ x: 0, y: 0 }));

export const projectNow = (): McProject => useProject.getState().data;

export function selectedElements(p: McProject = projectNow(), ui = useUi.getState()): McElement[] {
  const set = new Set(ui.selected);
  return p.elements.filter((el) => set.has(el.id));
}

export function primaryElement(
  p: McProject = projectNow(),
  ui = useUi.getState(),
): McElement | null {
  return p.elements.find((el) => el.id === ui.primary) ?? null;
}

/* 作品變了（復原、刪除、開啟）之後：選取裡已不存在的 id 拿掉 */
useProject.subscribe((st, prev) => {
  if (st.data.elements === prev.data.elements) return;
  const ids = new Set(st.data.elements.map((el) => el.id));
  const ui = useUi.getState();
  const selected = ui.selected.filter((id) => ids.has(id));
  const primary = ui.primary && ids.has(ui.primary) ? ui.primary : (selected.at(-1) ?? null);
  const anchor = ui.anchor && ids.has(ui.anchor) ? ui.anchor : primary;
  const nodeEl = ui.node ? st.data.elements.find((el) => el.id === ui.node?.id) : null;
  const node =
    ui.node && nodeEl?.type === 'path' && ui.node.index < nodeEl.points.length ? ui.node : null;
  if (
    selected.length !== ui.selected.length ||
    primary !== ui.primary ||
    anchor !== ui.anchor ||
    node !== ui.node
  )
    useUi.setState({ selected, primary, anchor, node });
});
