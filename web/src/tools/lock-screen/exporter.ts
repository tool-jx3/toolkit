/**
 * 匯出（規格 3.4、3.5）：手機畫面 PNG（1080 × 2340）、完整構圖 PNG（1200 × 1200）、手機畫面 GIF（寬 540／720／1080）、
 * 完整構圖 GIF（1200 × 1200）。先等字型載好再排版；GIF 依影格表逐格畫，交給共用的 GIF 編碼器（Web Worker）。
 */
import { createEncoder, type GifDither } from '@/core/encode';
import { ensureFonts } from '@/core/fonts';
import { canvasToBlob, makeCanvas } from '@/core/image';
import type { ExportOutput } from '@/ui';
import {
  type ExportFormat,
  type ExportTarget,
  exportFileName,
  FULL_OUT,
  type GifWidth,
  gifFrames,
  type LockScreenState,
  SCREEN_OUT,
  screenHeightFor,
} from './model';
import {
  type AnyCanvas,
  buildBlurred,
  buildOuter,
  buildPhoneFrame,
  buildWallpaper,
  type Ctx,
  drawComposition,
  drawScreen,
  fontLoads,
  layoutCards,
} from './render';
import { S } from './strings';

export interface ExportJob {
  target: ExportTarget;
  format: ExportFormat;
  gifWidth: GifWidth;
  /** GIF 的播放次數（0＝無限循環） */
  plays: number;
}

export interface ExportImages {
  wallpaper: CanvasImageSource | null;
  outer: CanvasImageSource | null;
}

/**
 * GIF 的抖色（D7）：只擴散亮度、誤差有上限（共用編碼器的 'luma'，做法參考原作）；第 2 格起只寫變化的範圍（cropFrames）。
 * 比較見規格 5. D7：同樣的 25 格，Floyd–Steinberg 會在漸層裡冒出別的色相的雜點、檔案也比較大。
 */
export const GIF_DITHER: GifDither = 'luma';

const ctx2d = (c: AnyCanvas): Ctx => {
  const ctx = c.getContext('2d', { willReadFrequently: true }) as Ctx | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

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

/** 輸出的大小 */
export function outputSize(job: Pick<ExportJob, 'target' | 'format' | 'gifWidth'>): {
  width: number;
  height: number;
} {
  if (job.target === 'full') return { width: FULL_OUT, height: FULL_OUT };
  if (job.format === 'gif') return { width: job.gifWidth, height: screenHeightFor(job.gifWidth) };
  return { ...SCREEN_OUT };
}

/** 準備畫圖：字型、卡片排版、桌布與外框的快取；回傳「畫某個時間」的函式與輸出畫布 */
async function prepare(s: LockScreenState, images: ExportImages, job: ExportJob) {
  await ensureFonts(fontLoads(s));
  const cards = layoutCards(s);
  const wallpaper = buildWallpaper(images.wallpaper, s.wallpaper.image, s.wallpaper);
  const layers = { wallpaper, blurred: buildBlurred(wallpaper, s.blur) };
  const size = outputSize(job);
  if (job.target === 'screen') {
    const out = makeCanvas(size.width, size.height);
    const ctx = ctx2d(out);
    return {
      out,
      ctx,
      render: (t: number) => drawScreen(ctx, size.width, size.height, s, layers, cards, t),
    };
  }
  /* 完整構圖：手機畫面以 1080 寬畫好再縮進手機裡 */
  const screen = makeCanvas(SCREEN_OUT.width, SCREEN_OUT.height);
  const sctx = ctx2d(screen);
  const outer = buildOuter(images.outer, s.outer.image, s.outer);
  const frame = buildPhoneFrame(s.outer.side);
  const out = makeCanvas(size.width, size.height);
  const ctx = ctx2d(out);
  return {
    out,
    ctx,
    render: (t: number) => {
      drawScreen(sctx, SCREEN_OUT.width, SCREEN_OUT.height, s, layers, cards, t);
      drawComposition(ctx, outer, frame, screen, s.outer.side);
    },
  };
}

export async function runExport(
  s: LockScreenState,
  images: ExportImages,
  job: ExportJob,
  {
    signal,
    onProgress,
    now = new Date(),
  }: {
    signal: AbortSignal;
    onProgress: (ratio: number, label?: string) => void;
    now?: Date;
  },
): Promise<ExportOutput> {
  const p = await prepare(s, images, job);
  if (signal.aborted) throw aborted();
  const { width, height } = p.out;
  const fileName = exportFileName(job.target, job.format, now);
  if (job.format === 'png') {
    p.render(Number.POSITIVE_INFINITY);
    const blob = await canvasToBlob(p.out, 'image/png');
    return { blob, fileName, width, height };
  }
  const frames = gifFrames(s.messages.length, s.interval);
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
      /* 靜態畫面（全部的訊息都出現）在調色盤的統計裡算「影格數」那麼多格（D7、對等驗證 F52） */
      stillWeight: frames.length,
    },
  });
  const stop = () => enc.abort();
  signal.addEventListener('abort', stop);
  try {
    /*
     * 調色盤：共用編碼器統計「第一格整格＋每格變化的範圍」，一直在動的卡片那一帶算了二十幾次、桌布不動的地方只算一次，
     * 月亮這種不動的小區塊會分不到顏色（預設內容的 1080 寬就是這樣）。把靜態畫面加進統計補回來。
     */
    p.render(Number.POSITIVE_INFINITY);
    await abortable(enc.setStill(p.ctx.getImageData(0, 0, width, height).data), signal);
    for (let i = 0; i < frames.length; i++) {
      if (signal.aborted) throw aborted();
      p.render(frames[i].t);
      const px = p.ctx.getImageData(0, 0, width, height).data;
      await abortable(enc.addFrame(px, frames[i].ms), signal);
      onProgress(((i + 1) / frames.length) * 0.9, S.rendering(i + 1, frames.length));
    }
    if (signal.aborted) throw aborted();
    onProgress(0.92, S.encoding);
    const file = await abortable(enc.finish(), signal);
    if (signal.aborted) throw aborted();
    const totalMs = frames.reduce((a, f) => a + f.ms, 0);
    return {
      blob: new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: 'image/gif' }),
      fileName,
      width,
      height,
      frames: file.frames,
      storedFrames: file.storedFrames,
      duration: totalMs / 1000,
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
