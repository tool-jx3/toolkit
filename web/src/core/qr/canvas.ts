/**
 * 有樣式的 QR code 場景畫到 canvas（預覽與 PNG／JPEG／WebP 匯出共用）。路徑用 Path2D 解析 SVG 的路徑字串。
 */
import { toCss } from '../color';
import { containRect, type QrFill, type QrScene } from './style';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 場景的填色 → canvas 的 fillStyle */
export function qrFillStyle(ctx: Ctx, f: QrFill): string | CanvasGradient {
  if (f.kind === 'solid') return toCss(f.color);
  const g =
    f.kind === 'linear'
      ? ctx.createLinearGradient(f.x1, f.y1, f.x2, f.y2)
      : ctx.createRadialGradient(f.cx, f.cy, 0, f.cx, f.cy, f.r);
  for (const s of f.stops) g.addColorStop(s.offset, toCss(s.color));
  return g;
}

/** 圓角矩形（rx 超過一半時夾在一半） */
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, rx: number) {
  const r = Math.max(0, Math.min(rx, w / 2, h / 2));
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export interface DrawQrOptions {
  /** 中間的圖（場景有圖的位置時才畫） */
  image?: CanvasImageSource & { width: number; height: number };
  /** 倍率（匯出 2 倍時給 2；畫布要先設好大小） */
  scale?: number;
  /** 先鋪的底色（JPEG 沒有透明，透明的地方鋪白） */
  matte?: string;
}

/** 把場景畫上去（會先清掉畫布） */
export function drawQrScene(ctx: Ctx, scene: QrScene, options: DrawQrOptions = {}): void {
  const k = options.scale ?? 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (options.matte) {
    ctx.fillStyle = options.matte;
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  }
  ctx.setTransform(k, 0, 0, k, 0, 0);
  const bg = scene.background;
  if (bg) {
    ctx.fillStyle = qrFillStyle(ctx, bg.fill);
    roundRect(ctx, bg.x, bg.y, bg.width, bg.height, bg.rx);
    ctx.fill();
  }
  for (const layer of scene.layers) {
    if (!layer.d) continue;
    ctx.fillStyle = qrFillStyle(ctx, layer.fill);
    ctx.fill(new Path2D(layer.d), layer.rule);
  }
  if (scene.image && options.image) {
    const r = containRect(scene.image, options.image.width, options.image.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(options.image, r.x, r.y, r.width, r.height);
  }
  ctx.restore();
}
