/**
 * 狀態與動作：
 * - useClue：調查熱點圖的內容（自動儲存、可以復原；文字欄從聚焦到離開算一步、拖曳一次一步）；
 * - usePrefs：舞台背景、總覽 PNG 的倍率（自動儲存，不列入復原）；
 * - useUi：只在這次開頁有效的東西（選取的熱點、工具、編輯／試玩、試玩的進度）；
 * - 圖片存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  assetIds,
  type ClueMapState,
  clampBox,
  defaultBox,
  LIMITS,
  newSpot,
  newSpotId,
  normalizeState,
  type PctBox,
  removeSpotFrom,
  type SceneRef,
  type Shape,
  type Spot,
  sceneAspect,
} from './model';
import { sampleState } from './sample';
import { S } from './strings';

export const TOOL_ID = 'clue-map';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useClue = createToolStore<ClueMapState>(TOOL_ID, sampleState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  historyLimit: 150,
});

/**
 * 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄。
 * 暫停復原紀錄再寫：沒暫停時這一筆會被記成「最後一次變更」，開頁後 0.4 秒內的第一個變更會併進這一步而不能復原。
 */
{
  const cur = useClue.getState().data;
  const fixed = normalizeState(cur);
  const t = useClue.temporal.getState();
  t.pause();
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useClue.getState().replace(fixed);
  t.resume();
  t.clear();
}

/** 文字欄：從聚焦到離開算一步 */
export const gesture = historyGesture(useClue);

export const assets = createAssetStore(TOOL_ID);

/** 整理圖片庫時保留的圖：狀態與復原紀錄裡用到的（這次開頁放進來的由 `gcStale` 保留） */
export function referencedImages(): Set<string> {
  return referencedAssetIds(useClue, assetIds);
}

export const clueNow = (): ClueMapState => useClue.getState().data;

export function edit(recipe: (d: ClueMapState) => void): void {
  useClue.getState().update((d) => {
    recipe(d as ClueMapState);
  });
}

/** 復原／重做（文字欄打字中先結束這一步） */
export function historyStep(kind: 'undo' | 'redo'): void {
  if (useClue.inGesture()) useClue.endGesture();
  const t = useClue.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/* ---------- 偏好（不列入復原） ---------- */

export type StageBg = 'dark' | 'light' | 'checker';
export const STAGE_BGS: readonly StageBg[] = ['dark', 'light', 'checker'];
export type OverviewScale = 1 | 2;

export interface Prefs {
  stageBg: StageBg;
  scale: OverviewScale;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, { stageBg: 'dark', scale: 1 });

/** 存的舞台背景（壞掉時深色） */
export const stageBgOf = (v: unknown): StageBg =>
  STAGE_BGS.includes(v as StageBg) ? (v as StageBg) : 'dark';

/* ---------- 這次開頁的狀態 ---------- */

export type Tool = 'select' | 'rect' | 'ellipse';
export type Mode = 'edit' | 'play';
export type SettingsTab = 'scene' | 'spots' | 'look';

export interface UiState {
  selectedId: string | null;
  tool: Tool;
  mode: Mode;
  tab: SettingsTab;
  /** 要把焦點放到「名稱」欄的熱點（放好就清掉） */
  focusName: string | null;
  /** 試玩：找到的熱點（找到的先後順序）、顯示所有熱點、翻開的線索卡 */
  found: string[];
  revealing: boolean;
  open: string | null;
  /** 網址場景讀進來的實際尺寸（讀進來之前不知道） */
  measured: { key: string; width: number; height: number } | null;
}

export const useUi = create<UiState>(() => ({
  selectedId: null,
  tool: 'select',
  mode: 'edit',
  tab: 'scene',
  focusName: null,
  found: [],
  revealing: false,
  open: null,
  measured: null,
}));

export const selectSpot = (id: string | null): void =>
  useUi.setState(id ? { selectedId: id, tab: 'spots' } : { selectedId: null });

export const setTool = (tool: Tool): void => useUi.setState({ tool });

/** 目前場景的寬高比（網址的圖讀進來之前用 3:2） */
export function currentAspect(): number {
  const d = clueNow();
  const m = useUi.getState().measured;
  return sceneAspect(d.scene, m && d.scene.kind === 'url' && m.key === d.scene.url ? m : null);
}

/* ---------- 熱點的動作 ---------- */

export const selectedSpot = (d: ClueMapState, id: string | null): Spot | null =>
  id ? (d.spots.find((s) => s.id === id) ?? null) : null;

/** 新增熱點（沒有給位置時放在預設位置）；到上限時回傳 null */
export function addSpot(shape: Shape, box?: PctBox): string | null {
  const d = clueNow();
  if (d.spots.length >= LIMITS.spots) return null;
  const id = newSpotId(new Set(d.spots.map((s) => s.id)));
  const b = clampBox(box ?? defaultBox(shape, currentAspect(), d.spots.length));
  edit((draft) => {
    draft.spots.push(newSpot(id, shape, b, ''));
  });
  useUi.setState({ selectedId: id, tab: 'spots', tool: 'select', focusName: id });
  return id;
}

/** 複製：名稱後加「（複製）」，往右下 3%，放在原本那個的上面一層（陣列的下一個位置）並選取 */
export function duplicateSpot(id: string): string | null {
  const d = clueNow();
  const i = d.spots.findIndex((s) => s.id === id);
  if (i < 0 || d.spots.length >= LIMITS.spots) return null;
  const src = d.spots[i];
  const nid = newSpotId(new Set(d.spots.map((s) => s.id)));
  const box = clampBox({ x: src.x + 3, y: src.y + 3, w: src.w, h: src.h });
  const name = src.name.trim() ? `${src.name.trim()}${S.spot.copySuffix}` : '';
  edit((draft) => {
    draft.spots.splice(i + 1, 0, { ...structuredClone(src), id: nid, name, ...box });
  });
  useUi.setState({ selectedId: nid, tab: 'spots' });
  return nid;
}

export function removeSpot(id: string): void {
  edit((d) => {
    d.spots = removeSpotFrom(d.spots, id);
  });
  if (useUi.getState().selectedId === id) useUi.setState({ selectedId: null });
}

/** 清單排序：把 from 移到 to */
export function moveSpot(from: number, to: number): void {
  edit((d) => {
    if (from === to || from < 0 || to < 0 || from >= d.spots.length || to >= d.spots.length) return;
    const [s] = d.spots.splice(from, 1);
    d.spots.splice(to, 0, s);
  });
}

export function patchSpot(id: string, patch: Partial<Spot>): void {
  edit((d) => {
    const s = d.spots.find((x) => x.id === id);
    if (s) Object.assign(s, patch);
  });
}

/** 位置與大小（夾在場景內） */
export function setSpotBox(id: string, box: PctBox): void {
  const b = clampBox(box);
  edit((d) => {
    const s = d.spots.find((x) => x.id === id);
    if (s) Object.assign(s, b);
  });
}

export function setScene(scene: SceneRef): void {
  edit((d) => {
    d.scene = scene;
  });
}

/* ---------- 整份換掉 ---------- */

/** 整份換掉（開啟專案檔、重設、載入範例）；選取、試玩的進度清掉 */
export function replaceAll(next: ClueMapState): void {
  useClue.getState().replace(next);
  useUi.setState({ selectedId: null, found: [], revealing: false, open: null, tool: 'select' });
}

export function loadSample(): void {
  replaceAll(sampleState());
}

export function clearSpots(): void {
  edit((d) => {
    d.spots = [];
  });
  useUi.setState({ selectedId: null, found: [], open: null });
}
