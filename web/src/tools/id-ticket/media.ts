/**
 * 照片的放入與調整範圍：選檔、拖放、貼上都走這裡。用第一張圖片（長邊超過 1600 px 時縮小）放進資產庫，
 * 換到目前範本的照片格（蓋滿、置中）；同一批檔案的問題合成一則通知。
 */
import { addImageFile, ImageLoadError, splitImageFiles } from '@/core/assets';
import { applyPhoto, assets, currentPhoto, docNow, photoSlot, useUi } from './store';
import { S } from './strings';

/** 照片的長邊上限（同原作：1600） */
export const PHOTO_MAX_SIDE = 1600;

export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/** 放入照片（用第一張圖片）；回傳一則通知（沒有照片格時說明） */
export async function loadPhotoFiles(files: readonly File[]): Promise<BatchNotice | null> {
  if (!files.length) return null;
  if (!photoSlot(docNow()))
    return { title: S.photoFailed, description: S.noPhotoSlot, tone: 'warning' };
  const { images, others } = await splitImageFiles(files);
  const notes: string[] = others.map((f) => S.notImage(f.name));
  const [first, ...rest] = images;
  if (rest.length) notes.push(S.onlyFirst(rest.map((f) => f.name).join('」「')));
  if (!first) return { title: S.photoFailed, description: notes.join('；'), tone: 'danger' };
  try {
    const added = await addImageFile(assets, first, { maxSide: PHOTO_MAX_SIDE });
    applyPhoto(added.ref);
    if (!added.persisted) notes.push(S.photoNotSaved);
    return {
      title: S.photoApplied(first.name),
      description: notes.length ? notes.join('；') : undefined,
      tone: notes.length ? 'warning' : 'success',
    };
  } catch (e) {
    const name = e instanceof ImageLoadError ? e.fileName : first.name;
    return {
      title: S.photoFailed,
      description: [S.readError(name), ...notes].join('；'),
      tone: 'danger',
    };
  }
}

/** 打開「調整照片範圍」（照片讀不回來時回傳 false） */
export async function openFrame(): Promise<boolean> {
  const d = docNow();
  const photo = currentPhoto(d);
  const slot = photoSlot(d);
  if (!photo || !slot) return false;
  const bitmap = await assets.bitmap(photo.image.id).catch(() => undefined);
  if (!bitmap) return false;
  useUi.setState({
    frame: { bitmap, photo, aspect: slot.aspect, circle: slot.circle, maxZoom: slot.maxZoom },
  });
  return true;
}

export const closeFrame = (): void => useUi.setState({ frame: null });
