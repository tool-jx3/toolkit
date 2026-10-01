/**
 * 表情的合成與合輯圖（瀏覽器端）。
 * 預覽、選項縮圖、清單縮圖與合輯圖都走同一套疊法（F06）：內建部件是向量，直接畫到目標大小；
 * 自訂部件是點陣圖，交給 core/compose 的 drawLayers 等比置中（主控裁定：預覽與合輯圖一致）。
 */
import { drawLayers } from '@/core/compose';
import { ensureFont, fontCss } from '@/core/fonts';
import { type DrawableImage, makeCanvas, type Rect } from '@/core/image';
import { captionMeasure, drawSheet, layoutSheet, type SheetLayout } from '@/core/sheet';
import {
  type Expression,
  layerIds,
  type PartSelection,
  type SheetOptions,
  sheetCaptions,
} from './logic';
import { type BuiltinPart, type Ctx2D, drawPartAt } from './parts';

export type StackLayer =
  | { kind: 'vector'; id: string; part: BuiltinPart }
  | { kind: 'image'; id: string; image: DrawableImage };

/** 部件 id → 可以畫的圖層；找不到（或自訂部件的圖還沒讀到、遺失）時 null */
export type LayerResolver = (id: string) => StackLayer | null;

/** 一個表情由下而上的圖層 */
export function stackOf(s: PartSelection, resolve: LayerResolver): StackLayer[] {
  return layerIds(s)
    .map(resolve)
    .filter((l): l is StackLayer => !!l);
}

/** 把圖層依序畫進 rect（正方形）。 */
export function drawStack(ctx: Ctx2D, layers: readonly StackLayer[], rect: Rect): void {
  const size = Math.min(rect.width, rect.height);
  const x = rect.x + (rect.width - size) / 2;
  const y = rect.y + (rect.height - size) / 2;
  for (const l of layers) {
    if (l.kind === 'vector') drawPartAt(ctx, l.part, x, y, size);
    else drawLayers(ctx, [l.image], { x, y, width: size, height: size }, { fit: 'contain' });
  }
}

/** 疊成一張 size × size 的透明畫布（選項縮圖、清單縮圖） */
export function renderStack(layers: readonly StackLayer[], size: number): HTMLCanvasElement {
  const c = makeCanvas(size, size) as HTMLCanvasElement;
  const ctx = c.getContext('2d');
  if (ctx) drawStack(ctx, layers, { x: 0, y: 0, width: size, height: size });
  return c;
}

/* ---------- 合輯圖（3.3） ---------- */

/** 合輯圖文字的字型：繁中字型、半粗體（刻意差異：舊版是系統無襯線字型） */
export const SHEET_FONT = { family: 'Noto Sans TC', weight: 600 } as const;

/** 瀏覽器畫布的上限（Chromium：每邊 32767 px、總面積約 2.68 億像素） */
export const MAX_CANVAS_SIDE = 32_767;
export const MAX_CANVAS_AREA = 268_435_456;

export class SheetTooLargeError extends Error {
  override name = 'SheetTooLargeError';
  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    super(`sheet too large: ${width}×${height}`);
  }
}

/** 先算版面（含逐字換行）；字型要先載入才量得準 */
export async function layoutFor(
  picked: readonly Expression[],
  options: SheetOptions,
): Promise<SheetLayout> {
  const captions = sheetCaptions(picked, options.showText);
  const font = fontCss(SHEET_FONT, options.fontSize);
  const text = captions.join('');
  if (text) await ensureFont(SHEET_FONT.family, SHEET_FONT.weight, text);
  return layoutSheet({
    count: picked.length,
    columns: options.columns,
    cellSize: options.cellSize,
    gap: options.gap,
    captions,
    fontSize: options.fontSize,
    measure: captionMeasure(font),
  });
}

/**
 * 把合輯圖畫到 canvas（畫布尺寸會改成輸出尺寸）。太大時丟出 SheetTooLargeError（畫布不動）。
 */
export function paintSheet(
  canvas: HTMLCanvasElement,
  layout: SheetLayout,
  picked: readonly Expression[],
  options: SheetOptions,
  resolve: LayerResolver,
): void {
  const { width, height } = layout;
  if (width > MAX_CANVAS_SIDE || height > MAX_CANVAS_SIDE || width * height > MAX_CANVAS_AREA)
    throw new SheetTooLargeError(width, height);
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d context unavailable');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSheet(ctx, layout, {
    font: fontCss(SHEET_FONT, options.fontSize),
    color: options.textColor,
    background: options.background,
    drawCell: (c, i, rect) => drawStack(c, stackOf(picked[i], resolve), rect),
  });
}
