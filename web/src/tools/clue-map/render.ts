/**
 * 畫總覽 PNG（規格 3.5）：量字寬的畫布、字型載入、版面（overview.ts）→ PNG。
 */
import { canvasToBlob, deviceResolutionLimits, limitResolution, makeCanvas } from '@/core/image';
import {
  fontString,
  loadSceneFonts,
  measureWidth,
  renderScene,
  sourceSize,
  type TextFont,
} from '@/core/scene';
import { type DrawableSource, loadOverviewImages, refsOf } from './images';
import type { ClueMapState } from './model';
import {
  layoutOverview,
  type OverviewEnv,
  type OverviewLayout,
  overviewFontUses,
} from './overview';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let measureCtx: Ctx | null = null;

/** 量字寬用的畫布（共用一個） */
function measureContext(): Ctx {
  if (!measureCtx) measureCtx = makeCanvas(4, 4).getContext('2d') as Ctx;
  return measureCtx;
}

export const measure = (f: TextFont, text: string): number =>
  measureWidth(measureContext(), fontString(f), text);

/** 版面用的環境：圖片讀不到的是 null */
export function overviewEnv(images: ReadonlyMap<string, DrawableSource | null>): OverviewEnv {
  return {
    measure,
    image: (key) => images.get(key) ?? null,
    imageSize: (key) => {
      const im = images.get(key);
      return im ? sourceSize(im) : null;
    },
  };
}

/** 還沒讀圖片時估的版面（輸出尺寸的預估用） */
export function estimateOverview(d: ClueMapState): OverviewLayout {
  return layoutOverview(d, overviewEnv(new Map()));
}

/** 輸出的倍率：想要的倍率，但超過瀏覽器能畫的大小時自動降低 */
export function outputScale(width: number, height: number, desired: number): number {
  return limitResolution(desired, { width, height }, deviceResolutionLimits());
}

export interface OverviewResult {
  blob: Blob;
  width: number;
  height: number;
  /** 實際的倍率（比想要的小＝自動降低了） */
  scale: number;
  /** 讀不到的圖片張數（總覽裡用灰底代替） */
  missing: number;
}

export async function renderOverviewPng(d: ClueMapState, desired: number): Promise<OverviewResult> {
  await loadSceneFonts(overviewFontUses(d));
  const images = await loadOverviewImages(refsOf(d));
  const lay = layoutOverview(d, overviewEnv(images));
  const scale = outputScale(lay.width, lay.height, desired);
  const canvas = renderScene({ width: lay.width, height: lay.height }, lay.nodes, { scale });
  const blob = await canvasToBlob(canvas, 'image/png');
  return {
    blob,
    width: canvas.width,
    height: canvas.height,
    scale,
    missing: [...images.values()].filter((v) => v === null).length,
  };
}
