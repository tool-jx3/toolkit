/**
 * 照片與背景圖片：放進資產庫（IndexedDB；長邊超過 3200 px 時縮小）→ 解碼確認 → 換上（位置回到預設）。
 * 「調整位置與縮放…」打開共用的 ImageFrameDialog，套用時只換位置。重新整理後從資產庫讀回（共用的 `useAssetImage`）。
 */
import { create } from 'zustand';
import { addImageFile, ImageLoadError, splitImageFiles } from '@/core/assets';
import { DEFAULT_PLACEMENT, type FramePlacement } from '@/core/image';
import { IMAGE_MAX_MB, IMAGE_MAX_SIDE, type ImageRef } from './model';
import { assets, docNow, edit } from './store';
import { S } from './strings';

export type ImageSlot = 'photo' | 'bg';

/** 一則通知的內容 */
export interface Notice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/**
 * 選檔、拖放、貼上：用第一張圖片換上（位置回到預設）。其他檔案與讀不到的原因合成一則通知。
 */
export async function loadImageFiles(
  slot: ImageSlot,
  files: readonly File[],
): Promise<Notice | null> {
  if (!files.length) return null;
  const { images, others } = await splitImageFiles([...files]);
  const notes = others.map((f) => S.imageNotImage(f.name));
  const first = images[0];
  if (!first)
    return {
      title: notes[0] ?? S.imageUnreadable(''),
      description: notes.slice(1).join('；') || undefined,
      tone: 'danger',
    };
  if (first.size > IMAGE_MAX_MB * 1024 * 1024)
    return {
      title: S.imageTooBig(first.name),
      description: notes.join('；') || undefined,
      tone: 'danger',
    };
  let ref: ImageRef;
  let persisted = true;
  try {
    const added = await addImageFile(assets, first, { maxSide: IMAGE_MAX_SIDE });
    ref = added.ref;
    persisted = added.persisted;
  } catch (e) {
    const name = e instanceof ImageLoadError ? e.fileName : first.name;
    return {
      title: S.imageUnreadable(name),
      description: notes.join('；') || undefined,
      tone: 'danger',
    };
  }
  edit((d) => {
    if (slot === 'photo') {
      d.photo.image = { ...ref };
      d.photo.place = { ...DEFAULT_PLACEMENT };
    } else {
      d.bg.image = { ...ref };
      d.bg.place = { ...DEFAULT_PLACEMENT };
      d.bg.kind = 'image';
    }
  });
  if (!persisted) notes.push(S.imageNotSaved);
  return {
    title: S.imageLoaded[slot],
    description: [ref.name, ...notes].filter(Boolean).join('；') || undefined,
    tone: notes.length ? 'warning' : 'success',
  };
}

/** 拿掉照片或背景圖片（位置回到預設） */
export function removeImage(slot: ImageSlot): void {
  edit((d) => {
    const target = slot === 'photo' ? d.photo : d.bg;
    target.image = null;
    target.place = { ...DEFAULT_PLACEMENT };
  });
}

/** 位置回到預設（置中、不縮放、不旋轉） */
export function resetPlacement(slot: ImageSlot): void {
  edit((d) => {
    (slot === 'photo' ? d.photo : d.bg).place = { ...DEFAULT_PLACEMENT };
  });
}

/* ---------- 位置與縮放的對話框 ---------- */

export interface FrameRequest {
  slot: ImageSlot;
  bitmap: ImageBitmap;
}

export const useFrame = create<{ request: FrameRequest | null }>(() => ({ request: null }));
export const closeFrame = (): void => useFrame.setState({ request: null });

/** 打開「調整位置與縮放」（圖片讀不到時回傳 false） */
export async function openFrame(slot: ImageSlot): Promise<boolean> {
  const ref = slot === 'photo' ? docNow().photo.image : docNow().bg.image;
  if (!ref) return false;
  const bitmap = await assets.bitmap(ref.id).catch(() => undefined);
  if (!bitmap) return false;
  useFrame.setState({ request: { slot, bitmap } });
  return true;
}

/** 套用新的位置（一步復原） */
export function applyPlacement(slot: ImageSlot, place: FramePlacement): void {
  edit((d) => {
    (slot === 'photo' ? d.photo : d.bg).place = { ...place };
  });
}
