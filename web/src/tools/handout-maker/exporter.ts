/**
 * 匯出（規格 3.7）：PNG（倍率 1／2／3，預設 2 倍；透明的地方保留透明）、清單裡全部（每張一個 PNG，可以打包成 ZIP）、
 * 複製到剪貼簿。先等字型與圖片載好再畫。
 */
import { loadAssetBitmaps } from '@/core/assets';
import { safeFileName, uniqueFileName } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import type { ExportBatchOutput, ExportOutput } from '@/ui';
import { loadFonts } from './fonts';
import { type Handout, handoutAssetIds, handoutName } from './model';
import { fontNeeds, renderHandout } from './render';
import { assets } from './store';
import { S } from './strings';

const aborted = () => new DOMException('已取消', 'AbortError');

/** 畫成 PNG */
export async function renderPng(
  h: Handout,
  scale: number,
): Promise<{ blob: Blob; width: number; height: number }> {
  await loadFonts(fontNeeds(h)).catch(() => false);
  const bitmaps = await loadAssetBitmaps(assets, handoutAssetIds(h));
  const { canvas } = renderHandout(h, {
    scale,
    image: h.image ? (bitmaps.get(h.image.id) ?? null) : null,
    bgImage: h.bg.image ? (bitmaps.get(h.bg.image.id) ?? null) : null,
  });
  const blob = await canvasToBlob(canvas, 'image/png');
  return { blob, width: canvas.width, height: canvas.height };
}

/** 一張的檔名主體（標題；沒有標題時「線索道具」） */
export const baseName = (h: Handout): string =>
  safeFileName(handoutName(h), { fallback: S.fileBase, maxLength: 60 });

/** 一張 */
export async function exportOne(h: Handout, scale: number): Promise<ExportOutput> {
  const r = await renderPng(h, scale);
  return { blob: r.blob, fileName: `${baseName(h)}.png`, width: r.width, height: r.height };
}

/** 清單裡全部：檔名前面加兩位數的序號（01_標題.png），重名時加 _2 */
export async function exportAll(
  list: readonly Handout[],
  scale: number,
  {
    signal,
    onProgress,
  }: { signal: AbortSignal; onProgress: (ratio: number, label?: string) => void },
): Promise<ExportBatchOutput> {
  const files: ExportOutput[] = [];
  const used = new Set<string>();
  const digits = Math.max(2, String(list.length).length);
  for (let i = 0; i < list.length; i++) {
    if (signal.aborted) throw aborted();
    onProgress(i / list.length, S.rendering(i + 1, list.length));
    const h = list[i];
    const r = await renderPng(h, scale);
    const name = uniqueFileName(`${String(i + 1).padStart(digits, '0')}_${baseName(h)}.png`, used);
    files.push({ blob: r.blob, fileName: name, width: r.width, height: r.height });
  }
  if (signal.aborted) throw aborted();
  onProgress(1);
  return { files, zipName: S.zipName };
}
