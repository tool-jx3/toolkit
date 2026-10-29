/**
 * 動作：放進中間的圖、匯出（目前的設定重畫成檔案）、複製圖片。
 */
import { addImageFile, assetFileInfo, ImageLoadError } from '@/core/assets';
import { copyImage, readAsBytes } from '@/core/files';
import { buildQr, exportFileName, renderQrBlob } from './render';
import { assets, docNow, type ExportFormat, edit, prefsNow } from './store';
import { S } from './strings';

/** 中間的圖的長邊上限（大圖縮小再存；匯出 4 倍時圖大約佔 1600 px） */
export const IMAGE_MAX_SIDE = 2048;

export interface Notice {
  title: string;
  description?: string;
  tone: 'success' | 'warning' | 'danger' | 'info';
}

/** 讀一張圖放到中間（第一張；讀不了時回傳錯誤的通知） */
export async function setImageFile(file: File): Promise<Notice | null> {
  try {
    const added = await addImageFile(assets, file, { maxSide: IMAGE_MAX_SIDE });
    edit((d) => {
      d.image = added.ref;
    });
    return added.persisted ? null : { title: S.imageNotSaved, tone: 'warning' };
  } catch (e) {
    const name = e instanceof ImageLoadError ? e.fileName : file.name;
    return { title: S.imageFailed(name), tone: 'danger' };
  }
}

export function removeImage(): void {
  edit((d) => {
    d.image = null;
  });
}

/** 匯出用的圖：解碼好的（畫在 canvas 上）與原檔（SVG 嵌入；沒有類型時看檔頭補上） */
async function exportImage(id: string | undefined) {
  if (!id) return { bitmap: null, blob: null };
  const [bitmap, raw] = await Promise.all([
    assets.bitmap(id).catch(() => undefined),
    assets.get(id).catch(() => undefined),
  ]);
  let blob = raw ?? null;
  if (blob && !blob.type) {
    const bytes = await readAsBytes(blob);
    blob = new Blob([bytes], { type: assetFileInfo(bytes).mime });
  }
  return { bitmap: bitmap ?? null, blob: bitmap ? blob : null };
}

/** 目前的設定匯出成檔案（format、scale 不給時用匯出設定） */
export async function exportCurrent(
  format: ExportFormat = prefsNow().format,
  scale: number = prefsNow().scale,
): Promise<{ blob: Blob; width: number; height: number; fileName: string }> {
  const d = docNow();
  const image = await exportImage(d.image?.id);
  const dims = d.image && image.bitmap ? { width: d.image.width, height: d.image.height } : null;
  const built = buildQr(d, dims);
  if (!built.ok) throw new Error(built.message);
  const out = await renderQrBlob(built.scene, format, scale, image);
  return { ...out, fileName: exportFileName(prefsNow().fileName, format) };
}

/** 以 PNG 複製到剪貼簿（Safari 要在點擊當下呼叫 clipboard.write，所以傳 Promise） */
export async function copyCurrent(): Promise<Notice> {
  const r = await copyImage(exportCurrent('png').then((o) => o.blob));
  return r.ok ? { title: S.copied, tone: 'success' } : { title: S.copyFailed, tone: 'warning' };
}
