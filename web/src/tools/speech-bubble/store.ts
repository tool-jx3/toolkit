/**
 * 狀態：
 * - useSb：泡泡與所有設定（自動儲存 `trpg-toolkit:speech-bubble`、可復原；拖曳、滑桿、文字欄放開／離開才記一步）。
 * - usePrefs：不列入復原的偏好（範本一覽的分類、搜尋、縮圖背景與播放、匯出格式、是否開始編輯過）。
 * - useUi：這次開頁的畫面（範本一覽／編輯、選取的泡泡、分頁），不存。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { moveItem } from '@/core/compose';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  type Align,
  type Bubble,
  bubbleCustom,
  cloneFmt,
  cloneLook,
  DEFAULT_FMT,
  getLook,
  LOOK_KEYS,
  type LookKey,
  lookOf,
  MAX_BUBBLES,
  MAX_OFFSET,
  newBubbleId,
  normalizeCustom,
  normalizeData,
  type SbData,
  type StyleId,
  sameLookValue,
  setLook,
  TOOL_ID,
} from './model';
import { applyPreset, type CategoryId, defaultData, type Preset } from './presets';
import { normalizeSavedStyles, type SavedStyle } from './stylePresets';
import { styleDefaults } from './styles';

/** 資料版本：2026-10 整合對話卡片時從 1 加到 2（兩側的預設、單獨改過的項目、卡片底…；舊的存檔與專案檔由 normalize 補齊） */
export const DATA_VERSION = 2;

export const normalize = (raw: unknown): SbData | null =>
  normalizeData(raw, styleDefaults, () => defaultData().bubbles);

export const useSb = createToolStore<SbData>(TOOL_ID, defaultData(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalize(persisted) ?? defaultData(),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useSb.getState().data;
  const fixed = normalize(cur) ?? defaultData();
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useSb.getState().replace(fixed);
  useSb.temporal.getState().clear();
}

/** 滑桿、文字欄、調色盤、拖曳排序：放開（離開）才記一步 */
export const gesture = historyGesture(useSb);

export const sbNow = (): SbData => useSb.getState().data;

/** 一次變更＝一步復原（手勢中合成一步） */
export function edit(recipe: (d: SbData) => void): void {
  useSb.getState().update((d) => {
    recipe(d as SbData);
  });
}

export type ThumbBg = 'dark' | 'light' | 'checker';

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface SbPrefs {
  /** 套用過範本（範本一覽顯示「繼續編輯」） */
  started: boolean;
  category: CategoryId | 'all';
  query: string;
  thumbBg: ThumbBg;
  motion: boolean;
  format: string;
  plays: number;
  scale: number;
  quantize: boolean;
  /** 自己存的樣式預設（2026-10） */
  styles: SavedStyle[];
}

export const usePrefs = createPreviewStore<SbPrefs>(TOOL_ID, {
  started: false,
  category: 'all',
  query: '',
  thumbBg: 'dark',
  motion: !prefersReducedMotion(),
  format: 'apng',
  plays: 0,
  scale: 1,
  quantize: false,
  styles: [],
});

/** 自己存的樣式預設（讀的時候整理，壞掉的丟掉） */
export const savedStyles = (): SavedStyle[] =>
  normalizeSavedStyles(usePrefs.getState().data.styles);

/* ---------- 圖片（卡片的背景圖） ---------- */

/** 圖片資產庫（IndexedDB；狀態只存 id） */
export const assets = createAssetStore(TOOL_ID);

/** 還有人用的圖：目前的內容與復原紀錄、存著的樣式預設 */
export function referencedImages(): Set<string> {
  const ids = referencedAssetIds(useSb, (d) => [d.card?.image]);
  for (const s of savedStyles()) if (s.card.image) ids.add(s.card.image);
  return ids;
}

export type Screen = 'gallery' | 'editor';
export type Tab = 'bubbles' | 'style' | 'motion' | 'layout';

export interface UiState {
  screen: Screen;
  selectedId: string | null;
  tab: Tab;
  /** 預覽上可以拖曳泡泡（F67） */
  drag: boolean;
  /** 「樣式」分頁正在改哪一側 */
  side: Align;
}

export const useUi = create<UiState>(() => ({
  screen: 'gallery',
  selectedId: null,
  tab: 'bubbles',
  drag: false,
  side: 'left',
}));

/** 目前選取的泡泡（選取的不存在時是第一個） */
export function selectedBubble(d: SbData, id: string | null): Bubble {
  return d.bubbles.find((b) => b.id === id) ?? d.bubbles[0];
}

export const select = (id: string): void => useUi.setState({ selectedId: id });

/* ---------- 動作 ---------- */

/** 套用範本並進入編輯畫面（F08） */
export function choosePreset(p: Preset): void {
  const next = applyPreset(p);
  useSb.getState().replace(next);
  usePrefs.getState().patch({ started: true });
  useUi.setState({ screen: 'editor', selectedId: next.bubbles[0]?.id ?? null });
}

export function patchBubble(id: string, patch: Partial<Omit<Bubble, 'id'>>): void {
  edit((d) => {
    const b = d.bubbles.find((x) => x.id === id);
    if (b) Object.assign(b, patch);
  });
}

/* ---------- 樣式：兩側的預設與單獨調整（F57～） ---------- */

export type LookPatch = Partial<Record<LookKey, unknown>>;

/** 換造型時一起換的項目：造型、造型的預設配色與圖示 */
export function stylePatch(style: StyleId): LookPatch {
  const d = styleDefaults(style);
  return { style, ...d.colors, icon: d.icon };
}

/**
 * 把一側的預設寫進那一側的泡泡：keys（不給＝全部）裡沒有單獨改過的項目換成預設；
 * 單獨改過、但現在剛好和預設相同的項目不再算單獨改過。
 */
function syncSide(d: SbData, side: Align, keys: readonly LookKey[] = LOOK_KEYS): void {
  const look = d.sides[side];
  for (const b of d.bubbles) {
    if (b.align !== side) continue;
    const custom = bubbleCustom(b);
    for (const k of keys) if (!custom.includes(k)) setLook(b, k, getLook(look, k));
    b.custom = custom.filter((k) => !sameLookValue(getLook(b, k), getLook(look, k)));
  }
}

/** 改一側的預設：套用到那一側沒有單獨改過的泡泡（F58） */
export function setSideLook(side: Align, patch: LookPatch): void {
  const keys = Object.keys(patch) as LookKey[];
  edit((d) => {
    for (const k of keys) setLook(d.sides[side], k, patch[k]);
    syncSide(d, side, keys);
  });
}

/** 把一側的預設複製到另一側（那一側沒有單獨改過的泡泡跟著換） */
export function copySide(from: Align, to: Align): void {
  if (from === to) return;
  edit((d) => {
    d.sides[to] = cloneLook(d.sides[from]);
    syncSide(d, to);
  });
}

/** 單獨改一個泡泡的樣式：和那一側的預設不同的項目記成「單獨改過」，相同的拿掉（F59） */
export function patchBubbleLook(id: string, patch: LookPatch): void {
  edit((d) => {
    const b = d.bubbles.find((x) => x.id === id);
    if (!b) return;
    const side = d.sides[b.align];
    const custom = new Set(bubbleCustom(b));
    for (const [k, v] of Object.entries(patch) as [LookKey, unknown][]) {
      setLook(b, k, v);
      if (sameLookValue(getLook(b, k), getLook(side, k))) custom.delete(k);
      else custom.add(k);
    }
    b.custom = normalizeCustom([...custom]);
  });
}

/** 換造型：配色與圖示換成新造型的預設（F23） */
export function setStyle(id: string, style: Bubble['style']): void {
  patchBubbleLook(id, stylePatch(style));
}

/** 這個泡泡回到這一側的預設（單獨改過的全部取消） */
export function resetBubbleLook(id: string): void {
  edit((d) => {
    const b = d.bubbles.find((x) => x.id === id);
    if (!b) return;
    const side = d.sides[b.align];
    for (const k of LOOK_KEYS) setLook(b, k, getLook(side, k));
    b.custom = [];
  });
}

/** 把這個泡泡的樣式存成這一側的預設（同一側沒有單獨改過的泡泡跟著換） */
export function saveBubbleAsSide(id: string): void {
  edit((d) => {
    const b = d.bubbles.find((x) => x.id === id);
    if (!b) return;
    d.sides[b.align] = lookOf(b);
    b.custom = [];
    syncSide(d, b.align);
  });
}

/**
 * 換位置：沒有單獨改過的項目換成新位置那一側的預設（F20、F58）；
 * 單獨改過、但和新的一側相同的項目不再算單獨改過。
 */
export function setAlign(id: string, align: Align): void {
  edit((d) => {
    const b = d.bubbles.find((x) => x.id === id);
    if (!b || b.align === align) return;
    b.align = align;
    const look = d.sides[align];
    const custom = bubbleCustom(b);
    for (const k of LOOK_KEYS) if (!custom.includes(k)) setLook(b, k, getLook(look, k));
    b.custom = custom.filter((k) => !sameLookValue(getLook(b, k), getLook(look, k)));
  });
}

/* ---------- 自由拖曳的位移（F67） ---------- */

const clampOffset = (v: number) =>
  Math.round(Math.min(MAX_OFFSET, Math.max(-MAX_OFFSET, v)) * 10) / 10;

export function setOffset(id: string, dx: number, dy: number): void {
  edit((d) => {
    const b = d.bubbles.find((x) => x.id === id);
    if (!b) return;
    b.dx = clampOffset(dx);
    b.dy = clampOffset(dy);
  });
}

/** 回到排列的位置（id 不給＝全部） */
export function resetOffsets(id?: string): void {
  edit((d) => {
    for (const b of d.bubbles) {
      if (id && b.id !== id) continue;
      b.dx = 0;
      b.dy = 0;
    }
  });
}

export const hasOffset = (b: Pick<Bubble, 'dx' | 'dy'>): boolean => !!(b.dx || b.dy);

/* ---------- 卡片底、頁首與頁尾（F62、F63） ---------- */

export function editCard(recipe: (c: SbData['card']) => void): void {
  edit((d) => recipe(d.card));
}

/** 新增泡泡：照抄選取的泡泡的造型、配色、圖示與位置，文字是空的（F13） */
export function addBubble(afterId: string | null): string | null {
  const d = sbNow();
  if (d.bubbles.length >= MAX_BUBBLES) return null;
  const src = selectedBubble(d, afterId);
  const id = newBubbleId();
  edit((x) => {
    const at = x.bubbles.findIndex((b) => b.id === src.id);
    x.bubbles.splice(at + 1, 0, {
      ...src,
      id,
      title: '',
      text: '新的泡泡',
      button: '',
      colors: { ...src.colors },
      time: '',
      fmt: cloneFmt(src.fmt ?? DEFAULT_FMT),
      custom: [...bubbleCustom(src)],
      dx: 0,
      dy: 0,
    });
  });
  useUi.setState({ selectedId: id });
  return id;
}

/** 複製泡泡（含文字），放在原本的後面 */
export function duplicateBubble(id: string): string | null {
  const d = sbNow();
  if (d.bubbles.length >= MAX_BUBBLES) return null;
  const nid = newBubbleId();
  edit((x) => {
    const at = x.bubbles.findIndex((b) => b.id === id);
    if (at < 0) return;
    const src = x.bubbles[at];
    x.bubbles.splice(at + 1, 0, {
      ...src,
      id: nid,
      colors: { ...src.colors },
      fmt: cloneFmt(src.fmt ?? DEFAULT_FMT),
      custom: [...bubbleCustom(src)],
    });
  });
  useUi.setState({ selectedId: nid });
  return nid;
}

export function removeBubble(id: string): void {
  const d = sbNow();
  if (d.bubbles.length <= 1) return;
  const at = d.bubbles.findIndex((b) => b.id === id);
  edit((x) => {
    x.bubbles = x.bubbles.filter((b) => b.id !== id);
  });
  const rest = sbNow().bubbles;
  useUi.setState({ selectedId: rest[Math.min(at, rest.length - 1)]?.id ?? null });
}

export function moveBubble(from: number, to: number): void {
  edit((d) => {
    d.bubbles = moveItem(d.bubbles, from, to);
  });
}

/** 把一個泡泡的造型、配色、圖示套用到全部（F21）；回傳改到幾個 */
export function applyLookToAll(id: string): number {
  const d = sbNow();
  const src = d.bubbles.find((b) => b.id === id);
  if (!src) return 0;
  const others = d.bubbles.filter((b) => b.id !== id);
  if (!others.length) return 0;
  edit((x) => {
    const keys: LookKey[] = ['style', 'fill', 'border', 'text', 'accent', 'icon'];
    for (const b of x.bubbles) {
      if (b.id === id) continue;
      b.style = src.style;
      b.colors = { ...src.colors };
      b.icon = src.icon;
      /* 和那一側的預設不同的就算單獨改過 */
      const side = x.sides[b.align];
      const custom = new Set(bubbleCustom(b));
      for (const k of keys)
        if (sameLookValue(getLook(b, k), getLook(side, k))) custom.delete(k);
        else custom.add(k);
      b.custom = normalizeCustom([...custom]);
    }
  });
  return others.length;
}
