/**
 * 狀態與動作：
 * - useDoc：外觀、棋子（圖片、擺放、出框遮罩、名稱）（自動儲存、可以復原；拖曳、滑桿放開才記一步）；
 * - usePrefs：工具、模式、容許度、筆刷大小、分頁、匯出的尺寸與格式（自動儲存，不列入復原）；
 * - useUi：只在這次開頁有效的東西（按住 Alt／空白鍵、魔術棒上次點的位置、正在畫的遮罩、忙碌中）。
 * 圖片與遮罩存在資產庫（IndexedDB），狀態只記 id。
 */
import { create } from 'zustand';
import { referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import { frameDefaults } from './frames';
import type { Mask, SelectMode } from './mask';
import {
  autoPad,
  CUSTOM_SIZE,
  clamp,
  DEFAULT_SIZE,
  type DocState,
  defaultView,
  type ExportFormat,
  type FrameId,
  flipView,
  type ImageRef,
  initialState,
  type Look,
  type MaskRef,
  newToken,
  nextTokenId,
  normalizeState,
  RANGES,
  rotateView,
  type TokenItem,
  type TokenView,
  zoomViewAt,
} from './model';
import { assets, boundaryOf, peekImageWork, peekMask, putMask, TOOL_ID } from './sources';
import type { TabId, ToolId } from './strings';

export { TOOL_ID };
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useDoc = createToolStore<DocState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  coalesceMs: 0,
  historyLimit: 100,
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

export const docNow = (): DocState => useDoc.getState().data;

export function currentToken(d: DocState = docNow()): TokenItem | null {
  return d.tokens.find((t) => t.id === d.current) ?? null;
}

/** 一次變更＝一步復原（手勢中除外）；連按方向鍵、連續滾輪還沒結束時先結束成一步 */
export function edit(recipe: (d: DocState) => void): void {
  if (!burst) flushBurst();
  useDoc.getState().update((d) => {
    recipe(d as DocState);
  });
}

export function editLook(recipe: (l: Look) => void): void {
  edit((d) => recipe(d.look));
}

export function editToken(id: string | null, recipe: (t: TokenItem) => void): void {
  if (!id) return;
  edit((d) => {
    const t = d.tokens.find((x) => x.id === id);
    if (t) recipe(t);
  });
}

export function editCurrent(recipe: (t: TokenItem) => void): void {
  editToken(docNow().current, recipe);
}

export function historyStep(kind: 'undo' | 'redo'): void {
  flushBurst();
  if (useDoc.inGesture() || useUi.getState().painting) return;
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
  useUi.setState({ wand: null });
}

/* ---------- 偏好（不列入復原） ---------- */

export interface Prefs {
  tab: TabId;
  tool: ToolId;
  /** 魔術棒與筆刷共用：加入（畫）或去掉（擦） */
  mode: SelectMode;
  tolerance: number;
  contiguous: boolean;
  /** 筆刷半徑（外框半徑的 %） */
  brush: number;
  showOutline: boolean;
  autoDetect: boolean;
  /** 匯出尺寸：預設的其中一個，或 custom 時用 customSize */
  sizeChoice: number | 'custom';
  customSize: number;
  format: ExportFormat;
}

export const initialPrefs = (): Prefs => ({
  tab: 'image',
  tool: 'move',
  mode: 'add',
  tolerance: 18,
  contiguous: true,
  brush: 10,
  showOutline: true,
  autoDetect: false,
  sizeChoice: DEFAULT_SIZE,
  customSize: 300,
  format: 'png',
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

{
  const p = usePrefs.getState().data;
  const d = initialPrefs();
  const fixed: Prefs = {
    tab: (['image', 'popout', 'frame', 'export'] as TabId[]).includes(p.tab) ? p.tab : d.tab,
    tool: (['move', 'wand', 'brush'] as ToolId[]).includes(p.tool) ? p.tool : d.tool,
    mode: p.mode === 'sub' ? 'sub' : 'add',
    tolerance: clamp(Math.round(Number(p.tolerance) || d.tolerance), 1, 100),
    contiguous: p.contiguous !== false,
    brush: clamp(Math.round(Number(p.brush) || d.brush), RANGES.brush.min, RANGES.brush.max),
    showOutline: p.showOutline !== false,
    autoDetect: p.autoDetect === true,
    sizeChoice:
      p.sizeChoice === 'custom' || [256, 280, 400, 512, 1024, 2048].includes(p.sizeChoice as number)
        ? p.sizeChoice
        : d.sizeChoice,
    customSize: clamp(
      Math.round(Number(p.customSize) || d.customSize),
      CUSTOM_SIZE.min,
      CUSTOM_SIZE.max,
    ),
    format: p.format === 'webp' ? 'webp' : 'png',
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);

export function exportSizeOf(p: Prefs = prefsNow()): number {
  return p.sizeChoice === 'custom' ? p.customSize : p.sizeChoice;
}

export function setTool(tool: ToolId): void {
  if (prefsNow().tool !== tool) setPrefs({ tool });
  useUi.setState({ wand: null, hint: null });
}

/* ---------- 介面狀態 ---------- */

/** 魔術棒上次點的地方（改容許度時從這裡重新選） */
export interface WandSeed {
  tokenId: string;
  /** 遮罩的 px */
  x: number;
  y: number;
  mode: SelectMode;
  /** 點之前的遮罩（null＝空） */
  base: MaskRef | null;
  /** 點完之後的遮罩 id（遮罩被別的動作改掉時作廢） */
  result: string | null;
}

export interface UiState {
  alt: boolean;
  space: boolean;
  wand: WandSeed | null;
  /** 正在畫（筆刷）：畫完才寫進 useDoc */
  painting: boolean;
  /** 正在畫的遮罩（預覽直接用它） */
  liveMask: { tokenId: string; mask: Mask; version: number } | null;
  /** 忙碌中的說明（自動偵測、讀圖…） */
  busy: string | null;
  /** 拖曳、捏合中：邊距先固定（不讓外框跟著縮放跳動） */
  lockedPad: number | null;
  /** 預覽下方的一行說明（魔術棒加入了多少…） */
  hint: string | null;
}

export const useUi = create<UiState>(() => ({
  alt: false,
  space: false,
  wand: null,
  painting: false,
  liveMask: null,
  busy: null,
  lockedPad: null,
  hint: null,
}));

/** 目前的模式（按住 Alt 時反過來） */
export function effectiveMode(): SelectMode {
  const m = prefsNow().mode;
  return useUi.getState().alt ? (m === 'add' ? 'sub' : 'add') : m;
}

/* ---------- 邊距 ---------- */

/** 一個棋子的邊距（自動時依出框的範圍；手動時用設定） */
export function tokenPad(look: Look, token: TokenItem | null, maskOverride?: Mask | null): number {
  if (!look.autoMargin) return look.margin / 100;
  if (!token?.image) return autoPad(null, { width: 1, height: 1 }, defaultView(), look);
  const mask =
    maskOverride !== undefined
      ? maskOverride
      : token.mask
        ? (peekMask(token.mask.id) ?? null)
        : null;
  if (!token.popOn || !mask) return autoPad(null, token.image, token.view, look);
  const work = peekImageWork(token.image.id)?.work ?? null;
  const b = boundaryOf(mask, work, token.image);
  return autoPad(b, token.image, token.view, look, token.image.width / mask.width);
}

/* ---------- 外框 ---------- */

/** 換外框樣式：數量、深度、線寬回到那個樣式的預設 */
export function setFrame(frame: FrameId): void {
  editLook((l) => {
    if (l.frame === frame) return;
    l.frame = frame;
    Object.assign(l, frameDefaults(frame));
  });
}

/* ---------- 棋子與圖片 ---------- */

/** 放進一張新圖片：有目前的棋子就換掉它的圖片（擺放重設、遮罩清掉），沒有就新增一個棋子 */
export function applyImage(ref: ImageRef): string {
  const d = docNow();
  const cur = currentToken(d);
  if (cur) {
    editToken(cur.id, (t) => {
      t.image = { ...ref };
      t.view = defaultView();
      t.mask = null;
      t.popOn = true;
    });
    useUi.setState({ wand: null });
    return cur.id;
  }
  const id = nextTokenId(d.tokens);
  edit((x) => {
    x.tokens.push(newToken(id, { ...ref }));
    x.current = id;
  });
  return id;
}

/* ---------- 擺放 ---------- */

export function setView(id: string, view: TokenView): void {
  editToken(id, (t) => {
    t.view = view;
  });
}

export function patchView(patch: Partial<TokenView>): void {
  editCurrent((t) => {
    t.view = { ...t.view, ...patch };
  });
}

export function resetView(): void {
  editCurrent((t) => {
    t.view = defaultView();
  });
}

export function flipCurrent(): void {
  editCurrent((t) => {
    t.view = flipView(t.view);
  });
}

/** 方向鍵：連按（停頓 0.6 秒以內）算一步 */
export function nudgeView(dx: number, dy: number): void {
  const t = currentToken();
  if (!t?.image) return;
  startBurst();
  editCurrent((x) => {
    x.view = { ...x.view, x: clamp(x.view.x + dx, -20, 20), y: clamp(x.view.y + dy, -20, 20) };
  });
  scheduleBurstEnd(600);
}

/** 縮放（±，以中心）：連按算一步 */
export function stepZoom(delta: number): void {
  const t = currentToken();
  if (!t?.image) return;
  startBurst();
  editCurrent((x) => {
    x.view = zoomViewAt(x.view, x.view.zoom + delta, 0, 0);
  });
  scheduleBurstEnd(600);
}

/** 滾輪：以指標下的點（R 為單位、相對中心）縮放；連續滾動算一步 */
export function wheelZoom(factor: number, ax: number, ay: number): void {
  const t = currentToken();
  if (!t?.image) return;
  startBurst();
  editCurrent((x) => {
    x.view = zoomViewAt(x.view, x.view.zoom * factor, ax, ay);
  });
  scheduleBurstEnd(400);
}

export function wheelRotate(delta: number): void {
  const t = currentToken();
  if (!t?.image) return;
  startBurst();
  editCurrent((x) => {
    x.view = rotateView(x.view, delta);
  });
  scheduleBurstEnd(400);
}

export function keyRotate(delta: number): void {
  wheelRotate(delta);
}

/* ---------- 遮罩 ---------- */

/** 換掉一個棋子的遮罩（先存進資產庫，再寫進狀態＝一步復原）；回傳新的遮罩 id */
export async function commitMask(tokenId: string, mask: Mask | null): Promise<string | null> {
  const r = mask ? await putMask(mask) : null;
  editToken(tokenId, (t) => {
    t.mask = r ? r.ref : null;
    if (r) t.popOn = true;
  });
  return r?.ref.id ?? null;
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

export function flushBurst(): void {
  if (!burstOpen) return;
  clearTimeout(burstTimer);
  burstTimer = undefined;
  burstOpen = false;
  useDoc.endGesture();
}

/* ---------- 資產 ---------- */

export const docAssetIds = (d: DocState): string[] =>
  d.tokens.flatMap((t) => [t.image?.id, t.mask?.id].filter((x): x is string => !!x));

export function referencedImages(): Set<string> {
  return referencedAssetIds(useDoc, docAssetIds);
}

export { assets };

/* ---------- 重設 ---------- */

export function resetAll(next: DocState = initialState()): void {
  flushBurst();
  useDoc.getState().replace(next);
  useUi.setState({ wand: null, liveMask: null, painting: false, lockedPad: null });
}
