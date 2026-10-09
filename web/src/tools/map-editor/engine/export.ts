/**
 * 匯出圖片（規格 3.3）：世界座標的範圍以倍率 s 畫成 W × H（四捨五入）的圖；不含選取框、預覽、吸附標示、匯出範圍的暗幕。
 * 網格由引擎的 after:render 依 `exporting` 的設定畫上去。SVG 用 Fabric 的 toSVG（不含網格）。
 */
import type { Canvas, FabricObject, TMat2D } from 'fabric';
import type { MapObj } from './objects';

export interface ExportRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RasterOptions {
  scale: number;
  background: 'transparent' | 'white';
  /** 引擎在畫的期間把這個旗標交給 after:render（網格要不要畫） */
  setExporting: (v: { grid: boolean } | null) => void;
  grid: boolean;
}

/** 範圍畫成一張 canvas（PNG／JPEG／預覽用） */
export function renderRegion(
  canvas: Canvas,
  r: ExportRect,
  opts: RasterOptions,
): HTMLCanvasElement {
  const W = Math.max(1, Math.round(r.w * opts.scale));
  const H = Math.max(1, Math.round(r.h * opts.scale));
  const el = document.createElement('canvas');
  el.width = W;
  el.height = H;
  const ctx = el.getContext('2d');
  if (!ctx) return el;
  const c = canvas as unknown as Canvas & {
    width: number;
    height: number;
    skipControlsDrawing: boolean;
  };
  const saved = {
    vpt: c.viewportTransform.slice() as TMat2D,
    width: c.width,
    height: c.height,
    bg: c.backgroundColor,
    retina: c.enableRetinaScaling,
    skip: c.skipControlsDrawing,
  };
  const s = opts.scale;
  c.viewportTransform = [s, 0, 0, s, -r.x * s, -r.y * s];
  c.width = W;
  c.height = H;
  c.backgroundColor = opts.background === 'white' ? '#ffffff' : '';
  c.enableRetinaScaling = false;
  c.skipControlsDrawing = true;
  opts.setExporting({ grid: opts.grid });
  try {
    c.calcViewportBoundaries();
    const objs = c.getObjects().filter((o: FabricObject) => !(o as MapObj).isPreview);
    c.renderCanvas(ctx, objs);
  } finally {
    opts.setExporting(null);
    c.viewportTransform = saved.vpt;
    c.width = saved.width;
    c.height = saved.height;
    c.backgroundColor = saved.bg;
    c.enableRetinaScaling = saved.retina;
    c.skipControlsDrawing = saved.skip;
    c.calcViewportBoundaries();
    c.requestRenderAll();
  }
  return el;
}

/** SVG：範圍對應 viewBox，大小 W × H；背景白色時有白底 */
export function renderSvg(
  canvas: Canvas,
  r: ExportRect,
  scale: number,
  background: 'transparent' | 'white',
): string {
  const W = Math.max(1, Math.round(r.w * scale));
  const H = Math.max(1, Math.round(r.h * scale));
  const savedBg = canvas.backgroundColor;
  canvas.backgroundColor = background === 'white' ? '#ffffff' : '';
  try {
    return canvas.toSVG({
      width: `${W}`,
      height: `${H}`,
      viewBox: { x: r.x, y: r.y, width: r.w, height: r.h },
    });
  } finally {
    canvas.backgroundColor = savedBg;
  }
}
