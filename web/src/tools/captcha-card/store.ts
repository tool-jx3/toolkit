/**
 * 狀態與動作：
 * - useDoc：卡片（主題色、文字、代表圖、格數、底部操作列）、16 格圖片（圖、位置、勾選）、動畫設定
 *   （自動儲存、可以復原；文字欄從聚焦到離開、滑桿放開才記一步）；
 * - usePrefs：分頁、匯出的設定（自動儲存，不列入復原）；
 * - useUi：只在這次開頁有效的東西（排列模式、滑鼠指著哪一格、圖片放進框的對話框）；
 * - 照片存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { clampPlacement, DEFAULT_PLACEMENT, type FramePlacement } from '@/core/image';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  type CaptchaState,
  type CardImage,
  type Cell,
  type Cols,
  GRID_SLOTS,
  imageSize,
  initialState,
  normalizeState,
  planFill,
  selectAllTarget,
  shuffledOrder,
  stateAssetIds,
  visibleCount,
  ZOOM_MAX,
} from './model';

export const TOOL_ID = 'captcha-card';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useDoc = createToolStore<CaptchaState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useDoc.getState().data;
  const fixed = normalizeState(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

/** 滑桿、文字欄：放開（離開）才記一步 */
export const gesture = historyGesture(useDoc);

export const docNow = (): CaptchaState => useDoc.getState().data;

/** 一次變更＝一步復原（手勢中除外） */
export function edit(recipe: (d: CaptchaState) => void): void {
  useDoc.getState().update((d) => {
    recipe(d as CaptchaState);
  });
}

/** 復原／重做（手勢中不做事） */
export function historyStep(kind: 'undo' | 'redo'): void {
  if (useDoc.inGesture()) return;
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/** 換掉整份內容（重設、開啟專案檔；可以復原） */
export function resetAll(next: CaptchaState = initialState()): void {
  useDoc.getState().replace(next);
}

/* ---------- 不列入復原的設定 ---------- */

export type TabId = 'card' | 'anim';
export const EXPORT_FORMATS = ['gif', 'apng', 'webp', 'png'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const PNG_SCALES = [1, 2, 3] as const;
export const ANIM_SCALES = [1, 1.5, 2] as const;

export interface Prefs {
  tab: TabId;
  format: ExportFormat;
  /** 動畫的播放次數（0＝無限循環） */
  plays: number;
  /** PNG 的倍率（預設 3＝1140 寬） */
  pngScale: number;
  /** 動畫的倍率（預設 1.5＝570 寬） */
  animScale: number;
}

export const initialPrefs = (): Prefs => ({
  tab: 'card',
  format: 'gif',
  plays: 0,
  pngScale: 3,
  animScale: 1.5,
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const fixed: Prefs = {
    tab: p.tab === 'anim' ? 'anim' : 'card',
    format: (EXPORT_FORMATS as readonly string[]).includes(p.format) ? p.format : 'gif',
    plays:
      typeof p.plays === 'number' && Number.isFinite(p.plays)
        ? Math.max(0, Math.min(99, Math.round(p.plays)))
        : 0,
    pngScale: (PNG_SCALES as readonly number[]).includes(p.pngScale) ? p.pngScale : 3,
    animScale: (ANIM_SCALES as readonly number[]).includes(p.animScale) ? p.animScale : 1.5,
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);

/* ---------- 這次開頁的介面狀態 ---------- */

/** 預覽上的目標：代表圖或某一格 */
export type Target = { kind: 'avatar' } | { kind: 'cell'; index: number };

/** 圖片放進框（調整範圍）的對話框 */
export interface FrameRequest {
  target: Target;
  image: CanvasImageSource;
  initial: FramePlacement;
}

export interface UiState {
  /** 排列模式：拖曳圖片到別的格子換位置 */
  arrange: boolean;
  /** 滑鼠指著預覽上的哪裡（貼上圖片用） */
  hover: Target | null;
  frame: FrameRequest | null;
}

export const useUi = create<UiState>(() => ({ arrange: false, hover: null, frame: null }));

export const setArrange = (on: boolean): void => useUi.setState({ arrange: on });

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/**
 * 目前的狀態與復原紀錄用到的圖（開頁的整理時保留）。這次開頁放進來、還沒寫進狀態的圖由 assets.gcStale 保留。
 */
export function referencedImages(): Set<string> {
  return referencedAssetIds(useDoc, stateAssetIds);
}

/* ---------- 卡片 ---------- */

export const setCols = (cols: Cols): void =>
  edit((d) => {
    d.cols = cols;
  });

/* ---------- 代表圖 ---------- */

export function setAvatarImage(image: CardImage): void {
  edit((d) => {
    d.avatar = { image, place: { ...DEFAULT_PLACEMENT } };
  });
}

export function setAvatarPlace(place: FramePlacement): void {
  edit((d) => {
    d.avatar.place = { ...place };
  });
}

export function clearAvatar(): void {
  edit((d) => {
    d.avatar = { image: null, place: { ...DEFAULT_PLACEMENT } };
  });
}

/** 代表圖的縮放（100%～400%）：以框的中心縮放，位移跟著等比例，再夾回蓋滿的範圍 */
export function zoomPlace(image: CardImage, place: FramePlacement, zoom: number): FramePlacement {
  const z = Math.max(1, Math.min(ZOOM_MAX, zoom));
  const k = place.zoom > 0 ? z / place.zoom : 1;
  return clampPlacement(
    imageSize(image),
    { width: 1, height: 1 },
    { ...place, zoom: z, x: place.x * k, y: place.y * k },
    ZOOM_MAX,
  );
}

export function setAvatarZoom(zoom: number): void {
  const av = docNow().avatar;
  if (!av.image) return;
  const next = zoomPlace(av.image, av.place, zoom);
  edit((d) => {
    d.avatar.place = next;
  });
}

/* ---------- 格子 ---------- */

const blankCell = (): Cell => ({ image: null, place: { ...DEFAULT_PLACEMENT }, selected: false });

/** 點格子：有圖時勾選／取消 */
export function toggleCell(index: number): void {
  if (!docNow().cells[index]?.image) return;
  edit((d) => {
    d.cells[index].selected = !d.cells[index].selected;
  });
}

/** 放一張新圖（位置歸零、自動勾選，同原作） */
export function setCellImage(index: number, image: CardImage): void {
  edit((d) => {
    d.cells[index] = { image, place: { ...DEFAULT_PLACEMENT }, selected: true };
  });
}

export function removeCellImage(index: number): void {
  edit((d) => {
    d.cells[index] = blankCell();
  });
}

export function setCellPlace(index: number, place: FramePlacement): void {
  edit((d) => {
    if (d.cells[index].image) d.cells[index].place = { ...place };
  });
}

/** 兩格交換（含空格＝移過去） */
export function swapCells(a: number, b: number): void {
  if (a === b) return;
  edit((d) => {
    const t = d.cells[a];
    d.cells[a] = d.cells[b];
    d.cells[b] = t;
  });
}

/**
 * 依序放圖（一步復原）：start 給了就先放那一格，其餘依序放進空格子；回傳放進的格子與沒有位置的張數。
 */
export function fillImages(
  images: readonly CardImage[],
  start: number | null = null,
): { slots: number[]; dropped: number } {
  const plan = planFill(docNow(), images.length, start);
  if (!plan.slots.length) return plan;
  edit((d) => {
    plan.slots.forEach((slot, k) => {
      d.cells[slot] = { image: images[k], place: { ...DEFAULT_PLACEMENT }, selected: true };
    });
  });
  return plan;
}

/** 全選／全不選；沒有圖時回傳 false */
export function selectAll(): boolean {
  const target = selectAllTarget(docNow());
  if (target === null) return false;
  edit((d) => {
    const n = visibleCount(d.cols);
    for (let i = 0; i < n; i++) if (d.cells[i].image) d.cells[i].selected = target;
  });
  return true;
}

/** 打亂看得到的格子（含空格）；沒有圖時回傳 false */
export function shuffleCells(random: () => number = Math.random): boolean {
  const d0 = docNow();
  const n = visibleCount(d0.cols);
  if (!d0.cells.slice(0, n).some((c) => c.image)) return false;
  const perm = shuffledOrder(n, random);
  edit((d) => {
    const old = d.cells.slice(0, n).map((c) => ({ ...c }));
    for (let i = 0; i < n; i++) d.cells[i] = old[perm[i]];
  });
  return true;
}

/** 清空所有格子（3 × 3 時藏起來的 7 格也清掉，同原作） */
export function clearCells(): void {
  edit((d) => {
    d.cells = Array.from({ length: GRID_SLOTS }, blankCell);
  });
}

/** 換一個隨機順序 */
export function nextOrderSeed(): void {
  edit((d) => {
    d.orderSeed = (d.orderSeed % 999_999) + 1;
  });
}
