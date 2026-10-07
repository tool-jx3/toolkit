/**
 * 狀態：
 * - useSettings：去背方式、色鍵、邊緣、輸出設定與圖片清單（每張的筆刷）——自動保存（localStorage）、復原／重做。
 *   圖片只記資產庫的 id（原檔在 IndexedDB）。
 * - usePreview：不列入復原的狀態（目前這張、筆刷工具與大小、預覽模式、預覽背景），以及 AI 遮罩的快取
 *   （原圖的資產 id → 遮罩 PNG 的資產 id；同一張圖不必再推論一次，復原也不會把它弄丟）。
 * - assets：原圖與 AI 遮罩（IndexedDB）。
 */
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { createPreviewStore, createToolStore } from '@/core/storage';
import type { StageBackground } from '@/ui';
import {
  type BrushTool,
  defaultSettings,
  normalizeSettings,
  PROJECT_VERSION,
  RANGE,
  type Settings,
  TOOL_ID,
  type ViewMode,
} from './model';

export { PROJECT_VERSION, TOOL_ID };

export const assets = createAssetStore(TOOL_ID);

export const useSettings = createToolStore<Settings>(TOOL_ID, defaultSettings(), {
  version: PROJECT_VERSION,
  migrate: (persisted) => normalizeSettings(persisted),
});

/* 存檔裡的值不合法時（被改壞、舊版本）修正一次 */
{
  const d = useSettings.getState().data;
  const fixed = normalizeSettings(d);
  if (JSON.stringify(fixed) !== JSON.stringify(d)) {
    useSettings.temporal.getState().pause();
    useSettings.getState().replace(fixed);
    useSettings.temporal.getState().resume();
  }
  useSettings.temporal.getState().clear();
}

export const settingsNow = (): Settings => useSettings.getState().data;

/** 改設定（拖滑桿等連續的變更 0.4 秒內算一步） */
export function edit(recipe: (d: Settings) => void): void {
  useSettings.getState().update(recipe);
}

/** 一次完成的動作（按鈕、加圖、一筆筆刷）：自己算一步 */
export function step(recipe: (d: Settings) => void): void {
  if (useSettings.inGesture()) {
    edit(recipe);
    return;
  }
  useSettings.beginGesture();
  try {
    edit(recipe);
  } finally {
    useSettings.endGesture();
  }
}

export interface PreviewState {
  /** 目前這張（清單項目的 id） */
  current: string | null;
  tool: BrushTool;
  brushSize: number;
  brushHardness: number;
  /** 同色擦掉／補回：容許度、只選相連的（規格 F61） */
  fillTolerance: number;
  fillContiguous: boolean;
  view: ViewMode;
  /** 預覽背景（背景圖的網址不存：圖放在素材庫，見 stageBgImage） */
  stageBg: StageBackground;
  /** 預覽背景圖在素材庫的 id（重新整理後還在） */
  stageBgImage: string | null;
  /** 原圖的資產 id → AI 遮罩（PNG）的資產 id */
  aiMasks: Record<string, string>;
}

export const usePreview = createPreviewStore<PreviewState>(TOOL_ID, {
  current: null,
  tool: 'move',
  brushSize: RANGE.brushSize.default,
  brushHardness: RANGE.brushHardness.default,
  fillTolerance: RANGE.fillTolerance.default,
  fillContiguous: true,
  view: 'result',
  stageBg: { kind: 'checker' },
  stageBgImage: null,
  aiMasks: {},
});

export const previewNow = (): PreviewState => usePreview.getState().data;

export function setPreview(patch: Partial<PreviewState>): void {
  usePreview.getState().patch(patch);
}

/** 目前這張（沒有選或選的不見了時是第一張） */
export function currentItem(s: Settings = settingsNow(), p: PreviewState = previewNow()) {
  return s.images.find((it) => it.id === p.current) ?? s.images[0] ?? null;
}

/** 目前設定與復原／重做歷史用到的原圖、它們的 AI 遮罩，以及預覽背景圖（gc 時保留） */
export function referencedIds(): Set<string> {
  const keep = referencedAssetIds(useSettings, (d) => d.images.map((it) => it.asset));
  const { aiMasks: masks, stageBgImage } = previewNow();
  for (const id of [...keep]) {
    const m = masks[id];
    if (m) keep.add(m);
  }
  if (stageBgImage) keep.add(stageBgImage);
  return keep;
}

/** 清掉沒有人用的檔案與 AI 遮罩的紀錄 */
export async function collectGarbage(): Promise<void> {
  try {
    const keep = referencedIds();
    const masks = previewNow().aiMasks;
    const stale = Object.keys(masks).filter((src) => !keep.has(src));
    if (stale.length) {
      usePreview.getState().update((d) => {
        for (const k of stale) delete d.aiMasks[k];
      });
    }
    await assets.gc(referencedIds());
  } catch {
    /* 下次再清 */
  }
}
