/**
 * 圖片：附圖的濾鏡（規格 3.5）、背景圖層（填滿／完整顯示／並排、模糊、色調、不透明度；3.6）。
 * 濾鏡在預覽與匯出都套用（原作的存圖不含 CSS 濾鏡，D 項）。結果依（圖、設定、輸出像素）快取。
 */
import { applyFilterOps, type FilterOp, makeCanvas } from '@/core/image';
import { blurCanvas } from '@/core/scene';
import type { BgLayer, ImageFilterId } from '../model';
import type { AnyCanvas, Ctx } from './canvas';

export type ImageCache = Map<string, AnyCanvas>;

/** 快取最多留幾張（預覽改設定時舊的會被擠掉） */
const CACHE_MAX = 12;

function remember(cache: ImageCache | undefined, key: string, c: AnyCanvas): AnyCanvas {
  if (!cache) return c;
  cache.set(key, c);
  while (cache.size > CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first === undefined) break;
    cache.delete(first);
  }
  return c;
}

const ctx2d = (c: AnyCanvas): Ctx => {
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

/** CSS 的 hue-rotate 換成 3 × 4 的色彩矩陣（Filter Effects 規格的係數） */
export function hueRotateMatrix(deg: number): number[] {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [
    0.213 + c * 0.787 - s * 0.213,
    0.715 - c * 0.715 - s * 0.715,
    0.072 - c * 0.072 + s * 0.928,
    0,
    0.213 - c * 0.213 + s * 0.143,
    0.715 + c * 0.285 + s * 0.14,
    0.072 - c * 0.072 - s * 0.283,
    0,
    0.213 - c * 0.213 - s * 0.787,
    0.715 - c * 0.715 + s * 0.715,
    0.072 + c * 0.928 + s * 0.072,
    0,
  ];
}

/** 附圖濾鏡的調色步驟（模糊另外做）：黑白、懷舊（八成）、鮮明（亮度、對比各 1.2）、反相 */
export function filterOps(id: ImageFilterId): FilterOp[] {
  switch (id) {
    case 'gray':
      return [{ op: 'gray', amount: 1 }];
    case 'sepia':
      return [{ op: 'sepia', amount: 0.8 }];
    case 'vivid':
      return [
        { op: 'brightness', amount: 1.2 },
        { op: 'contrast', amount: 1.2 },
      ];
    case 'invert':
      return [{ op: 'matrix', m: [-1, 0, 0, 255, 0, -1, 0, 255, 0, 0, -1, 255] }];
    default:
      return [];
  }
}

/** 模糊濾鏡的半徑（畫面 px） */
export const IMAGE_BLUR_PX = 2;

/**
 * 附圖畫成 w × h（畫面 px）× scale 的畫布，套上濾鏡。沒有濾鏡時直接回傳 null（呼叫端直接畫原圖）。
 */
export function filteredImage(
  image: CanvasImageSource,
  key: string,
  filter: ImageFilterId,
  w: number,
  h: number,
  scale: number,
  cache?: ImageCache,
): AnyCanvas | null {
  if (filter === 'none') return null;
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round(h * scale));
  const k = `img|${key}|${filter}|${pw}x${ph}`;
  const hit = cache?.get(k);
  if (hit) return hit;
  const c = makeCanvas(pw, ph);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, pw, ph);
  if (filter === 'blur') blurCanvas(c, IMAGE_BLUR_PX * scale);
  else {
    const ops = filterOps(filter);
    const data = ctx.getImageData(0, 0, pw, ph);
    data.data.set(applyFilterOps(data.data, pw, ph, ops));
    ctx.putImageData(data, 0, 0);
  }
  return remember(cache, k, c);
}

/**
 * 背景圖層：畫面大小（× scale）的畫布，依擺法畫上背景圖，再模糊、轉色調（不透明度由呼叫端畫上去時套用）。
 */
export function backgroundLayer(
  image: CanvasImageSource & { width: number; height: number },
  key: string,
  bg: BgLayer,
  w: number,
  h: number,
  scale: number,
  cache?: ImageCache,
): AnyCanvas {
  const pw = Math.max(1, Math.round(w * scale));
  const ph = Math.max(1, Math.round(h * scale));
  const k = `bg|${key}|${bg.fit}|${bg.blur}|${bg.hue}|${pw}x${ph}`;
  const hit = cache?.get(k);
  if (hit) return hit;
  const c = makeCanvas(pw, ph);
  const ctx = ctx2d(c);
  ctx.imageSmoothingQuality = 'high';
  const iw = image.width;
  const ih = image.height;
  if (bg.fit === 'repeat') {
    /* 並排：原尺寸（畫面 px）從左上角開始 */
    const tw = iw * scale;
    const th = ih * scale;
    for (let y = 0; y < ph; y += th)
      for (let x = 0; x < pw; x += tw) ctx.drawImage(image, x, y, tw, th);
  } else {
    const k2 = bg.fit === 'cover' ? Math.max(pw / iw, ph / ih) : Math.min(pw / iw, ph / ih);
    const dw = iw * k2;
    const dh = ih * k2;
    ctx.drawImage(image, (pw - dw) / 2, (ph - dh) / 2, dw, dh);
  }
  if (bg.blur > 0) blurCanvas(c, bg.blur * scale);
  if (bg.hue % 360 !== 0) {
    const data = ctx.getImageData(0, 0, pw, ph);
    data.data.set(
      applyFilterOps(data.data, pw, ph, [{ op: 'matrix', m: hueRotateMatrix(bg.hue) }]),
    );
    ctx.putImageData(data, 0, 0);
  }
  return remember(cache, k, c);
}
