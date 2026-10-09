/**
 * 圖片：讀進資產庫（解碼確認 → 長邊超過 1024 時縮小 → 記成這次開頁的圖 → 存 IndexedDB），
 * 以及卡片上的圖片網址（預覽：物件網址；互動 HTML：data URL 或待填的網址）與「去掉透明留白」。
 */
import { useEffect, useMemo, useState } from 'react';
import { readAsDataUrl } from '@/core/files';
import {
  canvasToBlob,
  cropImage,
  dataUriToBlob,
  getImageData,
  loadImage,
  opaqueBounds,
  resizeImage,
} from '@/core/image';
import { type Card, cardImages } from './card';
import { IMAGE_MAX_SIDE, type ImageRef, imageKey } from './model';
import { assets } from './store';
import { S } from './strings';

export class ImageLoadError extends Error {}

export type AssetImage = Extract<ImageRef, { kind: 'asset' }>;

export interface LoadedImage {
  ref: AssetImage;
  /** 有存進 IndexedDB（false：這次可以用，重新整理後就沒了） */
  persisted: boolean;
}

export const isImageFile = (f: File): boolean =>
  f.type.startsWith('image/') || (!f.type && /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i.test(f.name));

/** 讀一張圖進資產庫（解碼失敗丟 ImageLoadError） */
export async function loadScratchImage(file: Blob, name: string): Promise<LoadedImage> {
  let bmp: ImageBitmap;
  try {
    bmp = await loadImage(file);
  } catch {
    throw new ImageLoadError(name);
  }
  let blob: Blob = file;
  try {
    if (bmp.width < 1 || bmp.height < 1) throw new ImageLoadError(name);
    const long = Math.max(bmp.width, bmp.height);
    if (long > IMAGE_MAX_SIDE) {
      const k = IMAGE_MAX_SIDE / long;
      const canvas = resizeImage(
        bmp,
        Math.max(1, Math.round(bmp.width * k)),
        Math.max(1, Math.round(bmp.height * k)),
        { quality: 'smooth' },
      );
      blob =
        file.type === 'image/jpeg'
          ? await canvasToBlob(canvas, 'image/jpeg', 0.92)
          : await canvasToBlob(canvas, 'image/png');
    }
  } finally {
    bmp.close?.();
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const added = await assets.add(new Blob([bytes], { type: blob.type }));
  const check = await assets.bitmap(added.id).catch(() => undefined);
  if (!check) {
    await assets.remove(added.id).catch(() => undefined);
    throw new ImageLoadError(name);
  }
  return {
    ref: { kind: 'asset', id: added.id, name, width: check.width, height: check.height },
    persisted: added.persisted,
  };
}

/** data URL（原作的設定檔）→ 資產庫 */
export async function loadDataUrlImage(dataUrl: string, name: string): Promise<LoadedImage> {
  let blob: Blob;
  try {
    blob = dataUriToBlob(dataUrl);
  } catch {
    throw new ImageLoadError(name);
  }
  return loadScratchImage(blob, name);
}

/** 一次讀好幾個檔：不是圖片、讀不了的分開列出（不中斷其他張） */
export async function loadImageFiles(files: readonly File[]): Promise<{
  loaded: LoadedImage[];
  notImages: string[];
  failed: string[];
}> {
  const loaded: LoadedImage[] = [];
  const notImages: string[] = [];
  const failed: string[] = [];
  for (const f of files) {
    if (!isImageFile(f)) {
      notImages.push(f.name);
      continue;
    }
    try {
      loaded.push(await loadScratchImage(f, f.name));
    } catch {
      failed.push(f.name);
    }
  }
  return { loaded, notImages, failed };
}

/* ---------- 去掉透明留白 ---------- */

const trims = new Map<string, Promise<Blob | null>>();

async function decode(image: ImageRef): Promise<ImageBitmap | null> {
  try {
    if (image.kind === 'asset') return (await assets.bitmap(image.id)) ?? null;
    return await loadImage(image.url);
  } catch {
    return null;
  }
}

/** 裁掉透明（不透明度 ≤ 10）留白後的 PNG；沒有留白、整張透明、讀不到像素（跨網域）時 null */
export function trimmedBlob(image: ImageRef): Promise<Blob | null> {
  const key = imageKey(image);
  let p = trims.get(key);
  if (!p) {
    p = (async () => {
      const bmp = await decode(image);
      if (!bmp) return null;
      try {
        const px = getImageData(bmp);
        const r = opaqueBounds(px, 10);
        if (!r || (r.width === px.width && r.height === px.height)) return null;
        return await canvasToBlob(cropImage(bmp, r), 'image/png');
      } catch {
        return null;
      } finally {
        if (image.kind === 'url') bmp.close?.();
      }
    })();
    trims.set(key, p);
  }
  return p;
}

/* ---------- 預覽用的網址 ---------- */

export const srcKey = (image: ImageRef, trim: boolean): string =>
  `${imageKey(image)}${trim ? '#trim' : ''}`;

const trimUrls = new Map<string, string>();

/** 預覽的圖片網址（上傳的圖：物件網址；讀不到時 null） */
export async function previewSrc(image: ImageRef, trim: boolean): Promise<string | null> {
  if (trim) {
    const key = imageKey(image);
    const hit = trimUrls.get(key);
    if (hit) return hit;
    const b = await trimmedBlob(image);
    if (b) {
      const url = URL.createObjectURL(b);
      trimUrls.set(key, url);
      return url;
    }
  }
  if (image.kind === 'url') return image.url;
  return (await assets.url(image.id).catch(() => undefined)) ?? null;
}

/**
 * 卡片上用到的圖片網址（預覽）：還沒讀好的是空字串。
 * missing：讀不到的上傳圖片數（可能被瀏覽器清掉）；pending：還在讀的張數。
 */
export function usePreviewSources(card: Card): {
  src: (image: ImageRef, trim: boolean) => string;
  pending: number;
  missing: number;
} {
  const needed = useMemo(() => {
    const m = new Map<string, { image: ImageRef; trim: boolean }>();
    for (const it of cardImages(card)) m.set(srcKey(it.image, it.trim), it);
    return m;
  }, [card]);
  const key = [...needed.keys()].sort().join('\n');
  const [resolved, setResolved] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 代表 needed 的內容
  useEffect(() => {
    let alive = true;
    for (const [k, it] of needed) {
      if (resolved.has(k)) continue;
      previewSrc(it.image, it.trim).then(
        (url) => alive && setResolved((m) => new Map(m).set(k, url)),
        () => alive && setResolved((m) => new Map(m).set(k, null)),
      );
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return useMemo(() => {
    let pending = 0;
    let missing = 0;
    for (const k of needed.keys()) {
      if (!resolved.has(k)) pending++;
      else if (resolved.get(k) === null) missing++;
    }
    return {
      src: (image: ImageRef, trim: boolean) => resolved.get(srcKey(image, trim)) ?? '',
      pending,
      missing,
    };
  }, [needed, resolved]);
}

/** 圖片清單的縮圖網址（上傳的圖：物件網址） */
export function useThumbUrls(images: readonly ImageRef[]): ReadonlyMap<string, string> {
  const key = images.map(imageKey).join('\n');
  const [urls, setUrls] = useState<ReadonlyMap<string, string>>(() => new Map());
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 代表 images 的內容
  useEffect(() => {
    let alive = true;
    for (const im of images) {
      const k = imageKey(im);
      if (im.kind === 'url' || urls.has(k)) continue;
      assets
        .url(im.id)
        .then((u) => {
          if (alive && u) setUrls((m) => new Map(m).set(k, u));
        })
        .catch(() => undefined);
    }
    return () => {
      alive = false;
    };
  }, [key]);
  return urls;
}

/* ---------- 互動 HTML 用的網址 ---------- */

/**
 * 互動 HTML 的圖片網址：網址加入的圖照樣用網址；上傳的圖（與裁過的圖）是 data URL，
 * placeholder 給了時換成待填的網址（F46）。讀不到時空字串。
 */
export async function exportSrc(
  image: ImageRef,
  trim: boolean,
  placeholder: string | null,
): Promise<string> {
  if (trim) {
    const b = await trimmedBlob(image);
    if (b) return placeholder ?? (await readAsDataUrl(b));
  }
  if (image.kind === 'url') return image.url;
  if (placeholder) return placeholder;
  const blob = await assets.get(image.id).catch(() => undefined);
  return blob ? readAsDataUrl(blob) : '';
}

/**
 * 卡片用到的圖片 → 互動 HTML 的網址（瀏覽器）。placeholders：要放進程式碼的圖換成待填的網址，
 * 結果的圖用圖片清單裡的順序編號（清單裡找不到時依出現的順序）。
 */
export async function resolveExportSources(
  card: Card,
  pool: readonly ImageRef[],
  placeholders: boolean,
): Promise<(image: ImageRef, trim: boolean) => string> {
  const out = new Map<string, string>();
  let extra = pool.length;
  const numbers = new Map<string, number>();
  pool.forEach((im, i) => {
    if (!numbers.has(imageKey(im))) numbers.set(imageKey(im), i + 1);
  });
  for (const it of cardImages(card)) {
    const k = srcKey(it.image, it.trim);
    if (out.has(k)) continue;
    let placeholder: string | null = null;
    if (placeholders) {
      if (it.role === 'bg') placeholder = S.html.placeholderBg;
      else {
        let n = numbers.get(imageKey(it.image));
        if (n === undefined) {
          n = ++extra;
          numbers.set(imageKey(it.image), n);
        }
        placeholder = S.html.placeholderImage(n);
      }
    }
    out.set(k, await exportSrc(it.image, it.trim, placeholder));
  }
  return (image, trim) => out.get(srcKey(image, trim)) ?? '';
}
