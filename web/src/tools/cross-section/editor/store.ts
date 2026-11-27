/**
 * 狀態：
 * - useDoc：斷面圖本身（自動存到 localStorage、可以復原 80 步）。一次操作、一次拖曳、一次放開滑桿各算一步。
 * - usePrefs：不列入復原的偏好（分頁、設備的分類、放置的出現時機、連續放置、匯出的設定）；自動存。
 * - useEditor：只在這一頁的狀態（工具、選取、GM 用／PL 用、對話框），不存。
 */
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import type { Crop } from '../draw/render';
import type { FixtureCategory } from '../model/catalog';
import { normalizeDoc } from '../model/normalize';
import { sampleDoc } from '../model/samples';
import type { Arrange, Audience, EnvId, Moment, SectionDoc, SelRef } from '../model/types';
import { DEFAULT_ZIP, type ZipOptions } from '../zip/plan';

export const TOOL_ID = 'cross-section';
/** 存檔格式版本。1：第一批（縱向的建築斷面）。 */
export const DATA_VERSION = 1;

export const starterDoc = (): SectionDoc => sampleDoc('manor');

let persistError: ((e: unknown) => void) | null = null;
export function onPersistError(fn: ((e: unknown) => void) | null): void {
  persistError = fn;
}

export const useDoc = createToolStore<SectionDoc>(TOOL_ID, starterDoc(), {
  version: DATA_VERSION,
  historyLimit: 80,
  coalesceMs: 0,
  migrate: (persisted) => normalizeDoc(persisted) ?? starterDoc(),
  onPersistError: (e) => persistError?.(e),
});

/* 讀進來的自動儲存整理一次（壞掉時換回範例）；這一步不算復原 */
{
  const data = useDoc.getState().data;
  const fixed = normalizeDoc(data);
  if (!fixed) useDoc.getState().replace(starterDoc());
  else if (JSON.stringify(fixed) !== JSON.stringify(data)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

export const docNow = (): SectionDoc => useDoc.getState().data;

export type LeftTab = 'build' | 'fixtures' | 'finish';
/** 放置的出現時機：auto＝照種類 */
export type PlacePhase = 'auto' | 'any' | Moment;

/** 房間 ZIP 的設定（偏好；淹水與列車的排法在打開時帶入作品的） */
export type ZipPrefs = Omit<ZipOptions, 'flood' | 'arrange'>;

export interface Prefs {
  tab: LeftTab;
  /** 匯出對話框的分頁（第二批） */
  expTab: 'png' | 'zip';
  zip: ZipPrefs;
  category: FixtureCategory | 'all';
  phase: PlacePhase;
  repeat: boolean;
  exp: {
    crop: Crop;
    audience: Audience;
    longEdge: number;
    cellPx: number;
    transparent: boolean;
  };
}

const { flood: _flood, arrange: _arrange, ...zipDefaults } = DEFAULT_ZIP;

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  tab: 'build',
  expTab: 'png',
  zip: zipDefaults,
  category: 'all',
  phase: 'auto',
  repeat: true,
  exp: { crop: 'sheet', audience: 'player', longEdge: 2400, cellPx: 48, transparent: false },
});

export type ToolId = 'select' | 'place' | 'note' | 'hand';

export interface EditorState {
  tool: ToolId;
  /** 放置的設備 */
  kind: string;
  sel: SelRef | null;
  audience: Exclude<Audience, 'reveal'>;
  zoomPct: number;
  exportOpen: boolean;
  startOpen: boolean;
  query: string;
  /** 匯出時選的環境與淹水（打開對話框時帶入畫面上的） */
  expEnv: EnvId;
  expFlood: boolean;
  /** 房間 ZIP：加淹水的場景、列車的排法（打開時帶入作品的） */
  zipFlood: boolean;
  zipArrange: Arrange;
}

export const useEditor = create<EditorState>(() => ({
  tool: 'select',
  kind: 'tank',
  sel: null,
  audience: 'gm',
  zoomPct: 100,
  exportOpen: false,
  startOpen: false,
  query: '',
  expEnv: 'day',
  expFlood: false,
  zipFlood: false,
  zipArrange: 'auto',
}));

export const setEditor = (patch: Partial<EditorState>): void => useEditor.setState(patch);
