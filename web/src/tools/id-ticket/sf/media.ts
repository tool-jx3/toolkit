/**
 * SF 證件的圖：裝飾圖（一次好幾張、放入後依序打開裁切）、執照的自訂圖示（方形裁切）、浮水印的圖片。
 * 圖都放進資產庫（長邊超過 1600 px 時縮小），狀態只記 id。
 */
import { addImageFile, addImageFiles, splitImageFiles } from '@/core/assets';
import type { Rect } from '@/core/image';
import { PHOTO_MAX_SIDE } from '../media';
import {
  addElement,
  assets,
  currentElements,
  docNow,
  patchElement,
  setLicenseIcon,
  setLicenseIconCrop,
  setWatermark,
  useUi,
} from '../store';
import { S } from '../strings';
import { sfBlank } from './defs';
import { elementRect } from './draw';
import { type CropFrac, SF_ELEMENT_MAX as SF_ELEMENT_LIMIT } from './model';

export interface Notice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/** 新的裝飾圖放的位置（這一款的標誌位置，原生像素）→ 卡片的比例 */
export function spotFraction(
  spot: { x: number; y: number; w: number; h: number } | null,
): { x: number; y: number; size: number } | null {
  if (!spot) return null;
  const b = sfBlank(docNow().sf.blank);
  return {
    x: (spot.x + spot.w / 2) / b.w,
    y: (spot.y + spot.h / 2) / b.h,
    size: Math.min(spot.w, spot.h) / Math.min(b.w, b.h),
  };
}

/* ---------- 裁切的佇列 ---------- */

const queue: string[] = [];

async function openElementCrop(id: string, fresh: boolean): Promise<boolean> {
  const el = currentElements().find((e) => e.id === id);
  if (!el) return false;
  const bitmap = await assets.bitmap(el.image.id).catch(() => undefined);
  if (!bitmap) return false;
  useUi.setState({ crop: { target: { kind: 'element', id }, bitmap, crop: el.crop, fresh } });
  return true;
}

/** 裁切對話框關掉之後：佇列裡還有就開下一張 */
export function closeCrop(): void {
  useUi.setState({ crop: null });
  const next = queue.shift();
  if (next) void openElementCrop(next, true);
}

/** 打開裝飾圖的裁切（從目前的裁切開始） */
export const cropElement = (id: string): Promise<boolean> => openElementCrop(id, false);

/** 放入裝飾圖（一次好幾張；放在這一款的標誌位置或卡片中央，依序打開裁切） */
export async function loadElementFiles(
  files: readonly File[],
  spot: { x: number; y: number; size: number } | null,
): Promise<Notice | null> {
  if (!files.length) return null;
  const { images, others } = await splitImageFiles(files);
  const notes: string[] = others.map((f) => S.notImage(f.name));
  const room = SF_ELEMENT_LIMIT - currentElements().length;
  if (room <= 0) return { title: S.elementsFull(SF_ELEMENT_LIMIT), tone: 'warning' };
  const take = images.slice(0, room);
  if (images.length > room) notes.push(S.elementsFull(SF_ELEMENT_LIMIT));
  const { loaded, failed } = await addImageFiles(assets, take, { maxSide: PHOTO_MAX_SIDE });
  for (const n of failed) notes.push(S.readError(n));
  const ids: string[] = [];
  for (const l of loaded) {
    const id = addElement(l.ref, spot);
    if (id) ids.push(id);
    if (!l.persisted) notes.push(S.photoNotSaved);
  }
  if (!ids.length)
    return { title: S.photoFailed, description: notes.join('；') || undefined, tone: 'danger' };
  const [first, ...rest] = ids;
  queue.push(...rest);
  if (!useUi.getState().crop) void openElementCrop(first, true);
  else queue.unshift(first);
  return {
    title: S.elementsAdded(ids.length),
    description: notes.length ? [...new Set(notes)].join('；') : undefined,
    tone: notes.length ? 'warning' : 'success',
  };
}

/* ---------- 裁切的換算 ---------- */

/** 裁切範圍（比例）↔ 原圖像素 */
export const cropToRect = (c: CropFrac, w: number, h: number): Rect => ({
  x: Math.round(c.x * w),
  y: Math.round(c.y * h),
  width: Math.max(1, Math.round(c.w * w)),
  height: Math.max(1, Math.round(c.h * h)),
});

export const rectToCrop = (r: Rect, w: number, h: number): CropFrac => ({
  x: r.x / w,
  y: r.y / h,
  w: r.width / w,
  h: r.height / h,
});

/**
 * 套用裁切：重新裁切時留下的部分停在卡上原本的位置、比例不變（大小跟著變）；新放的圖裁好的部分填滿它的位置。
 */
export function applyElementCrop(id: string, crop: CropFrac, fresh: boolean): void {
  const d = docNow();
  const el = currentElements(d).find((e) => e.id === id);
  if (!el) return;
  if (fresh) {
    patchElement(id, { crop });
    return;
  }
  const b = sfBlank(d.sf.blank);
  const r0 = elementRect(el, b.w, b.h);
  const ppx = r0.w / Math.max(1e-6, el.crop.w * el.image.width);
  const dx = (crop.x + crop.w / 2 - (el.crop.x + el.crop.w / 2)) * el.image.width * ppx;
  const dy = (crop.y + crop.h / 2 - (el.crop.y + el.crop.h / 2)) * el.image.height * ppx;
  const side = Math.max(crop.w * el.image.width, crop.h * el.image.height) * ppx;
  patchElement(id, {
    crop,
    size: side / Math.min(b.w, b.h),
    x: el.x + dx / b.w,
    y: el.y + dy / b.h,
  });
}

/* ---------- 執照的自訂圖示 ---------- */

/** 選一張圖當執照的圖示：放進資產庫，打開方形裁切（從中央的正方形開始） */
export async function loadLicenseIcon(key: string, file: File): Promise<Notice | null> {
  try {
    const added = await addImageFile(assets, file, { maxSide: PHOTO_MAX_SIDE });
    const { width: w, height: h } = added.ref;
    const s = Math.min(w, h);
    const crop = { x: (w - s) / 2 / w, y: (h - s) / 2 / h, w: s / w, h: s / h };
    setLicenseIcon(key, added.ref, crop);
    const bitmap = await assets.bitmap(added.ref.id).catch(() => undefined);
    if (bitmap)
      useUi.setState({ crop: { target: { kind: 'license', key }, bitmap, crop, fresh: true } });
    return added.persisted ? null : { title: S.photoNotSaved, tone: 'warning' };
  } catch {
    return { title: S.photoFailed, description: S.readError(file.name), tone: 'danger' };
  }
}

export async function cropLicenseIcon(key: string): Promise<boolean> {
  const ic = docNow().sf.licenseIcons[key];
  if (!ic) return false;
  const bitmap = await assets.bitmap(ic.image.id).catch(() => undefined);
  if (!bitmap) return false;
  useUi.setState({
    crop: { target: { kind: 'license', key }, bitmap, crop: ic.crop, fresh: false },
  });
  return true;
}

export const applyLicenseCrop = (key: string, crop: CropFrac): void =>
  setLicenseIconCrop(key, crop);

/* ---------- 浮水印的圖片 ---------- */

export async function loadWatermarkImage(file: File): Promise<Notice | null> {
  try {
    const added = await addImageFile(assets, file, { maxSide: PHOTO_MAX_SIDE });
    setWatermark({ image: added.ref, mode: 'image' });
    return added.persisted ? null : { title: S.photoNotSaved, tone: 'warning' };
  } catch {
    return { title: S.photoFailed, description: S.readError(file.name), tone: 'danger' };
  }
}
