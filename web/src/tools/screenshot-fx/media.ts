/**
 * 圖片的載入（F01～F04）：選檔、拖放、貼上都走這裡——只用第一張圖片 → 放進資產庫（原檔）→ 解碼確認 → 換上
 * （演出框與出處清空）。同一批檔案的問題整理成一則通知（不是圖片、讀不到、第二張以後沒有用、存不進瀏覽器）。
 * 範例圖、示範演出見 sample.ts。
 */
import { splitImageFiles } from '@/core/assets';
import { canvasToBlob } from '@/core/image';
import type { ImageRef } from './model';
import { demoFrames, drawSample } from './sample';
import { assets, setImage } from './store';
import { S } from './strings';

export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/** 讀一張圖放進資產庫並解碼；失敗時回傳原因 */
async function storeImage(
  file: Blob,
  name: string,
): Promise<{ ok: true; ref: ImageRef; persisted: boolean } | { ok: false; reason: string }> {
  let added: { id: string; persisted: boolean };
  try {
    added = await assets.add(file);
  } catch {
    return { ok: false, reason: S.readError(name) };
  }
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await assets.bitmap(added.id);
  } catch {
    bitmap = undefined;
  }
  if (!bitmap?.width || !bitmap.height) {
    await assets.remove(added.id).catch(() => undefined);
    return { ok: false, reason: S.decodeError(name) };
  }
  return {
    ok: true,
    ref: { id: added.id, name, width: bitmap.width, height: bitmap.height },
    persisted: added.persisted,
  };
}

/** 貼上的圖（瀏覽器給的檔名是空的或 image.png）的名稱 */
const displayName = (f: File) => (!f.name || f.name === 'image.png' ? S.pastedName : f.name);

/** 選檔、拖放、貼上：用第一張圖片；回傳要顯示的通知（沒有要說的時 null） */
export async function loadImageFiles(files: readonly File[]): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const notes: string[] = [];
  const { images, others } = await splitImageFiles(files);
  const first = images[0];
  for (const f of others) notes.push(S.notImage(f.name));
  const extra = images.slice(1);
  if (extra.length) notes.push(S.onlyFirst(extra.map((f) => f.name).join('」「')));
  if (!first) return { title: S.imageFailed, description: notes.join('；'), tone: 'danger' };
  const name = displayName(first);
  const r = await storeImage(first, name);
  if (!r.ok)
    return { title: S.imageFailed, description: [r.reason, ...notes].join('；'), tone: 'danger' };
  setImage(r.ref);
  if (!r.persisted) notes.push(S.imageNotSaved);
  if (!notes.length) return null;
  return { title: S.imageApplied(name), description: notes.join('；'), tone: 'warning' };
}

/** 範例圖（demo＝一起放示範演出的框與出處） */
export async function loadSample(demo: boolean): Promise<BatchNotice | null> {
  try {
    const { canvas, anchors } = await drawSample();
    const blob = await canvasToBlob(canvas, 'image/png');
    const r = await storeImage(blob, S.sampleName);
    if (!r.ok) return { title: S.imageFailed, description: r.reason, tone: 'danger' };
    setImage(r.ref, demo ? { frames: demoFrames(anchors), credit: S.demoCredit } : undefined);
    return r.persisted
      ? null
      : { title: S.imageApplied(S.sampleName), description: S.imageNotSaved, tone: 'warning' };
  } catch {
    return { title: S.imageFailed, description: S.sampleFailed, tone: 'danger' };
  }
}
