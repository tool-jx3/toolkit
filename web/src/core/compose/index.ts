/**
 * core/compose：把同尺寸的圖層依順序（第一個在最下面）疊到任意大小的範圍。
 * 預覽、選項縮圖、清單縮圖與合輯圖共用同一個函式，所以每個地方的疊法完全一樣。
 *
 * ```ts
 * const layers = [face.fill, face.line, brows, eyes, mouth, ...decorations];  // 每層都是正方形透明圖
 * drawLayers(ctx, layers, { x: 14, y: 14, width: 300, height: 300 });          // 等比置中（預設）
 * const thumb = composeLayers(layers, { width: 128, height: 128 });           // 回傳 canvas
 * ```
 */
import { type DrawableImage, imageSize, makeCanvas, type Rect, type Size } from '../image';

/** contain：等比縮放、整張放進範圍並置中；cover：等比填滿（超出裁掉）；stretch：拉伸成範圍大小 */
export type ComposeFit = 'contain' | 'cover' | 'stretch';

export type Layer = DrawableImage | null | undefined | false;

export interface ComposeOptions {
  fit?: ComposeFit;
  /** 平滑縮放（預設 true；像素圖用 false） */
  smoothing?: boolean;
}

/** 一張來源在範圍裡實際畫出的位置與大小 */
export function layerRect(src: Size, dst: Rect, fit: ComposeFit = 'contain'): Rect {
  if (fit === 'stretch' || !(src.width > 0 && src.height > 0)) return { ...dst };
  const sx = dst.width / src.width;
  const sy = dst.height / src.height;
  const s = fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
  const width = src.width * s;
  const height = src.height * s;
  return {
    x: dst.x + (dst.width - width) / 2,
    y: dst.y + (dst.height - height) / 2,
    width,
    height,
  };
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 依序把圖層畫進 ctx 的 dst 範圍（cover 時裁在範圍內）。null／undefined／false 的圖層略過。 */
export function drawLayers(
  ctx: Ctx2D,
  layers: readonly Layer[],
  dst: Rect,
  { fit = 'contain', smoothing = true }: ComposeOptions = {},
): void {
  ctx.save();
  ctx.imageSmoothingEnabled = smoothing;
  ctx.imageSmoothingQuality = 'high';
  if (fit === 'cover') {
    ctx.beginPath();
    ctx.rect(dst.x, dst.y, dst.width, dst.height);
    ctx.clip();
  }
  for (const layer of layers) {
    if (!layer) continue;
    const r = layerRect(imageSize(layer), dst, fit);
    ctx.drawImage(layer as CanvasImageSource, r.x, r.y, r.width, r.height);
  }
  ctx.restore();
}

/** 疊成一張新的畫布（size 大小；background 不給時透明） */
export function composeLayers(
  layers: readonly Layer[],
  size: Size,
  { background, ...options }: ComposeOptions & { background?: string | null } = {},
): HTMLCanvasElement | OffscreenCanvas {
  const c = makeCanvas(size.width, size.height);
  const ctx = c.getContext('2d') as Ctx2D | null;
  if (!ctx) return c;
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, c.width, c.height);
  }
  drawLayers(ctx, layers, { x: 0, y: 0, width: c.width, height: c.height }, options);
  return c;
}

/**
 * 有順序的複選（裝飾圖層）：點一下加入（放在最上層＝陣列最後）、再點一下移除。回傳新的陣列。
 */
export function toggleOrdered<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/** 陣列裡第 from 項移到 to 的位置（往下移時落在目標之後、往上移時落在目標之前）。回傳新的陣列。 */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const t = Math.max(0, Math.min(out.length - 1, to));
  const [it] = out.splice(from, 1);
  out.splice(t, 0, it);
  return out;
}
