/**
 * 匯出：場景 → AnimationSource → core/timeline 的 exportAnimation。
 * 縮放匯出時用「等比放大的設定」重新排版（不是把 1× 的畫面點陣放大）。
 */
import {
  type AnimationExportFormat,
  type AnimationSource,
  type Ctx2D,
  type ExportResult,
  exportAnimation,
  type TimelineSegment,
} from '@/core/timeline';
import type { ExportOutput } from '@/ui';
import { loadFonts } from './fonts';
import { buildScene, type Scene, sceneFontLoads } from './scene';
import { deepClone, hasText, playsOf, type Settings } from './settings';
import { S } from './strings';

export const MAX_FRAMES = 1800;

const PHASE_COLOR = { intro: 'var(--accent)', hold: 'var(--success)', outro: 'var(--warning)' };

/** 時間軸的階段（給 Transport） */
export function sceneSegments(scene: Scene): TimelineSegment[] {
  const multi = scene.pages.length > 1;
  return scene.phases
    .map((ph) => ({
      id: `${ph.kind}-${ph.page}`,
      label:
        (multi ? `第 ${ph.page + 1} 頁・` : '') +
        (scene.flowKind === 'scroll' ? S.phase.scroll : S.phase[ph.kind]),
      start: Math.max(0, ph.a),
      end: Math.min(scene.duration, ph.b),
      color: PHASE_COLOR[ph.kind],
    }))
    .filter((s) => s.end > s.start);
}

/** 目前時間的階段文字（第 N 頁・登場／停留／退場、開始前空白…） */
export function phaseLabel(scene: Scene, t: number): string {
  const ph = scene.phaseAt(t);
  if (ph)
    return (
      (scene.pages.length > 1 ? `第 ${ph.page + 1} 頁・` : '') +
      (scene.flowKind === 'scroll' ? S.phase.scroll : S.phase[ph.kind])
    );
  if (t < scene.preEnd) return S.phase.before;
  if (scene.pageAt(t)) return scene.outroOn ? '' : S.phase.done;
  return t >= scene.lastEnd ? S.phase.after : S.phase.between;
}

let tmp: HTMLCanvasElement | null = null;

/** 場景 → AnimationSource（預覽與匯出共用） */
export function sceneSource(scene: Scene, stillTime = scene.repTime): AnimationSource {
  return {
    width: scene.W,
    height: scene.H,
    duration: scene.duration,
    stillTime,
    segments: sceneSegments(scene),
    render(ctx: Ctx2D, t: number) {
      const m = ctx.getTransform();
      const identity = m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0;
      if (identity) {
        scene.draw(ctx as CanvasRenderingContext2D, t);
        return;
      }
      /* 呼叫端套了縮放：先畫在原尺寸的暫存畫布上再貼上去 */
      if (!tmp) tmp = document.createElement('canvas');
      if (tmp.width !== scene.W || tmp.height !== scene.H) {
        tmp.width = scene.W;
        tmp.height = scene.H;
      }
      scene.draw(tmp.getContext('2d')!, t);
      ctx.drawImage(tmp, 0, 0);
    },
  };
}

/** 把整組設定等比例縮放（所有 px 值跟著縮放，看起來跟原尺寸一樣） */
export function scaleSettings(src: Settings, ratio: number): Settings {
  if (ratio === 1) return src;
  const c = deepClone(src);
  const r = (v: number) => v * ratio;
  c.canvasW = Math.max(1, Math.round(src.canvasW * ratio));
  c.canvasH = Math.max(1, Math.round(src.canvasH * ratio));
  c.size = r(src.size);
  c.minSize = Math.max(3, r(src.minSize));
  c.marginX = r(src.marginX);
  c.marginY = r(src.marginY);
  c.offsetX = r(src.offsetX);
  c.offsetY = r(src.offsetY);
  c.stroke.width = r(src.stroke.width);
  c.outer.width = r(src.outer.width);
  c.shadow.blur = r(src.shadow.blur);
  c.shadow.x = r(src.shadow.x);
  c.shadow.y = r(src.shadow.y);
  c.glow.spread = r(src.glow.spread);
  c.deco.lineWidth = r(src.deco.lineWidth);
  c.deco.tapeWidth = r(src.deco.tapeWidth);
  c.deco.tapeSpeed = r(src.deco.tapeSpeed);
  c.flow.speed = r(src.flow.speed);
  return c;
}

export interface RunExportOptions {
  cfg: Settings;
  format: AnimationExportFormat;
  fps: number;
  plays: number;
  scale: number;
  quantize: boolean;
  /** 檔名主體（已清理） */
  name: string;
  /** 暫停中的時間（存 PNG 靜止圖時用）；播放中為 null */
  pausedAt: number | null;
  signal: AbortSignal;
  onProgress: (ratio: number, label?: string) => void;
}

const fmtTime = (ms: number) => `${(ms / 1000).toFixed(2)} 秒`;

/** 匯出並組出結果卡的資訊 */
export async function runExport(
  o: RunExportOptions,
): Promise<ExportOutput & { result: ExportResult }> {
  const { cfg, format } = o;
  if (!hasText(cfg)) throw new Error(S.export.noText);
  o.onProgress(0, S.export.loadingFonts);
  const scaled = scaleSettings(cfg, o.scale);
  await loadFonts(sceneFontLoads(scaled), 12000);
  if (o.signal.aborted) throw new DOMException('已取消', 'AbortError');
  const scene = buildScene(scaled, { maxCanvas: 4096 });
  let stillTime = scene.repTime;
  if (format === 'png' && o.pausedAt != null && !scene.isBlankAt(o.pausedAt))
    stillTime = o.pausedAt;
  const source = sceneSource(scene, stillTime);
  const fileName =
    format === 'png' ? `${o.name}_靜止` : format === 'zip' ? `${o.name}_連番` : o.name;
  const result = await exportAnimation(source, {
    format,
    fps: o.fps,
    plays: o.plays,
    scale: 1,
    quantize: format === 'apng' && o.quantize,
    still: format === 'apng' && cfg.stillFallback,
    stillForPalette: true,
    stillWeightMin: 4,
    autoCrop: cfg.autoCrop,
    fileName,
    sequenceBaseName: o.name,
    sequenceInfo: (m) =>
      [
        S.export.seqTitle,
        `FPS：${m.fps}`,
        `張數：${m.frames}`,
        `尺寸：${m.width}×${m.height}`,
        `長度：${m.duration.toFixed(2)} 秒`,
        `檔名：${m.first} ～ ${m.last}`,
      ].join('\r\n'),
    maxFrames: MAX_FRAMES,
    signal: o.signal,
    onProgress: o.onProgress,
  });

  const details: { label: string; value: string }[] = [];
  const cropped = cfg.autoCrop && (result.crop.w !== scene.W || result.crop.h !== scene.H);
  if (cfg.autoCrop)
    details.push({ label: '裁邊', value: cropped ? '已裁掉透明邊' : '沒有可裁的透明邊' });
  if (format === 'png') {
    details.push({
      label: '時間點',
      value: `${stillTime.toFixed(2)} 秒${stillTime === scene.repTime ? '（完成狀態）' : ''}`,
    });
  } else {
    if (format === 'apng')
      details.push({
        label: '色數',
        value: result.colors
          ? `256 色${result.colors.lossless ? `（無損：實際只用了 ${result.colors.count} 色）` : '（減色）'}`
          : '全彩（RGBA）',
      });
    if (format !== 'zip') {
      details.push({
        label: '循環',
        value:
          o.plays === 0 ? '無限循環' : o.plays === 1 ? '播放一次（停在最後一格）' : `${o.plays} 次`,
      });
    }
    if (format === 'apng')
      details.push({
        label: '預設圖',
        value: cfg.stillFallback ? '完成狀態（不支援 APNG 時顯示）' : '第一格',
      });
  }
  details.push({ label: '匯出時間', value: fmtTime(result.ms) });
  return {
    blob: result.blob,
    fileName: result.fileName,
    width: result.width,
    height: result.height,
    frames: result.frames,
    storedFrames: result.storedFrames,
    duration: format === 'png' ? undefined : scene.duration,
    details,
    result,
  };
}

/** 設定的播放次數（給 ExportPanel） */
export { playsOf };
