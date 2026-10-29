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
  normalizeLook,
  normalizeState,
  RANGES,
  rotateView,
  TOKEN_MAX,
  type TokenItem,
  type TokenView,
  zoomViewAt,
} from './model';
import { type LookPreset, PRESET_MAX, PRESET_NAME_MAX } from './presets';
import type { Guides, RefKind } from './reference';
import { assets, boundaryFor, boundaryOf, putMask, setImageKeepers, TOOL_ID } from './sources';
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
  /* 遮罩還在存（剛畫完一筆、剛點完魔術棒）：存好再復原，不然會復原到前一步 */
  if (pendingMasks > 0) {
    void maskSaved.then(() => historyStep(kind));
    return;
  }
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
  /** 把設定嵌進 PNG */
  embed: boolean;
  /** 編號組的張數 */
  setCount: number;
  /** 預設外觀：顯示範例、存的時候含匯出設定、我的預設 */
  showExamples: boolean;
  presetOutput: boolean;
  myPresets: LookPreset[];
  /** 參考輪廓：種類、不透明度 %、輔助線、自訂參考圖（資產 id） */
  refKind: RefKind;
  refOpacity: number;
  guides: Guides;
  refImage: string | null;
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
  embed: true,
  setCount: 4,
  showExamples: true,
  presetOutput: false,
  myPresets: [],
  refKind: 'off',
  refOpacity: 40,
  guides: 'off',
  refImage: null,
});

const TAB_IDS: TabId[] = ['image', 'popout', 'frame', 'text', 'fx', 'export'];
const REF_KINDS: RefKind[] = ['off', 'bust', 'head', 'body', 'profile', 'custom'];

export function normalizeMyPresets(raw: unknown): LookPreset[] {
  if (!Array.isArray(raw)) return [];
  const out: LookPreset[] = [];
  for (const p of raw) {
    if (!p || typeof p !== 'object') continue;
    const o = p as Record<string, unknown>;
    if (typeof o.name !== 'string' || !o.name.trim() || typeof o.patch !== 'object' || !o.patch)
      continue;
    out.push({
      id: typeof o.id === 'string' ? o.id : `mine-${out.length + 1}`,
      name: o.name.trim().slice(0, PRESET_NAME_MAX),
      kind: 'mine',
      patch: normalizeLook(o.patch),
      ...(o.output && typeof o.output === 'object'
        ? { output: o.output as LookPreset['output'] }
        : {}),
      savedAt: typeof o.savedAt === 'number' ? o.savedAt : 0,
    });
    if (out.length >= PRESET_MAX) break;
  }
  return out;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

{
  const p = usePrefs.getState().data;
  const d = initialPrefs();
  const fixed: Prefs = {
    tab: TAB_IDS.includes(p.tab) ? p.tab : d.tab,
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
    embed: p.embed !== false,
    setCount: clamp(
      Math.round(Number(p.setCount) || d.setCount),
      RANGES.setCount.min,
      RANGES.setCount.max,
    ),
    showExamples: p.showExamples !== false,
    presetOutput: p.presetOutput === true,
    myPresets: normalizeMyPresets(p.myPresets),
    refKind:
      REF_KINDS.includes(p.refKind) && (p.refKind !== 'custom' || typeof p.refImage === 'string')
        ? p.refKind
        : 'off',
    refOpacity: clamp(Math.round(Number(p.refOpacity) || d.refOpacity), 5, 100),
    guides: p.guides === 'cross' || p.guides === 'grid' ? p.guides : 'off',
    refImage: typeof p.refImage === 'string' ? p.refImage : null,
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

/* 不能放掉的圖：目前的棋子、自訂外框與遮罩、參考圖 */
setImageKeepers(() => {
  const d = useDoc.getState().data;
  const cur = d.tokens.find((t) => t.id === d.current)?.image?.id;
  const ref = usePrefs.getState().data.refImage;
  return [cur, d.custom.frame?.id, d.custom.mask?.id, ref].filter((x): x is string => !!x);
});

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
  /** 自動配色按了幾次（每次換下一個候選） */
  autoSeed: number;
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
  autoSeed: 0,
}));

/** 目前的模式（按住 Alt 時反過來） */
export function effectiveMode(): SelectMode {
  const m = prefsNow().mode;
  return useUi.getState().alt ? (m === 'add' ? 'sub' : 'add') : m;
}

/* ---------- 邊距 ---------- */

/** 一個棋子的邊距（自動時依出框的範圍；手動時用設定）；maskOverride：畫到一半、還沒存的遮罩 */
export function tokenPad(look: Look, token: TokenItem | null, maskOverride?: Mask | null): number {
  if (!look.autoMargin) return look.margin / 100;
  if (!token?.image) return autoPad(null, { width: 1, height: 1 }, defaultView(), look);
  if (!token.popOn) return autoPad(null, token.image, token.view, look);
  if (maskOverride !== undefined) {
    if (!maskOverride) return autoPad(null, token.image, token.view, look);
    const b = boundaryOf(maskOverride, token.image);
    return autoPad(b, token.image, token.view, look, token.image.width / maskOverride.width);
  }
  const b = token.mask ? boundaryFor(token.mask, token.image) : null;
  if (!b || !token.mask) return autoPad(null, token.image, token.view, look);
  return autoPad(b, token.image, token.view, look, token.image.width / token.mask.width);
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

/** 換掉一個棋子的圖片（擺放重設、遮罩清掉、顯示出框打開） */
export function replaceImage(tokenId: string, ref: ImageRef): void {
  editToken(tokenId, (t) => {
    t.image = { ...ref };
    t.view = defaultView();
    t.mask = null;
    t.popOn = true;
  });
  useUi.setState({ wand: null });
}

/** 加入棋子（每張圖一個；一步復原）；選取第一個新的。回傳新的 id */
export function addTokens(list: readonly Partial<TokenItem>[]): string[] {
  const d = docNow();
  const room = Math.max(0, TOKEN_MAX - d.tokens.length);
  const ids: string[] = [];
  const all = [...d.tokens];
  for (const item of list.slice(0, room)) {
    const id = nextTokenId(all);
    const t: TokenItem = { ...newToken(id, item.image ?? null), ...item, id };
    all.push(t);
    ids.push(id);
  }
  if (!ids.length) return ids;
  edit((x) => {
    x.tokens = all.map((t) => (x.tokens.find((o) => o.id === t.id) ?? t) as TokenItem);
    x.current = ids[0];
  });
  useUi.setState({ wand: null });
  return ids;
}

export function selectToken(id: string | null): void {
  if (docNow().current === id) return;
  flushBurst();
  /* 切換棋子不算一步復原 */
  useDoc.temporal.getState().pause();
  useDoc.getState().update((d) => {
    d.current = id;
  });
  useDoc.temporal.getState().resume();
  useUi.setState({ wand: null, liveMask: null });
}

export function removeToken(id: string): void {
  edit((d) => {
    const i = d.tokens.findIndex((t) => t.id === id);
    if (i < 0) return;
    d.tokens.splice(i, 1);
    if (d.current === id) d.current = d.tokens[Math.min(i, d.tokens.length - 1)]?.id ?? null;
  });
  useUi.setState({ wand: null });
}

export function clearTokens(): void {
  edit((d) => {
    d.tokens = [];
    d.current = null;
  });
  useUi.setState({ wand: null, liveMask: null });
}

export function moveToken(from: number, to: number): void {
  edit((d) => {
    const [t] = d.tokens.splice(from, 1);
    if (t) d.tokens.splice(to, 0, t);
  });
}

/* ---------- 自訂外框與遮罩 ---------- */

export function setCustomFrame(ref: ImageRef | null, inner?: number): void {
  edit((d) => {
    d.custom.frame = ref;
    if (ref) {
      d.look.frame = 'custom';
      if (inner !== undefined) d.look.customInner = inner;
    } else if (d.look.frame === 'custom') d.look.frame = 'plain';
  });
}

export function setCustomMask(ref: ImageRef | null): void {
  edit((d) => {
    d.custom.mask = ref;
  });
}

/* ---------- 預設外觀 ---------- */

export function applyLookPatch(next: Look): void {
  edit((d) => {
    d.look = next.frame === 'custom' && !d.custom.frame ? { ...next, frame: 'plain' } : next;
  });
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
export function commitMask(tokenId: string, mask: Mask | null): Promise<string | null> {
  /* 一個接一個存：連續兩筆（畫完馬上擦）時，後面那一筆不會比前面的先寫進狀態 */
  const job = maskSaved.then(async () => {
    const r = mask ? await putMask(mask) : null;
    editToken(tokenId, (t) => {
      t.mask = r ? r.ref : null;
      if (r) t.popOn = true;
    });
    return r?.ref.id ?? null;
  });
  pendingMasks++;
  maskSaved = job
    .catch(() => null)
    .finally(() => {
      pendingMasks--;
    });
  return job;
}

/** 還在存的遮罩數（復原要等它們存好） */
let pendingMasks = 0;
let maskSaved: Promise<unknown> = Promise.resolve();

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

export const docAssetIds = (d: DocState): string[] => [
  ...d.tokens.flatMap((t) => [t.image?.id, t.mask?.id].filter((x): x is string => !!x)),
  ...[d.custom.frame?.id, d.custom.mask?.id].filter((x): x is string => !!x),
];

/** 目前的狀態、復原紀錄、參考圖用到的圖（開頁的整理時保留） */
export function referencedImages(): Set<string> {
  const ids = referencedAssetIds(useDoc, docAssetIds);
  const ref = prefsNow().refImage;
  if (ref) ids.add(ref);
  return ids;
}

export { assets };

/* ---------- 重設 ---------- */

export function resetAll(next: DocState = initialState()): void {
  flushBurst();
  useDoc.getState().replace(next);
  useUi.setState({ wand: null, liveMask: null, painting: false, lockedPad: null });
}
