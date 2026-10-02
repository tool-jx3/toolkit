/**
 * 匯出（規格 3.1、3.2）：逐格畫出輸出尺寸的影格，相鄰相同的影格先合併（延遲相加後才四捨五入成整毫秒），
 * 再交給共用的編碼器（Worker）：
 * - WebP：每格比較無損與有損（品質 0.9）取較小者（主控裁定，共用編碼器的 pickSmaller）；
 * - APNG：8 位元 RGBA、每格只存與前一格不同的矩形。
 * 播放次數：循環播放＝無限（0），否則 1 次。
 */
import { createEncoder, type EncoderSpec } from '@/core/encode';
import { captionSpecOf, drawCaption } from './caption';
import { ensureCaptionFont } from './fonts';
import { exportFileName } from './model';
import { planOf, renderRuns, runDelayMs } from './render';
import { type ExportFormatId, type Settings, sizeOf } from './settings';

export interface TransitionExport {
  blob: Blob;
  fileName: string;
  format: ExportFormatId;
  width: number;
  height: number;
  /** 合併前的影格數 */
  frames: number;
  /** 合併後（檔案裡）的影格數 */
  storedFrames: number;
  /** 檔案的總長（毫秒，整數延遲的總和） */
  durationMs: number;
  /** 字型有沒有載入（false：用後備字型畫） */
  fontOk: boolean;
}

export interface ExportOptions {
  signal?: AbortSignal;
  /** ratio：0～1；done／total：處理到第幾格／共幾格（合併前） */
  onProgress?: (ratio: number, done: number, total: number) => void;
  /** 在 Worker 裡編碼（預設：環境支援就用） */
  worker?: boolean;
}

const abortError = () => new DOMException('已取消', 'AbortError');

export function encoderSpec(
  format: ExportFormatId,
  width: number,
  height: number,
  loop: boolean,
): EncoderSpec {
  const plays = loop ? 0 : 1;
  return format === 'webp'
    ? {
        format: 'webp',
        options: { width, height, fps: 1000, plays, quality: 0.9, pickSmaller: true },
      }
    : { format: 'apng', options: { width, height, fps: 1000, plays, quantize: false } };
}

export async function exportTransition(
  s: Settings,
  format: ExportFormatId,
  { signal, onProgress = () => {}, worker }: ExportOptions = {},
): Promise<TransitionExport> {
  if (signal?.aborted) throw abortError();
  const fontOk = await ensureCaptionFont(s.font, s.caption);
  if (signal?.aborted) throw abortError();
  const { width, height } = sizeOf(s.size);
  const plan = planOf(s, width, height, 1);
  const spec = captionSpecOf(s, width, height, 1);
  const caption = spec ? drawCaption(spec) : null;
  const total = plan.frames.length;
  onProgress(0, 0, total);
  const encoder = createEncoder(encoderSpec(format, width, height, s.loop), { worker });
  const onAbort = () => encoder.abort();
  signal?.addEventListener('abort', onAbort, { once: true });
  let stored = 0;
  let durationMs = 0;
  try {
    const runs = renderRuns(plan, caption, { fresh: true });
    for (;;) {
      if (signal?.aborted) throw abortError();
      const r = runs.next();
      if (r.done) break;
      const { run, rgba, done } = r.value;
      const ms = runDelayMs(run);
      await encoder.addFrame(rgba, ms);
      stored++;
      durationMs += ms;
      onProgress(done / total, done, total);
      /* 讓畫面有機會更新進度 */
      if (stored % 2 === 0) await new Promise((res) => setTimeout(res, 0));
    }
    if (signal?.aborted) throw abortError();
    const file = await encoder.finish();
    if (signal?.aborted) throw abortError();
    return {
      blob: new Blob([file.bytes], { type: file.mime }),
      fileName: exportFileName(s, format === 'webp' ? 'webp' : 'png'),
      format,
      width,
      height,
      frames: total,
      storedFrames: stored,
      durationMs,
      fontOk,
    };
  } catch (e) {
    encoder.abort();
    throw e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
