/**
 * 狀態與動作：
 * - useDoc：照片（id）與位置、字幕、左上文字、字型、時間碼、磨損度、比例（自動儲存、可以復原；滑桿放開、文字欄離開、拖曳放開才記一步，
 *   滾輪與按鍵 0.4 秒內連續的算一步）；
 * - usePrefs：預覽模式、匯出的設定、「錄影帶」的時間與暫停（自動儲存，不列入復原）；
 * - 照片原檔存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  type Aspect,
  clampView,
  DEFAULT_VIEW,
  EXPORT_FORMATS,
  type ExportFormat,
  type ImageRef,
  initialState,
  normalizeState,
  type PhotoView,
  screenSize,
  stateAssetIds,
  TAPE_LOOP,
  type VhsState,
} from './model';

export const TOOL_ID = 'vhs-frame';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useDoc = createToolStore<VhsState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useDoc.getState().data;
  const fixed = normalizeState(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDoc.getState().replace(fixed);
  useDoc.temporal.getState().clear();
}

/** 滑桿、文字欄、拖曳：放開（離開）才記一步 */
export const gesture = historyGesture(useDoc);

export const docNow = (): VhsState => useDoc.getState().data;

/** 一次變更＝一步復原（手勢中除外；0.4 秒內連續的變更合成一步） */
export function edit(recipe: (d: VhsState) => void): void {
  useDoc.getState().update((d) => {
    recipe(d as VhsState);
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

export type PreviewMode = 'tape' | 'gif';

export interface Prefs {
  /** 預覽：錄影帶（PNG 用的畫面）／GIF 動畫 */
  preview: PreviewMode;
  format: ExportFormat;
  /** 動畫大小：0 小、1 中、2 大 */
  animSize: number;
  /** 播放次數（0＝無限循環） */
  plays: number;
  /** APNG 減色 */
  quantize: boolean;
  /** 「錄影帶」暫停時的時間（秒） */
  tapeTime: number;
  tapePaused: boolean;
}

export const initialPrefs = (): Prefs => ({
  preview: 'tape',
  format: 'png',
  animSize: 0,
  plays: 0,
  quantize: false,
  tapeTime: 0,
  tapePaused: false,
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const n = (v: unknown, lo: number, hi: number, d: number) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  const fixed: Prefs = {
    preview: p.preview === 'gif' ? 'gif' : 'tape',
    format: EXPORT_FORMATS.includes(p.format) ? p.format : 'png',
    animSize: Math.round(n(p.animSize, 0, 2, 0)),
    plays: Math.round(n(p.plays, 0, 99, 0)),
    quantize: p.quantize === true,
    tapeTime: n(p.tapeTime, 0, TAPE_LOOP, 0),
    tapePaused: p.tapePaused === true,
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 目前的狀態與復原紀錄用到的圖（開頁的整理時保留） */
export function referencedImages(): Set<string> {
  return referencedAssetIds(useDoc, stateAssetIds);
}

/* ---------- 照片 ---------- */

/** 換上照片：位置回到初始（蓋滿、置中；一步復原） */
export function setPhoto(image: ImageRef): void {
  edit((d) => {
    d.photo = { ...image };
    d.view = { ...DEFAULT_VIEW };
  });
}

/** 拿掉照片（回到無訊號） */
export function clearPhoto(): void {
  edit((d) => {
    d.photo = null;
    d.view = { ...DEFAULT_VIEW };
  });
}

/** 改位置（夾回範圍；沒有照片時不做事） */
export function setView(view: PhotoView): void {
  const s = docNow();
  if (!s.photo) return;
  const next = clampView(s.photo, screenSize(s.aspect), view);
  const cur = s.view;
  if (next.zoom === cur.zoom && next.x === cur.x && next.y === cur.y) return;
  edit((d) => {
    d.view = next;
  });
}

/** 換比例：位置照比例保留，再夾回範圍 */
export function setAspect(aspect: Aspect): void {
  edit((d) => {
    d.aspect = aspect;
    if (d.photo) d.view = clampView(d.photo, screenSize(aspect), d.view);
  });
}

/* ---------- 重設 ---------- */

/** 換掉整份內容（重設、開啟專案檔；可以復原） */
export function resetAll(next: VhsState = initialState()): void {
  useDoc.getState().replace(next);
}
