/**
 * 上傳的素材：角色（動畫檔或連續圖）、換圖列的兩組圖片。原始檔存在資產庫（IndexedDB，core/assets），
 * 設定只記 id；解碼後的影格放在記憶體快取（同一組 id 只解碼一次）。
 */
import { createAssetStore } from '@/core/assets';
import { decodeAnimatedImage } from '@/core/decode';
import { naturalSort } from '@/core/files';
import { loadImage } from '@/core/image';
import type { CharacterMedia } from './render';
import { type CharacterUpload, type ImageSet, MAX_CHARACTER_FRAMES } from './settings';

export const TOOL_ID = 'loading-maker';

export const assets = createAssetStore(TOOL_ID);

export type Progress = (ratio: number, label: string) => void;

const IMAGE_EXT = /\.(apng|png|gif|webp|jpe?g|bmp|avif)$/i;

/** 看起來是圖片的檔案（MIME 或副檔名） */
export const isImageFile = (f: File): boolean =>
  f.type.startsWith('image/') || IMAGE_EXT.test(f.name);

/** 依檔名自然排序（1、2、10） */
export const sortByName = (files: readonly File[]): File[] => naturalSort(files, (f) => f.name);

/** 單一檔案：APNG／GIF／動態 WebP 拆成影格（最多 500 格、保留每格時間），靜態圖一格 */
async function decodeFile(blob: Blob, onProgress?: Progress): Promise<CharacterMedia> {
  onProgress?.(0.05, '解析影格中…');
  const anim = await decodeAnimatedImage(blob, { maxFrames: MAX_CHARACTER_FRAMES });
  const frames: ImageBitmap[] = [];
  for (let i = 0; i < anim.frames.length; i++) {
    onProgress?.(
      0.1 + (0.85 * i) / anim.frames.length,
      `轉換第 ${i + 1}／${anim.frames.length} 格`,
    );
    frames.push(
      await createImageBitmap(new ImageData(anim.frames[i].rgba, anim.width, anim.height)),
    );
  }
  return {
    frames,
    delays: anim.frames.map((f) => f.delayMs),
    animated: frames.length > 1,
    width: anim.width,
    height: anim.height,
  };
}

/** 連續圖：每張解碼（動畫檔取第一格），各張尺寸可以不同 */
async function decodeSequence(blobs: readonly Blob[], onProgress?: Progress) {
  const frames: ImageBitmap[] = [];
  let width = 0;
  let height = 0;
  for (let i = 0; i < blobs.length; i++) {
    onProgress?.(i / blobs.length, `讀取第 ${i + 1}／${blobs.length} 張`);
    let bmp: ImageBitmap;
    try {
      bmp = await loadImage(blobs[i]);
    } catch {
      throw new Error(`第 ${i + 1} 張圖片無法解碼。`);
    }
    frames.push(bmp);
    width = Math.max(width, bmp.width);
    height = Math.max(height, bmp.height);
  }
  return { frames, width, height };
}

/* ---------- 快取 ---------- */

const characterCache = new Map<string, Promise<CharacterMedia>>();
const setCache = new Map<string, Promise<ImageBitmap[]>>();
const keyOf = (ids: readonly string[]) => ids.join('|');

async function blobsOf(ids: readonly string[]): Promise<Blob[]> {
  const blobs = await Promise.all(ids.map((id) => assets.get(id)));
  if (blobs.some((b) => !b)) throw new Error('找不到上傳的圖片（瀏覽器的資料可能已被清除）。');
  return blobs as Blob[];
}

/** 從資產庫讀回角色並解碼（快取） */
export function loadCharacterMedia(
  upload: CharacterUpload,
  onProgress?: Progress,
): Promise<CharacterMedia> {
  const key = `${upload.kind}:${keyOf(upload.ids)}`;
  let p = characterCache.get(key);
  if (!p) {
    p = (async () => {
      const blobs = await blobsOf(upload.ids);
      if (upload.kind === 'file') return decodeFile(blobs[0], onProgress);
      const seq = await decodeSequence(blobs, onProgress);
      return { ...seq, delays: seq.frames.map(() => 125), animated: false };
    })();
    p.catch(() => characterCache.delete(key));
    characterCache.set(key, p);
  }
  return p;
}

/** 從資產庫讀回一組換圖用的圖片（快取） */
export function loadImageSet(set: ImageSet, onProgress?: Progress): Promise<ImageBitmap[]> {
  const key = keyOf(set.ids);
  let p = setCache.get(key);
  if (!p) {
    p = blobsOf(set.ids).then(async (blobs) => (await decodeSequence(blobs, onProgress)).frames);
    p.catch(() => setCache.delete(key));
    setCache.set(key, p);
  }
  return p;
}

/* ---------- 新增 ---------- */

export interface AddResult<T> {
  value: T;
  /** 有沒有存進 IndexedDB（false：重新整理後就沒了） */
  persisted: boolean;
  /** 略過的非圖片檔數 */
  skipped: number;
}

async function storeFiles(files: readonly File[]) {
  let persisted = true;
  const ids: string[] = [];
  for (const f of files) {
    const r = await assets.add(f);
    ids.push(r.id);
    if (!r.persisted) persisted = false;
  }
  return { ids, persisted };
}

/**
 * 上傳角色（F13～F15）：一個檔案＝動畫檔或靜態圖；多個檔案＝連續圖（依檔名自然排序）。
 * 不是圖片的檔案略過；全部都不是時丟錯。解碼失敗丟錯（訊息可直接顯示）。
 */
export async function addCharacterFiles(
  input: readonly File[],
  onProgress?: Progress,
): Promise<AddResult<{ upload: CharacterUpload; media: CharacterMedia }>> {
  const files = sortByName(input.filter(isImageFile));
  if (!files.length) throw new Error('沒有可用的圖片檔。');
  const kind = files.length === 1 ? 'file' : 'sequence';
  const media: CharacterMedia =
    kind === 'file'
      ? await decodeFile(files[0], onProgress)
      : await decodeSequence(files, onProgress).then((seq) => ({
          ...seq,
          delays: seq.frames.map(() => 125),
          animated: false,
        }));
  onProgress?.(0.97, '儲存中…');
  const { ids, persisted } = await storeFiles(files);
  const upload: CharacterUpload = { kind, ids, names: files.map((f) => f.name) };
  characterCache.set(`${kind}:${keyOf(ids)}`, Promise.resolve(media));
  return { value: { upload, media }, persisted, skipped: input.length - files.length };
}

/** 上傳一組換圖用的圖片（F119、F122）：靜態圖，依檔名自然排序；整組換掉 */
export async function addImageSet(
  input: readonly File[],
  onProgress?: Progress,
): Promise<AddResult<{ set: ImageSet; images: ImageBitmap[] }>> {
  const files = sortByName(input.filter(isImageFile));
  if (!files.length) throw new Error('沒有可用的圖片檔。');
  const { frames } = await decodeSequence(files, onProgress);
  const { ids, persisted } = await storeFiles(files);
  setCache.set(keyOf(ids), Promise.resolve(frames));
  return {
    value: { set: { ids, names: files.map((f) => f.name) }, images: frames },
    persisted,
    skipped: input.length - files.length,
  };
}

/** 「前幾個檔名，另外 N 個」 */
export function namesSummary(names: readonly string[], shown: number): string {
  const head = names.slice(0, shown).join('、');
  return names.length > shown ? `${head}，另外 ${names.length - shown} 個` : head;
}
