/**
 * 畫面與輸出：版型的場景＋貼紙畫到 canvas（預覽、PNG、存檔槽的預覽、PDF 共用），以及圖片的讀入（格式、大小、縮小）。
 */
import { canvasToBlob, loadImage, makeCanvas } from '@/core/image';
import { drawScene, drawSticker, loadSceneFonts, type SceneNode, type Size } from '@/core/scene';
import {
  type Draft,
  downscaleRatio,
  draftAssets,
  IMAGE_MAX_BYTES,
  IMAGE_MAX_PIXELS,
  imageTypeOk,
  type SceneEnv,
  type Sticker,
  type TemplateDef,
} from './model';
import { assets, measureContext } from './store';
import { S } from './strings';
import { SANS } from './templates/kit';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 場景用的環境：圖片格的圖（已讀進記憶體的）與量字寬的 context */
export function sceneEnv(d: Draft, noText = false): SceneEnv {
  return {
    image: (slot) => {
      const id = d.images[slot];
      return id ? (assets.peekBitmap(id) ?? null) : null;
    },
    measure: measureContext(),
    noText,
  };
}

/** 貼紙在畫布上的位置（含文字記錄看全部時的頁位移） */
export function stickerPlacement(def: TemplateDef, d: Draft, s: Sticker) {
  const o = def.stickerOffset?.(d, s) ?? { x: 0, y: 0 };
  return { cx: s.cx + o.x, cy: s.cy + o.y, width: s.width, height: s.height, rotation: s.rotation };
}

/** 畫貼紙（後面的先畫：清單第一個在最上層） */
export function drawStickers(
  ctx: Ctx,
  def: TemplateDef,
  d: Draft,
  filter: (s: Sticker) => boolean = (s) => def.stickerVisible?.(d, s) ?? true,
  offset?: (s: Sticker) => { x: number; y: number },
): void {
  for (let i = d.stickers.length - 1; i >= 0; i--) {
    const s = d.stickers[i];
    if (!filter(s)) continue;
    const img = assets.peekBitmap(s.asset);
    if (!img) continue;
    const p = offset
      ? {
          cx: s.cx + offset(s).x,
          cy: s.cy + offset(s).y,
          width: s.width,
          height: s.height,
          rotation: s.rotation,
        }
      : stickerPlacement(def, d, s);
    drawSticker(ctx as CanvasRenderingContext2D, p, img, s, SANS);
  }
}

/** 把整張畫到 ctx（預覽與輸出共用） */
export function paint(ctx: Ctx, def: TemplateDef, d: Draft, nodes: readonly SceneNode[]): void {
  drawScene(ctx, nodes);
  drawStickers(ctx, def, d);
}

/** 確認用到的圖片都讀進記憶體（輸出前） */
export async function ensureImages(d: Draft): Promise<{ missing: string[] }> {
  return assets.preload(draftAssets(d));
}

/** 輸出用：讀好圖與字型後畫成新的畫布（scale：倍率） */
export async function renderOutput(def: TemplateDef, d: Draft, scale = 1): Promise<AnyCanvas> {
  await ensureImages(d);
  let nodes = def.scene(d, sceneEnv(d));
  if (await loadSceneFonts(nodes)) nodes = def.scene(d, sceneEnv(d));
  const size: Size = def.size(d);
  const c = makeCanvas(
    Math.max(1, Math.round(size.width * scale)),
    Math.max(1, Math.round(size.height * scale)),
  );
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.scale(scale, scale);
  paint(ctx, def, d, nodes);
  return c;
}

/** 輸出 PNG */
export async function exportPng(def: TemplateDef, d: Draft): Promise<Blob> {
  return canvasToBlob(await renderOutput(def, d, 1), 'image/png');
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 檔名的時間：YYYYMMDD-HHMM */
export const stamp = (t = new Date()) =>
  `${t.getFullYear()}${pad(t.getMonth() + 1)}${pad(t.getDate())}-${pad(t.getHours())}${pad(t.getMinutes())}`;

/** 檔名：版型名稱（不能用的字換成 _）＋時間 */
export function outputName(def: TemplateDef, ext: string, t = new Date()): string {
  const safe = Array.from(def.name, (ch) =>
    ch.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(ch) ? '_' : ch,
  );
  const base = safe.join('').replace(/[. ]+$/, '') || 'pair-maker';
  return `${base}_${stamp(t)}.${ext}`;
}

/* ---------- 讀入圖片 ---------- */

export class ImageInputError extends Error {
  override name = 'ImageInputError';
}

/**
 * 讀一張圖片檔：只接受 PNG、JPEG、WebP；15 MB、4,000 萬像素以下；長邊大於 2,048 px 時等比縮小。
 * 回傳解碼後的圖（縮小過的是畫布）與要存進圖片庫的檔案（縮小過的存成 PNG，否則原檔）。
 */
export async function readImageFile(
  file: File,
): Promise<{ image: ImageBitmap | AnyCanvas; blob: Blob; width: number; height: number }> {
  if (!imageTypeOk(file.type)) throw new ImageInputError(S.imageType);
  if (file.size > IMAGE_MAX_BYTES) throw new ImageInputError(S.imageTooBig);
  let bmp: ImageBitmap;
  try {
    bmp = await loadImage(file);
  } catch {
    throw new ImageInputError(S.imageUnreadable);
  }
  if (bmp.width * bmp.height > IMAGE_MAX_PIXELS) {
    bmp.close?.();
    throw new ImageInputError(S.imageTooManyPixels);
  }
  const k = downscaleRatio(bmp.width, bmp.height);
  if (k >= 1) return { image: bmp, blob: file, width: bmp.width, height: bmp.height };
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d') as CanvasRenderingContext2D;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  return { image: c, blob: await canvasToBlob(c, 'image/png'), width: w, height: h };
}
