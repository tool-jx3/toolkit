/**
 * 匯出（規格 3.10、F56～F64）：PNG（全部顯示的那一格，倍率 1～3，最近鄰放大）、GIF／輕量 GIF／APNG／WebP（影格表照原作）。
 * 先等字型載好再畫；動畫逐格畫好交給共用的編碼器（Web Worker）。GIF 的延遲以 1/100 秒寫入（round(毫秒 ÷ 10)），
 * APNG、WebP 用同樣的 1/100 秒。
 */
import { createEncoder, type EncoderSpec } from '@/core/encode';
import { canvasToBlob, makeCanvas } from '@/core/image';
import type { ExportOutput } from '@/ui';
import { ensureFont, fontStack } from './fonts';
import {
  animScale,
  type ExportFormat,
  exportFileName,
  type FrameClocks,
  FULL_CLOCKS,
  frameTable,
  pageInfos,
  parsePages,
  type RpgState,
  type Size,
  screenSize,
  type TableFrame,
} from './model';
import { type AnyCanvas, buildBackground, buildFace, type Ctx, drawScene } from './render';
import { S } from './strings';
import { THEMES } from './themes';

/** WebP 的品質（有損） */
export const WEBP_QUALITY = 0.9;

export interface SceneImages {
  bg: AnyCanvas | null;
  face: AnyCanvas | null;
}

/** 原圖 → 像素化後的背景圖與頭像 */
export function buildImages(
  s: RpgState,
  bg: ImageBitmap | null | undefined,
  face: ImageBitmap | null | undefined,
): SceneImages {
  return {
    bg: bg && s.bg ? buildBackground(bg, s) : null,
    face: face && s.face ? buildFace(face, s) : null,
  };
}

const ctx2d = (c: AnyCanvas, willRead = false): Ctx => {
  const ctx = c.getContext('2d', willRead ? { willReadFrequently: true } : undefined) as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

/** 畫一格到 W × H 的畫布 */
export function renderFrame(
  out: AnyCanvas,
  s: RpgState,
  page: number,
  images: SceneImages,
  clocks: FrameClocks,
  noScanline = false,
): void {
  const { width, height } = screenSize(s.ratio);
  if (out.width !== width || out.height !== height) {
    out.width = width;
    out.height = height;
  }
  drawScene(ctx2d(out), {
    state: s,
    page,
    bg: images.bg,
    face: images.face,
    font: fontStack(s.font),
    clocks,
    noScanline,
  });
}

/** 放大／縮小成 width × height（放大最近鄰；縮小平滑、高品質） */
export function scaleCanvas(src: AnyCanvas, size: Size, into?: AnyCanvas): AnyCanvas {
  if (src.width === size.width && src.height === size.height && !into) return src;
  const c = into ?? makeCanvas(size.width, size.height);
  const g = ctx2d(c, !!into);
  const shrink = size.width < src.width;
  g.clearRect(0, 0, size.width, size.height);
  g.imageSmoothingEnabled = shrink;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, size.width, size.height);
  return c;
}

/** PNG 的畫面（全部顯示，倍率 1～3） */
export async function pngBlob(
  s: RpgState,
  page: number,
  images: SceneImages,
  scale: number,
): Promise<Blob> {
  await ensureFont(s.font);
  const { width, height } = screenSize(s.ratio);
  const base = makeCanvas(width, height);
  renderFrame(base, s, page, images, FULL_CLOCKS);
  const k = Math.max(1, Math.min(3, Math.round(scale) || 1));
  const out = scaleCanvas(base, { width: width * k, height: height * k });
  return canvasToBlob(out, 'image/png');
}

/** 動畫的影格表（輕量：寬最多 560；包含所有頁或只有目前這一頁） */
export function animationTable(
  s: RpgState,
  page: number,
  o: { light: boolean; allPages: boolean },
): TableFrame[] {
  const infos = pageInfos(s, THEMES[s.theme].accent);
  const n = parsePages(s.dialogue, s.speaker).length;
  const cur = Math.max(0, Math.min(n - 1, page));
  const list = o.allPages ? [...Array(n).keys()] : [cur];
  return frameTable(infos, list, {
    light: o.light,
    typeSpeed: s.typeSpeed,
    popupWhen: s.popupWhen,
    location: s.location.trim() !== '',
  });
}

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

export interface ExportJob {
  format: ExportFormat;
  scale: number;
  allPages: boolean;
  plays: number;
  page: number;
}

function encoderSpec(format: Exclude<ExportFormat, 'png'>, size: Size, plays: number): EncoderSpec {
  const base = { width: size.width, height: size.height, fps: 100, plays };
  if (format === 'apng') return { format: 'apng', options: base };
  if (format === 'webp') return { format: 'webp', options: { ...base, quality: WEBP_QUALITY } };
  return { format: 'gif', options: { ...base, variableDelay: true, dither: 'none' } };
}

/** 延遲（毫秒 → 1/100 秒，同 gif.js 的 round(毫秒 ÷ 10)） */
export const delayCs = (ms: number): number => Math.round(ms / 10);

export async function runExport(
  s: RpgState,
  images: SceneImages,
  job: ExportJob,
  {
    signal,
    onProgress,
  }: { signal: AbortSignal; onProgress: (ratio: number, label?: string) => void },
): Promise<ExportOutput> {
  if (!images.bg) throw new Error(S.needBackground);
  await ensureFont(s.font);
  if (signal.aborted) throw aborted();
  const now = new Date();
  const fileName = exportFileName(job.format, now);
  const screen = screenSize(s.ratio);
  if (job.format === 'png') {
    const blob = await pngBlob(s, job.page, images, job.scale);
    const k = Math.max(1, Math.min(3, Math.round(job.scale) || 1));
    return { blob, fileName, width: screen.width * k, height: screen.height * k };
  }
  const light = job.format === 'gif-light';
  const sc = animScale(screen.width, job.scale, light);
  const size = { width: Math.round(screen.width * sc), height: Math.round(screen.height * sc) };
  const table = animationTable(s, job.page, { light, allPages: job.allPages });
  const base = makeCanvas(screen.width, screen.height);
  const scaled = sc !== 1 ? makeCanvas(size.width, size.height) : null;
  const enc = createEncoder(encoderSpec(job.format, size, job.plays));
  const stop = () => enc.abort();
  signal.addEventListener('abort', stop);
  try {
    let total = 0;
    for (let i = 0; i < table.length; i++) {
      if (signal.aborted) throw aborted();
      const f = table[i];
      renderFrame(base, s, f.page, images, f.clocks, light);
      const src = scaled ? scaleCanvas(base, size, scaled) : base;
      const px = ctx2d(src, true).getImageData(0, 0, size.width, size.height).data;
      const cs = delayCs(f.delay);
      total += cs;
      await abortable(enc.addFrame(px, cs), signal);
      onProgress(((i + 1) / table.length) * 0.6, S.rendering(i + 1, table.length));
    }
    if (signal.aborted) throw aborted();
    onProgress(0.62, S.encoding);
    const file = await abortable(enc.finish(), signal);
    if (signal.aborted) throw aborted();
    return {
      blob: new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.mime }),
      fileName,
      width: size.width,
      height: size.height,
      frames: file.frames,
      storedFrames: file.storedFrames,
      duration: total / 100,
      details: [
        { label: S.tableDetail, value: S.tableValue(table.length) },
        ...(file.colors
          ? [
              {
                label: S.colorsDetail,
                value: file.colors.lossless
                  ? S.lossless(file.colors.count)
                  : S.colorCount(file.colors.count),
              },
            ]
          : []),
      ],
    };
  } catch (e) {
    enc.abort();
    throw e;
  } finally {
    signal.removeEventListener('abort', stop);
  }
}
