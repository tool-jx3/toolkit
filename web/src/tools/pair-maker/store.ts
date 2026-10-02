/**
 * 角色介紹圖產生器的狀態與存取：
 * - 每個版型一個 createToolStore（localStorage 鍵 `trpg-toolkit:pair-maker:<版型 id>`，有復原／重做）；
 * - 圖片（格子裁切後的 PNG、貼紙）存在 IndexedDB 的圖片庫（core/assets），編輯內容只記圖片的 id；
 * - 介面狀態（目前的編輯對象、分類、選取的貼紙、只看一張）不保存。
 */
import { create } from 'zustand';
import { createAssetStore } from '@/core/assets';
import { makeCanvas } from '@/core/image';
import { createToolStore, type ToolStore } from '@/core/storage';
import { type Draft, draftAssets, type TemplateDef, validateDraft } from './model';
import { TEMPLATES } from './templates';

export const TOOL_ID = 'pair-maker';
/** 編輯檔（專案檔）的資料版本 */
export const PROJECT_VERSION = 1;

export const assets = createAssetStore(TOOL_ID);

const stores = new Map<string, ToolStore<Draft>>();

/** 自動保存的鍵名（工具 id） */
export const draftToolId = (templateId: string) => `${TOOL_ID}:${templateId}`;

function localGet(key: string): string | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** 版型的編輯內容 store（第一次用到時建立；建立時從 localStorage 讀回） */
export function draftStore(def: TemplateDef): ToolStore<Draft> {
  let s = stores.get(def.id);
  if (!s) {
    s = createToolStore<Draft>(draftToolId(def.id), def.initial(), {
      version: 1,
      historyLimit: 60,
      coalesceMs: 500,
    });
    stores.set(def.id, s);
  }
  return s;
}

/** 不記進復原紀錄的變更（自動分頁、讀回時的修正） */
export function silently(store: ToolStore<Draft>, fn: () => void): void {
  const t = store.temporal.getState();
  t.pause();
  try {
    fn();
  } finally {
    t.resume();
  }
}

export interface OpenResult {
  store: ToolStore<Draft>;
  /** 有讀回上次的內容 */
  restored: boolean;
  /** 讀回的內容不能用（已換成初始內容） */
  failed: boolean;
}

/**
 * 開啟版型：建立（或取用）store；有自動保存的內容時檢查一次（不合格就回到初始內容）。
 */
export function openDraft(def: TemplateDef): OpenResult {
  const existed = stores.has(def.id);
  const had = existed || localGet(`trpg-toolkit:${draftToolId(def.id)}`) !== null;
  const store = draftStore(def);
  if (existed || !had) return { store, restored: false, failed: false };
  try {
    const fixed = validateDraft(def, store.getState().data);
    silently(store, () => store.getState().replace(fixed));
    store.temporal.getState().clear();
    return { store, restored: true, failed: false };
  } catch {
    silently(store, () => store.getState().replace(def.initial()));
    store.temporal.getState().clear();
    return { store, restored: false, failed: true };
  }
}

/* ---------- 介面狀態 ---------- */

export interface UiState {
  /** 版型 → 目前的編輯對象 */
  side: Record<string, string>;
  /** `版型|對象` → 分類 */
  group: Record<string, string>;
  /** 選取的貼紙 */
  sticker: string | null;
  /** 多人資料框：只看目前的角色 */
  solo: boolean;
  /** 最近一次從畫布點的項目（設定欄要捲過去） */
  revealTick: number;
  setSide: (tpl: string, side: string) => void;
  setGroup: (tpl: string, side: string, group: string) => void;
  open: (tpl: string, side: string, group?: string) => void;
  setSticker: (id: string | null) => void;
  setSolo: (on: boolean) => void;
}

export const STICKER_SIDE = '__stickers';

export const useUi = create<UiState>()((set) => ({
  side: {},
  group: {},
  sticker: null,
  solo: false,
  revealTick: 0,
  setSide: (tpl, side) => set((s) => ({ side: { ...s.side, [tpl]: side } })),
  setGroup: (tpl, side, group) =>
    set((s) => ({ group: { ...s.group, [`${tpl}|${side}`]: group } })),
  open: (tpl, side, group) =>
    set((s) => ({
      side: { ...s.side, [tpl]: side },
      group: group ? { ...s.group, [`${tpl}|${side}`]: group } : s.group,
      revealTick: s.revealTick + 1,
    })),
  setSticker: (id) => set({ sticker: id }),
  setSolo: (on) => set({ solo: on }),
}));

/* ---------- 量字寬用的 context ---------- */

let measureCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
export function measureContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!measureCtx) measureCtx = makeCanvas(4, 4).getContext('2d') as CanvasRenderingContext2D;
  return measureCtx;
}

/* ---------- 圖片庫的整理 ---------- */

/** 所有版型（目前內容＋復原紀錄）與存檔槽用到的圖片 */
export async function referencedIds(slotIds: Iterable<string>): Promise<Set<string>> {
  const keep = new Set<string>(slotIds);
  for (const def of TEMPLATES) {
    const had = stores.has(def.id) || localGet(`trpg-toolkit:${draftToolId(def.id)}`) !== null;
    if (!had) continue;
    const st = draftStore(def);
    const add = (d: Draft | undefined) => {
      if (d) for (const id of draftAssets(d)) keep.add(id);
    };
    add(st.getState().data);
    const t = st.temporal.getState();
    for (const p of t.pastStates) add(p.data as Draft | undefined);
    for (const f of t.futureStates) add(f.data as Draft | undefined);
  }
  return keep;
}
