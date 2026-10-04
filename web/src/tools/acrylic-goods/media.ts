/**
 * 圖片：使用者的圖存在資產庫（IndexedDB，core/assets），設定裡只記 id；內建示範圖（`demo:`）執行時畫出來。
 * 解碼後的圖放在記憶體快取：貼圖用的畫布（長邊最多 2048 px）、算外框用的透明度圖（長邊最多 500 px）、
 * 外框（依留白分別快取）。
 */
import { create } from 'zustand';
import { createAssetStore } from '@/core/assets';
import { loadImage } from '@/core/image';
import { type AlphaMap, type ContourShape, contourScale, contourShape } from './contour';
import { demoSvg, isDemoImage } from './demo';
import { TOOL_ID } from './model';

export const assets = createAssetStore(TOOL_ID);

/** 貼圖的長邊上限（px）；3D 的大小仍以原圖的 px 計 */
export const TEXTURE_MAX_DIM = 2048;

export interface ImageInfo {
  id: string;
  /** 原圖寬高 */
  width: number;
  height: number;
  /** 貼圖（也是清單的縮圖） */
  canvas: HTMLCanvasElement;
  alpha: AlphaMap;
}

type Entry = ImageInfo | 'loading' | 'error';

/** 解碼好的圖片（id → 圖；讀不到是 'error'）；改變時預覽重建 */
export const useImages = create<{ images: Record<string, Entry> }>(() => ({ images: {} }));

const pending = new Map<string, Promise<ImageInfo>>();

function toCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const k = Math.min(1, TEXTURE_MAX_DIM / Math.max(bitmap.width, bitmap.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bitmap.width * k));
  c.height = Math.max(1, Math.round(bitmap.height * k));
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

function alphaMapOf(bitmap: ImageBitmap): AlphaMap {
  const { width, height } = contourScale(bitmap.width, bitmap.height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('無法建立畫布');
  ctx.drawImage(bitmap, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const alpha = new Uint8Array(width * height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  return { width, height, alpha, sourceWidth: bitmap.width, sourceHeight: bitmap.height };
}

async function decode(id: string): Promise<ImageBitmap> {
  if (isDemoImage(id)) {
    const src = demoSvg(id);
    if (!src) throw new Error('missing');
    return loadImage(new Blob([src], { type: 'image/svg+xml' }));
  }
  const bmp = await assets.bitmap(id);
  if (!bmp) throw new Error('missing');
  return bmp;
}

/** 讀一張圖（快取；同一個 id 只解碼一次）；讀不到時丟錯 */
export function loadImageInfo(id: string): Promise<ImageInfo> {
  const hit = useImages.getState().images[id];
  if (hit && hit !== 'loading' && hit !== 'error') return Promise.resolve(hit);
  let p = pending.get(id);
  if (!p) {
    useImages.setState((s) => ({ images: { ...s.images, [id]: 'loading' } }));
    p = decode(id).then(
      (bmp) => {
        const info: ImageInfo = {
          id,
          width: bmp.width,
          height: bmp.height,
          canvas: toCanvas(bmp),
          alpha: alphaMapOf(bmp),
        };
        useImages.setState((s) => ({ images: { ...s.images, [id]: info } }));
        return info;
      },
      (e) => {
        pending.delete(id);
        useImages.setState((s) => ({ images: { ...s.images, [id]: 'error' } }));
        throw e;
      },
    );
    pending.set(id, p);
  }
  return p;
}

/** 已經解碼好的圖（同步；還沒好或讀不到時 null） */
export function peekImage(id: string | null | undefined): ImageInfo | null {
  if (!id) return null;
  const e = useImages.getState().images[id];
  return e && e !== 'loading' && e !== 'error' ? e : null;
}

/** 這些圖都讀好了嗎（讀不到的也算「好了」，由呼叫端當成沒有圖） */
export function imagesSettled(ids: readonly (string | null | undefined)[]): boolean {
  const images = useImages.getState().images;
  return ids.every((id) => !id || (images[id] && images[id] !== 'loading'));
}

const contours = new Map<string, ContourShape | null>();

/** 外框（依留白快取） */
export function contourOf(info: ImageInfo, expandPx: number): ContourShape | null {
  const key = `${info.id}|${expandPx}`;
  if (contours.has(key)) return contours.get(key) ?? null;
  const c = contourShape(info.alpha, expandPx);
  contours.set(key, c);
  if (contours.size > 400) contours.delete(contours.keys().next().value as string);
  return c;
}

/** 加入一個檔案：先試著解碼（不是圖片就丟錯），再存進資產庫 */
export async function addImageFile(file: Blob) {
  const bmp = await loadImage(file);
  const r = await assets.add(file);
  if (!useImages.getState().images[r.id] || useImages.getState().images[r.id] === 'error') {
    const info: ImageInfo = {
      id: r.id,
      width: bmp.width,
      height: bmp.height,
      canvas: toCanvas(bmp),
      alpha: alphaMapOf(bmp),
    };
    pending.set(r.id, Promise.resolve(info));
    useImages.setState((s) => ({ images: { ...s.images, [r.id]: info } }));
  }
  bmp.close?.();
  return r;
}

/** 這次開頁之後加入的圖（清理時一律保留，避免和進行中的加入互相干擾） */
export const sessionAssets = new Set<string>();
export const markSessionAsset = (id: string): void => {
  sessionAssets.add(id);
};

/** 開啟專案檔後：讀不到的舊結果作廢 */
export function forgetImage(id: string): void {
  pending.delete(id);
  useImages.setState((s) => {
    const images = { ...s.images };
    delete images[id];
    return { images };
  });
}
