/**
 * 狀態與動作：
 * - useDoc：時間、日期、狀態列、桌布（照片 id、位置、變暗）、通知（App 名稱、不透明度、模糊、間隔）、訊息、外框構圖
 *   （自動儲存、可以復原；滑桿放開、文字欄離開才記一步）；
 * - usePrefs：分頁、預覽模式、匯出的設定（自動儲存，不列入復原）；
 * - 桌布與外框的照片存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import type { FramePlacement } from '@/core/image';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  type ExportFormat,
  type ExportTarget,
  GIF_WIDTHS,
  type GifWidth,
  type ImageRef,
  initialState,
  type LockScreenState,
  MESSAGE_MAX,
  type Message,
  nextMessageId,
  normalizeState,
  stateAssetIds,
} from './model';

export const TOOL_ID = 'lock-screen';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useDoc = createToolStore<LockScreenState>(TOOL_ID, initialState(), {
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

export const docNow = (): LockScreenState => useDoc.getState().data;

/** 一次變更＝一步復原（手勢中除外） */
export function edit(recipe: (d: LockScreenState) => void): void {
  useDoc.getState().update((d) => {
    recipe(d as LockScreenState);
  });
}

/** 復原／重做（手勢中不做事） */
export function historyStep(kind: 'undo' | 'redo'): void {
  if (useDoc.inGesture()) return;
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/* ---------- 不列入復原的設定 ---------- */

export type TabId = 'messages' | 'phone' | 'outer';
export type PreviewMode = 'screen' | 'full';

export interface Prefs {
  tab: TabId;
  /** 預覽：手機畫面／完整構圖（預設完整構圖，同原作） */
  preview: PreviewMode;
  format: ExportFormat;
  target: ExportTarget;
  gifWidth: GifWidth;
  /** GIF 的播放次數（0＝無限循環） */
  plays: number;
}

export const initialPrefs = (): Prefs => ({
  tab: 'messages',
  preview: 'full',
  format: 'png',
  target: 'screen',
  gifWidth: 540,
  plays: 0,
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const fixed: Prefs = {
    tab: (['messages', 'phone', 'outer'] as const).includes(p.tab) ? p.tab : 'messages',
    preview: p.preview === 'screen' ? 'screen' : 'full',
    format: p.format === 'gif' ? 'gif' : 'png',
    target: p.target === 'full' ? 'full' : 'screen',
    gifWidth: GIF_WIDTHS.includes(p.gifWidth) ? p.gifWidth : 540,
    plays:
      typeof p.plays === 'number' && Number.isFinite(p.plays)
        ? Math.max(0, Math.min(99, Math.round(p.plays)))
        : 0,
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/**
 * 目前的狀態與復原紀錄用到的圖（開頁的整理時保留）。這次開頁放進來、還沒寫進狀態的圖由 assets.gcStale 保留。
 */
export function referencedImages(): Set<string> {
  return referencedAssetIds(useDoc, stateAssetIds);
}

/* ---------- 照片 ---------- */

export type PhotoSlot = 'wallpaper' | 'outer';

/** 換上照片與裁切的位置（一步復原） */
export function applyPhoto(slot: PhotoSlot, image: ImageRef, place: FramePlacement): void {
  edit((d) => {
    d[slot].image = { ...image };
    d[slot].place = { ...place };
  });
}

/** 重新裁切（只換位置） */
export function setPlacement(slot: PhotoSlot, place: FramePlacement): void {
  edit((d) => {
    d[slot].place = { ...place };
  });
}

/** 回到預設的桌布／外框背景（拿掉照片、位置歸零；變暗不變） */
export function clearPhoto(slot: PhotoSlot): void {
  edit((d) => {
    d[slot].image = null;
    d[slot].place = { zoom: 1, x: 0, y: 0, turns: 0 };
  });
}

/* ---------- 訊息 ---------- */

/** 加一則空白的訊息（最多 4 則）；回傳新的 id */
export function addMessage(): string | null {
  const list = docNow().messages;
  if (list.length >= MESSAGE_MAX) return null;
  const id = nextMessageId(list);
  edit((d) => {
    d.messages.push({ id, sender: '', body: '', received: '' });
  });
  return id;
}

/** 刪掉一則（至少留一則） */
export function removeMessage(id: string): void {
  if (docNow().messages.length <= 1) return;
  edit((d) => {
    d.messages = d.messages.filter((m) => m.id !== id);
  });
}

/** 換順序（收到的順序）：往前（早一點收到）或往後 */
export function moveMessage(id: string, delta: -1 | 1): void {
  const list = docNow().messages;
  const i = list.findIndex((m) => m.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  edit((d) => {
    const [m] = d.messages.splice(i, 1);
    d.messages.splice(j, 0, m);
  });
}

export function patchMessage(id: string, patch: Partial<Omit<Message, 'id'>>): void {
  edit((d) => {
    const m = d.messages.find((x) => x.id === id);
    if (m) Object.assign(m, patch);
  });
}

/* ---------- 重設 ---------- */

/** 換掉整份內容（重設、開啟專案檔；可以復原） */
export function resetAll(next: LockScreenState = initialState()): void {
  useDoc.getState().replace(next);
}
