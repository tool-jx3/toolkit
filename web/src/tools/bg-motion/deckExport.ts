/**
 * 「圖片切換」模式的匯出（規格 3.11.3、3.11.8、3.11.9、F130～F133）：
 * 照影格表（停住一格、切換逐格）交給共用的匯出編碼器；超過容量上限時依序降低畫質（WebP）→ FPS → 尺寸，完整重新匯出，最多 8 次。
 */
import { type AnimationSource, type ExportResult, exportAnimation } from '@/core/timeline';
import { DECK_MAX_FRAMES, type DeckState } from './deck';
import {
  buildTimeline,
  CAP_MAX_ATTEMPTS,
  type CapState,
  capLimitBytes,
  capStep,
  deckFileBase,
  framePlan,
} from './deckPlan';
import { DeckPainter, type DeckScene } from './deckRender';
import { DECK } from './strings';

export interface DeckExportOptions {
  /** 匯出當下的內容（快照） */
  state: DeckState;
  /** 用到的圖片（圖片 id → 解碼結果） */
  bitmaps: ReadonlyMap<string, ImageBitmap>;
  /** 面板上的設定（格式、FPS、播放次數、減色）；其他設定取自 state */
  format: DeckState['format'];
  fps: number;
  plays: number;
  quantize: boolean;
  signal?: AbortSignal;
  onProgress?: (ratio: number, label: string) => void;
}

export interface DeckAttempt {
  q: number;
  fps: number;
  width: number;
  height: number;
  bytes: number;
  frames: number;
}

export interface DeckExportResult {
  result: ExportResult;
  /** 每次嘗試的設定與大小（最後一筆就是輸出） */
  attempts: DeckAttempt[];
  /** 最後仍超過上限 */
  over: boolean;
  /** 有改的項目（畫質、FPS、尺寸），給結果卡 */
  adjustments: string[];
}

const pct = (q: number) => Math.round(q * 100);

export async function exportDeck(o: DeckExportOptions): Promise<DeckExportResult> {
  const { state } = o;
  const tl = buildTimeline(state);
  const painter = new DeckPainter();
  const scene: DeckScene = {
    images: state.slides.map((s) => o.bitmaps.get(s.image.id) ?? null),
    segs: tl.segs,
    fit: state.fit,
    bg: state.bg,
    transparent: state.transparent,
    easing: state.easing,
  };
  const limit = state.capOn ? capLimitBytes(state.capMb) : Number.POSITIVE_INFINITY;
  const start: CapState = {
    q: state.quality / 100,
    fps: o.fps,
    width: state.width,
    height: state.height,
  };
  const fileName = deckFileBase(state.slides.map((s) => s.image.name));
  let cur = start;
  const attempts: DeckAttempt[] = [];
  let result: ExportResult | null = null;

  for (let n = 1; n <= CAP_MAX_ATTEMPTS; n++) {
    const { width, height, fps, q } = cur;
    const plan = framePlan(tl.segs, fps);
    const source: AnimationSource = {
      width,
      height,
      duration: plan.reduce((a, f) => a + f.d, 0) / 1000,
      frames: plan.map((f) => ({ ms: f.d, t: f.t })),
      stillTime: 0,
      render(ctx, t) {
        painter.paint(ctx, scene, width, height, t);
      },
    };
    result = await exportAnimation(source, {
      format: o.format,
      fps,
      plays: o.plays,
      quantize: o.format === 'apng' ? o.quantize : false,
      webpQuality: q,
      fileName,
      maxFrames: DECK_MAX_FRAMES,
      signal: o.signal,
      onProgress: (ratio, label) =>
        o.onProgress?.(ratio, n > 1 ? `${DECK.attemptLabel(n)}・${label}` : label),
    });
    const bytes = result.blob.size;
    attempts.push({ q, fps, width, height, bytes, frames: plan.length });
    if (bytes <= limit || n === CAP_MAX_ATTEMPTS) break;
    const next = capStep(cur, limit / bytes, o.format, o.fps);
    if (!next) break;
    cur = next;
  }
  if (!result) throw new Error('匯出失敗');

  const adjustments: string[] = [];
  if (o.format === 'webp' && pct(cur.q) !== pct(start.q))
    adjustments.push(DECK.adjustQuality(pct(start.q), pct(cur.q)));
  if (cur.fps !== start.fps) adjustments.push(DECK.adjustFps(start.fps, cur.fps));
  if (cur.width !== start.width || cur.height !== start.height)
    adjustments.push(
      DECK.adjustSize(`${start.width} × ${start.height}`, `${cur.width} × ${cur.height}`),
    );
  const last = attempts[attempts.length - 1];
  return { result, attempts, over: last.bytes > limit, adjustments };
}
