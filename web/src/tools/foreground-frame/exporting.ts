/**
 * 匯出（F74～F77、規格 3.12）：檔名、單張 PNG、所有差分的 ZIP（不壓縮）。
 * 輸出只有設計本身：不含預覽背景、範例風景、背景圖、格線、選取框。
 */
import { zipFiles } from '@/core/files';
import { canvasToBlob } from '@/core/image';
import type { FrameState, VariantItem } from './model';
import { type RenderEnv, render } from './render';
import { S } from './strings';

/** 檔名主體：Windows 不能用的字元換成底線、去頭尾空白；空白時用預設值 */
export function baseName(fileBase: string): string {
  return (
    String(fileBase ?? '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim() || S.export.defaultBase
  );
}

/**
 * 單張的檔名：沒開差分時「主體.png」；開了差分時「主體_序號_名稱.png」——序號是該差分在整個清單中的位置
 * （含不匯出的，從 1 開始）；名稱裡 Windows 不能用的字元與連續空白換成一個底線、去頭尾底線、最多 40 字；
 * 名稱變成空白時用「差分N」（第 7 節裁定）。
 */
export function exportName(state: FrameState, item: VariantItem | null): string {
  const base = baseName(state.fileBase);
  if (!item) return `${base}.png`;
  const n = state.variants.items.indexOf(item) + 1;
  const cleaned = String(item.name ?? '')
    .replace(/[\\/:*?"<>|\s]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const label = Array.from(cleaned).slice(0, 40).join('') || `差分${n}`;
  return `${base}_${n}_${label}.png`;
}

export const zipName = (state: FrameState): string => `${baseName(state.fileBase)}.zip`;

/** 畫整張輸出（輸出寬 × 高 px） */
export function renderFull(
  state: FrameState,
  env: RenderEnv,
  slotId: string | null,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = state.size.w;
  c.height = state.size.h;
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  render(ctx, state, env, slotId, c.width, c.height);
  return c;
}

export async function renderPng(
  state: FrameState,
  env: RenderEnv,
  slotId: string | null,
): Promise<Blob> {
  return canvasToBlob(renderFull(state, env, slotId), 'image/png');
}

/** 所有要匯出的差分，依清單順序各一張 PNG，打包成不壓縮的 ZIP（時間為匯出時間） */
export async function buildZip(
  state: FrameState,
  env: RenderEnv,
  now = new Date(),
): Promise<{ blob: Blob; count: number; names: string[] }> {
  const files: { name: string; data: Uint8Array }[] = [];
  for (const item of state.variants.items) {
    if (!item.on) continue;
    const png = await renderPng(state, env, item.id);
    files.push({ name: exportName(state, item), data: new Uint8Array(await png.arrayBuffer()) });
  }
  const bytes = zipFiles(files, { level: 0, mtime: now });
  return {
    blob: new Blob([bytes], { type: 'application/zip' }),
    count: files.length,
    names: files.map((f) => f.name),
  };
}
