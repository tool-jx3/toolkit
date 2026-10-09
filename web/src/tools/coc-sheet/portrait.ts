/**
 * 頭像：資產庫的原圖依裁切範圍畫成頭像框比例的圖（最寬 640 px），給預覽、列印、PNG 用的物件網址。
 */
import { useEffect, useState } from 'react';
import { useAssetBitmap } from '@/core/assets';
import { canvasToBlob, type Rect } from '@/core/image';
import { PORTRAIT_ASPECT, type Portrait } from './model';
import { assets } from './store';

/** 頭像圖的最大寬度（px；A4 上約 36 mm 寬，約 450 dpi） */
export const PORTRAIT_MAX_WIDTH = 640;

/** 裁切後的輸出尺寸（寬 ≤ 640，比例固定 13：16） */
export function portraitSize(crop: Rect): { width: number; height: number } {
  const width = Math.max(1, Math.min(PORTRAIT_MAX_WIDTH, Math.round(crop.width)));
  return { width, height: Math.max(1, Math.round(width / PORTRAIT_ASPECT)) };
}

/** 裁好的頭像（物件網址；沒有頭像、圖片讀不到時 null） */
export function usePortraitUrl(portrait: Portrait | null): string | null {
  const bitmap = useAssetBitmap(assets, portrait?.assetId ?? null);
  const [url, setUrl] = useState<string | null>(null);
  const crop = portrait?.crop;
  const key = crop ? `${crop.x},${crop.y},${crop.width},${crop.height}` : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: 裁切範圍以 key 比較
  useEffect(() => {
    if (!bitmap || !crop) {
      setUrl(null);
      return;
    }
    let alive = true;
    let made: string | null = null;
    const { width, height } = portraitSize(crop);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
    canvasToBlob(canvas, 'image/png')
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [bitmap, key]);
  return url;
}
