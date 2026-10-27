/**
 * 圖片的載入（附圖、背景圖；選檔、拖放、貼上都走這裡）：放進資產庫（IndexedDB，長邊超過 2048 px 時縮小）→ 換上目前這一張。
 * 同一批檔案的問題整理成一則通知（不是圖片、讀不出來、第二張以後沒有用、存不進瀏覽器）。
 */
import { addImageFile, ImageLoadError, splitImageFiles } from '@/core/assets';
import { DEFAULT_IMAGE_SIZE } from './model';
import { activeNow, assets, editActive, editHandout } from './store';
import { S } from './strings';

/** 附圖與背景圖的長邊上限 */
export const IMAGE_MAX_SIDE = 2048;

export type ImageSlot = 'image' | 'bg';

export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/** 用第一張圖片換上；附圖換上新的時大小回到 90 %、濾鏡回到原圖（同原作） */
export async function loadImageFiles(
  slot: ImageSlot,
  files: readonly File[],
): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const { images, others } = await splitImageFiles(files);
  const notes = others.map((f) => S.notImage(f.name));
  const [first, ...rest] = images;
  if (rest.length) notes.push(S.onlyFirst(rest.map((f) => f.name).join('」「')));
  if (!first) return { title: S.imageFailed, description: notes.join(''), tone: 'danger' };
  /* 讀檔途中換了編輯的那一張時，圖片仍然放進開始讀的那一張 */
  const target = activeNow().id;
  try {
    const { ref, persisted } = await addImageFile(assets, first, { maxSide: IMAGE_MAX_SIDE });
    editHandout(target, (h) => {
      if (slot === 'image') {
        h.image = ref;
        h.imageSize = DEFAULT_IMAGE_SIZE;
        h.imageFilter = 'none';
      } else h.bg.image = ref;
    });
    if (!persisted) notes.push(S.imageNotSaved);
    return {
      title: S.imageApplied(first.name || '—'),
      description: notes.join('') || undefined,
      tone: notes.length ? 'warning' : 'success',
    };
  } catch (e) {
    const name = e instanceof ImageLoadError ? e.fileName || first.name : first.name;
    return {
      title: S.imageFailed,
      description: [S.decodeError(name), ...notes].join(''),
      tone: 'danger',
    };
  }
}

export function clearImage(slot: ImageSlot): void {
  editActive((h) => {
    if (slot === 'image') h.image = null;
    else h.bg.image = null;
  });
}
