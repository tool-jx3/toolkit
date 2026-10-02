/**
 * 匯出（規格 3.1、3.2）：
 * - APNG：N 格、每格延遲＝1000 ÷ fps 四捨五入成整毫秒、無限循環；色數 1～256 為整段共用調色盤，0＝無損。
 * - GIF：每格各自減色到 256 色（區域調色盤），延遲以 1/100 秒累計；沒有底色時透明只有一階，有底色時先合成。
 * - 減色一律用主成分切割（'pca'，同舊版的做法：名額依顏色的分散量分配，彩虹與半透明的線條也分得到顏色）。
 * - PNG：單張，畫 t＝0（第一格）；色數規則同 APNG。
 * 第 i 格畫的是 t＝i ÷ N，所以最後一格接回第一格是無縫的。預覽與匯出都套用依用途的自動調整（F09）。
 */
import {
  type AnimationSource,
  type ExportResult,
  exportAnimation,
  type FrameSpec,
} from '@/core/timeline';
import { apngDelayMs, type CutinFormat, type CutinSettings, fileBaseName } from './model';
import { buildScene, type CutinScene, loadFonts } from './scene';

export interface ExportProgress {
  /** draw：繪製影格；encode：編碼 */
  phase: 'draw' | 'encode';
  done: number;
  total: number;
}

/** APNG 的影格表：N 格、每格整毫秒（第 i 格從 i × 延遲 開始） */
export function apngFrames(frames: number, fps: number): FrameSpec[] {
  const ms = apngDelayMs(fps);
  return Array.from({ length: frames }, (_, i) => ({ ms, t: (i * ms) / 1000 }));
}

/** 匯出時第幾秒 → 循環進度（第 i 格＝i ÷ N）；secPerFrame 是一格的秒數 */
export function loopProgressAt(sec: number, secPerFrame: number, frames: number): number {
  const i = Math.round(sec / secPerFrame) % frames;
  return i / frames;
}

/** 匯出用的動畫來源（字型載好後才排版；render 的時間換成第幾格） */
export function exportSource(s: CutinSettings, format: CutinFormat): AnimationSource {
  let scene: CutinScene | null = null;
  const sceneNow = () => {
    scene ??= buildScene(s, { tuned: true });
    return scene;
  };
  const N = s.frames;
  const base = {
    width: s.width,
    height: s.height,
    loop: true,
    stillTime: 0,
    prepare: async () => {
      await loadFonts(s);
      scene = buildScene(s, { tuned: true });
    },
  };
  if (format === 'apng') {
    const frames = apngFrames(N, s.fps);
    const sec = apngDelayMs(s.fps) / 1000;
    return {
      ...base,
      duration: N * sec,
      frames,
      render: (ctx, t) => sceneNow().draw(ctx, loopProgressAt(t, sec, N)),
    };
  }
  return {
    ...base,
    duration: N / s.fps,
    render: (ctx, t) => sceneNow().draw(ctx, loopProgressAt(t, 1 / s.fps, N)),
  };
}

/** 測試用：下一次匯出故意失敗（模擬編碼失敗） */
let failNext: string | null = null;
export function failNextExport(message: string): void {
  failNext = message;
}

export async function runExport(
  s: CutinSettings,
  format: CutinFormat,
  onProgress: (p: ExportProgress) => void,
): Promise<ExportResult> {
  if (failNext) {
    const m = failNext;
    failNext = null;
    throw new Error(m);
  }
  const N = format === 'png' ? 1 : s.frames;
  onProgress({ phase: 'draw', done: 0, total: N });
  return exportAnimation(exportSource(s, format), {
    format,
    fps: s.fps,
    plays: 0,
    colors: format === 'gif' ? undefined : s.colors,
    paletteMethod: 'pca',
    gifLocalPalettes: true,
    matte: format === 'gif' ? s.gifMatte : null,
    fileName: fileBaseName(s),
    onProgress: (_ratio, label) => {
      const m = /(\d+)／(\d+)/.exec(label);
      if (m) onProgress({ phase: 'draw', done: Number(m[1]), total: Number(m[2]) });
      else if (/編碼|封裝/.test(label)) onProgress({ phase: 'encode', done: N, total: N });
    },
  });
}
