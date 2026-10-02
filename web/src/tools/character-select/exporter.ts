/**
 * 匯出（規格 3.7、3.8）：APNG、WebP、GIF 用共用的 exportAnimation（影格表＋Worker 編碼）；
 * MP4、AVI 用共用的 core/video（逐格畫、透明處鋪黑）；目前畫面存 PNG。
 */
import { fileNameWithExt } from '@/core/files';
import { ensureFont } from '@/core/fonts';
import { type AnimationSource, exportAnimation } from '@/core/timeline';
import { encodeAvi, encodeMp4 } from '@/core/video';
import { type ExportFormatId, exportDimensions, fileBase, type Settings } from './model';
import {
  framePlan,
  gifFramePlan,
  type PlannedFrame,
  timelineDuration,
  videoFramePlan,
} from './motion';
import { type RenderAssets, renderScene, renderToCanvas } from './render';
import { RENDER_TEXT, S } from './strings';

/** 影格數上限（寬 × 高的處理量另外確認） */
export const MAX_FRAMES = 20_000;
/** 超過這麼多像素（寬 × 高 × 影格數）先確認（規格 F131） */
export const CONFIRM_PIXELS = 260_000_000;

export const FORMAT_EXT: Record<ExportFormatId, string> = {
  apng: 'png',
  webp: 'webp',
  gif: 'gif',
  mp4: 'mp4',
  avi: 'avi',
};

export const isVideo = (f: ExportFormatId) => f === 'mp4' || f === 'avi';

/** 這個格式實際的影格表 */
export function planFor(s: Settings, format: ExportFormatId, fps: number): PlannedFrame[] {
  if (isVideo(format)) return videoFramePlan(s, fps);
  if (format === 'gif') return gifFramePlan(s, fps);
  return framePlan(s, fps);
}

/** 輸出尺寸（MP4 的寬高補成偶數） */
export function outputSize(s: Settings, format: ExportFormatId, scale: number) {
  const d = exportDimensions(s, scale);
  return format === 'mp4'
    ? { width: d.width + (d.width % 2), height: d.height + (d.height % 2) }
    : d;
}

/** 畫布上用到的字型（各元素的字重固定：650～950，規格 3.5） */
export async function ensureCanvasFonts(s: Settings): Promise<void> {
  const text = [
    s.text.title,
    s.text.subtitle,
    s.mainPanel.placeholder,
    ...s.characters.map((c) => c.name),
    ...s.players.labels,
    ...Object.values(RENDER_TEXT),
    '0123456789P·/+…',
  ].join('');
  await Promise.all([700, 800, 900].map((w) => ensureFont(s.font.family, w, text)));
}

export interface ExportRequest {
  settings: Settings;
  assets: RenderAssets;
  format: ExportFormatId;
  fps: number;
  scale: number;
  webpQuality: number;
  signal: AbortSignal;
  onProgress: (ratio: number, label?: string) => void;
}

export interface ExportedFile {
  blob: Blob;
  fileName: string;
  width: number;
  height: number;
  frames: number;
  storedFrames?: number;
  duration: number;
}

/** 檔名（共用的檔名清理；主標題空白時 character-select） */
export const fileNameOf = (s: Settings, ext: string, suffix = '') =>
  fileNameWithExt(`${fileBase(s)}${suffix}`, ext, { fallback: 'character-select' });

/** 匯出一個檔案 */
export async function exportFile(req: ExportRequest): Promise<ExportedFile> {
  const { settings: s, assets, format, fps, scale, signal, onProgress } = req;
  await ensureCanvasFonts(s);
  if (signal.aborted) throw new DOMException('已取消', 'AbortError');
  const plan = planFor(s, format, fps);
  const duration = timelineDuration(s) / 1000;
  const label = S.exp.formats[format].label;

  if (!isVideo(format)) {
    const source: AnimationSource = {
      width: s.canvas.width,
      height: s.canvas.height,
      duration,
      frames: plan.map((f) => ({ ms: f.delay, t: f.time })),
      render: (ctx, t) => {
        renderScene(ctx as CanvasRenderingContext2D, s, t, assets, { text: RENDER_TEXT });
      },
    };
    const r = await exportAnimation(source, {
      format: format as 'apng' | 'webp' | 'gif',
      fps,
      plays: s.animation.loop ? 0 : 1,
      scale,
      quantize: false,
      webpQuality: req.webpQuality,
      gifDither: 'floyd-steinberg',
      fileName: fileBase(s),
      maxFrames: MAX_FRAMES,
      signal,
      onProgress: (ratio, l) => {
        const m = /(\d+)／(\d+)/.exec(l);
        onProgress(
          ratio,
          m && l.startsWith('產生影格')
            ? S.exp.progressFrames(label, Number(m[1]), Number(m[2]))
            : l,
        );
      },
    });
    return {
      blob: r.blob,
      fileName: r.fileName,
      width: r.width,
      height: r.height,
      frames: r.frames,
      storedFrames: r.storedFrames,
      duration: r.duration,
    };
  }

  /* 影片：場景畫在透明畫布上，再貼到黑底（MP4 的寬高補成偶數，多出來的地方是黑色） */
  const dims = exportDimensions(s, scale);
  const out = outputSize(s, format, scale);
  const scene = document.createElement('canvas');
  scene.width = dims.width;
  scene.height = dims.height;
  const frame = document.createElement('canvas');
  frame.width = out.width;
  frame.height = out.height;
  const fctx = frame.getContext('2d', { alpha: false });
  if (!fctx) throw new Error('無法建立畫布');
  const renderFrame = (i: number) => {
    renderToCanvas(scene, s, plan[i].time, assets, { text: RENDER_TEXT });
    fctx.fillStyle = '#000000';
    fctx.fillRect(0, 0, out.width, out.height);
    fctx.drawImage(scene, 0, 0);
    return frame;
  };
  const options = {
    width: out.width,
    height: out.height,
    fps,
    frameCount: plan.length,
    renderFrame,
    signal,
    onProgress: (done: number, total: number) =>
      onProgress(done / total, S.exp.progressFrames(label, done, total)),
  };
  const blob = format === 'mp4' ? await encodeMp4(options) : await encodeAvi(options);
  return {
    blob,
    fileName: fileNameOf(s, FORMAT_EXT[format]),
    width: out.width,
    height: out.height,
    frames: plan.length,
    duration: plan.length / fps,
  };
}

/** 目前畫面的 PNG（不含參考線；尺寸依匯出比例，規格 F116） */
export async function snapshotPng(
  s: Settings,
  assets: RenderAssets,
  time: number,
  scale: number,
): Promise<{ blob: Blob; fileName: string }> {
  await ensureCanvasFonts(s);
  const d = exportDimensions(s, scale);
  const canvas = document.createElement('canvas');
  canvas.width = d.width;
  canvas.height = d.height;
  renderToCanvas(canvas, s, time, assets, { text: RENDER_TEXT });
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
  if (!blob) throw new Error('PNG 產生失敗');
  return { blob, fileName: fileNameOf(s, 'png', '-frame') };
}
