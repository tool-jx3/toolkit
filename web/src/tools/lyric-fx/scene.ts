/**
 * 由設定推出來的東西（快取）：要排的句、目前的風格與它的設定、排好的 plan；以及畫一格（背景＋歌詞）。
 * 預覽、PNG、影片都用這裡的 drawFrame，所以每一格都一樣（規格 F17、3.9）。
 */
import {
  type AnyLyricStyle,
  type BuiltLines,
  buildLyricLines,
  createCanvasMeasure,
  getLyricStyle,
  type LyricCtx,
  type LyricMeasureEnv,
} from '@/core/lyricfx';
import { loopLengthFor, type Settings, sizeOf } from './model';

/* ---------- 要排的句 ---------- */

let linesKey: unknown[] = [];
let linesValue: BuiltLines | null = null;

export function builtLines(s: Settings): BuiltLines {
  const key = [s.lyrics.text, s.lyrics.offset, s.language, s.filters, s.overrides];
  if (!linesValue || key.some((v, i) => !Object.is(v, linesKey[i]))) {
    linesValue = buildLyricLines(s.lyrics.text, {
      language: s.language,
      offset: s.lyrics.offset,
      filters: s.filters,
      overrides: s.overrides,
    });
    linesKey = key;
  }
  return linesValue;
}

/* ---------- 風格 ---------- */

export const styleOf = (s: Settings): AnyLyricStyle => getLyricStyle(s.styleId);

let styleKey: unknown = null;
let styleValue: Record<string, unknown> | null = null;

/** 目前風格的設定（正規化過；同一個物件時回傳同一份） */
export function styleSettings(s: Settings): Record<string, unknown> {
  const style = styleOf(s);
  const raw = s.styles[style.id];
  if (!styleValue || styleKey !== raw) {
    styleValue = style.normalize(raw) as Record<string, unknown>;
    styleKey = raw;
  }
  return styleValue;
}

/* ---------- plan ---------- */

let measureTick = -1;
let measure: LyricMeasureEnv = createCanvasMeasure();
let planKey: unknown[] = [];
let planValue: unknown = null;

/** 排好的 plan（輸出尺寸；字型載好之後 fontTick 變了就重排） */
export function planOf(s: Settings, fontTick: number): unknown {
  if (fontTick !== measureTick) {
    measure = createCanvasMeasure();
    measureTick = fontTick;
    planValue = null;
  }
  const lines = builtLines(s).lines;
  const style = styleOf(s);
  const settings = styleSettings(s);
  const key = [lines, style, settings, s.seed, s.canvas.size];
  if (!planValue || key.some((v, i) => !Object.is(v, planKey[i]))) {
    planValue = style.plan(lines, settings, s.seed, sizeOf(s.canvas.size), measure);
    planKey = key;
  }
  return planValue;
}

/** 沒有音樂時的長度（秒） */
export function loopLength(s: Settings, fontTick: number): number {
  const style = styleOf(s);
  const plan = planOf(s, fontTick);
  return loopLengthFor(style.settledAt ? style.settledAt(plan) : 0);
}

/* ---------- 畫一格 ---------- */

export interface FrameBackground {
  /** 畫背景（false：透明 WebM、PNG 連番） */
  paint: boolean;
  /** 背景是透明時畫成黑色（MP4） */
  opaque?: boolean;
  image: ImageBitmap | null;
}

export function drawBackground(
  ctx: LyricCtx,
  s: Settings,
  w: number,
  h: number,
  bg: FrameBackground,
): void {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.clearRect(0, 0, w, h);
  if (bg.paint) {
    const kind = s.background.kind;
    if (kind === 'transparent') {
      if (bg.opaque) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, w, h);
      }
    } else {
      ctx.fillStyle = s.background.color;
      ctx.fillRect(0, 0, w, h);
      const img = kind === 'image' ? bg.image : null;
      if (img) {
        const k =
          s.background.fit === 'cover'
            ? Math.max(w / img.width, h / img.height)
            : Math.min(w / img.width, h / img.height);
        const dw = img.width * k;
        const dh = img.height * k;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
    }
  }
  ctx.restore();
}

/** 畫時間 t 的一格：背景＋歌詞（w × h＝輸出尺寸） */
export function drawFrame(
  ctx: LyricCtx,
  t: number,
  s: Settings,
  plan: unknown,
  bg: FrameBackground,
): void {
  const { width: w, height: h } = sizeOf(s.canvas.size);
  drawBackground(ctx, s, w, h, bg);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  styleOf(s).draw(ctx, t, plan, styleSettings(s), { x: 0, y: 0, width: w, height: h });
  ctx.restore();
}

/** 畫面會用到的字（字型只下載這些字） */
export function frameText(s: Settings): string {
  const b = builtLines(s);
  return `${b.lines.map((l) => l.text + l.tr).join('')}Aa永`;
}
