/**
 * 狀態與動作：
 * - useDoc：圖片（資產 id）與位置、比例、像素化、色調、效果、台詞與各文字欄、樣式、打字速度（自動儲存、可以復原；
 *   滑桿放開、文字欄離開、拖曳放開才記一步，滾輪與按鍵 0.4 秒內連續的算一步）；
 * - usePrefs：匯出的設定、鎖定位置、打字音效與音高（自動儲存，不列入復原）；
 * - useLive：目前在第幾頁（不儲存）；
 * - 圖片原檔存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  type BgView,
  clampView,
  DEFAULT_VIEW,
  EXPORT_FORMATS,
  type ExportFormat,
  type ImageRef,
  initialState,
  normalizePitch,
  normalizeState,
  parsePages,
  type Ratio,
  type RpgState,
  SCALES,
  screenSize,
  stateAssetIds,
} from './model';

export const TOOL_ID = 'rpg-screenshot';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useDoc = createToolStore<RpgState>(TOOL_ID, initialState(), {
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

export const docNow = (): RpgState => useDoc.getState().data;

/** 一次變更＝一步復原（手勢中除外；0.4 秒內連續的變更合成一步） */
export function edit(recipe: (d: RpgState) => void): void {
  useDoc.getState().update((d) => {
    recipe(d as RpgState);
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

export interface Prefs {
  format: ExportFormat;
  /** PNG 的倍率（動畫最多 2） */
  scale: number;
  /** GIF、APNG、WebP 包含所有頁 */
  gifAll: boolean;
  /** 播放次數（0＝無限循環） */
  plays: number;
  /** 鎖定背景圖的位置 */
  locked: boolean;
  /** 打字音效 */
  sound: boolean;
  /** 音效的音高（Hz） */
  pitch: number;
}

export const initialPrefs = (): Prefs => ({
  format: 'png',
  scale: 2,
  gifAll: true,
  plays: 0,
  locked: false,
  sound: true,
  pitch: 520,
});

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const d = initialPrefs();
  const fixed: Prefs = {
    format: EXPORT_FORMATS.includes(p.format) ? p.format : d.format,
    scale: SCALES.includes(p.scale) ? p.scale : d.scale,
    gifAll: typeof p.gifAll === 'boolean' ? p.gifAll : d.gifAll,
    plays:
      typeof p.plays === 'number' && Number.isFinite(p.plays)
        ? Math.max(0, Math.min(99, Math.round(p.plays)))
        : d.plays,
    locked: p.locked === true,
    sound: typeof p.sound === 'boolean' ? p.sound : d.sound,
    pitch: normalizePitch(p.pitch, d.pitch),
  };
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);

/* ---------- 目前的頁（不儲存） ---------- */

export interface Live {
  /** 目前在第幾頁（從 0 起） */
  page: number;
  /** 每換一次頁（含按了但頁沒變）加 1：預覽依它停止播放、全部顯示或自動播放 */
  nav: number;
  /** 這次換頁要自動播放（下一頁） */
  autoplay: boolean;
  /** 字超出訊息視窗的頁（預覽量好之後寫入） */
  overflow: number[];
  /** 選用的字型：ready／loading／failed */
  fontState: 'ready' | 'loading' | 'failed';
}

export const useLive = create<Live>(() => ({
  page: 0,
  nav: 0,
  autoplay: false,
  overflow: [],
  fontState: 'ready',
}));

/** 頁數 */
export const pageCountNow = (): number => {
  const s = docNow();
  return parsePages(s.dialogue, s.speaker).length;
};

/** 換頁（夾在範圍內）；autoplay：有背景圖時自動播放（同原作的「下一頁」） */
export function goPage(i: number, autoplay = false): void {
  const n = pageCountNow();
  useLive.setState((l) => ({
    page: Math.max(0, Math.min(n - 1, i)),
    nav: l.nav + 1,
    autoplay,
  }));
}

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 目前的狀態與復原紀錄用到的圖（開頁的整理時保留） */
export function referencedImages(): Set<string> {
  return referencedAssetIds(useDoc, stateAssetIds);
}

/** 讀不回來的圖（提醒用；換上新的圖時清掉） */
export const useMissing = create<{ bg: string | null; face: string | null }>(() => ({
  bg: null,
  face: null,
}));

/** 圖讀不回來（已從這個瀏覽器清除）：從內容裡拿掉，不記成一步復原；提醒留著直到換上新的圖 */
export function dropMissingImage(kind: 'bg' | 'face', id: string): void {
  const s = docNow();
  const ref = s[kind];
  if (ref?.id !== id) return;
  useMissing.setState({ [kind]: ref.name });
  const t = useDoc.temporal.getState();
  t.pause();
  try {
    useDoc.getState().update((d) => {
      d[kind] = null;
      if (kind === 'bg') d.view = { ...DEFAULT_VIEW };
    });
  } finally {
    t.resume();
  }
}

/** 換上背景圖：位置回到初始（一步復原） */
export function setBackground(image: ImageRef): void {
  useMissing.setState({ bg: null });
  edit((d) => {
    d.bg = { ...image };
    d.view = { ...DEFAULT_VIEW };
  });
}

/** 拿掉背景圖 */
export function clearBackground(): void {
  edit((d) => {
    d.bg = null;
    d.view = { ...DEFAULT_VIEW };
  });
}

export function setFace(image: ImageRef): void {
  useMissing.setState({ face: null });
  edit((d) => {
    d.face = { ...image };
  });
}

export function clearFace(): void {
  edit((d) => {
    d.face = null;
  });
}

/** 改位置（夾回範圍；沒有背景圖時不做事；沒有變化時不記） */
export function setView(view: BgView, clamp = true): void {
  const s = docNow();
  if (!s.bg) return;
  const next = clamp ? clampView(s.bg, screenSize(s.ratio), view) : view;
  const cur = s.view;
  if (next.zoom === cur.zoom && next.x === cur.x && next.y === cur.y) return;
  edit((d) => {
    d.view = next;
  });
}

export function setRatio(ratio: Ratio): void {
  edit((d) => {
    d.ratio = ratio;
  });
}

/** 換掉整份內容（重設、開啟專案檔；可以復原） */
export function resetAll(next: RpgState = initialState()): void {
  useDoc.getState().replace(next);
  goPage(0);
}
