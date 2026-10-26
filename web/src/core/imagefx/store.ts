/**
 * 圖片演出工具的狀態與動作（createFxStore 一次做好）：
 * - useDoc：圖片（資產 id）、畫面、背景、圖的擺放、出處、時間軸、演出框（自動儲存、可以復原）。復原的步數：
 *   只有連續的操作合成一步——拖曳、滑桿、文字欄（放開／離開才記）、方向鍵連按與顏色拖曳（0.4 秒內連續的）；
 *   其他（新增、複製、刪除、上移下移、換圖、範例、選項）一次各一步，不和前後的變更合併；
 * - usePrefs：畫框的工具、新畫的框的預設、編輯輔助線、循環播放、匯出設定、預覽背景（自動儲存，不列入復原）；
 * - useLive：選取中的框、設定欄的分頁、編輯區的倍率與指標工具、運鏡確認（不儲存）；
 * - 圖片原檔存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  clampRect,
  type FrameBase,
  type FxDoc,
  type ImageRef,
  LIMITS,
  newFrameId,
  type Rect,
  type Size,
} from './types';

/** 預覽背景（只在預覽） */
export type StageBg = 'checker' | 'dark' | 'light';
export const STAGE_BGS: readonly StageBg[] = ['checker', 'dark', 'light'];

/** 編輯區的指標工具：畫框（一般）、手形（拖曳移動顯示位置）、框選放大 */
export type PointerTool = 'edit' | 'hand' | 'region';

export interface FxLive<Tab extends string> {
  selected: string | null;
  tab: Tab;
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

/** 偏好至少要有：畫框的工具、新畫的框的預設 */
export interface FxPrefsBase<Kind extends string = string, Defaults = unknown> {
  tool: Kind;
  defaults: Defaults;
  guides: boolean;
  loop: boolean;
  stageBg: StageBg;
}

export interface FxStoreConfig<
  F extends FrameBase,
  S extends FxDoc<F>,
  P extends FxPrefsBase,
  Tab extends string,
> {
  toolId: string;
  /** 專案檔與自動儲存的資料版本 */
  version: number;
  initialState: () => S;
  normalizeState: (raw: unknown) => S;
  initialPrefs: () => P;
  normalizePrefs: (raw: unknown) => P;
  /** 用目前的預設做一個新框 */
  makeFrame: (kind: P['tool'], rect: Rect, defaults: P['defaults'], id: string) => F;
  /** 複製：往右下移一點（夾在圖裡）、新的 id */
  duplicateFrame: (f: F, image: Size, id: string) => F;
  /** 框的範圍改了（拖曳、控點、方向鍵）：預設只換 x、y、w、h；路線之類的點要跟著動時自己改 */
  applyRect?: (draft: F, r: Rect) => void;
  /** 內容用到的圖（資產 id） */
  assetIds: (s: S) => string[];
  /**
   * 換圖、拿掉圖、圖讀不回來時，工具自己的內容怎麼處理（框與出處以外；例：地圖演出的 3D 房間與路線清空）。
   * setImage 的 extra.tool 原樣傳進來（示範演出一起換上的內容）。不給時只清框與出處（與以前相同）。
   */
  resetForImage?: (draft: S, tool?: unknown) => void;
  /** 設定欄的分頁：開頁時、從預覽選了框時切到哪一頁 */
  tabs: { initial: Tab; frames: Tab };
}

export function createFxStore<
  F extends FrameBase,
  S extends FxDoc<F>,
  P extends FxPrefsBase,
  Tab extends string,
>(config: FxStoreConfig<F, S, P, Tab>) {
  const { toolId } = config;

  const useDoc = createToolStore<S>(toolId, config.initialState(), {
    version: config.version,
    migrate: (persisted) => config.normalizeState(persisted),
    historyLimit: 150,
  });

  /* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
  {
    const cur = useDoc.getState().data;
    const fixed = config.normalizeState(cur);
    if (JSON.stringify(fixed) !== JSON.stringify(cur)) useDoc.getState().replace(fixed);
    useDoc.temporal.getState().clear();
  }

  /** 滑桿、文字欄、拖曳：放開（離開）才記一步 */
  const gesture = historyGesture(useDoc);

  const docNow = (): S => useDoc.getState().data;

  /**
   * 離散的變更：一次一步復原，不和前後的變更合併（包成一個只有一次變更的手勢；手勢中〔拖曳、滑桿〕則併進那個手勢）
   */
  function edit(recipe: (d: S) => void): void {
    const apply = () =>
      useDoc.getState().update((d) => {
        recipe(d as S);
      });
    if (useDoc.inGesture()) {
      apply();
      return;
    }
    useDoc.beginGesture();
    try {
      apply();
    } finally {
      useDoc.endGesture();
    }
  }

  /** 連續的變更（方向鍵連按、顏色拖曳）：0.4 秒內連續的合成一步 */
  function editMerged(recipe: (d: S) => void): void {
    useDoc.getState().update((d) => {
      recipe(d as S);
    });
  }

  /* ---------- 選取（不儲存） ---------- */

  const useLive = create<FxLive<Tab>>(() => ({
    selected: null,
    tab: config.tabs.initial,
    missing: null,
    cameraPreview: false,
    cameraRun: 0,
    viewZoom: 1,
    pointer: 'edit',
    expanded: false,
    seek: null,
  }));

  /** 選取一個框（reveal：從預覽選的，設定欄換到「演出框」分頁） */
  function select(id: string | null, reveal = false): void {
    useLive.setState((l) => ({ selected: id, tab: reveal && id ? config.tabs.frames : l.tab }));
  }

  /** 復原／重做（手勢中不做事） */
  function historyStep(kind: 'undo' | 'redo'): void {
    if (useDoc.inGesture()) return;
    const t = useDoc.temporal.getState();
    if (kind === 'undo') t.undo();
    else t.redo();
    /* 選取的框被復原掉了：取消選取 */
    const sel = useLive.getState().selected;
    if (sel && !docNow().frames.some((f) => f.id === sel)) select(null);
  }

  /* ---------- 不列入復原的設定 ---------- */

  const usePrefs = createPreviewStore<P>(toolId, config.initialPrefs());

  /* 存下來的設定可能被改壞：開頁時整理一次 */
  {
    const p = usePrefs.getState().data;
    const fixed = config.normalizePrefs(p);
    if (JSON.stringify(fixed) !== JSON.stringify(p)) usePrefs.getState().replace(fixed);
  }

  const prefsNow = (): P => usePrefs.getState().data;
  const setPrefs = (patch: Partial<P>): void => usePrefs.getState().patch(patch);
  function setDefaults(recipe: (d: P['defaults']) => void): void {
    usePrefs.getState().update((p) => {
      recipe((p as P).defaults);
    });
  }

  /** 從頭確認運鏡 */
  function startCameraPreview(): void {
    useLive.setState((l) => ({ cameraPreview: true, cameraRun: l.cameraRun + 1 }));
  }

  /** 預覽跳到 t 秒並暫停（例如調整邊界演出時，看動作到一半的樣子） */
  function requestSeek(t: number): void {
    useLive.setState((l) => ({ seek: { t, n: (l.seek?.n ?? 0) + 1 } }));
  }

  /* ---------- 資產 ---------- */

  const assets = createAssetStore(toolId);

  /** 目前的狀態與復原紀錄用到的圖（開頁的整理時保留） */
  function referencedImages(): Set<string> {
    return referencedAssetIds(useDoc, config.assetIds);
  }

  /** 圖讀不回來（已從這個瀏覽器清除）：從內容裡拿掉，不記成一步復原；提醒留著直到換上新的圖 */
  function dropMissingImage(id: string): void {
    const s = docNow();
    if (s.image?.id !== id) return;
    useLive.setState({ missing: s.image.name, selected: null });
    const t = useDoc.temporal.getState();
    t.pause();
    try {
      useDoc.getState().update((d) => {
        (d as S).image = null;
        (d as S).frames = [];
        config.resetForImage?.(d as S);
      });
    } finally {
      t.resume();
    }
  }

  /**
   * 換上圖片：演出框與出處清空（一步復原）；frames／credit 給了時一起換上（示範演出）；
   * tool：工具自己的內容（交給 config.resetForImage）
   */
  function setImage(
    image: ImageRef,
    extra?: { frames?: F[]; credit?: string; tool?: unknown },
  ): void {
    useLive.setState({ missing: null, selected: null });
    edit((d) => {
      d.image = { ...image };
      d.frames = extra?.frames ? extra.frames.map((f) => structuredClone(f)) : [];
      d.credit.text = extra?.credit ?? '';
      config.resetForImage?.(d, extra?.tool);
    });
  }

  /** 拿掉圖片（框也清掉） */
  function clearImage(): void {
    select(null);
    edit((d) => {
      d.image = null;
      d.frames = [];
      config.resetForImage?.(d);
    });
  }

  /* ---------- 演出框 ---------- */

  const frameById = (id: string | null): F | undefined =>
    id ? docNow().frames.find((f) => f.id === id) : undefined;

  /** 加一個做好的框（到上限時 null）；回傳 id */
  function insertFrame(frame: F, reveal = true): string | null {
    const s = docNow();
    if (!s.image || s.frames.length >= LIMITS.frames) return null;
    edit((d) => {
      d.frames.push(frame);
    });
    select(frame.id, reveal);
    return frame.id;
  }

  /** 畫一個新框（用目前的工具與預設）；回傳 id（到上限時 null） */
  function addFrame(rect: Rect, kind: P['tool'] = prefsNow().tool): string | null {
    const s = docNow();
    if (!s.image || s.frames.length >= LIMITS.frames) return null;
    const id = newFrameId(s.frames.map((f) => f.id));
    const frame = config.makeFrame(kind, clampRect(rect, s.image), prefsNow().defaults, id);
    return insertFrame(frame);
  }

  /** 改一個框的設定（一步復原；merge：連續的變更，0.4 秒內的合成一步） */
  function updateFrame(id: string, recipe: (f: F) => void, merge = false): void {
    (merge ? editMerged : edit)((d) => {
      const f = d.frames.find((x) => x.id === id);
      if (f) recipe(f);
    });
  }

  /** 改一個框的範圍（夾在圖裡；沒有變化時不記；merge：方向鍵連按） */
  function setFrameRect(id: string, rect: Rect, merge = false): void {
    const s = docNow();
    const f = s.frames.find((x) => x.id === id);
    if (!f || !s.image) return;
    const r = clampRect(rect, s.image);
    if (r.x === f.x && r.y === f.y && r.w === f.w && r.h === f.h) return;
    updateFrame(
      id,
      (x) => {
        if (config.applyRect) config.applyRect(x, r);
        else Object.assign(x, r);
      },
      merge,
    );
  }

  function removeFrame(id: string): void {
    if (!frameById(id)) return;
    if (useLive.getState().selected === id) select(null);
    edit((d) => {
      d.frames = d.frames.filter((f) => f.id !== id);
    });
  }

  function clearFrames(): void {
    select(null);
    edit((d) => {
      d.frames = [];
    });
  }

  /** 複製（放在原本那個的後面）；回傳新的 id */
  function duplicate(id: string): string | null {
    const s = docNow();
    const f = s.frames.find((x) => x.id === id);
    if (!f || !s.image || s.frames.length >= LIMITS.frames) return null;
    const nid = newFrameId(s.frames.map((x) => x.id));
    const copy = config.duplicateFrame(f, s.image, nid);
    edit((d) => {
      const i = d.frames.findIndex((x) => x.id === id);
      d.frames.splice(i + 1, 0, copy);
    });
    select(nid);
    return nid;
  }

  /** 在清單裡上移（-1）／下移（+1）一格 */
  function moveFrame(id: string, delta: -1 | 1): void {
    const frames = docNow().frames;
    const i = frames.findIndex((f) => f.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= frames.length) return;
    edit((d) => {
      const [f] = d.frames.splice(i, 1);
      d.frames.splice(j, 0, f);
    });
  }

  /** 換掉整份內容（重設、開啟專案檔；一步復原） */
  function resetAll(next: S = config.initialState()): void {
    select(null);
    useLive.setState({ missing: null });
    if (useDoc.inGesture()) useDoc.endGesture();
    useDoc.beginGesture();
    try {
      useDoc.getState().replace(next);
    } finally {
      useDoc.endGesture();
    }
  }

  return {
    toolId,
    version: config.version,
    useDoc,
    gesture,
    docNow,
    edit,
    editMerged,
    historyStep,
    useLive,
    select,
    usePrefs,
    prefsNow,
    setPrefs,
    setDefaults,
    startCameraPreview,
    requestSeek,
    assets,
    referencedImages,
    dropMissingImage,
    setImage,
    clearImage,
    frameById,
    insertFrame,
    addFrame,
    updateFrame,
    setFrameRect,
    removeFrame,
    clearFrames,
    duplicate,
    moveFrame,
    resetAll,
    assetIds: config.assetIds,
    normalizeState: config.normalizeState,
    initialState: config.initialState,
    initialPrefs: config.initialPrefs,
  };
}

export type FxStore<
  F extends FrameBase = FrameBase,
  S extends FxDoc<F> = FxDoc<F>,
  P extends FxPrefsBase = FxPrefsBase,
  Tab extends string = string,
> = ReturnType<typeof createFxStore<F, S, P, Tab>>;
