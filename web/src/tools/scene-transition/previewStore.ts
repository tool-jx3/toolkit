/**
 * 預覽用的狀態（2026-11-20）：預覽背景的種類、背景圖、立繪與它的位置大小。
 * - 只影響預覽，不進匯出、不進設定的自動儲存與復原（設定的格式與版本不變）；
 * - 存在這個瀏覽器：種類與位置在 localStorage（`trpg-toolkit:scene-transition:preview`），
 *   圖片本身在 IndexedDB（`@/core/assets`，只存 id），重新整理後還在；
 * - 圖片讀不回來（被瀏覽器清掉）時背景回到示意場景、立繪拿掉。
 */
import { createAssetStore } from '@/core/assets';
import { clampBoxPosition } from '@/core/layout';
import { createPreviewStore } from '@/core/storage';
import type { StageAnyBackgroundKind } from '@/ui';
import { PREVIEW_SIZE } from './render';
import { TOOL_ID } from './settings';

/** 預覽背景的按鈕（順序即工具列順序） */
export const BACKGROUNDS: readonly StageAnyBackgroundKind[] = [
  'scene',
  'light',
  'checker',
  'image',
];

/** 立繪：圖片 id、寬 ÷ 高，位置與大小以預覽畫面的百分比計（x、y 是左上角，height 是高度） */
export interface Portrait {
  id: string;
  aspect: number;
  x: number;
  y: number;
  height: number;
}

export interface PreviewState {
  background: StageAnyBackgroundKind;
  /** 背景圖（資產庫的 id） */
  backgroundImage: string | null;
  portrait: Portrait | null;
}

export const PREVIEW_DEFAULTS: PreviewState = {
  background: 'scene',
  backgroundImage: null,
  portrait: null,
};

/** 立繪大小（預覽畫面高的百分比）：範圍與預設 */
export const PORTRAIT_HEIGHT = { min: 10, max: 200, step: 1, initial: 90 } as const;

/** 預覽畫面的長寬比（寬 ÷ 高），把立繪的寬度換成畫面寬的百分比用 */
const FRAME_ASPECT = PREVIEW_SIZE.width / PREVIEW_SIZE.height;

export const assets = createAssetStore(TOOL_ID);

export const usePreview = createPreviewStore<PreviewState>(TOOL_ID, PREVIEW_DEFAULTS);

const finite = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** 讀回的值不對時修正（種類不在按鈕裡 → 示意場景；數字夾在範圍內） */
export function normalizePreview(raw: unknown): PreviewState {
  if (!raw || typeof raw !== 'object') return { ...PREVIEW_DEFAULTS };
  const r = raw as Record<string, unknown>;
  const background = BACKGROUNDS.includes(r.background as StageAnyBackgroundKind)
    ? (r.background as StageAnyBackgroundKind)
    : 'scene';
  const backgroundImage = typeof r.backgroundImage === 'string' ? r.backgroundImage : null;
  let portrait: Portrait | null = null;
  const p = r.portrait as Record<string, unknown> | null | undefined;
  if (p && typeof p === 'object' && typeof p.id === 'string') {
    const aspect = finite(p.aspect, 0);
    if (aspect > 0)
      portrait = placePortrait({
        id: p.id,
        aspect,
        x: finite(p.x, 0),
        y: finite(p.y, 0),
        height: Math.min(
          PORTRAIT_HEIGHT.max,
          Math.max(PORTRAIT_HEIGHT.min, finite(p.height, PORTRAIT_HEIGHT.initial)),
        ),
      });
  }
  return {
    background: background === 'image' && !backgroundImage ? 'scene' : background,
    backgroundImage,
    portrait,
  };
}

/** 立繪的寬（畫面寬的百分比） */
export const portraitWidth = (p: Pick<Portrait, 'aspect' | 'height'>): number =>
  (p.height * p.aspect) / FRAME_ASPECT;

/** 新的立繪：高度 90%、左右置中、腳底貼齊畫面下緣 */
export function newPortrait(id: string, aspect: number): Portrait {
  const height = PORTRAIT_HEIGHT.initial;
  const width = portraitWidth({ aspect, height });
  return { id, aspect, x: 50 - width / 2, y: 100 - height, height };
}

/** 夾住位置：立繪的中心留在畫面裡 */
export function placePortrait(p: Portrait): Portrait {
  const width = portraitWidth(p);
  const b = clampBoxPosition(
    { x: p.x, y: p.y, width, height: p.height },
    { minX: 0, maxX: 100, minY: 0, maxY: 100 },
    'center',
  );
  return { ...p, x: b.x, y: b.y };
}

/** 改大小：腳底與左右的中心不動 */
export function resizePortrait(p: Portrait, height: number): Portrait {
  const h = Math.min(PORTRAIT_HEIGHT.max, Math.max(PORTRAIT_HEIGHT.min, height));
  const cx = p.x + portraitWidth(p) / 2;
  const bottom = p.y + p.height;
  const width = portraitWidth({ aspect: p.aspect, height: h });
  return placePortrait({ ...p, height: h, x: cx - width / 2, y: bottom - h });
}

/**
 * 換一張圖：用舊的長寬比算出原本的左右中心與腳底，換成新的長寬比後保持中心、腳底與高度（再照夾住的規則）。
 */
export function replacePortraitImage(p: Portrait, id: string, aspect: number): Portrait {
  const cx = p.x + portraitWidth(p) / 2;
  const bottom = p.y + p.height;
  const width = portraitWidth({ aspect, height: p.height });
  return placePortrait({ ...p, id, aspect, x: cx - width / 2, y: bottom - p.height });
}

/* 開頁時修正存下的值 */
{
  const cur = usePreview.getState().data;
  const fixed = normalizePreview(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) usePreview.getState().replace(fixed);
}

/** 目前用到的圖片 id（背景圖、立繪） */
export function keptAssetIds(d: PreviewState = usePreview.getState().data): string[] {
  return [d.backgroundImage, d.portrait?.id].filter((v): v is string => !!v);
}
