/**
 * 畫 QR code：目前的設定 → 編碼 → 場景（core/qr），預覽與匯出（PNG、JPEG、WebP、SVG）共用。
 */
import { fileNameWithExt, readAsDataUrl } from '@/core/files';
import { canvasToBlob, makeCanvas } from '@/core/image';
import {
  buildQrScene,
  drawQrScene,
  encodeQr,
  type QrCode,
  type QrEncodeError,
  type QrScene,
  qrSceneToSvg,
} from '@/core/qr';
import { type DocState, toStyle } from './model';
import type { ExportFormat } from './store';
import { S } from './strings';

export type QrBuild =
  | { ok: true; code: QrCode; scene: QrScene }
  | { ok: false; message: string; error: QrEncodeError | { kind: 'too-small'; count: number } };

/** 設定 → 場景；image＝中間的圖的原始大小（沒有圖或讀不到時 null） */
export function buildQr(d: DocState, image: { width: number; height: number } | null): QrBuild {
  const r = encodeQr(d.data, { version: d.qr.version, ecl: d.qr.ecl, mode: d.qr.mode });
  if (!r.ok) return { ok: false, message: encodeMessage(r.error, d), error: r.error };
  const s = buildQrScene(r.code, r.code.ecl, toStyle(d, image));
  if (!s.ok)
    return {
      ok: false,
      message: S.errTooSmall(r.code.size),
      error: { kind: 'too-small', count: r.code.size },
    };
  return { ok: true, code: r.code, scene: s.scene };
}

function encodeMessage(e: QrEncodeError, d: DocState): string {
  switch (e.kind) {
    case 'empty':
      return S.errEmpty;
    case 'mode':
      return S.errMode(e.mode, e.char);
    case 'too-long':
      return S.errTooLong(d.qr.ecl);
    case 'version':
      return S.errVersion(d.qr.version, e.min);
  }
}

const MIME: Record<ExportFormat, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  svg: 'image/svg+xml',
};
const EXT: Record<ExportFormat, string> = { png: 'png', jpeg: 'jpg', webp: 'webp', svg: 'svg' };

export const exportFileName = (base: string, format: ExportFormat): string =>
  fileNameWithExt(base.trim() || 'qr', EXT[format], { fallback: 'qr' });

export interface ExportImage {
  /** 畫在 canvas 上用 */
  bitmap: ImageBitmap | null;
  /** SVG 用（原檔） */
  blob: Blob | null;
}

/**
 * 匯出一張：PNG、JPEG、WebP 以倍率重畫（同預覽的畫法；JPEG 透明的地方鋪白），SVG 寫成向量（寬高乘上倍率）。
 * 品質照原作（canvas 的 quality 1）。
 */
export async function renderQrBlob(
  scene: QrScene,
  format: ExportFormat,
  scale: number,
  image: ExportImage,
): Promise<{ blob: Blob; width: number; height: number }> {
  const width = Math.round(scene.width * scale);
  const height = Math.round(scene.height * scale);
  if (format === 'svg') {
    const href = scene.image && image.blob ? await readAsDataUrl(image.blob) : undefined;
    const text = qrSceneToSvg(scene, { imageHref: href, scale });
    return { blob: new Blob([text], { type: MIME.svg }), width, height };
  }
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error(S.exportFailed);
  drawQrScene(ctx, scene, {
    image: image.bitmap ?? undefined,
    scale,
    matte: format === 'jpeg' ? '#ffffff' : undefined,
  });
  const blob = await canvasToBlob(canvas, MIME[format], format === 'png' ? undefined : 1);
  return { blob, width, height };
}
