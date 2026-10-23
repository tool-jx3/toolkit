/**
 * 狀態：
 * - useTree：所有圖板（自動儲存、復原／重做；規格 3.5）。復原紀錄在換圖板時清空（每張圖板分開，F69）。
 * - usePrefs：目前的圖板、顯示設定、拖曳方式、每張圖板的折疊、匯出設定（存在瀏覽器、不列入復原）。
 * - useUi：選取、就地編輯、拖曳中的草稿、畫面的平移縮放（不保存）。
 */
import type { Draft } from 'immer';
import { create } from 'zustand';
import { createPreviewStore, createToolStore } from '@/core/storage';
import type { ExportCard, ExportOrient, ExportRange } from './export/render';
import { exampleBoard } from './model/example';
import type { CardMode } from './model/layout';
import { cleanTreeData } from './model/sanitize';
import type { Board, InlineField, People, TreeData } from './model/types';
import { S } from './strings';

export const TOOL_ID = 'family-tree';
export const DATA_VERSION = 1;

function initialData(): TreeData {
  return { boards: [exampleBoard('b-example', '2026-01-01T00:00:00.000Z')] };
}

export const useTree = createToolStore<TreeData>(TOOL_ID, initialData(), {
  version: DATA_VERSION,
  migrate: (persisted) => cleanTreeData(persisted),
});

/* 自動儲存讀回來的資料整理一次（文字上限、壞掉的關係…）；一張都沒有時放範例 */
{
  const d = cleanTreeData(useTree.getState().data);
  if (!d.boards.length) d.boards.push(exampleBoard());
  useTree.setState({ data: d });
  useTree.temporal.getState().clear();
}

export type DragMode = 'order' | 'gap';
export type SettingsTab = 'person' | 'view' | 'export';

export interface Prefs {
  current: string | null;
  cardMode: CardMode;
  memo: boolean;
  spouses: boolean;
  colors: boolean;
  dragMode: DragMode;
  /** 每張圖板折疊的人 */
  collapsed: Record<string, string[]>;
  tab: SettingsTab;
  exportRange: ExportRange;
  exportOrient: ExportOrient;
  exportCard: ExportCard;
  exportTitle: boolean;
  exportGens: boolean;
  exportSpouses: boolean;
  exportScale: number;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  current: null,
  cardMode: 'full',
  memo: false,
  spouses: true,
  colors: true,
  dragMode: 'order',
  collapsed: {},
  tab: 'person',
  exportRange: 'all',
  exportOrient: 'v',
  exportCard: 'view',
  exportTitle: true,
  exportGens: true,
  exportSpouses: true,
  exportScale: 2,
});

export const prefsNow = () => usePrefs.getState().data;
export const setPrefs = (p: Partial<Prefs>) => usePrefs.getState().patch(p);

/* ---------- 圖板 ---------- */

export const treeNow = () => useTree.getState().data;

/** 目前的圖板（記住的找不到時第一張） */
export function pickBoard(data: TreeData, current: string | null): Board {
  return data.boards.find((b) => b.id === current) ?? data.boards[0];
}

export const boardNow = () => pickBoard(treeNow(), prefsNow().current);

export function useBoard(): Board {
  const data = useTree((s) => s.data);
  const current = usePrefs((s) => s.data.current);
  return pickBoard(data, current);
}

/** 改目前的圖板（一次 update＝一步復原） */
export function updateBoard(recipe: (b: Draft<Board>) => void): void {
  const id = boardNow().id;
  useTree.getState().update((d) => {
    const b = d.boards.find((x) => x.id === id);
    if (b) recipe(b);
  });
}

export function updatePeople(recipe: (people: Draft<People>) => void): void {
  updateBoard((b) => recipe(b.people));
}

/** 切換圖板：取消選取、復原紀錄清空 */
export function switchBoard(id: string): void {
  if (id === prefsNow().current && id === boardNow().id) return;
  useTree.endGesture();
  setPrefs({ current: id });
  useTree.temporal.getState().clear();
  resetUi();
}

/* ---------- 折疊（每張圖板分開；不列入復原） ---------- */

export function collapsedOf(prefs: Prefs, boardId: string): string[] {
  return prefs.collapsed[boardId] ?? [];
}

export function setCollapsed(boardId: string, ids: string[]): void {
  usePrefs.getState().update((p) => {
    if (ids.length) p.collapsed[boardId] = ids;
    else delete p.collapsed[boardId];
  });
}

export function toggleFold(id: string): void {
  const b = boardNow();
  const list = collapsedOf(prefsNow(), b.id);
  setCollapsed(b.id, list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
}

export function expand(ids: string[]): void {
  const b = boardNow();
  const list = collapsedOf(prefsNow(), b.id);
  if (!ids.some((id) => list.includes(id))) return;
  setCollapsed(
    b.id,
    list.filter((x) => !ids.includes(x)),
  );
}

/* ---------- 畫面上的狀態（不保存） ---------- */

export interface DragView {
  /** 被拖的成員 */
  id: string;
  /** 拖曳中的人物資料（同一列重排的結果；換父母時是原本的） */
  people: People;
  /** 跟著移動的人（加虛線外框） */
  moving: string[];
  /** 放下的目標（卡片的 data-pid）與能不能放 */
  target: { pid: string; ok: boolean } | null;
  label: string;
  /** 指標旁的半透明卡片：在畫面（viewport）上的左上角 */
  ghost: { x: number; y: number };
}

export interface Ui {
  selectedId: string | null;
  editing: { id: string; field: InlineField } | null;
  drag: DragView | null;
  exportName: string | null;
}

export const useUi = create<Ui>(() => ({
  selectedId: null,
  editing: null,
  drag: null,
  exportName: null,
}));

export function resetUi(): void {
  useUi.setState({ selectedId: null, editing: null, drag: null });
}

export function select(id: string | null): void {
  if (useUi.getState().selectedId === id) return;
  useUi.setState({ selectedId: id, editing: null });
  if (id) setPrefs({ tab: 'person' });
}

/* ---------- 新圖板 ---------- */

export function uniqueTitle(base: string, boards: readonly Board[]): string {
  const titles = new Set(boards.map((b) => b.title));
  if (!titles.has(base)) return base;
  for (let i = 2; ; i++) if (!titles.has(`${base} ${i}`)) return `${base} ${i}`;
}

export const defaultTitle = () => S.newBoardTitle;
