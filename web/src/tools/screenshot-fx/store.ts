/**
 * 狀態與動作：
 * - useDoc：圖片（資產 id）、畫面、背景、截圖、出處、時間軸、演出框（自動儲存、可以復原；滑桿放開、文字欄離開、
 *   拖曳放開才記一步，方向鍵 0.4 秒內連續的算一步）；
 * - usePrefs：畫框的工具、新畫的框的預設、編輯輔助線、循環播放、匯出設定、預覽背景（自動儲存，不列入復原）；
 * - useLive：選取中的框、設定欄的分頁（不儲存）；
 * - 圖片原檔存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import type { ExportSettings } from '@/ui';
import {
  clampRect,
  duplicateFrame,
  type Frame,
  type FrameDefaults,
  type FrameKind,
  type FxState,
  type ImageRef,
  initialDefaults,
  initialState,
  LIMITS,
  makeFrame,
  newFrameId,
  normalizeDefaults,
  normalizeState,
  type Rect,
  stateAssetIds,
  VIDEO_FPS,
} from './model';

export const TOOL_ID = 'screenshot-fx';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useDoc = createToolStore<FxState>(TOOL_ID, initialState(), {
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

export const docNow = (): FxState => useDoc.getState().data;

/** 一次變更＝一步復原（手勢中除外；0.4 秒內連續的變更合成一步） */
export function edit(recipe: (d: FxState) => void): void {
  useDoc.getState().update((d) => {
    recipe(d as FxState);
  });
}

/** 復原／重做（手勢中不做事） */
export function historyStep(kind: 'undo' | 'redo'): void {
  if (useDoc.inGesture()) return;
  const t = useDoc.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
  /* 選取的框被復原掉了：取消選取 */
  const sel = useLive.getState().selected;
  if (sel && !docNow().frames.some((f) => f.id === sel)) select(null);
}

/* ---------- 不列入復原的設定 ---------- */

export type StageBg = 'checker' | 'dark' | 'light';
export const STAGE_BGS: readonly StageBg[] = ['checker', 'dark', 'light'];

export interface Prefs {
  /** 拖曳畫出哪一種框 */
  tool: FrameKind;
  defaults: FrameDefaults;
  /** 編輯輔助線（框的虛線與編號；不會匯出） */
  guides: boolean;
  loop: boolean;
  export: ExportSettings;
  stageBg: StageBg;
}

export const initialExport = (): ExportSettings => ({
  format: 'png',
  fps: 30,
  plays: 0,
  scale: 1,
  quantize: false,
  colors: 128,
});

export const initialPrefs = (): Prefs => ({
  tool: 'zoom',
  defaults: initialDefaults(),
  guides: true,
  loop: true,
  export: initialExport(),
  stageBg: 'checker',
});

export const EXPORT_FORMATS = ['png', 'apng', 'video'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const APNG_COLORS: readonly number[] = [0, 256, 128, 64];

export function normalizePrefs(raw: unknown): Prefs {
  const d = initialPrefs();
  const p = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<Prefs>;
  const e = (
    typeof p.export === 'object' && p.export !== null ? p.export : {}
  ) as Partial<ExportSettings>;
  return {
    tool: (['zoom', 'marker', 'redact'] as const).includes(p.tool as FrameKind)
      ? (p.tool as FrameKind)
      : d.tool,
    defaults: normalizeDefaults(p.defaults),
    guides: typeof p.guides === 'boolean' ? p.guides : d.guides,
    loop: typeof p.loop === 'boolean' ? p.loop : d.loop,
    export: {
      format: (EXPORT_FORMATS as readonly string[]).includes(e.format as string)
        ? (e.format as string)
        : d.export.format,
      fps: VIDEO_FPS.includes(e.fps as number) ? (e.fps as number) : d.export.fps,
      plays:
        typeof e.plays === 'number' && Number.isFinite(e.plays)
          ? Math.max(0, Math.min(99, Math.round(e.plays)))
          : d.export.plays,
      scale: 1,
      quantize: false,
      colors: APNG_COLORS.includes(e.colors as number) ? (e.colors as number) : d.export.colors,
    },
    stageBg: STAGE_BGS.includes(p.stageBg as StageBg) ? (p.stageBg as StageBg) : d.stageBg,
  };
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, initialPrefs());

/* 存下來的設定可能被改壞：開頁時整理一次 */
{
  const p = usePrefs.getState().data;
  const fixed = normalizePrefs(p);
  if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
}

export const prefsNow = (): Prefs => usePrefs.getState().data;
export const setPrefs = (patch: Partial<Prefs>): void => usePrefs.getState().patch(patch);
export function setDefaults(recipe: (d: FrameDefaults) => void): void {
  usePrefs.getState().update((p) => {
    recipe(p.defaults as FrameDefaults);
  });
}

/* ---------- 選取（不儲存） ---------- */

export type PanelTab = 'image' | 'frames' | 'timing';
/** 編輯區的指標工具：畫框（一般）、手形（拖曳移動顯示位置）、框選放大 */
export type PointerTool = 'edit' | 'hand' | 'region';

export interface Live {
  selected: string | null;
  tab: PanelTab;
  /** 讀不回來的圖（提醒用；換上新的圖時清掉） */
  missing: string | null;
  /** 運鏡確認中（預覽套用運鏡、不能編輯） */
  cameraPreview: boolean;
  /** 每按一次「從頭確認運鏡」加 1（預覽從頭播放） */
  cameraRun: number;
  /** 編輯區的倍率（符合畫面＝1；不影響輸出） */
  viewZoom: number;
  pointer: PointerTool;
  /** 放大編輯區（佔滿視窗） */
  expanded: boolean;
  /** 要預覽跳到的時間（每次要求 n 加 1） */
  seek: { t: number; n: number } | null;
}

export const useLive = create<Live>(() => ({
  selected: null,
  tab: 'image',
  missing: null,
  cameraPreview: false,
  cameraRun: 0,
  viewZoom: 1,
  pointer: 'edit',
  expanded: false,
  seek: null,
}));

/** 從頭確認運鏡 */
export function startCameraPreview(): void {
  useLive.setState((l) => ({ cameraPreview: true, cameraRun: l.cameraRun + 1 }));
}

/** 預覽跳到 t 秒並暫停（例如調整邊界演出時，看動作到一半的樣子） */
export function requestSeek(t: number): void {
  useLive.setState((l) => ({ seek: { t, n: (l.seek?.n ?? 0) + 1 } }));
}

/** 選取一個框（reveal：從預覽選的，設定欄換到「演出框」分頁） */
export function select(id: string | null, reveal = false): void {
  useLive.setState((l) => ({ selected: id, tab: reveal && id ? 'frames' : l.tab }));
}

/* ---------- 資產 ---------- */

export const assets = createAssetStore(TOOL_ID);

/** 目前的狀態與復原紀錄用到的圖（開頁的整理時保留） */
export function referencedImages(): Set<string> {
  return referencedAssetIds(useDoc, stateAssetIds);
}

/** 圖讀不回來（已從這個瀏覽器清除）：從內容裡拿掉，不記成一步復原；提醒留著直到換上新的圖 */
export function dropMissingImage(id: string): void {
  const s = docNow();
  if (s.image?.id !== id) return;
  useLive.setState({ missing: s.image.name, selected: null });
  const t = useDoc.temporal.getState();
  t.pause();
  try {
    useDoc.getState().update((d) => {
      d.image = null;
      d.frames = [];
    });
  } finally {
    t.resume();
  }
}

/** 換上圖片：演出框與出處清空（同原作；一步復原）；frames／credit 給了時一起換上（示範演出） */
export function setImage(image: ImageRef, extra?: { frames?: Frame[]; credit?: string }): void {
  useLive.setState({ missing: null, selected: null });
  edit((d) => {
    d.image = { ...image };
    d.frames = extra?.frames ? extra.frames.map((f) => ({ ...f })) : [];
    d.credit.text = extra?.credit ?? '';
  });
}

/** 拿掉圖片（框也清掉） */
export function clearImage(): void {
  select(null);
  edit((d) => {
    d.image = null;
    d.frames = [];
  });
}

/* ---------- 演出框 ---------- */

export const frameById = (id: string | null): Frame | undefined =>
  id ? docNow().frames.find((f) => f.id === id) : undefined;

/** 畫一個新框（用目前的工具與預設）；回傳 id（到上限時 null） */
export function addFrame(rect: Rect, kind: FrameKind = prefsNow().tool): string | null {
  const s = docNow();
  if (!s.image || s.frames.length >= LIMITS.frames) return null;
  const id = newFrameId(s.frames.map((f) => f.id));
  const frame = makeFrame(kind, clampRect(rect, s.image), prefsNow().defaults, id);
  edit((d) => {
    d.frames.push(frame);
  });
  select(id, true);
  return id;
}

/** 改一個框的設定（一步復原） */
export function updateFrame(id: string, recipe: (f: Frame) => void): void {
  edit((d) => {
    const f = d.frames.find((x) => x.id === id);
    if (f) recipe(f);
  });
}

/** 改一個框的範圍（夾在圖裡；沒有變化時不記） */
export function setFrameRect(id: string, rect: Rect): void {
  const s = docNow();
  const f = s.frames.find((x) => x.id === id);
  if (!f || !s.image) return;
  const r = clampRect(rect, s.image);
  if (r.x === f.x && r.y === f.y && r.w === f.w && r.h === f.h) return;
  updateFrame(id, (x) => {
    Object.assign(x, r);
  });
}

export function removeFrame(id: string): void {
  if (!frameById(id)) return;
  if (useLive.getState().selected === id) select(null);
  edit((d) => {
    d.frames = d.frames.filter((f) => f.id !== id);
  });
}

export function clearFrames(): void {
  select(null);
  edit((d) => {
    d.frames = [];
  });
}

/** 複製（放在原本那個的後面）；回傳新的 id */
export function duplicate(id: string): string | null {
  const s = docNow();
  const f = s.frames.find((x) => x.id === id);
  if (!f || !s.image || s.frames.length >= LIMITS.frames) return null;
  const nid = newFrameId(s.frames.map((x) => x.id));
  const copy = duplicateFrame(f, s.image, nid);
  edit((d) => {
    const i = d.frames.findIndex((x) => x.id === id);
    d.frames.splice(i + 1, 0, copy);
  });
  select(nid);
  return nid;
}

/** 在清單裡上移（-1）／下移（+1）一格 */
export function moveFrame(id: string, delta: -1 | 1): void {
  const frames = docNow().frames;
  const i = frames.findIndex((f) => f.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= frames.length) return;
  edit((d) => {
    const [f] = d.frames.splice(i, 1);
    d.frames.splice(j, 0, f);
  });
}

/** 換掉整份內容（重設、開啟專案檔；可以復原） */
export function resetAll(next: FxState = initialState()): void {
  select(null);
  useLive.setState({ missing: null });
  useDoc.getState().replace(next);
}
