/**
 * 圖片的放入（選檔、拖放、貼上都走這裡；規格 F06、F17、F18、F21、F22、F28）：
 * - 目標是代表圖：第一張換成代表圖，其他的在通知裡說明沒有用到；
 * - 目標是某一格（點選、拖放、貼上指著的那一格）：第一張放那一格（有圖也換掉），其他從那一格往後依序放進空格子，
 *   後面沒有空格時再從頭找（規格 7.1；`planFill`）；
 * - 沒有目標：從頭依序放進空格子；沒有空格時說明「沒有空的格子」。
 * 不是圖片、讀不到、沒有位置的檔案，同一批合成一則通知。也負責「調整範圍」的對話框（ImageFrameDialog）要的圖
 * （讀不回來時說明「這張圖片讀不回來，請重新放入」）。
 */
import { addImageFile, addImageFiles, splitImageFiles } from '@/core/assets';
import type { CardImage } from './model';
import { IMAGE_MAX_SIDE, planFill } from './model';
import { sampleCanvas } from './samples';
import { assets, docNow, fillImages, setAvatarImage, type Target, useUi } from './store';
import { S } from './strings';

export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

const names = (list: readonly string[]) => list.join('」「');

/** 放入一批檔案；回傳要顯示的通知（沒有要說的時 null） */
export async function placeFiles(
  files: readonly File[],
  target: Target | null,
): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const { images, others } = await splitImageFiles(files);
  const notes: string[] = [];
  if (others.length) notes.push(S.notImage(names(others.map((f) => f.name))));

  if (target?.kind === 'avatar') {
    const [first, ...rest] = images;
    if (rest.length) notes.push(S.onlyFirst(names(rest.map((f) => f.name))));
    if (!first) return { title: S.loadFailed, description: notes.join(''), tone: 'danger' };
    try {
      const r = await addImageFile(assets, first, { maxSide: IMAGE_MAX_SIDE });
      setAvatarImage({ kind: 'asset', ...r.ref });
      if (!r.persisted) notes.push(S.notSaved);
    } catch {
      notes.unshift(S.readError(first.name));
      return { title: S.loadFailed, description: notes.join(''), tone: 'danger' };
    }
    return notes.length
      ? { title: S.avatarPlaced, description: notes.join(''), tone: 'warning' }
      : { title: S.avatarPlaced, tone: 'success' };
  }

  const start = target?.kind === 'cell' ? target.index : null;
  const plan = planFill(docNow(), images.length, start);
  if (!images.length) return { title: S.loadFailed, description: notes.join(''), tone: 'danger' };
  if (!plan.slots.length)
    return { title: S.noEmpty, description: notes.join('') || undefined, tone: 'warning' };
  const use = images.slice(0, plan.slots.length);
  const { loaded, failed } = await addImageFiles(assets, use, { maxSide: IMAGE_MAX_SIDE });
  if (failed.length) notes.push(S.readError(names(failed)));
  const refs: CardImage[] = loaded.map((l) => ({ kind: 'asset', ...l.ref }));
  const r = refs.length ? fillImages(refs, start) : { slots: [], dropped: 0 };
  const dropped = images.length - use.length + r.dropped;
  if (dropped) notes.push(S.dropped(dropped));
  if (loaded.some((l) => !l.persisted)) notes.push(S.notSaved);
  if (!r.slots.length) return { title: S.loadFailed, description: notes.join(''), tone: 'danger' };
  return {
    title: S.placed(r.slots.length),
    description: notes.join('') || undefined,
    tone: notes.length ? 'warning' : 'success',
  };
}

/** 圖片本身（範例圖是畫好的畫布；資產從資產庫讀，讀不到時 null） */
export async function imageSource(img: CardImage): Promise<CanvasImageSource | null> {
  if (img.kind === 'sample') return sampleCanvas(img.key);
  return (await assets.bitmap(img.id).catch(() => undefined)) ?? null;
}

/** 打開「調整範圍」（圖片讀不到時回傳 false） */
export async function openFrame(target: Target): Promise<boolean> {
  const d = docNow();
  const slot = target.kind === 'avatar' ? d.avatar : d.cells[target.index];
  if (!slot?.image) return false;
  const image = await imageSource(slot.image);
  if (!image) return false;
  useUi.setState({ frame: { target, image, initial: slot.place } });
  return true;
}

export const closeFrame = (): void => useUi.setState({ frame: null });
