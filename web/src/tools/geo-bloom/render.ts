/**
 * 繪製（規格 3.3、3.4）：背景 → 所有線 → 所有點 → 所有圖形。canvas 2D 的指令順序與參數照原作，
 * 所以同一個瀏覽器裡和原作逐像素相同（例如塗滿的 90% 不透明度、同心圓最內層先塗再描、雙正方形先轉圖形的角度再轉 45°）。
 * 主執行緒的 canvas 與 Worker 的 OffscreenCanvas 都用這支。
 */
import type { BloomScene, BloomShape } from './generate';
import type { BloomConfig } from './settings';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 預覽的長邊最多幾 px（大畫布時縮小畫；匯出一律全尺寸） */
export const PREVIEW_MAX_SIDE = 2048;

/** 預覽的縮小倍率（≤ 1） */
export function previewScale(width: number, height: number): number {
  return Math.min(1, PREVIEW_MAX_SIDE / Math.max(width, height));
}

const TAU = Math.PI * 2;

/** 描邊；塗滿時先以 90% 不透明度塗滿 */
function finish(ctx: Ctx, s: BloomShape) {
  if (s.fill) {
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.stroke();
}

function drawShape(ctx: Ctx, s: BloomShape, lineWidth: number) {
  switch (s.kind) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, s.r, 0, TAU);
      finish(ctx, s);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.5, lineWidth * 1.2), 0, TAU);
      ctx.fill();
      break;
    case 'rings': {
      const rings = s.rings ?? [];
      rings.forEach((r, i) => {
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, TAU);
        if (i === rings.length - 1 && s.fill) ctx.fill();
        ctx.stroke();
      });
      break;
    }
    case 'semi':
      ctx.beginPath();
      ctx.arc(0, 0, s.r, 0, Math.PI);
      if (s.closed) ctx.closePath();
      finish(ctx, s);
      break;
    case 'mix': {
      const rings = s.rings ?? [];
      rings.forEach((r, i) => {
        const arc = s.arcs?.[i];
        ctx.beginPath();
        if (arc) ctx.arc(0, 0, r, arc.start, arc.start + arc.span);
        else ctx.arc(0, 0, r, 0, TAU);
        ctx.stroke();
      });
      if (s.fill && rings.length) {
        ctx.beginPath();
        ctx.arc(0, 0, rings[rings.length - 1], 0, Math.PI);
        ctx.closePath();
        ctx.fill();
      }
      break;
    }
    case 'square':
    case 'doubleSquare': {
      const h = s.r / Math.SQRT2;
      ctx.beginPath();
      ctx.rect(-h, -h, h * 2, h * 2);
      finish(ctx, s);
      if (s.kind === 'doubleSquare') {
        const h2 = h * 0.6;
        ctx.rotate(Math.PI / 4);
        ctx.beginPath();
        ctx.rect(-h2, -h2, h2 * 2, h2 * 2);
        ctx.stroke();
      }
      break;
    }
  }
}

/**
 * 畫整張花紋。ctx 的畫布大小＝寬 × 高 × scale；scale ≠ 1（預覽縮小）時先設定縮放，座標照原尺寸。
 * 匯出（scale＝1）時的指令和原作完全相同。
 */
export function drawBloom(ctx: Ctx, cfg: BloomConfig, scene: BloomScene, scale = 1): void {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (scale !== 1) ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (!cfg.transparent) {
    ctx.fillStyle = cfg.background;
    ctx.fillRect(0, 0, cfg.width, cfg.height);
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const color = (accent: boolean) => (accent ? cfg.accentColor : cfg.lineColor);
  for (const l of scene.lines) {
    ctx.strokeStyle = color(l.accent);
    ctx.lineWidth = cfg.lineWidth;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }
  for (const d of scene.dots) {
    ctx.fillStyle = color(d.accent);
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, TAU);
    ctx.fill();
  }
  for (const s of scene.shapes) {
    const c = color(s.accent);
    ctx.strokeStyle = c;
    ctx.fillStyle = c;
    ctx.lineWidth = cfg.lineWidth;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.rotation);
    drawShape(ctx, s, cfg.lineWidth);
    ctx.restore();
  }
}
