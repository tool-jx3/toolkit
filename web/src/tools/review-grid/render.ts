/**
 * 畫圖：量字寬的畫布、字型載入、心得卡片與比較圖的 PNG（預覽與下載同一份版面，見 layout.ts、compare.ts）。
 */
import { canvasToBlob, deviceResolutionLimits, limitResolution, makeCanvas } from '@/core/image';
import { fontString, loadSceneFonts, measureWidth, renderScene, type TextFont } from '@/core/scene';
import {
  type CompareGroup,
  type ComparePerson,
  type CompareStrings,
  compareFontUses,
  layoutCompare,
} from './compare';
import { cardFontUses, type LayoutEnv, layoutCard } from './layout';
import type { ReviewState } from './model';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

let measureCtx: Ctx | null = null;

/** 量字寬用的畫布（共用一個） */
export function measureContext(): Ctx {
  if (!measureCtx) measureCtx = makeCanvas(4, 4).getContext('2d') as Ctx;
  return measureCtx;
}

export const measure = (f: TextFont, text: string): number =>
  measureWidth(measureContext(), fontString(f), text);

export function layoutEnv(
  images: ReadonlyMap<string, CanvasImageSource>,
  shadowScale = 1,
): LayoutEnv {
  return { measure, image: (id) => images.get(id) ?? null, shadowScale };
}

/** 載入卡片用到的字；有新載入的字時回傳 true（呼叫端重畫） */
export const loadCardFonts = (d: ReviewState): Promise<boolean> => loadSceneFonts(cardFontUses(d));

/** 輸出的倍率：想要的倍率，但超過瀏覽器能畫的大小時自動降低 */
export function outputScale(width: number, height: number, desired: number): number {
  return limitResolution(desired, { width, height }, deviceResolutionLimits());
}

export interface RenderResult {
  blob: Blob;
  width: number;
  height: number;
  /** 實際的倍率（比想要的小＝自動降低了） */
  scale: number;
}

/** 心得卡片的 PNG */
export async function renderCardPng(
  d: ReviewState,
  images: ReadonlyMap<string, CanvasImageSource>,
  desired: number,
): Promise<RenderResult> {
  await loadCardFonts(d);
  const base = layoutCard(d, layoutEnv(images));
  const scale = outputScale(base.width, base.height, desired);
  const lay = layoutCard(d, layoutEnv(images, scale));
  const canvas = renderScene({ width: lay.width, height: lay.height }, lay.nodes, { scale });
  const blob = await canvasToBlob(canvas, 'image/png');
  return { blob, width: canvas.width, height: canvas.height, scale };
}

/** 比較圖的 PNG */
export async function renderComparePng(
  people: readonly ComparePerson[],
  groups: readonly CompareGroup[],
  s: CompareStrings,
  desired: number,
): Promise<RenderResult> {
  await loadSceneFonts(compareFontUses(people, groups, s));
  const env = layoutEnv(new Map());
  const lay = layoutCompare(people, groups, env, s);
  const scale = outputScale(lay.width, lay.height, desired);
  const canvas = renderScene({ width: lay.width, height: lay.height }, lay.nodes, { scale });
  const blob = await canvasToBlob(canvas, 'image/png');
  return { blob, width: canvas.width, height: canvas.height, scale };
}
