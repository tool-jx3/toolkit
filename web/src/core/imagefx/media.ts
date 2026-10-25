/**
 * 圖片的載入（選檔、拖放、貼上）與專案檔的讀入：
 * - 只用第一張圖片 → 放進資產庫（原檔）→ 解碼確認 → 換上（演出框與出處清空）。同一批檔案的問題整理成一則通知
 *   （不是圖片、讀不到、第二張以後沒有用、存不進瀏覽器）。
 * - 專案檔（共用專案檔格式的 ZIP：project.json＋files/<資產 id>.<副檔名>）：先整理內容，圖片要在 ZIP 裡
 *   （或這個瀏覽器已經有）而且能解碼，才換掉目前的內容。
 */
import { type AssetStore, importAssetFiles, splitImageFiles } from '@/core/assets';
import type { FrameBase, FxDoc, ImageRef } from './types';

export interface BatchNotice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/** 載入圖片用到的文字（工具的 strings.ts 提供） */
export interface FxMediaText {
  readError: (name: string) => string;
  decodeError: (name: string) => string;
  pastedName: string;
  notImage: (name: string) => string;
  onlyFirst: (names: string) => string;
  imageFailed: string;
  imageApplied: (name: string) => string;
  imageNotSaved: string;
  projectBad: string;
  projectMissingImage: string;
}

/** 讀一張圖放進資產庫並解碼；失敗時回傳原因 */
export async function storeImage(
  assets: AssetStore,
  file: Blob,
  name: string,
  text: FxMediaText,
): Promise<{ ok: true; ref: ImageRef; persisted: boolean } | { ok: false; reason: string }> {
  let added: { id: string; persisted: boolean };
  try {
    added = await assets.add(file);
  } catch {
    return { ok: false, reason: text.readError(name) };
  }
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await assets.bitmap(added.id);
  } catch {
    bitmap = undefined;
  }
  if (!bitmap?.width || !bitmap.height) {
    await assets.remove(added.id).catch(() => undefined);
    return { ok: false, reason: text.decodeError(name) };
  }
  return {
    ok: true,
    ref: { id: added.id, name, width: bitmap.width, height: bitmap.height },
    persisted: added.persisted,
  };
}

/** 選檔、拖放、貼上：用第一張圖片、換上；回傳要顯示的通知（沒有要說的時 null） */
export async function loadImageFiles(
  files: readonly File[],
  assets: AssetStore,
  apply: (ref: ImageRef) => void,
  text: FxMediaText,
): Promise<BatchNotice | null> {
  if (!files.length) return null;
  const notes: string[] = [];
  const { images, others } = await splitImageFiles(files);
  const first = images[0];
  for (const f of others) notes.push(text.notImage(f.name));
  const extra = images.slice(1);
  if (extra.length) notes.push(text.onlyFirst(extra.map((f) => f.name).join('」「')));
  if (!first) return { title: text.imageFailed, description: notes.join('；'), tone: 'danger' };
  /* 貼上的圖（瀏覽器給的檔名是空的或 image.png）的名稱 */
  const name = !first.name || first.name === 'image.png' ? text.pastedName : first.name;
  const r = await storeImage(assets, first, name, text);
  if (!r.ok)
    return {
      title: text.imageFailed,
      description: [r.reason, ...notes].join('；'),
      tone: 'danger',
    };
  apply(r.ref);
  if (!r.persisted) notes.push(text.imageNotSaved);
  if (!notes.length) return null;
  return { title: text.imageApplied(name), description: notes.join('；'), tone: 'warning' };
}

export class ProjectDataError extends Error {}

export interface ImportedProject<S> {
  state: S;
  /** 有圖存不進瀏覽器（這次可以用，重新整理之後就沒了） */
  notSaved: boolean;
}

/** 讀入專案檔的內容（整理後；缺圖時丟出 ProjectDataError） */
export async function importFxProject<F extends FrameBase, S extends FxDoc<F>>(
  data: unknown,
  files: Map<string, Uint8Array>,
  assets: AssetStore,
  normalize: (raw: unknown) => S,
  assetIds: (s: S) => string[],
  text: Pick<FxMediaText, 'projectBad' | 'projectMissingImage'>,
): Promise<ImportedProject<S>> {
  if (typeof data !== 'object' || data === null || Array.isArray(data))
    throw new ProjectDataError(text.projectBad);
  const next = normalize(data);
  const imported = await importAssetFiles(assets, files.entries());
  for (const id of [...new Set(assetIds(next))]) {
    const bmp = await assets.bitmap(id).catch(() => undefined);
    if (!bmp) throw new ProjectDataError(text.projectMissingImage);
  }
  return { state: next, notSaved: imported.notPersisted > 0 };
}
