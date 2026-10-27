/**
 * 匯出（規格 F37～F39、3.8、3.9）：單張 PNG、ZIP 一次全部（文字冒險另含 TyranoScript 程式碼與補充樣式、說明）、預覽畫面的截圖。
 */
import { zipFiles } from '@/core/files';
import { canvasToBlob, makeCanvas } from '@/core/image';
import { loadFont } from './fonts';
import { screenSize } from './layout';
import { type DocState, SYSTEM_LABELS } from './model';
import { type PartDef, partsOf, renderPart } from './parts';
import type { Ctx } from './render';
import { drawStage, type StageEnv } from './stage';
import { S } from './strings';
import { CHOICE_EXAMPLE_FILE, CSS_FILE, QUICK_PASTE_FILE, tyranoCode } from './tyrano';

/** 素材上會畫到的字（先載入字型） */
export function assetText(doc: DocState): string {
  const t = doc.texts;
  const labels = Object.values(SYSTEM_LABELS[doc.design.buttonLang]).join('');
  if (doc.mode === 'novel') return labels;
  return t.bake ? [t.portraitName, t.status1, t.status2, t.status3, t.dice, t.board].join('') : '';
}

export async function ensureAssetFonts(doc: DocState): Promise<boolean> {
  return loadFont(doc.design.font, assetText(doc) || 'Aa');
}

export async function partPng(doc: DocState, part: PartDef): Promise<Blob> {
  return canvasToBlob(renderPart(part, doc.resolution, makeCanvas));
}

export const READ_ME_FILE = '說明.txt';

/** ZIP 的檔名：UI框素材_文字冒險_1280x720.zip */
export function zipName(doc: DocState): string {
  const { width, height } = screenSize(doc.resolution);
  return `${S.zipPrefix}_${S.modes[doc.mode]}_${width}x${height}.zip`;
}

export function readMe(doc: DocState, presetName: string, count: number): string {
  const { width, height } = screenSize(doc.resolution);
  const lines = [
    S.readMe.title,
    S.readMe.meta(presetName, width, height, count),
    '',
    ...(doc.mode === 'novel' ? S.readMe.novel : S.readMe.trpg),
    '',
  ];
  return lines.join('\r\n');
}

export interface ZipResult {
  fileName: string;
  bytes: Uint8Array;
  /** ZIP 裡的所有檔案（路徑） */
  files: string[];
  pngCount: number;
}

export async function buildZip(
  doc: DocState,
  presetName: string,
  onProgress?: (done: number, total: number) => void,
): Promise<ZipResult> {
  await ensureAssetFonts(doc);
  const parts = partsOf(doc);
  const entries: { name: string; data: Uint8Array | string; level?: 0 }[] = [];
  let done = 0;
  for (const p of parts) {
    const blob = await partPng(doc, p);
    entries.push({ name: p.file, data: new Uint8Array(await blob.arrayBuffer()), level: 0 });
    done++;
    onProgress?.(done, parts.length);
  }
  if (doc.mode === 'novel') {
    const code = tyranoCode(doc, presetName);
    entries.push({ name: QUICK_PASTE_FILE, data: code.quickPaste });
    entries.push({ name: CHOICE_EXAMPLE_FILE, data: code.choiceExample });
    entries.push({ name: CSS_FILE, data: code.css });
  }
  entries.push({ name: READ_ME_FILE, data: readMe(doc, presetName, parts.length) });
  const bytes = zipFiles(entries);
  return {
    fileName: zipName(doc),
    bytes,
    files: entries.map((e) => e.name),
    pngCount: parts.length,
  };
}

/** 預覽畫面的截圖（含背景與立繪、測試文字；不含滑過的狀態） */
export async function stageSnapshot(
  doc: DocState,
  env: Omit<StageEnv, 'hover' | 'pressed' | 'scale'>,
  text: string,
): Promise<Blob> {
  await loadFont(doc.design.font, text);
  const { width, height } = screenSize(doc.resolution);
  const c = makeCanvas(width, height);
  const ctx = c.getContext('2d') as Ctx;
  const scale = doc.resolution / 1920;
  ctx.scale(scale, scale);
  drawStage(ctx, doc, { ...env, hover: null, pressed: null, scale });
  return canvasToBlob(c);
}

export function snapshotName(doc: DocState, presetName: string): string {
  const { width, height } = screenSize(doc.resolution);
  return `${S.snapshotPrefix}_${presetName}_${width}x${height}.png`;
}
