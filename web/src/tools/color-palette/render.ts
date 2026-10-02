/**
 * 畫配色條（規格 3.1）與輸出 PNG（3.3）。預覽與儲存用同一段繪圖程式（所見即所得）。
 */
import { encodePngAsync } from '@/core/encode';
import { roundRectPath } from '@/core/image';
import { EMPTY_BAR_COLOR, type PaletteLayout, type Rect } from './logic';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * 整張畫布：先鋪滿背景色，再依序畫每一條膠囊形的色條（上下兩端是完整的半圓）。
 * 每段從自己的上緣一路畫到色條下端，下一段蓋上去：交界沒有縫隙（不會透出背景色）。
 */
export function drawPalette(ctx: Ctx, layout: PaletteLayout, background: string): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, layout.width, layout.height);
  for (const bar of layout.bars) {
    if (bar.length <= 0 || bar.width <= 0) continue;
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, bar.x, bar.top, bar.width, bar.length, bar.width / 2);
    ctx.closePath();
    if (bar.total <= 0) {
      ctx.fillStyle = EMPTY_BAR_COLOR;
      ctx.fill();
    } else {
      ctx.clip();
      /* 每段只畫自己的範圍、上下各多 1 px 防縫（下一段蓋掉多出來的那 1 px，和舊版相同）。
         不要從段的上緣一路畫到色條下端：圓角與側邊的半透明像素會被每一段重複疊色，染上上面各段的顏色 */
      for (const seg of bar.segments) {
        if (seg.y1 <= seg.y0) continue;
        ctx.fillStyle = seg.color;
        ctx.fillRect(bar.x, seg.y0 - 1, bar.width, seg.y1 - seg.y0 + 2);
      }
    }
    ctx.restore();
  }
  ctx.restore();
}

function context(canvas: HTMLCanvasElement | OffscreenCanvas): Ctx {
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
}

function newCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof document === 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/** 整張儲存用的畫布（與預覽相同的尺寸與像素） */
export function renderFull(
  layout: PaletteLayout,
  background: string,
): HTMLCanvasElement | OffscreenCanvas {
  const c = newCanvas(layout.width, layout.height);
  drawPalette(context(c), layout, background);
  return c;
}

/** 裁邊儲存：背景色鋪底，再把整張畫布上這個範圍的畫面原樣貼上（範圍超出畫布的部分是背景色） */
export function renderCrop(
  full: HTMLCanvasElement | OffscreenCanvas,
  rect: Rect,
  background: string,
): HTMLCanvasElement | OffscreenCanvas {
  const c = newCanvas(rect.width, rect.height);
  const ctx = context(c);
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, rect.width, rect.height);
  ctx.drawImage(full, -rect.x, -rect.y);
  return c;
}

/** 畫布 → PNG（8-bit RGBA；背景色鋪滿，所以整張不透明）。在 Worker 裡編碼（不支援時改在主執行緒） */
export async function canvasToPng(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  const { width, height } = canvas;
  const data = context(canvas).getImageData(0, 0, width, height).data;
  const bytes = await encodePngAsync(data, width, height, 0);
  return new Blob([bytes], { type: 'image/png' });
}
