/**
 * 狀態：
 * - useSb：泡泡與所有設定（自動儲存 `trpg-toolkit:speech-bubble`、可復原；拖曳、滑桿、文字欄放開／離開才記一步）。
 * - usePrefs：不列入復原的偏好（範本一覽的分類、搜尋、縮圖背景與播放、匯出格式、是否開始編輯過）。
 * - useUi：這次開頁的畫面（範本一覽／編輯、選取的泡泡、分頁），不存。
 */
import { create } from 'zustand';
import { moveItem } from '@/core/compose';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  type Bubble,
  MAX_BUBBLES,
  newBubbleId,
  normalizeData,
  type SbData,
  TOOL_ID,
} from './model';
import { applyPreset, type CategoryId, defaultData, type Preset } from './presets';
import { styleDefaults } from './styles';

export const DATA_VERSION = 1;

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
});

export type Screen = 'gallery' | 'editor';
export type Tab = 'bubbles' | 'motion' | 'layout';

export interface UiState {
  screen: Screen;
  selectedId: string | null;
  tab: Tab;
}

export const useUi = create<UiState>(() => ({
  screen: 'gallery',
  selectedId: null,
  tab: 'bubbles',
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

/** 換造型：配色與圖示換成新造型的預設（F14） */
export function setStyle(id: string, style: Bubble['style']): void {
  const def = styleDefaults(style);
  patchBubble(id, { style, colors: def.colors, icon: def.icon });
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
    x.bubbles.splice(at + 1, 0, { ...src, id: nid, colors: { ...src.colors } });
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
    for (const b of x.bubbles) {
      if (b.id === id) continue;
      b.style = src.style;
      b.colors = { ...src.colors };
      b.icon = src.icon;
    }
  });
  return others.length;
}
