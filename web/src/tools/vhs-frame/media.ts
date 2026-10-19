/**
 * 照片的載入（選檔、拖放、貼上都走這裡；F01～F04）：只用第一張圖片 → 放進資產庫（原檔）→ 解碼確認 → 換上照片（位置回到初始）。
 * 同一批檔案的問題整理成一則通知（不是圖片、讀不到、第二張以後沒有用、存不進瀏覽器）。
 */
import { splitImageFiles } from '@/core/assets';
import { assets, setPhoto } from './store';
import { S } from './strings';

/** 一則通知的內容 */
export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/** 讀一張圖放進資產庫並解碼；失敗時回傳原因 */
async function storeImage(
  file: File,
): Promise<
  { ok: true; id: string; bitmap: ImageBitmap; persisted: boolean } | { ok: false; reason: string }
> {
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
    bitmap = undefined;
  }
  if (!bitmap?.width || !bitmap.height) {
    await assets.remove(added.id).catch(() => undefined);
    return { ok: false, reason: S.decodeError(file.name) };
  }
  return { ok: true, id: added.id, bitmap, persisted: added.persisted };
}

/** 選檔、拖放、貼上：用第一張圖片換上照片；回傳要顯示的通知（沒有要說的時 null） */
export async function loadPhotoFiles(files: readonly File[]): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const notes: string[] = [];
  const { images, others } = await splitImageFiles(files);
  const first = images[0];
  for (const f of others) notes.push(S.notImage(f.name));
  const extra = images.slice(1);
  if (extra.length) notes.push(S.onlyFirst(extra.map((f) => f.name).join('」「')));
  if (!first) return { title: S.photoFailed, description: notes.join('；'), tone: 'danger' };
  const r = await storeImage(first);
  if (!r.ok)
    return { title: S.photoFailed, description: [r.reason, ...notes].join('；'), tone: 'danger' };
  setPhoto({ id: r.id, name: first.name, width: r.bitmap.width, height: r.bitmap.height });
  if (!r.persisted) notes.push(S.photoNotSaved);
  if (!notes.length) return null;
  return { title: S.photoApplied(first.name), description: notes.join('；'), tone: 'warning' };
}
