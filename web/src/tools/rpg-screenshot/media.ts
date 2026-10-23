/**
 * 圖片的載入（F01～F04、F13、F31）：選檔、拖放、貼上都走這裡——只用第一張圖片 → 放進資產庫（原檔）→ 解碼確認 → 換上。
 * 同一批檔案的問題整理成一則通知（不是圖片、讀不到、第二張以後沒有用、存不進瀏覽器）。
 * 範例圖是共用的示意場景（本站自己畫的 SVG）畫成 960 × 540 的 PNG。
 */
import { splitImageFiles } from '@/core/assets';
import { canvasToBlob, loadImage, makeCanvas } from '@/core/image';
import { STAGE_SCENE_SVG } from '@/ui';
import type { ImageRef } from './model';
import { assets, setBackground, setFace } from './store';
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
async function loadFiles(
  files: readonly File[],
  apply: (ref: ImageRef) => void,
  failedTitle: string,
  appliedTitle: (name: string) => string,
): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const notes: string[] = [];
  const { images, others } = await splitImageFiles(files);
  const first = images[0];
  for (const f of others) notes.push(S.notImage(f.name));
  const extra = images.slice(1);
  if (extra.length) notes.push(S.onlyFirst(extra.map((f) => f.name).join('」「')));
  if (!first) return { title: failedTitle, description: notes.join('；'), tone: 'danger' };
  const name = displayName(first);
  const r = await storeImage(first, name);
  if (!r.ok)
    return { title: failedTitle, description: [r.reason, ...notes].join('；'), tone: 'danger' };
  apply(r.ref);
  if (!r.persisted) notes.push(S.imageNotSaved);
  if (!notes.length) return null;
  return { title: appliedTitle(name), description: notes.join('；'), tone: 'warning' };
}

export const loadBackgroundFiles = (files: readonly File[]) =>
  loadFiles(files, setBackground, S.bgFailed, S.bgApplied);

export const loadFaceFiles = (files: readonly File[]) =>
  loadFiles(files, setFace, S.faceFailed, S.faceApplied);

/** 範例圖：示意場景畫成 960 × 540 的 PNG，當背景圖 */
export async function loadSampleBackground(): Promise<BatchNotice | null> {
  try {
    const svg = STAGE_SCENE_SVG.replace('<svg ', '<svg width="960" height="540" ');
    const bmp = await loadImage(new Blob([svg], { type: 'image/svg+xml' }));
    const c = makeCanvas(960, 540);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) throw new Error('canvas');
    ctx.drawImage(bmp, 0, 0, 960, 540);
    const blob = await canvasToBlob(c, 'image/png');
    const r = await storeImage(blob, S.sampleName);
    if (!r.ok) return { title: S.bgFailed, description: r.reason, tone: 'danger' };
    setBackground(r.ref);
    return r.persisted
      ? null
      : { title: S.bgApplied(S.sampleName), description: S.imageNotSaved, tone: 'warning' };
  } catch {
    return { title: S.bgFailed, description: S.sampleFailed, tone: 'danger' };
  }
}
