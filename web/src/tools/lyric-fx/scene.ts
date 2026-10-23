/**
 * 由設定推出來的東西（快取）：要排的句、目前的風格與它的設定、排好的 plan；以及畫一格（背景＋歌詞）。
 * 預覽、PNG、影片都用這裡的 drawFrame，所以每一格都一樣（規格 F17、3.9）。
 */
import {
  type AnyLyricStyle,
  adjustFonts,
  type BuiltLines,
  buildLyricLines,
  createCanvasMeasure,
  getLyricStyle,
  type LyricAdjustSupport,
  type LyricCtx,
  type LyricFont,
  type LyricLinePlacement,
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

/** 風格會避開避開區域（controls 裡有 region 控制項；規格 3.8）：沒有時預覽上不畫區域的框 */
export const usesRegion = (style: AnyLyricStyle): boolean =>
  style.controls.some((sec) => sec.controls.some((c) => c.kind === 'region'));

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
  const key = [lines, style, settings, s.seed, s.canvas.size, s.region];
  if (!planValue || key.some((v, i) => !Object.is(v, planKey[i]))) {
    planValue = style.plan(lines, settings, s.seed, sizeOf(s.canvas.size), measure, {
      region: s.region,
    });
    planKey = key;
  }
  return planValue;
}

/** 沒有音樂時的長度（秒）：風格沒有 settledAt 時用最後一句的開始時間（規格 3.8） */
export function loopLength(s: Settings, fontTick: number): number {
  const style = styleOf(s);
  const plan = planOf(s, fontTick);
  const lines = builtLines(s).lines;
  const lastStart = lines.length ? Math.max(0, lines[lines.length - 1].t) : 0;
  return loopLengthFor(style.settledAt ? style.settledAt(plan) : lastStart);
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

/** 要先載入的字型與要下載的字：風格的字型（整份歌詞）＋逐句換的字型（那幾句的字；風格支援時；F81） */
export function fontsToLoad(s: Settings): { font: LyricFont; text: string }[] {
  const style = styleOf(s);
  const text = frameText(s);
  const out = style.fonts(styleSettings(s)).map((font) => ({ font, text }));
  if (style.adjust?.font)
    for (const f of adjustFonts(builtLines(s).lines))
      out.push({ font: f.font, text: `${f.text}Aa永` });
  return out;
}

/* ---------- 逐句的手動調整（F75～F81） ---------- */

const NO_SUPPORT: LyricAdjustSupport = {};

/** 目前的風格支援哪些逐句調整（沒有宣告＝都不支援） */
export const adjustSupport = (s: Settings): LyricAdjustSupport => styleOf(s).adjust ?? NO_SUPPORT;

/** 目前的風格能不能在預覽上點選、拖曳（要有 placement、hitTest，而且支援位置或角度） */
export function canPick(s: Settings): boolean {
  const style = styleOf(s);
  const a = style.adjust ?? NO_SUPPORT;
  return !!(style.placement && style.hitTest && (a.position || a.angle));
}

/** 一句目前的位置（風格沒有 placement、這一句沒有排到時 null） */
export function placementOf(
  s: Settings,
  fontTick: number,
  key: string,
  t: number,
): LyricLinePlacement | null {
  const style = styleOf(s);
  if (!style.placement) return null;
  return style.placement(planOf(s, fontTick), styleSettings(s), key, t);
}
