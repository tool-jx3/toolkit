/**
 * 狀態與動作（共用的 createFxStore，core/imagefx/store.ts）：
 * - useDoc：圖片（資產 id）、畫面、背景、截圖、出處、時間軸、運鏡、演出框（自動儲存、可以復原）。復原的步數（第一批驗證 R10）：
 *   只有連續的操作合成一步——拖曳、滑桿、文字欄（放開／離開才記）、方向鍵連按與顏色拖曳（0.4 秒內連續的）；
 *   其他（新增、複製、刪除、上移下移、換圖、範例、選項）一次各一步，不和前後的變更合併；
 * - usePrefs：畫框的工具、新畫的框的預設、編輯輔助線、循環播放、匯出設定、預覽背景（自動儲存，不列入復原）；
 * - useLive：選取中的框、設定欄的分頁、編輯區、運鏡確認（不儲存）；
 * - 圖片原檔存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { createFxStore, type FxPrefsBase, STAGE_BGS, type StageBg } from '@/core/imagefx';
import type { ExportSettings } from '@/ui';
import {
  duplicateFrame,
  type Frame,
  type FrameDefaults,
  type FrameKind,
  type FxState,
  initialDefaults,
  initialState,
  makeFrame,
  normalizeDefaults,
  normalizeState,
  stateAssetIds,
  VIDEO_FPS,
} from './model';

export { type PointerTool, STAGE_BGS, type StageBg } from '@/core/imagefx';

export const TOOL_ID = 'screenshot-fx';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

/* ---------- 不列入復原的設定 ---------- */

export interface Prefs extends FxPrefsBase<FrameKind, FrameDefaults> {
  export: ExportSettings;
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

export type PanelTab = 'image' | 'frames' | 'timing';

export const fx = createFxStore<Frame, FxState, Prefs, PanelTab>({
  toolId: TOOL_ID,
  version: DATA_VERSION,
  initialState,
  normalizeState,
  initialPrefs,
  normalizePrefs,
  makeFrame,
  duplicateFrame,
  assetIds: stateAssetIds,
  tabs: { initial: 'image', frames: 'frames' },
});

export const {
  useDoc,
  gesture,
  docNow,
  edit,
  editMerged,
  historyStep,
  usePrefs,
  prefsNow,
  setPrefs,
  setDefaults,
  useLive,
  startCameraPreview,
  requestSeek,
  select,
  assets,
  referencedImages,
  dropMissingImage,
  setImage,
  clearImage,
  frameById,
  addFrame,
  updateFrame,
  setFrameRect,
  removeFrame,
  clearFrames,
  duplicate,
  moveFrame,
  resetAll,
} = fx;
