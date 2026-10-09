/**
 * 照片的載入與讀回：放進資產庫（IndexedDB）→ 解碼確認 → 換掉目前的照片（清掉所有框，規格 F07）。
 * 重新整理後從資產庫讀回；讀不到時回報 'missing'（提醒重新選擇）。
 */
import { useEffect, useState } from 'react';
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

export type PhotoStatus = 'none' | 'loading' | 'ready' | 'missing';

/** 目前照片的解碼結果（id 換了就重讀；同一個 id 只解碼一次） */
export function usePhotoBitmap(id: string | null | undefined): {
  bitmap: ImageBitmap | null;
  status: PhotoStatus;
} {
  const [state, setState] = useState<{
    id: string | null;
    bitmap: ImageBitmap | null;
    status: PhotoStatus;
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
  }, [id]);
  /* id 剛換、effect 還沒跑的那一次 render：不要拿舊照片畫 */
  if ((state.id ?? null) !== (id ?? null)) {
    const hit = id ? assets.peekBitmap(id) : undefined;
    return { bitmap: hit ?? null, status: !id ? 'none' : hit ? 'ready' : 'loading' };
  }
  return { bitmap: state.bitmap, status: state.status };
}
