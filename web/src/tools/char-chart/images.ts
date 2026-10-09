/**
 * 角色圖片的載入與讀回：解碼確認 → 太大時縮小（長邊 1024）→ 放進資產庫（IndexedDB）。
 * 畫圖時用 useImageBitmaps 取得目前用到的圖（重新整理後從資產庫讀回；讀不到的列在 missing）。
 */
import { useEffect, useMemo, useState } from 'react';
import { canvasToBlob, detectImageType, loadImage, resizeImage } from '@/core/image';
import { IMAGE_MAX_SIDE, type ImageRef } from './model';
import { assets } from './store';

export class ImageLoadError extends Error {
  constructor(readonly fileName: string) {
    super(fileName);
  }
}

export interface LoadedImage {
  ref: ImageRef;
  /** 有存進 IndexedDB（false：這次可以用，重新整理後就沒了） */
  persisted: boolean;
}

/** 讀一張圖（解碼失敗丟 ImageLoadError）；Blob 時用 name 當檔名 */
export async function loadCharacterImage(
  file: Blob,
  name = file instanceof File ? file.name : '',
): Promise<LoadedImage> {
  let bmp: ImageBitmap;
  try {
    bmp = await loadImage(file);
  } catch {
    throw new ImageLoadError(name);
  }
  let blob: Blob = file;
  let width = bmp.width;
  let height = bmp.height;
  try {
    if (width < 1 || height < 1) throw new ImageLoadError(name);
    const long = Math.max(width, height);
    if (long > IMAGE_MAX_SIDE) {
      const s = IMAGE_MAX_SIDE / long;
      width = Math.max(1, Math.round(width * s));
      height = Math.max(1, Math.round(height * s));
      const canvas = resizeImage(bmp, width, height, { quality: 'smooth' });
      blob =
        file.type === 'image/jpeg'
          ? await canvasToBlob(canvas, 'image/jpeg', 0.92)
          : await canvasToBlob(canvas, 'image/png');
    }
  } finally {
    bmp.close?.();
  }
  const added = await assets.add(blob);
  const check = await assets.bitmap(added.id).catch(() => undefined);
  if (!check) {
    await assets.remove(added.id).catch(() => undefined);
    throw new ImageLoadError(name);
  }
  return {
    ref: { id: added.id, name, width: check.width, height: check.height },
    persisted: added.persisted,
  };
}

const IMAGE_EXT = /\.(png|apng|jpe?g|jfif|webp|gif|avif|bmp|svg)$/i;

/**
 * 分出圖片與不是圖片的檔案：類型是 image/*、或副檔名是圖片的算圖片；其他（例如沒有副檔名、類型空白）看檔頭
 * （PNG、JPEG、GIF、WebP、AVIF、BMP）。是不是真的讀得了，之後解碼時才知道。
 */
export async function splitImageFiles(
  files: readonly File[],
): Promise<{ images: File[]; others: File[] }> {
  const images: File[] = [];
  const others: File[] = [];
  for (const f of files) {
    if (f.type.startsWith('image/') || IMAGE_EXT.test(f.name)) {
      images.push(f);
      continue;
    }
    let head: Uint8Array | null = null;
    try {
      head = new Uint8Array(await f.slice(0, 64).arrayBuffer());
    } catch {
      head = null;
    }
    if (head && detectImageType(head)) images.push(f);
    else others.push(f);
  }
  return { images, others };
}

/** 一次讀好幾張；讀不了的列在 failed（不中斷其他張） */
export async function loadCharacterImages(
  files: readonly File[],
): Promise<{ loaded: (LoadedImage & { file: File })[]; failed: string[] }> {
  const loaded: (LoadedImage & { file: File })[] = [];
  const failed: string[] = [];
  for (const file of files) {
    try {
      loaded.push({ ...(await loadCharacterImage(file)), file });
    } catch {
      failed.push(file.name);
    }
  }
  return { loaded, failed };
}

/** 目前用到的圖片的解碼結果（同一個 id 只解碼一次）；讀不到的 id 列在 missing */
export function useImageBitmaps(ids: readonly string[]): {
  bitmaps: Map<string, ImageBitmap>;
  missing: string[];
  pending: number;
} {
  const key = [...new Set(ids)].sort().join(',');
  const [tick, setTick] = useState(0);
  const [missing, setMissing] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    const list = key ? key.split(',') : [];
    for (const id of list) {
      if (assets.peekBitmap(id)) continue;
      assets
        .bitmap(id)
        .then((b) => {
          if (!alive) return;
          if (!b) setMissing((m) => new Set(m).add(id));
          setTick((t) => t + 1);
        })
        .catch(() => {
          if (!alive) return;
          setMissing((m) => new Set(m).add(id));
          setTick((t) => t + 1);
        });
    }
    return () => {
      alive = false;
    };
  }, [key]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 在圖片讀好時讓結果重算
  return useMemo(() => {
    const list = key ? key.split(',') : [];
    const bitmaps = new Map<string, ImageBitmap>();
    let pending = 0;
    for (const id of list) {
      const b = assets.peekBitmap(id);
      if (b) bitmaps.set(id, b);
      else if (!missing.has(id)) pending++;
    }
    return { bitmaps, missing: list.filter((id) => missing.has(id) && !bitmaps.has(id)), pending };
  }, [key, tick, missing]);
}

/** 匯出用：等所有用到的圖讀好（讀不到的就不畫） */
export async function loadBitmaps(ids: readonly string[]): Promise<Map<string, ImageBitmap>> {
  const out = new Map<string, ImageBitmap>();
  for (const id of new Set(ids)) {
    const b = await assets.bitmap(id).catch(() => undefined);
    if (b) out.set(id, b);
  }
  return out;
}
