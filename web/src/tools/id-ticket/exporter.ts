/**
 * 匯出（規格 3.4、3.5）：
 * - 證件：卡片（54 × 86 mm）／印刷（含出血 58 × 90 mm）的 600 dpi PNG（寫入 pHYs）；目前這一面、正反面各一張、正反面排在一張；
 * - 票券：PNG（1～3 倍，有沒有墊紙）、GIF（48 格 × 70 ms，浮起＋閃光，長邊 1400／1000／700）。
 * 先等字型載好再畫；GIF 交給共用的編碼器（Web Worker）。
 */
import { createEncoder, type GifDither, setPngDpi } from '@/core/encode';
import { canvasToBlob, makeCanvas } from '@/core/image';
import type { ExportBatchOutput, ExportOutput } from '@/ui';
import { ensureAll } from './fonts';
import {
  CARD_DPI,
  EXPORT_SCALE,
  facePixels,
  type IdExportMode,
  type IdFaces,
  type IdTicketState,
  idFileName,
  type Side,
  sheetGapPx,
  ticketFileName,
} from './model';
import {
  type AnyCanvas,
  composeTicket,
  drawGifFrame,
  GIF_DELAY_MS,
  GIF_FRAMES,
  gifScale,
  idFontUses,
  MAT_PAD,
  renderIdFace,
  renderTicketLayer,
  ticketFontUses,
  ticketStageSize,
} from './render';
import { S } from './strings';
import { idTemplate } from './templates';

const aborted = () => new DOMException('已取消', 'AbortError');

/** 取消時立刻結束等待（編碼器的 Worker 被結束後，還在等的呼叫不會自己結束） */
function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(aborted());
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** 畫布 → 寫入 dpi 的 PNG */
export async function pngWithDpi(canvas: AnyCanvas, dpi: number): Promise<Blob> {
  const blob = await canvasToBlob(canvas, 'image/png');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return new Blob([setPngDpi(bytes, dpi)], { type: 'image/png' });
}

/* ---------- 證件 ---------- */

export interface IdJob {
  mode: IdExportMode;
  faces: IdFaces;
  /** 「目前這一面」用的面 */
  side: Side;
}

/** 輸出的像素（一面或排在一張） */
export function idOutputSize(s: IdTicketState, job: Pick<IdJob, 'mode' | 'faces'>) {
  const one = facePixels(idTemplate(s.idTemplate).orientation, job.mode);
  if (job.faces !== 'sheet') return one;
  return { width: one.width * 2 + sheetGapPx(), height: one.height };
}

function idFace(s: IdTicketState, side: Side, mode: IdExportMode, photo: CanvasImageSource | null) {
  const size = facePixels(idTemplate(s.idTemplate).orientation, mode);
  return renderIdFace(s, side, EXPORT_SCALE, mode, { preview: false, photo }, size).canvas;
}

export async function exportId(
  s: IdTicketState,
  photo: CanvasImageSource | null,
  job: IdJob,
  { signal, onProgress }: { signal: AbortSignal; onProgress: (r: number, label?: string) => void },
): Promise<ExportOutput | ExportBatchOutput> {
  await ensureAll(idFontUses(s));
  if (signal.aborted) throw aborted();
  const tpl = idTemplate(s.idTemplate);
  const dpiRow = [{ label: S.dpiDetail, value: S.dpiValue(CARD_DPI) }];
  const one = async (side: Side): Promise<ExportOutput> => {
    const c = idFace(s, side, job.mode, photo);
    return {
      blob: await pngWithDpi(c, CARD_DPI),
      fileName: idFileName(tpl.id, side, job.mode),
      width: c.width,
      height: c.height,
      details: dpiRow,
    };
  };
  if (job.faces === 'current') return one(job.side);
  if (job.faces === 'both') {
    const front = await one('front');
    onProgress(0.5);
    if (signal.aborted) throw aborted();
    const back = await one('back');
    return { files: [front, back], zipName: `${S.zipName}-${tpl.name}`, details: dpiRow };
  }
  const f = idFace(s, 'front', job.mode, photo);
  onProgress(0.4);
  const b = idFace(s, 'back', job.mode, photo);
  onProgress(0.7);
  const gap = sheetGapPx();
  const sheet = makeCanvas(f.width + gap + b.width, Math.max(f.height, b.height));
  const ctx = sheet.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) throw new Error('無法建立畫布');
  if (job.mode === 'print') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sheet.width, sheet.height);
  }
  ctx.drawImage(f, 0, 0);
  ctx.drawImage(b, f.width + gap, 0);
  return {
    blob: await pngWithDpi(sheet, CARD_DPI),
    fileName: idFileName(tpl.id, 'sheet', job.mode),
    width: sheet.width,
    height: sheet.height,
    details: dpiRow,
  };
}

/* ---------- 票券 ---------- */

/** GIF 的抖色：只擴散亮度的誤差（共用編碼器的 'luma'；墊紙與票的淡色漸層不會冒出別的色相的雜點） */
export const GIF_DITHER: GifDither = 'luma';

export interface TicketJob {
  format: 'png' | 'gif';
  pngScale: number;
  mat: boolean;
  gifLong: number;
  /** GIF 的播放次數（0＝無限） */
  plays: number;
}

export function ticketOutputSize(
  s: IdTicketState,
  job: Pick<TicketJob, 'format' | 'pngScale' | 'mat' | 'gifLong'>,
) {
  if (job.format === 'png') {
    const st = ticketStageSize(s, job.mat);
    const k = job.pngScale;
    const pad = job.mat ? Math.round(MAT_PAD * k) * 2 : 0;
    const t = ticketStageSize(s, false);
    return {
      width: Math.round(t.width * k) + pad,
      height: Math.round(t.height * k) + pad,
      stage: st,
    };
  }
  const scale = gifScale(s, job.gifLong);
  const t = ticketStageSize(s, false);
  const pad = Math.round(MAT_PAD * scale) * 2;
  return { width: Math.round(t.width * scale) + pad, height: Math.round(t.height * scale) + pad };
}

export async function exportTicket(
  s: IdTicketState,
  photo: CanvasImageSource | null,
  job: TicketJob,
  { signal, onProgress }: { signal: AbortSignal; onProgress: (r: number, label?: string) => void },
): Promise<ExportOutput> {
  await ensureAll(ticketFontUses(s));
  if (signal.aborted) throw aborted();
  const tplId = s.ticketTemplate;
  if (job.format === 'png') {
    const layer = renderTicketLayer(s, job.pngScale, { preview: false, photo }).canvas;
    const out = composeTicket(s, layer, job.pngScale, job.mat);
    return {
      blob: await canvasToBlob(out, 'image/png'),
      fileName: ticketFileName(tplId, 'png'),
      width: out.width,
      height: out.height,
    };
  }
  const scale = gifScale(s, job.gifLong);
  const layer = renderTicketLayer(s, scale, { preview: false, photo }).canvas;
  const pad = Math.round(MAT_PAD * scale);
  const width = layer.width + pad * 2;
  const height = layer.height + pad * 2;
  const frame = makeCanvas(width, height);
  const fctx = frame.getContext('2d', {
    willReadFrequently: true,
  }) as CanvasRenderingContext2D | null;
  if (!fctx) throw new Error('無法建立畫布');
  const shine = makeCanvas(layer.width, layer.height);
  const enc = createEncoder({
    format: 'gif',
    options: {
      width,
      height,
      fps: 1000,
      variableDelay: true,
      plays: job.plays,
      dither: GIF_DITHER,
      cropFrames: true,
    },
  });
  const stop = () => enc.abort();
  signal.addEventListener('abort', stop);
  try {
    for (let i = 0; i < GIF_FRAMES; i++) {
      if (signal.aborted) throw aborted();
      drawGifFrame(fctx, width, height, s, layer, shine, scale, i);
      const px = fctx.getImageData(0, 0, width, height).data;
      await abortable(enc.addFrame(px, GIF_DELAY_MS), signal);
      onProgress(((i + 1) / GIF_FRAMES) * 0.9, S.rendering(i + 1, GIF_FRAMES));
    }
    onProgress(0.92, S.encoding);
    const file = await abortable(enc.finish(), signal);
    if (signal.aborted) throw aborted();
    return {
      blob: new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: 'image/gif' }),
      fileName: ticketFileName(tplId, 'gif'),
      width,
      height,
      frames: file.frames,
      storedFrames: file.storedFrames,
      duration: (GIF_FRAMES * GIF_DELAY_MS) / 1000,
      details: file.colors
        ? [
            {
              label: S.colorsDetail,
              value: file.colors.lossless
                ? S.lossless(file.colors.count)
                : S.colorCount(file.colors.count),
            },
          ]
        : undefined,
    };
  } catch (e) {
    enc.abort();
    throw e;
  } finally {
    signal.removeEventListener('abort', stop);
  }
}
