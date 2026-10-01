/**
 * 依文字裁切畫布（規格 F24、3.12）：
 * - 打字／故障：把「字最多的那一格」以置中、置中、無背景、不透明畫在夠大的暫存畫布上，
 *   取有墨跡（含外框與陰影）的範圍，新畫布＝範圍＋四周各 30 px（不改原本的對齊設定）。
 * - 卡拉 OK：最寬一句與行數的公式（layout.ts 的 karaokeFitSize）。
 */
import { opaqueBounds } from '@/core/image';
import { createFrameCanvas, drawFrame, frameStartTimes } from '@/core/timeline';
import { loadFonts } from './fonts';
import { inkFitSize, karaokeFitSize } from './layout';
import { buildGlitchSource, buildKaraokeSource, buildTypingSource, type TwSource } from './render';
import { RANGES, type TwData } from './settings';

export type FitMode = 'typing' | 'glitch' | 'karaoke';

const clampCanvas = (v: number) =>
  Math.min(RANGES.canvas.max, Math.max(RANGES.canvas.min, Math.round(v)));

/** 新的畫布尺寸；沒有文字時回傳 null */
export async function fitCanvasToText(
  mode: FitMode,
  data: TwData,
): Promise<{ width: number; height: number } | null> {
  if (mode === 'karaoke') {
    const s = data.karaoke;
    const first = buildKaraokeSource(s);
    if (first.empty) return null;
    await loadFonts(first.fontLoads);
    const src = buildKaraokeSource(s);
    const d = src.debug;
    if (d.mode !== 'karaoke') return null;
    const widths = d.schedule.sung.map((i) => d.lineWidths[i] ?? 0);
    const size = karaokeFitSize({
      maxLineWidth: Math.max(0, ...widths),
      scaleX: s.scaleX / 100,
      rows: d.plan.rows,
      size: s.size,
      leading: s.leading,
      strokeWidth: s.strokeWidth,
      shadowBlur: s.shadowBlur,
    });
    return { width: clampCanvas(size.width), height: clampCanvas(size.height) };
  }

  const build = (w: number, h: number): TwSource =>
    mode === 'typing'
      ? buildTypingSource({
          ...data.typing,
          align: 'center',
          valign: 'middle',
          bgOn: false,
          fade: 'none',
          width: w,
          height: h,
        })
      : buildGlitchSource({
          ...data.glitch,
          align: 'center',
          valign: 'middle',
          bgOn: false,
          width: w,
          height: h,
        });
  const s = mode === 'typing' ? data.typing : data.glitch;
  const probe = build(s.width, s.height);
  if (probe.empty) return null;
  await loadFonts(probe.fontLoads);
  const measured = build(s.width, s.height);
  const W = Math.min(8192, Math.ceil(measured.extent.w + 200));
  const H = Math.min(8192, Math.ceil(measured.extent.h + 200));
  const src = build(W, H);
  const { ctx } = createFrameCanvas(W, H);
  await drawFrame(ctx, src, frameStartTimes(src.frames)[src.fitFrame] ?? 0);
  const ink = opaqueBounds(ctx.getImageData(0, 0, W, H));
  if (!ink) return null;
  const size = inkFitSize(ink);
  return { width: clampCanvas(size.width), height: clampCanvas(size.height) };
}
