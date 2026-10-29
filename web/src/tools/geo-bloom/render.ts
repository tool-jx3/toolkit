/**
 * 繪製（規格 3.3、3.4）：背景 → 依產生的順序畫圖形、線、點（原作 2026-10 一邊產生一邊畫，後畫的蓋在上面）。
 * canvas 2D 的指令順序與參數照原作，所以同一個瀏覽器裡和原作逐像素相同（例如塗滿的 90% 不透明度、同心圓最內層先塗再描、
 * 雙正方形先轉圖形的角度再轉 45°、摩斯環的線寬與線頭、三角形的頂點角度）。
 * 主執行緒的 canvas 與 Worker 的 OffscreenCanvas 都用這支。
 */
import type { BloomDot, BloomLine, BloomScene, BloomShape } from './generate';
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

/** 同心圓、圓＋半圓（含摩斯環、三角形、摩斯橋、中心） */
function drawRings(ctx: Ctx, s: BloomShape, cfg: BloomConfig) {
  const lw = cfg.lineWidth;
  const rings = s.rings ?? [];
  /* 塗滿：最內層（弧時連成扇形的弦）先以 90% 塗 */
  if (s.fill && rings.length) {
    const g = rings[rings.length - 1];
    ctx.beginPath();
    ctx.arc(0, 0, g.r, g.a0, g.a0 + g.span);
    if (g.span < TAU - 1e-6) ctx.closePath();
    ctx.globalAlpha = 0.9;
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  for (const g of rings) {
    if (g.hidden) continue;
    if (g.segs) {
      ctx.lineWidth = lw * cfg.morseWidth;
      ctx.lineCap = cfg.morseCap ? 'round' : 'butt';
      for (const sg of g.segs) {
        if (sg.dot && cfg.morseRound) {
          const m = (sg.a0 + sg.a1) / 2;
          ctx.beginPath();
          ctx.arc(
            Math.cos(m) * g.r,
            Math.sin(m) * g.r,
            Math.max(lw * cfg.morseWidth * 0.5, ((sg.a1 - sg.a0) * g.r) / 2),
            0,
            Math.PI * 2,
          );
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, g.r, sg.a0, sg.a1);
          ctx.stroke();
        }
      }
      ctx.lineWidth = lw;
      ctx.lineCap = 'round';
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, g.r, g.a0, g.a0 + g.span);
      ctx.stroke();
    }
  }
  const tri = s.tri;
  if (tri) {
    /* 頂點的角度是畫布的角度：扣掉圖形的旋轉 */
    ctx.beginPath();
    for (let e = 0; e < 3; e++) {
      const va = tri.rot + (e * TAU) / 3 - s.rotation;
      const px = Math.cos(va) * tri.R;
      const py = Math.sin(va) * tri.R;
      if (e) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.closePath();
    if (tri.fill) {
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.stroke();
  }
  for (const b of s.bridges ?? []) {
    ctx.beginPath();
    ctx.moveTo(Math.cos(b.a) * b.r0, Math.sin(b.a) * b.r0);
    ctx.lineTo(Math.cos(b.a) * b.r1, Math.sin(b.a) * b.r1);
    ctx.stroke();
  }
  if (s.core === 'big') {
    const vis = rings.filter((g) => !g.hidden);
    const rr = Math.max(lw * 3, tri ? (tri.R / 2) * 0.85 : vis[vis.length - 1].r * 0.75);
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, TAU);
    ctx.fill();
  } else if (s.kind === 'rings' && s.core !== 'none') {
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.5, lw * 1.2), 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawShapeBody(ctx: Ctx, s: BloomShape, cfg: BloomConfig) {
  switch (s.kind) {
    case 'circle':
      ctx.beginPath();
      ctx.arc(0, 0, s.r, 0, TAU);
      finish(ctx, s);
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.5, cfg.lineWidth * 1.2), 0, TAU);
      ctx.fill();
      break;
    case 'rings':
    case 'mix':
      drawRings(ctx, s, cfg);
      break;
    case 'semi':
      ctx.beginPath();
      ctx.arc(0, 0, s.r, 0, Math.PI);
      if (s.closed) ctx.closePath();
      finish(ctx, s);
      break;
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

function drawShape(ctx: Ctx, s: BloomShape, color: string, cfg: BloomConfig) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = cfg.lineWidth;
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rotation);
  drawShapeBody(ctx, s, cfg);
  ctx.restore();
}

function drawLine(ctx: Ctx, l: BloomLine, color: string, cfg: BloomConfig) {
  ctx.strokeStyle = color;
  ctx.lineWidth = cfg.lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(l.x1, l.y1);
  ctx.lineTo(l.x2, l.y2);
  ctx.stroke();
}

function drawDot(ctx: Ctx, d: BloomDot, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(d.x, d.y, d.r, 0, TAU);
  ctx.fill();
}

/**
 * 畫整張花紋。ctx 的畫布大小＝寬 × 高 × scale；scale ≠ 1（預覽縮小）時先設定縮放，座標照原尺寸。
 * 匯出（scale＝1）時的指令和原作完全相同。丟失的線不畫。
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
  let si = 0;
  let li = 0;
  let di = 0;
  for (const k of scene.order) {
    if (k === 's') {
      const s = scene.shapes[si++];
      drawShape(ctx, s, color(s.accent), cfg);
    } else if (k === 'l') {
      const l = scene.lines[li++];
      if (!l.dropped) drawLine(ctx, l, color(l.accent), cfg);
    } else {
      const d = scene.dots[di++];
      drawDot(ctx, d, color(d.accent));
    }
  }
}
