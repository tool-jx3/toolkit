/**
 * 狀態與動作：
 * - useDoc：尺寸、照片、放大與位移、相框與文字、貼紙、三個筆畫圖層（自動儲存、可以復原；拖曳、滑桿放開才記一步）；
 * - usePen：工具、筆的顏色與粗細、目前的圖層、分頁（自動儲存，不列入復原）；
 * - useUi：只在這次開頁有效的東西（選取的貼紙、正在畫的一筆）；
 * - 照片與貼紙的圖存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  type AspectId,
  BRUSH_RANGE,
  cardSize,
  clamp,
  clampStickerCenter,
  clampView,
  DEFAULT_BRUSH,
  DEFAULT_PEN_COLOR,
  initialState,
  LAYER_IDS,
  listToDraw,
  moveItem,
  normalizeColor,
  normalizeState,
  type PhotoRef,
  type PhotoView,
  type PolaroidState,
  panView,
  photoArea,
  type Sticker,
  type Stroke,
  TOOL_IDS,
  type ToolId,
  wheelZoom,
  zoomView,
} from './model';
import type { TabId } from './strings';

export const TOOL_ID = 'polaroid';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useDoc = createToolStore<PolaroidState>(TOOL_ID, initialState(), {
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

/** 拖曳、滑桿、文字欄：放開（離開）才記一步 */
export const gesture = historyGesture(useDoc);

export const docNow = (): PolaroidState => useDoc.getState().data;

/** 一次變更＝一步復原（手勢中除外）；連按方向鍵、連續滾輪還沒結束時先結束成一步 */
export function edit(recipe: (d: PolaroidState) => void): void {
  if (!burst) flushBurst();
  useDoc.getState().update((d) => {
    recipe(d as PolaroidState);
  });
}

/** 復原／重做：連續的滾輪或方向鍵先結束成一步；拖曳中（還沒放開）不做事 */
export function historyStep(kind: 'undo' | 'redo'): void {
  flushBurst();
  if (useDoc.inGesture() || useUi.getState().drawing) return;
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/* ---------- 筆與工具（不列入復原） ---------- */

export interface PenSettings {
  tool: ToolId;
  color: string;
  size: number;
  /** 目前的圖層（圖層的 id，不是位置） */
  layer: string;
  tab: TabId;
}

export const initialPen = (): PenSettings => ({
  tool: 'move',
  color: DEFAULT_PEN_COLOR,
  size: DEFAULT_BRUSH,
  layer: LAYER_IDS[0],
  tab: 'edit',
});

export const usePen = createPreviewStore<PenSettings>(TOOL_ID, initialPen());

/* 存下來的筆設定可能被改壞：開頁時整理一次 */
{
  const p = usePen.getState().data;
  const fixed: PenSettings = {
    tool: TOOL_IDS.includes(p.tool) ? p.tool : 'move',
    color: normalizeColor(p.color, DEFAULT_PEN_COLOR),
    size:
      typeof p.size === 'number' && Number.isFinite(p.size)
        ? Math.round(clamp(p.size, BRUSH_RANGE.min, BRUSH_RANGE.max))
        : DEFAULT_BRUSH,
    layer: typeof p.layer === 'string' ? p.layer : LAYER_IDS[0],
    tab: p.tab === 'decorate' ? 'decorate' : 'edit',
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePen.getState().replace(fixed);
}

export const penNow = (): PenSettings => usePen.getState().data;
export const setPen = (patch: Partial<PenSettings>): void => usePen.getState().patch(patch);

export function setTool(tool: ToolId): void {
  setPen({ tool });
}

/** 目前的圖層（找不到時是最下面那個） */
export function activeLayerId(d: PolaroidState = docNow()): string {
  const id = penNow().layer;
  return d.layers.some((l) => l.id === id) ? id : (d.layers[0]?.id ?? LAYER_IDS[0]);
}

/* ---------- 介面狀態 ---------- */

export interface LiveStroke {
  layer: string;
  stroke: Stroke;
  /** 每加一點就加 1（預覽據此重畫） */
  version: number;
}

export interface UiState {
  selectedSticker: string | null;
  /** 正在畫的一筆（放開時才寫進 useDoc） */
  drawing: LiveStroke | null;
  /** 拖著檔案經過貼紙區（全視窗拖放的提示改說「加入貼紙」） */
  dropOnSticker: boolean;
}

export const useUi = create<UiState>(() => ({
  selectedSticker: null,
  drawing: null,
  dropOnSticker: false,
}));

export const selectSticker = (id: string | null): void => useUi.setState({ selectedSticker: id });

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 這次開頁放進資產庫的圖（清掉沒用到的圖時一律保留：還沒寫進狀態的、剛讀完的專案檔） */
const sessionAssets = new Set<string>();
export const markSessionAsset = (id: string): void => {
  sessionAssets.add(id);
};

/** 一份狀態用到的圖 */
export const docAssetIds = (d: PolaroidState): string[] => [
  ...(d.photo ? [d.photo.id] : []),
  ...d.stickers.map((s) => s.asset),
];

/** 目前的狀態、復原紀錄與這次開頁放進來的圖（清掉沒用到的圖時保留） */
export function referencedImages(): Set<string> {
  const ids = referencedAssetIds(useDoc, docAssetIds);
  for (const id of sessionAssets) ids.add(id);
  return ids;
}

/* ---------- 尺寸 ---------- */

/** 換尺寸（F02、D12）：清掉所有筆畫、位移夾回新的照片範圍、中心在相框外的貼紙拉回來；選目前的尺寸不做事 */
export function setAspect(aspect: AspectId): void {
  if (docNow().aspect === aspect) return;
  edit((d) => {
    d.aspect = aspect;
    for (const l of d.layers) l.strokes = [];
    d.view = clampView(photoArea(aspect), d.photo, d.view);
    const card = cardSize(aspect);
    d.stickers = d.stickers.map((s) => clampStickerCenter(s, card));
  });
}

/* ---------- 照片 ---------- */

/** 放進新照片（F07）：放大 1、置中；筆畫、貼紙、文字保留 */
export function applyPhoto(photo: PhotoRef): void {
  edit((d) => {
    d.photo = { ...photo };
    d.view = { zoom: 1, ox: 0, oy: 0 };
  });
}

export function setZoom(zoom: number): void {
  edit((d) => {
    if (!d.photo) return;
    d.view = zoomView(photoArea(d.aspect), d.photo, d.view, zoom);
  });
}

export function resetView(): void {
  edit((d) => {
    if (!d.photo) return;
    d.view = { zoom: 1, ox: 0, oy: 0 };
  });
}

/** 拖曳取景（從按下時的位移加上移動量） */
export function panPhoto(start: PhotoView, dx: number, dy: number): void {
  edit((d) => {
    if (!d.photo) return;
    d.view = panView(photoArea(d.aspect), d.photo, start, dx, dy);
  });
}

/** 滾輪放大（連續的滾動算一步） */
export function wheelPhoto(deltaY: number): void {
  const d = docNow();
  if (!d.photo) return;
  startBurst();
  edit((x) => {
    if (!x.photo) return;
    x.view = zoomView(photoArea(x.aspect), x.photo, x.view, wheelZoom(x.view.zoom, deltaY));
  });
  scheduleBurstEnd(400);
}

/* ---------- 筆畫 ---------- */

/** 一筆畫完：加到那個圖層（一步復原） */
export function commitStroke(layer: string, stroke: Stroke): void {
  edit((d) => {
    const l = d.layers.find((x) => x.id === layer);
    if (l) l.strokes.push(stroke);
  });
}

export function clearLayer(id: string): void {
  edit((d) => {
    const l = d.layers.find((x) => x.id === id);
    if (l) l.strokes = [];
  });
}

export function clearAllLayers(): void {
  edit((d) => {
    for (const l of d.layers) l.strokes = [];
  });
}

export function setLayerVisible(id: string, visible: boolean): void {
  edit((d) => {
    const l = d.layers.find((x) => x.id === id);
    if (l) l.visible = visible;
  });
}

/** 清單（上層在前）的 from 列移到 to 列 */
export function moveLayerInList(from: number, to: number): void {
  edit((d) => {
    const n = d.layers.length;
    d.layers = moveItem(d.layers, listToDraw(n, from), listToDraw(n, to));
  });
}

/* ---------- 貼紙 ---------- */

/** 加入貼紙（一步復原）：選取最後加入的那張、切到移動工具（F34） */
export function addStickers(list: Sticker[]): void {
  if (!list.length) return;
  edit((d) => {
    d.stickers.push(...list);
  });
  selectSticker(list[list.length - 1].id);
  setTool('move');
}

export function patchSticker(id: string, patch: Partial<Omit<Sticker, 'id' | 'asset'>>): void {
  edit((d) => {
    const i = d.stickers.findIndex((s) => s.id === id);
    if (i < 0) return;
    d.stickers[i] = clampStickerCenter({ ...d.stickers[i], ...patch }, cardSize(d.aspect));
  });
}

/** 刪除貼紙；刪的是選取中的那張時改選最上面的那張（F39） */
export function removeSticker(id: string): void {
  edit((d) => {
    d.stickers = d.stickers.filter((s) => s.id !== id);
  });
  if (useUi.getState().selectedSticker === id) {
    const list = docNow().stickers;
    selectSticker(list[list.length - 1]?.id ?? null);
  }
}

/** 清單（上層在前）的 from 列移到 to 列 */
export function moveStickerInList(from: number, to: number): void {
  edit((d) => {
    const n = d.stickers.length;
    d.stickers = moveItem(d.stickers, listToDraw(n, from), listToDraw(n, to));
  });
}

/** 方向鍵移動貼紙：連按（停頓 0.5 秒以內）算一步 */
export function nudgeSticker(id: string, cx: number, cy: number): void {
  startBurst();
  patchSticker(id, { cx, cy });
  scheduleBurstEnd(500);
}

/* ---------- 連續動作（滾輪、方向鍵）合成一步 ---------- */

let burstTimer: ReturnType<typeof setTimeout> | undefined;
let burst = false;
let burstOpen = false;

function startBurst(): void {
  if (!burstOpen) {
    useDoc.beginGesture();
    burstOpen = true;
  }
  burst = true;
  queueMicrotask(() => {
    burst = false;
  });
}

function scheduleBurstEnd(ms: number): void {
  clearTimeout(burstTimer);
  burstTimer = setTimeout(flushBurst, ms);
}

/** 結束連續動作（開始別的動作之前呼叫，兩者不會併成同一步） */
export function flushBurst(): void {
  if (!burstOpen) return;
  clearTimeout(burstTimer);
  burstTimer = undefined;
  burstOpen = false;
  useDoc.endGesture();
}

/* ---------- 重設 ---------- */

export function resetAll(next: PolaroidState = initialState()): void {
  flushBurst();
  useDoc.getState().replace(next);
  useUi.setState({ selectedSticker: null, drawing: null, dropOnSticker: false });
}
