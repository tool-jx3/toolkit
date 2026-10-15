/**
 * core/assets 的圖片加入與讀回（char-chart、review-grid、scratch-card 原本各寫一份，合併成共用）：
 *
 * - 加入：解碼確認 → 長邊超過上限（預設 1024）時等比縮小（JPEG 存成 JPEG 品質 0.92，其他存 PNG；小圖不放大）→
 *   放進資產庫 → 從資產庫解碼一次確認（讀不了就從資產庫拿掉、丟 ImageLoadError）。
 *   寫進資產庫的當下就算「這次開頁寫進的圖」：工具還沒把 id 寫進狀態時，開頁的整理（`assets.gcStale`）也不會刪掉。
 * - 分類：類型 image/*、或副檔名是圖片的算圖片；其他看檔頭（沒有副檔名、類型空白的圖片也算）。
 * - 讀回：畫圖時用 `useAssetBitmaps` 取得用到的圖（同一個 id 只解碼一次；讀不到的列在 missing）、
 *   單一張用 `useAssetImage`（含狀態）、匯出時用 `loadAssetBitmaps` 等全部讀好。
 *
 * ```ts
 * const { images, others } = await splitImageFiles(files);
 * const { loaded, failed } = await addImageFiles(assets, images);          // 讀不了的列在 failed，不中斷其他張
 * update((d) => { for (const l of loaded) d.items.push({ image: l.ref }); });
 * const { bitmaps, missing, pending } = useAssetBitmaps(assets, ids);      // 預覽
 * const map = await loadAssetBitmaps(assets, ids);                          // 下載
 * ```
 */
import { useEffect, useMemo, useState } from 'react';
import { canvasToBlob, detectImageType, loadImage, resizeImage } from '../image';
import type { AssetStore } from './index';

/** 加入圖片時預設的長邊上限（超過時等比縮小再存） */
export const ASSET_IMAGE_MAX_SIDE = 1024;

/** 圖片讀不了（解碼失敗、0 px、存進資產庫後解碼不了）；message 是檔名 */
export class ImageLoadError extends Error {
  constructor(readonly fileName: string) {
    super(fileName);
  }
}

/** 放進資產庫的圖片：資產 id、原檔名、（縮小後的）寬高 */
export interface AssetImageRef {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface AddedImage {
  ref: AssetImageRef;
  /** 有存進 IndexedDB（false：這次可以用，重新整理後就沒了） */
  persisted: boolean;
}

export interface AddImageOptions {
  /** 檔名（預設：File 的名字，Blob 是空字串） */
  name?: string;
  /** 長邊上限（預設 1024） */
  maxSide?: number;
}

/** 讀一張圖放進資產庫（讀不了時丟 ImageLoadError） */
export async function addImageFile(
  assets: AssetStore,
  file: Blob,
  {
    name = file instanceof File ? file.name : '',
    maxSide = ASSET_IMAGE_MAX_SIDE,
  }: AddImageOptions = {},
): Promise<AddedImage> {
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
    if (long > maxSide) {
      const s = maxSide / long;
      const width = Math.max(1, Math.round(bmp.width * s));
      const height = Math.max(1, Math.round(bmp.height * s));
      const canvas = resizeImage(bmp, width, height, { quality: 'smooth' });
      blob =
        file.type === 'image/jpeg'
          ? await canvasToBlob(canvas, 'image/jpeg', 0.92)
          : await canvasToBlob(canvas, 'image/png');
    }
  } finally {
    bmp.close?.();
  }
  /* 寫入途中、寫好還沒寫進狀態時，開頁的整理（gcStale）都不刪這張（core/assets 記得這次開頁寫進的 id） */
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

/** 一次讀好幾張（依序）；讀不了的檔名列在 failed（不中斷其他張） */
export async function addImageFiles(
  assets: AssetStore,
  files: readonly File[],
  { maxSide }: Pick<AddImageOptions, 'maxSide'> = {},
): Promise<{ loaded: (AddedImage & { file: File })[]; failed: string[] }> {
  const loaded: (AddedImage & { file: File })[] = [];
  const failed: string[] = [];
  for (const file of files) {
    try {
      loaded.push({ ...(await addImageFile(assets, file, { maxSide })), file });
    } catch {
      failed.push(file.name);
    }
  }
  return { loaded, failed };
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

/**
 * React：用到的圖片的解碼結果（同一個 id 只解碼一次；圖片一張張讀好就一張張出現）。
 * missing：讀不到的 id（可能已從這個瀏覽器清除）；pending：還在讀的張數。
 */
export function useAssetBitmaps(
  assets: AssetStore,
  ids: readonly string[],
): {
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
  }, [assets, key]);
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
  }, [assets, key, tick, missing]);
}

/** 匯出用：等所有用到的圖讀好（讀不到的不在結果裡，就不畫） */
export async function loadAssetBitmaps(
  assets: AssetStore,
  ids: readonly string[],
): Promise<Map<string, ImageBitmap>> {
  const out = new Map<string, ImageBitmap>();
  for (const id of new Set(ids)) {
    const b = await assets.bitmap(id).catch(() => undefined);
    if (b) out.set(id, b);
  }
  return out;
}

/** 單張圖的狀態：沒有圖、讀取中、讀好了、讀不到（可能已從這個瀏覽器清除） */
export type AssetImageStatus = 'none' | 'loading' | 'ready' | 'missing';

/**
 * React：一張圖的解碼結果與狀態（id 換了就重讀；同一個 id 只解碼一次）。
 * id 剛換、還沒讀好的那一次 render 不會回傳上一張圖。
 */
export function useAssetImage(
  assets: AssetStore,
  id: string | null | undefined,
): { bitmap: ImageBitmap | null; status: AssetImageStatus } {
  const [state, setState] = useState<{
    id: string | null;
    bitmap: ImageBitmap | null;
    status: AssetImageStatus;
  }>(() => {
    const hit = id ? assets.peekBitmap(id) : undefined;
    return {
      id: id ?? null,
      bitmap: hit ?? null,
      status: !id ? 'none' : hit ? 'ready' : 'loading',
    };
  });
  useEffect(() => {
    let alive = true;
    if (!id) {
      setState({ id: null, bitmap: null, status: 'none' });
      return;
    }
    const hit = assets.peekBitmap(id);
    if (hit) {
      setState({ id, bitmap: hit, status: 'ready' });
      return;
    }
    setState({ id, bitmap: null, status: 'loading' });
    assets
      .bitmap(id)
      .then((b) => {
        if (alive) setState({ id, bitmap: b ?? null, status: b ? 'ready' : 'missing' });
      })
      .catch(() => {
        if (alive) setState({ id, bitmap: null, status: 'missing' });
      });
    return () => {
      alive = false;
    };
  }, [assets, id]);
  /* id 剛換、effect 還沒跑的那一次 render：不要拿上一張圖畫 */
  if ((state.id ?? null) !== (id ?? null)) {
    const hit = id ? assets.peekBitmap(id) : undefined;
    return { bitmap: hit ?? null, status: !id ? 'none' : hit ? 'ready' : 'loading' };
  }
  return { bitmap: state.bitmap, status: state.status };
}
