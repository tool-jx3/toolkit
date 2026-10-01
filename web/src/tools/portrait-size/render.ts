/**
 * 立繪尺寸統一器的畫布處理（瀏覽器內）：解碼、找透明邊界、畫到輸出畫布。
 *
 * 像素不經過 JS 逐一搬移：輸出用 drawImage 把原圖的內容範圍以 1:1、整數位移畫到「輸出寬 × 內容高」的透明畫布
 * （結果與 logic.ts 的 composePixels 相同：像素原值不變、完全透明的像素是 (0, 0, 0, 0)）。
 * 透明邊界只在開啟「去除透明留白」時讀像素，而且只讀四周到碰到內容為止（core/image 的 imageOpaqueBounds）。
 */
import { imageOpaqueBounds, loadImage, type Rect } from '@/core/image';
import type { Placement } from './logic';
import { S } from './strings';

/** 先解碼的張數：依 CPU 核心數，留一個核心給主執行緒（1～3 張） */
function defaultAhead(): number {
  const cores = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency || 2;
  return Math.max(1, Math.min(3, cores - 1));
}

/**
 * 依清單順序取用解碼結果，同時先解碼後面幾張：瀏覽器在背景執行緒解碼，大圖可以平行，
 * 主執行緒處理目前這張時，後面的已經在解碼。
 * 解碼失敗在 get() 時才丟出；dispose() 釋放還沒取走的圖。
 */
export class DecodeQueue {
  private readonly started: (Promise<ImageBitmap> | undefined)[] = [];
  private readonly taken = new Set<number>();

  constructor(
    private readonly files: readonly Blob[],
    /** 目前這張之外，最多先解碼幾張 */
    private readonly ahead = defaultAhead(),
  ) {}

  private start(i: number) {
    if (i >= this.files.length || this.started[i]) return;
    const p = loadImage(this.files[i]);
    /* 先接住失敗：沒輪到就放棄的圖不算未處理的錯誤；輪到時 get() 照樣丟出 */
    p.catch(() => {});
    this.started[i] = p;
  }

  get(i: number): Promise<ImageBitmap> {
    for (let k = i; k <= i + this.ahead; k++) this.start(k);
    this.taken.add(i);
    const p = this.started[i];
    return p ?? Promise.reject(new RangeError(`沒有第 ${i + 1} 張`));
  }

  /** 放棄處理：還沒取走的圖解碼完就釋放 */
  dispose() {
    this.started.forEach((p, i) => {
      if (p && !this.taken.has(i))
        p.then(
          (b) => b.close(),
          () => {},
        );
    });
  }
}

/**
 * 去除透明留白（3.1）：透明度大於 0 的像素的最小外接矩形，整張透明時不裁（結果同 logic.ts 的 contentRect）。
 * 只從四周往內讀到碰到內容為止；關閉時不讀像素，直接是整張。
 */
export function trimmedRect(bitmap: ImageBitmap, trim: boolean): Rect {
  const full = { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  if (!trim) return full;
  return imageOpaqueBounds(bitmap, 0) ?? full;
}

/** 依配置畫出輸出（3.2）：透明畫布上，內容放在 (offsetX, 0)，不縮放 */
export function renderPlacement(src: CanvasImageSource, p: Placement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(S.canvasError);
  /* 1:1、整數位移：每個像素原封不動 */
  ctx.imageSmoothingEnabled = false;
  const { x, y, width, height } = p.crop;
  ctx.drawImage(src, x, y, width, height, p.offsetX, 0, width, height);
  return canvas;
}
