/**
 * 照片（桌布、外框背景）的載入與讀回：放進資產庫（IndexedDB）→ 解碼確認 → 打開裁切 → 套用時換上照片與位置。
 * 同一批檔案的問題整理成一則通知（不是圖片、讀不到、第二張以後沒有用）。重新整理後從資產庫讀回；讀不到時回報。
 */
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import type { FramePlacement } from '@/core/image';
import type { ImageRef } from './model';
import { assets, docNow, type PhotoSlot } from './store';
import { S } from './strings';

export const isImageFile = (f: File): boolean =>
  f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|avif|bmp|svg)$/i.test(f.name);

/** 一則通知的內容 */
export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/* ---------- 裁切對話框的狀態 ---------- */

export interface CropRequest {
  slot: PhotoSlot;
  bitmap: ImageBitmap;
  ref: ImageRef;
  /** 重新裁切時是目前的位置；新照片是 null（蓋滿置中） */
  initial: FramePlacement | null;
  /** 新照片才有：是否存進了 IndexedDB、同一批的其他提醒 */
  fresh?: { persisted: boolean; notes: string[] };
}

export const useCrop = create<{ request: CropRequest | null }>(() => ({ request: null }));
export const openCrop = (request: CropRequest): void => useCrop.setState({ request });
export const closeCrop = (): void => useCrop.setState({ request: null });

/** 讀一張圖放進資產庫並解碼；失敗時回傳原因 */
async function storeImage(
  file: File,
): Promise<
  { ok: true; id: string; bitmap: ImageBitmap; persisted: boolean } | { ok: false; reason: string }
> {
  if (!isImageFile(file)) return { ok: false, reason: S.notImage(file.name) };
  let added: { id: string; persisted: boolean };
  try {
    added = await assets.add(file);
  } catch {
    return { ok: false, reason: S.readError(file.name) };
  }
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await assets.bitmap(added.id);
  } catch {
    return { ok: false, reason: S.decodeError(file.name) };
  }
  if (!bitmap) return { ok: false, reason: S.lostError(file.name) };
  if (!bitmap.width || !bitmap.height) return { ok: false, reason: S.decodeError(file.name) };
  return { ok: true, id: added.id, bitmap, persisted: added.persisted };
}

/**
 * 選檔、拖放、貼上：用第一張圖片，讀好後打開裁切（套用才換上）。讀不到時回傳一則通知；
 * 其他提醒（第二張以後沒有用、存不進瀏覽器）等套用時一起通知。
 */
export async function loadPhotoFiles(
  slot: PhotoSlot,
  files: readonly File[],
): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const notes: string[] = [];
  const first = files.find(isImageFile);
  for (const f of files) if (f !== first && !isImageFile(f)) notes.push(S.notImage(f.name));
  const extra = files.filter((f) => f !== first && isImageFile(f));
  if (extra.length) notes.push(S.onlyFirst(extra.map((f) => f.name).join('」「')));
  if (!first) return { title: S.photoFailed, description: notes.join('；'), tone: 'danger' };
  const r = await storeImage(first);
  if (!r.ok)
    return { title: S.photoFailed, description: [r.reason, ...notes].join('；'), tone: 'danger' };
  openCrop({
    slot,
    bitmap: r.bitmap,
    ref: { id: r.id, name: first.name, width: r.bitmap.width, height: r.bitmap.height },
    initial: null,
    fresh: { persisted: r.persisted, notes },
  });
  return null;
}

/** 重新裁切目前的照片（照片讀不到時回傳 false） */
export async function recrop(slot: PhotoSlot): Promise<boolean> {
  const photo = docNow()[slot];
  if (!photo.image) return false;
  const bitmap = await assets.bitmap(photo.image.id).catch(() => undefined);
  if (!bitmap) return false;
  openCrop({ slot, bitmap, ref: photo.image, initial: photo.place });
  return true;
}

/** 套用新照片之後的通知（沒有要提醒的就只說換上了哪張） */
export function appliedNotice(req: CropRequest): BatchNotice | null {
  if (!req.fresh) return null;
  const notes = [...req.fresh.notes];
  if (!req.fresh.persisted) notes.push(S.photoNotSaved);
  if (!notes.length) return null;
  return { title: S.photoApplied(req.ref.name), description: notes.join('；'), tone: 'warning' };
}

/* ---------- 讀回 ---------- */

export type ImageStatus = 'none' | 'loading' | 'ready' | 'missing';

/** 一張圖的解碼結果（id 換了就重讀；同一個 id 只解碼一次） */
export function useAssetImage(id: string | null | undefined): {
  bitmap: ImageBitmap | null;
  status: ImageStatus;
} {
  const [state, setState] = useState<{
    id: string | null;
    bitmap: ImageBitmap | null;
    status: ImageStatus;
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
  if ((state.id ?? null) !== (id ?? null)) {
    const hit = id ? assets.peekBitmap(id) : undefined;
    return { bitmap: hit ?? null, status: !id ? 'none' : hit ? 'ready' : 'loading' };
  }
  return { bitmap: state.bitmap, status: state.status };
}
