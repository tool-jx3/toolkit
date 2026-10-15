/**
 * 照片的載入：放進資產庫（IndexedDB）→ 解碼確認 → 換掉目前的照片（清掉所有框，規格 F07）。
 * 重新整理後從資產庫讀回用共用的 `useAssetImage`（讀不到時狀態是 'missing'，提醒重新選擇）。
 */
import { applyPhoto, assets } from './store';

export class PhotoError extends Error {}

export interface LoadResult {
  /** 照片有存進 IndexedDB（false：這次可以用，重新整理後就沒了） */
  persisted: boolean;
}

/** 讀一張照片並換上（解碼失敗丟 PhotoError，原本的照片與框不變） */
export async function loadPhotoFile(file: File): Promise<LoadResult> {
  const added = await assets.add(file);
  const bitmap = await assets.bitmap(added.id).catch(() => undefined);
  if (!bitmap) {
    await assets.remove(added.id).catch(() => undefined);
    throw new PhotoError(file.name);
  }
  applyPhoto({ id: added.id, name: file.name, width: bitmap.width, height: bitmap.height });
  return { persisted: added.persisted };
}
