/**
 * 頁面的底：背景（單色、漸層、圖片＋飽和度＋模糊＋變暗）與紙張紋理，畫成一張頁面大小的畫布（依輸出倍率），
 * 預覽與匯出的每一頁共用（設定沒變就不重畫）。
 */
import { canvasGradient } from '@/core/gradient';
import { applyFilterOps, drawPlaced, makeCanvas } from '@/core/image';
import { canvasFilterSupported, drawScene } from '@/core/scene';
import { type Background, PAGE_H, PAGE_W } from './model';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 背景的快取鍵（影響畫面的設定＋倍率＋圖片有沒有讀到） */
export function backgroundKey(bg: Background, scale: number, hasImage: boolean): string {
  const base = `${scale}|${bg.kind}`;
  if (bg.kind === 'solid') return `${base}|${bg.color}`;
  if (bg.kind === 'gradient') return `${base}|${bg.from}|${bg.to}|${bg.angle}`;
  return `${base}|${bg.color}|${bg.image?.id ?? ''}|${hasImage}|${JSON.stringify(bg.place)}|${bg.blur}|${bg.saturation}|${bg.dim}`;
}

/** 圖片蓋滿整頁（依位置）、調飽和度 */
function photoLayer(
  img: CanvasImageSource,
  size: { width: number; height: number },
  bg: Background,
  scale: number,
) {
  const w = Math.round(PAGE_W * scale);
  const h = Math.round(PAGE_H * scale);
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d') as Ctx;
  const sat = bg.saturation / 100;
  const filter = Math.abs(sat - 1) > 1e-6 && canvasFilterSupported();
  if (filter) ctx.filter = `saturate(${bg.saturation}%)`;
  drawPlaced(ctx, img, size, { x: 0, y: 0, width: w, height: h }, bg.place);
  if (filter) ctx.filter = 'none';
  else if (Math.abs(sat - 1) > 1e-6) {
    const data = ctx.getImageData(0, 0, w, h);
    data.data.set(applyFilterOps(data.data, w, h, [{ op: 'saturate', amount: sat }]));
    ctx.putImageData(data, 0, 0);
  }
  return c;
}

/**
 * 畫背景（頁面座標 1200 × 1600 × scale）。圖片背景：先鋪背景顏色（圖片還沒讀到時就是它），
 * 圖片依位置蓋滿、調飽和度、模糊（四周用最外圈的像素延伸，不會淡出）、最後蓋一層黑色（變暗）。
 */
export function buildBackground(
  bg: Background,
  image: { source: CanvasImageSource; width: number; height: number } | null,
  scale: number,
): AnyCanvas {
  const c = makeCanvas(Math.round(PAGE_W * scale), Math.round(PAGE_H * scale));
  const ctx = c.getContext('2d') as Ctx;
  ctx.scale(scale, scale);
  if (bg.kind === 'gradient') {
    ctx.fillStyle = canvasGradient(
      ctx,
      {
        kind: 'linear',
        angle: bg.angle,
        stops: [
          { offset: 0, color: bg.from },
          { offset: 1, color: bg.to },
        ],
      },
      0,
      0,
      PAGE_W,
      PAGE_H,
    );
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
    return c;
  }
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  if (bg.kind !== 'image' || !image) return c;
  const layer = photoLayer(image.source, image, bg, scale);
  drawScene(ctx, [
    {
      kind: 'image',
      x: 0,
      y: 0,
      w: PAGE_W,
      h: PAGE_H,
      image: layer,
      fit: 'fill',
      blur: bg.blur > 0 ? bg.blur : undefined,
      blurEdge: 'clamp',
    },
  ]);
  if (bg.dim > 0) {
    ctx.fillStyle = `rgba(0, 0, 0, ${bg.dim / 100})`;
    ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  }
  return c;
}

/* ---------- 紙張紋理（本站自己畫的：細小的深淺顆粒與少許纖維） ---------- */

let tile: AnyCanvas | null = null;

/** 固定亂數（每次畫出來都一樣） */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 紋理的一格（256 × 256，可以無縫鋪滿） */
export function textureTile(): AnyCanvas {
  if (tile) return tile;
  const size = 256;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d') as Ctx;
  const r = rng(20261015);
  const dot = (x: number, y: number, rad: number, color: string) => {
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(x + dx, y + dy, rad, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
  };
  for (let i = 0; i < 1100; i++) {
    const dark = r() < 0.62;
    const a = dark ? 0.05 + r() * 0.1 : 0.12 + r() * 0.2;
    dot(
      r() * size,
      r() * size,
      0.35 + r() * 0.7,
      dark ? `rgba(58, 52, 40, ${a})` : `rgba(255, 255, 255, ${a})`,
    );
  }
  ctx.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const x = r() * size;
    const y = r() * size;
    const len = 6 + r() * 16;
    const ang = r() * Math.PI;
    ctx.strokeStyle = `rgba(70, 62, 48, ${0.04 + r() * 0.05})`;
    ctx.lineWidth = 0.6;
    for (const dx of [-size, 0, size])
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.moveTo(x + dx, y + dy);
        ctx.quadraticCurveTo(
          x + dx + Math.cos(ang) * len * 0.5 + (r() - 0.5) * 3,
          y + dy + Math.sin(ang) * len * 0.5 + (r() - 0.5) * 3,
          x + dx + Math.cos(ang) * len,
          y + dy + Math.sin(ang) * len,
        );
        ctx.stroke();
      }
  }
  tile = c;
  return c;
}

/** 紋理的不透明度 */
export const TEXTURE_ALPHA = 0.55;

/** 整頁鋪上紋理（頁面座標） */
export function drawTexture(ctx: Ctx): void {
  const pattern = ctx.createPattern(textureTile() as CanvasImageSource, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = TEXTURE_ALPHA;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  ctx.restore();
}
