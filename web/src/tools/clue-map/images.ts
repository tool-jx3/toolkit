/**
 * 圖片：讀進資產庫（共用的 `addImageFiles`：解碼確認 → 長邊超過上限時縮小 → 存 IndexedDB；開頁的整理不刪這次開頁寫進的圖），
 * 場景與線索圖片的網址（預覽：物件網址或 data URL、互動 HTML：data URL 或網址、總覽 PNG：解碼後的圖）。
 */
import { useEffect, useMemo, useState } from 'react';
import { addImageFiles, splitImageFiles } from '@/core/assets';
import { readAsDataUrl } from '@/core/files';
import { loadImage } from '@/core/image';
import type { SrcOf } from './markup';
import { type ImageRef, imageKey, LIMITS, type SceneRef } from './model';
import { builtinSceneDataUrl, builtinSceneUrl, renderBuiltinScene } from './scenes';
import { assets } from './store';

export type AssetImage = Extract<ImageRef, { kind: 'asset' }>;

export interface LoadedImage {
  ref: AssetImage;
  /** 有存進 IndexedDB（false：這次可以用，重新整理後就沒了） */
  persisted: boolean;
}

/** 一次讀好幾個檔：不是圖片、讀不了的分開列出（不中斷其他張） */
export async function loadImageFiles(
  files: readonly File[],
  maxSide: number,
): Promise<{ loaded: LoadedImage[]; notImages: string[]; failed: string[] }> {
  const { images, others } = await splitImageFiles(files);
  const { loaded, failed } = await addImageFiles(assets, images, { maxSide });
  return {
    loaded: loaded.map((l) => ({
      ref: { kind: 'asset', ...l.ref } as AssetImage,
      persisted: l.persisted,
    })),
    notImages: others.map((f) => f.name),
    failed,
  };
}

export const loadSceneFiles = (files: readonly File[]) => loadImageFiles(files, LIMITS.sceneSide);
export const loadClueFiles = (files: readonly File[]) => loadImageFiles(files, LIMITS.imageSide);

/** 畫面上要用到的圖片參照（場景＋線索圖片），同一張只算一次 */
export function refsOf(d: {
  scene: SceneRef;
  spots: readonly { image: ImageRef | null }[];
}): (SceneRef | ImageRef)[] {
  const m = new Map<string, SceneRef | ImageRef>();
  m.set(imageKey(d.scene), d.scene);
  for (const s of d.spots) if (s.image) m.set(imageKey(s.image), s.image);
  return [...m.values()];
}

/* ---------- 預覽用的網址 ---------- */

async function previewSource(ref: SceneRef | ImageRef): Promise<string | null> {
  if (ref.kind === 'url') return ref.url;
  if (ref.kind === 'builtin') return builtinSceneUrl(ref.id);
  return (await assets.url(ref.id).catch(() => undefined)) ?? null;
}

/**
 * 預覽用的圖片網址：上傳的圖是物件網址、網址的圖照樣用網址、內建場景是畫好的圖；還沒讀好的是空字串。
 * missing：讀不到的上傳圖片數（可能被瀏覽器清掉）；pending：還在讀的張數。
 */
export function usePreviewSources(refs: readonly (SceneRef | ImageRef)[]): {
  srcOf: SrcOf;
  pending: number;
  missing: number;
} {
  const needed = useMemo(() => new Map(refs.map((r) => [imageKey(r), r])), [refs]);
  const key = [...needed.keys()].sort().join('\n');
  const [resolved, setResolved] = useState<ReadonlyMap<string, string | null>>(() => new Map());
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 代表 needed 的內容
  useEffect(() => {
    let alive = true;
    for (const [k, ref] of needed) {
      if (resolved.has(k)) continue;
      previewSource(ref).then(
        (v) => alive && setResolved((m) => new Map(m).set(k, v)),
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
      srcOf: (ref: SceneRef | ImageRef) => resolved.get(imageKey(ref)) ?? '',
      pending,
      missing,
    };
  }, [needed, resolved]);
}

/* ---------- 互動 HTML 用的網址 ---------- */

/**
 * 互動 HTML 用的圖片網址（瀏覽器）：上傳的圖與內建場景是 data URL（內嵌在檔案裡），網址的圖照樣用網址（要連網）。讀不到的是空字串。
 */
export async function resolveExportSources(refs: readonly (SceneRef | ImageRef)[]): Promise<SrcOf> {
  const out = new Map<string, string>();
  for (const ref of refs) {
    const k = imageKey(ref);
    if (out.has(k)) continue;
    if (ref.kind === 'url') out.set(k, ref.url);
    else if (ref.kind === 'builtin') out.set(k, await builtinSceneDataUrl(ref.id));
    else {
      const blob = await assets.get(ref.id).catch(() => undefined);
      out.set(k, blob ? await readAsDataUrl(blob) : '');
    }
  }
  return (ref) => out.get(imageKey(ref)) ?? '';
}

/* ---------- 總覽 PNG 用的圖 ---------- */

export type DrawableSource = CanvasImageSource;

/** 畫總覽 PNG 的圖：上傳的圖、內建場景、網址的圖（跨網域讀不到時 null）；讀不到的 key 對應 null */
export async function loadOverviewImages(
  refs: readonly (SceneRef | ImageRef)[],
): Promise<Map<string, DrawableSource | null>> {
  const out = new Map<string, DrawableSource | null>();
  for (const ref of refs) {
    const k = imageKey(ref);
    if (out.has(k)) continue;
    try {
      if (ref.kind === 'builtin') out.set(k, renderBuiltinScene(ref.id) as DrawableSource);
      else if (ref.kind === 'asset') out.set(k, (await assets.bitmap(ref.id)) ?? null);
      else out.set(k, await loadImage(ref.url));
    } catch {
      out.set(k, null);
    }
  }
  return out;
}
