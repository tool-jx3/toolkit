/**
 * SF 證件的卡片效果（規格 F90）：霓虹光暈（卡片外形的強調色光，畫在卡片底下）、印刷顆粒（墨色的雜點，畫在裝置像素上）、
 * 掃描線（每 6 原生像素一條 2 高的墨色線）。三種各有開關與強度（5～100%）；都關著時畫法和以前逐指令相同。
 * 做法與數值照 CyberDelaai/sinforge-ui（MIT，`67d459a`）的 js/render.js。
 */
import { makeCanvas } from '@/core/image';
import { seededRandom } from '../colors';
import type { Ctx } from '../kit';

export const FX_AMOUNT_RANGE = { min: 5, max: 100 } as const;

export interface SfCardFx {
  glow: boolean;
  glowAmt: number;
  grain: boolean;
  grainAmt: number;
  scan: boolean;
  scanAmt: number;
}

export const SF_FX_DEFAULT: SfCardFx = {
  glow: false,
  glowAmt: 40,
  grain: false,
  grainAmt: 25,
  scan: false,
  scanAmt: 25,
};

/** 光暈的模糊（裝置像素）：強度 100% 時 60 原生像素 */
export const glowBlur = (amt: number, k: number): number => (amt / 100) * 60 * k;

/** 卡片外形的光暈：外形的影子（強調色）畫兩次加強；path 畫好卡片外形（含洞）的路徑 */
export function paintGlow(
  ctx: Ctx,
  path: () => void,
  o: { amt: number; k: number; accent: string; card: string },
): void {
  ctx.save();
  ctx.shadowColor = o.accent;
  ctx.shadowBlur = glowBlur(o.amt, o.k);
  path();
  ctx.fillStyle = o.card;
  for (let i = 0; i < 2; i++) ctx.fill('evenodd');
  ctx.restore();
}

const GRAIN_TILE = 256;
let grainTile: { ink: string; canvas: HTMLCanvasElement | OffscreenCanvas } | null = null;

/** 顆粒的圖塊（256 × 256，墨色、一半的像素有隨機的不透明度；種子固定，每次一樣） */
export function grainPixels(ink: string): Uint8ClampedArray {
  const n = Number.parseInt(ink.slice(1), 16);
  const cr = (n >> 16) & 255;
  const cg = (n >> 8) & 255;
  const cb = n & 255;
  const d = new Uint8ClampedArray(GRAIN_TILE * GRAIN_TILE * 4);
  const r = seededRandom(1337);
  for (let p = 0; p < d.length; p += 4) {
    d[p] = cr;
    d[p + 1] = cg;
    d[p + 2] = cb;
    d[p + 3] = r() < 0.5 ? Math.floor(r() * 255) : 0;
  }
  return d;
}

function grainCanvas(ink: string) {
  if (grainTile?.ink === ink) return grainTile.canvas;
  const c = makeCanvas(GRAIN_TILE, GRAIN_TILE);
  const x = c.getContext('2d') as Ctx | null;
  if (x) {
    const img = x.createImageData(GRAIN_TILE, GRAIN_TILE);
    img.data.set(grainPixels(ink));
    x.putImageData(img, 0, 0);
  }
  grainTile = { ink, canvas: c };
  return c;
}

/** 顆粒：在裝置像素上鋪滿整張畫布（目前的裁切照樣有效） */
export function paintGrain(ctx: Ctx, amt: number, ink: string): void {
  const pattern = ctx.createPattern(grainCanvas(ink) as CanvasImageSource, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = (amt / 100) * 0.6;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();
}

/** 掃描線（原生像素：每 6 一條、高 2） */
export function paintScanlines(ctx: Ctx, amt: number, ink: string, W: number, H: number): void {
  ctx.save();
  ctx.globalAlpha = (amt / 100) * 0.5;
  ctx.fillStyle = ink;
  for (let y = 0; y < H; y += 6) ctx.fillRect(0, y, W, 2);
  ctx.restore();
}
