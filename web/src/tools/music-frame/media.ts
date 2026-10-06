/**
 * 封面的處理（規格 3.3）：取中央的正方形、縮放到 800～1600 px；做模糊背景（三段縮小再模糊）；縮成 56 × 56 抽色。
 * 示範封面：每格重畫，模糊背景與配色用第 0 格。需要瀏覽器的畫布。
 */
import { DEMO_SIZE, DEMO_VIBRANT, drawDemoCover } from './demo';
import type { CoverArt } from './render';
import { extractPalette, PALETTE_SAMPLE } from './theme';

const canvasOf = (w: number, h: number) => {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
};

/** 封面的邊長：短邊夾在 800～1600 */
export const coverSize = (w: number, h: number) => Math.min(1600, Math.max(800, Math.min(w, h)));

/** 取中央的正方形並縮放 */
export function squareCover(
  src: CanvasImageSource & { width: number; height: number },
): HTMLCanvasElement {
  const sw = src.width;
  const sh = src.height;
  const s = Math.min(sw, sh);
  const size = coverSize(sw, sh);
  const c = canvasOf(size, size);
  const g = c.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, (sw - s) / 2, (sh - s) / 2, s, s, 0, 0, size, size);
  return c;
}

/** 模糊背景：18 → 72 → 288 px 依序縮放，再以 22 px 的模糊放大畫到 1100 px（四周多畫 70 px） */
export function blurBackground(src: CanvasImageSource): HTMLCanvasElement {
  let cur: CanvasImageSource = src;
  for (const s of [18, 72, 288]) {
    const c = canvasOf(s, s);
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.drawImage(cur, 0, 0, s, s);
    cur = c;
  }
  const out = canvasOf(1100, 1100);
  const g = out.getContext('2d')!;
  g.imageSmoothingQuality = 'high';
  if ('filter' in g) g.filter = 'blur(22px)';
  g.drawImage(cur, -70, -70, 1240, 1240);
  return out;
}

/** 縮成 56 × 56 後抽色 */
export function paletteOf(src: CanvasImageSource) {
  const c = canvasOf(PALETTE_SAMPLE, PALETTE_SAMPLE);
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(src, 0, 0, PALETTE_SAMPLE, PALETTE_SAMPLE);
  return extractPalette(g.getImageData(0, 0, PALETTE_SAMPLE, PALETTE_SAMPLE).data);
}

/** 放進來的封面 */
export function coverFromImage(
  src: CanvasImageSource & { width: number; height: number },
): CoverArt {
  const image = squareCover(src);
  return { image, blur: blurBackground(image), palette: paletteOf(image), demo: false };
}

/** 示範封面（畫布由呼叫端每格重畫：drawDemoCover(demoContext(art), ph)） */
export function demoCover(): CoverArt {
  const c = canvasOf(DEMO_SIZE, DEMO_SIZE);
  drawDemoCover(c.getContext('2d')!, 0);
  const palette = paletteOf(c);
  palette.vibrant = { ...DEMO_VIBRANT };
  palette.mono = false;
  return { image: c, blur: blurBackground(c), palette, demo: true };
}

/** 示範封面的畫布 */
export const demoContext = (art: CoverArt) =>
  (art.image as HTMLCanvasElement).getContext('2d') as CanvasRenderingContext2D;
