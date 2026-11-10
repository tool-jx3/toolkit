/**
 * 匯出（規格 3.7）：PNG（1 倍時一格 64 px；倍率 1／2／3）、這張／全部排成一張／全部各一張（可以打包成 ZIP）、
 * 白底或透明、複製到剪貼簿。名字的字型先載好再畫。
 */

import { safeFileName, uniqueFileName } from '@/core/files';
import { ensureFont } from '@/core/fonts';
import { canvasToBlob } from '@/core/image';
import type { ExportBatchOutput, ExportOutput } from '@/ui';
import type { VeinCanvas } from './model/types';
import { boxGeom, CANVAS_FONT, type Layers, paintBox, paintTiled, tileCanvases } from './render';
import { S } from './strings';

/** 1 倍時一格幾 px */
export const EXPORT_CELL = 64;
/** 全部排成一張時一列最多幾張（角色畫布的寬度） */
export const TILE_COLS = 4;

export interface ExportOptions {
  scale: number;
  layers: Layers;
  transparent: boolean;
}

const aborted = () => new DOMException('已取消', 'AbortError');

async function fonts(list: readonly VeinCanvas[]): Promise<void> {
  const text = `${list.map((c) => c.name).join('')}0123456789`;
  await ensureFont(CANVAS_FONT, 400, text).catch(() => false);
}

function newCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  return [c, ctx];
}

/** 一張畫布的 PNG */
export async function renderOne(
  c: VeinCanvas,
  o: ExportOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  await fonts([c]);
  const g = boxGeom(c.size, EXPORT_CELL * o.scale);
  const [cv, ctx] = newCanvas(g.width, g.height);
  paintBox(ctx, c, 0, 0, g, o.layers, !o.transparent);
  return { blob: await canvasToBlob(cv, 'image/png'), width: g.width, height: g.height };
}

/** 全部排成一張 */
export async function renderTiled(
  list: readonly VeinCanvas[],
  o: ExportOptions,
): Promise<{ blob: Blob; width: number; height: number }> {
  await fonts(list);
  const t = tileCanvases(
    list.map((c) => c.size),
    EXPORT_CELL * o.scale,
    Math.min(TILE_COLS, list.length),
  );
  const [cv, ctx] = newCanvas(t.width, t.height);
  paintTiled(ctx, list, t, o.layers, o.transparent ? null : '#ffffff', !o.transparent);
  return { blob: await canvasToBlob(cv, 'image/png'), width: t.width, height: t.height };
}

/** 輸出的尺寸（1 倍；ExportPanel 顯示用） */
export function exportSize(
  target: 'one' | 'tiled' | 'each',
  active: VeinCanvas,
  list: readonly VeinCanvas[],
): { width: number; height: number } {
  if (target === 'tiled') {
    const t = tileCanvases(
      list.map((c) => c.size),
      EXPORT_CELL,
      Math.min(TILE_COLS, list.length),
    );
    return { width: t.width, height: t.height };
  }
  const g = boxGeom(active.size, EXPORT_CELL);
  return { width: g.width, height: g.height };
}

export const baseName = (c: VeinCanvas): string =>
  `${S.exporting.fileBase}_${safeFileName(c.name, { fallback: S.canvas.prefixCharacter, maxLength: 40 })}`;

export async function exportOne(c: VeinCanvas, o: ExportOptions): Promise<ExportOutput> {
  const r = await renderOne(c, o);
  return { blob: r.blob, fileName: `${baseName(c)}.png`, width: r.width, height: r.height };
}

export async function exportTiled(
  list: readonly VeinCanvas[],
  o: ExportOptions,
): Promise<ExportOutput> {
  const r = await renderTiled(list, o);
  return { blob: r.blob, fileName: `${S.exporting.allName}.png`, width: r.width, height: r.height };
}

/** 全部各一張：檔名前面加兩位數的序號，重名時加 _2 */
export async function exportEach(
  list: readonly VeinCanvas[],
  o: ExportOptions,
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
    onProgress(i / list.length, S.exporting.rendering(i + 1, list.length));
    const c = list[i];
    const r = await renderOne(c, o);
    const name = uniqueFileName(`${String(i + 1).padStart(digits, '0')}_${baseName(c)}.png`, used);
    files.push({ blob: r.blob, fileName: name, width: r.width, height: r.height });
  }
  if (signal.aborted) throw aborted();
  onProgress(1);
  return { files, zipName: S.exporting.zipName };
}
