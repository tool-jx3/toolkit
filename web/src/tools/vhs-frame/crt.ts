/**
 * 映像管的螢光粉遮罩與光暈（規格 3.13、F77～F80）。用一般的原理自己寫，**不是** crt-royale、crt-hyllian 等著色器的移植
 * （那些大多是 GPL，本站沒有讀它們的程式）：
 * - 遮罩：紅綠藍三色的小圖樣以「相乘」鋪滿整張，沒亮的顏色暗「強度」那麼多——光柵（直條，像 Trinitron）、
 *   槽孔（直條分成一格一格，隔一組錯開半格）、點狀（蔭罩：每一小段列錯開半組，看起來是交錯的點）。
 *   一組的寬依輸出的大小（1280 寬的 px × k），至少 3 px（再小就分不出三色）。
 * - 亮度補償：遮罩的平均亮度是 a 時，整張再以「相加」疊回 1 ÷ a − 1 次（亮部飽和成白，暗部維持暗），
 *   所以平均亮度和沒有遮罩時差不多。
 * - 光暈：整張縮小（取平均）→ 自己乘自己（只留亮的地方）→ 放大兩倍（再糊一次），以「濾色」疊回去；範圍＝縮小的倍數。
 */
import type { Crt, MaskKind } from './look';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** 中間畫布的來源（VhsRenderer 的畫布池） */
export interface CanvasPool {
  canvas(key: string, w: number, h: number): AnyCanvas;
  snapshot(key: string, src: AnyCanvas): AnyCanvas;
}

const ctx2d = (c: AnyCanvas): Ctx => {
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

/** 遮罩一組的寬（輸出 px）：maskSize × k，至少 3 */
export const maskPitch = (maskSize: number, k: number): number =>
  Math.max(3, Math.round(maskSize * k));

/** 一組遮罩的圖樣：寬 w、高 h，每個像素是紅綠藍三個 0～1 的「亮多少」 */
export interface MaskTile {
  w: number;
  h: number;
  rgb: Float32Array;
}

/**
 * 遮罩的圖樣（p＝一組的寬，s＝強度 0～1）：每一欄屬於紅、綠或藍（各佔三分之一）；亮的那色 1、其他 1 − s。
 * 槽孔：兩組一個圖樣，每組每 c（約 1.5p）列有一列全暗的縫，第二組的縫錯開半格。點狀：每 r（約 p ÷ 3）列錯開半組。
 */
export function maskTile(kind: Exclude<MaskKind, 'none'>, p: number, s: number): MaskTile {
  const dim = 1 - s;
  const third = (x: number) => (x < Math.round(p / 3) ? 0 : x < Math.round((2 * p) / 3) ? 1 : 2);
  const slotH = Math.max(3, Math.round(p * 1.5));
  const dotH = Math.max(1, Math.round(p / 3));
  const shape = {
    aperture: { w: p, h: 1 },
    slot: { w: p * 2, h: slotH * 2 },
    shadow: { w: p, h: dotH * 2 },
  }[kind];
  const rgb = new Float32Array(shape.w * shape.h * 3);
  for (let y = 0; y < shape.h; y++)
    for (let x = 0; x < shape.w; x++) {
      let lit = third(x % p);
      if (kind === 'shadow' && y >= dotH) lit = third((x + Math.round(p / 2)) % p);
      const second = kind === 'slot' && x >= p;
      const gap =
        kind === 'slot' && (y + (second ? Math.floor(slotH / 2) : 0)) % slotH === slotH - 1;
      const o = (y * shape.w + x) * 3;
      for (let c = 0; c < 3; c++) rgb[o + c] = !gap && c === lit ? 1 : dim;
    }
  return { ...shape, rgb };
}

/** 遮罩的平均亮度（三色平均） */
export function maskMean(t: MaskTile): number {
  let sum = 0;
  for (const v of t.rgb) sum += v;
  return sum / t.rgb.length;
}

/** 亮度補償要疊回幾次（1 ÷ 平均 − 1，最多 4） */
export const boostOf = (t: MaskTile): number => Math.min(4, 1 / Math.max(0.05, maskMean(t)) - 1);

/** 圖樣畫成畫布（不透明） */
function tileCanvas(pool: CanvasPool, kind: Exclude<MaskKind, 'none'>, p: number, s: number) {
  const t = maskTile(kind, p, s);
  const key = `mask-${kind}-${Math.round(s * 1000)}-`;
  const c = pool.canvas(key, t.w, t.h);
  const g = ctx2d(c);
  const img = g.createImageData(t.w, t.h);
  for (let i = 0; i < t.w * t.h; i++) {
    img.data[i * 4] = Math.round(t.rgb[i * 3] * 255);
    img.data[i * 4 + 1] = Math.round(t.rgb[i * 3 + 1] * 255);
    img.data[i * 4 + 2] = Math.round(t.rgb[i * 3 + 2] * 255);
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, tile: t };
}

/** 光暈的來源：整張縮小、自己乘自己、放大兩倍（畫遮罩之前先做好；回傳要疊回去的那張） */
export function glowSource(pool: CanvasPool, dst: AnyCanvas, crt: Crt): AnyCanvas {
  const W = dst.width;
  const H = dst.height;
  const down = 4 + (crt.glowSize / 100) * 28;
  const sw = Math.max(2, Math.round(W / down));
  const sh = Math.max(2, Math.round(H / down));
  const small = pool.canvas('glow-s', sw, sh);
  const s = ctx2d(small);
  s.globalCompositeOperation = 'source-over';
  s.imageSmoothingEnabled = true;
  s.imageSmoothingQuality = 'high';
  s.clearRect(0, 0, sw, sh);
  s.drawImage(dst, 0, 0, sw, sh);
  /* 自己乘自己：暗的地方幾乎沒有光暈 */
  const sq = pool.snapshot('glow-q', small);
  s.globalCompositeOperation = 'multiply';
  s.drawImage(sq, 0, 0);
  s.globalCompositeOperation = 'source-over';
  const mid = pool.canvas('glow-m', sw * 2, sh * 2);
  const m = ctx2d(mid);
  m.imageSmoothingEnabled = true;
  m.imageSmoothingQuality = 'high';
  m.clearRect(0, 0, sw * 2, sh * 2);
  m.drawImage(small, 0, 0, sw * 2, sh * 2);
  return mid;
}

/** 螢光粉遮罩（＋亮度補償）畫到 g（W × H，不透明的畫面） */
export function paintMask(pool: CanvasPool, g: Ctx, dst: AnyCanvas, crt: Crt, k: number): void {
  if (crt.mask === 'none') return;
  const W = dst.width;
  const H = dst.height;
  const { canvas, tile } = tileCanvas(
    pool,
    crt.mask,
    maskPitch(crt.maskSize, k),
    crt.maskStrength / 100,
  );
  const pattern = g.createPattern(canvas, 'repeat');
  if (!pattern) return;
  g.save();
  g.globalCompositeOperation = 'multiply';
  g.fillStyle = pattern;
  g.fillRect(0, 0, W, H);
  g.restore();
  if (!crt.maskBoost) return;
  let extra = boostOf(tile);
  if (!(extra > 0.001)) return;
  const copy = pool.snapshot('mask-boost', dst);
  g.save();
  g.globalCompositeOperation = 'lighter';
  while (extra > 0.001) {
    g.globalAlpha = Math.min(1, extra);
    g.drawImage(copy, 0, 0);
    extra -= 1;
  }
  g.restore();
}

/** 光暈疊回去（濾色） */
export function paintGlow(g: Ctx, src: AnyCanvas, W: number, H: number, crt: Crt): void {
  if (!(crt.glow > 0)) return;
  g.save();
  g.globalCompositeOperation = 'screen';
  g.globalAlpha = Math.min(1, (crt.glow / 100) * 0.9);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, W, H);
  g.restore();
}
