/**
 * 簡易頭像產生器的繪圖：預覽與下載用同一段程式畫在 1024 × 1024 的畫布上（所見即所得）。
 * 圖層由下往上：外框 → 內側背景 → 圖片 → 名字牌 → HO 牌（後四者都裁在內側區域裡）。
 * 選取框、控點、安全範圍、參考線是 LayoutEditor 的 DOM，不會畫進來。
 */
import { defineFontChoices, ensureFont, fontCss } from '@/core/fonts';
import { fillPattern, roundRectPath, roundRectPath2D } from '@/core/image';
import { type Box, percentToBox } from '@/core/layout';
import {
  type BackgroundKind,
  backgroundGradientStops,
  CANVAS,
  type ColorPreset,
  displayHo,
  displayName,
  type FontId,
  type FrameKind,
  HO_LOOKS,
  type IconSettings,
  INNER_RADIUS,
  imageBox,
  innerRect,
  layoutHo,
  layoutHorizontal,
  layoutVertical,
  type MeasureFn,
  NAME_PLATE,
  nameBoxOf,
  OUTER_RADIUS,
  type PatternBackground,
  PLACEHOLDER_SIZE,
  PLATE_RADIUS,
  patternInk,
  presetById,
} from './logic';

/** 名字的四種字型（預覽與下載相同）；粗細取各字型最粗的 */
export const NAME_FONTS = defineFontChoices<FontId>([
  { id: 'serif', family: 'Noto Serif TC', weight: 900, data: 'serif' },
  { id: 'sans', family: 'Noto Sans TC', weight: 900, data: 'sans' },
  { id: 'rounded', family: 'Huninn', weight: 400, data: 'rounded' },
  /* 等寬英文字型；中文字由備用字型（思源黑體）顯示 */
  { id: 'mono', family: 'Roboto Mono', weight: 700, data: 'mono' },
]);

export const nameFont = (id: FontId) => NAME_FONTS.find((f) => f.id === id) ?? NAME_FONTS[0];

/** HO 牌：無襯線、最粗 */
export const HO_FONT = { family: 'Noto Sans TC', weight: 900 } as const;

/** 畫布上要用到的字型都載好（只下載這些字需要的部分）；逾時就先用備用字型 */
export async function ensureIconFonts(s: Pick<IconSettings, 'name' | 'font' | 'hoText'>) {
  const name = displayName(s.name);
  const ho = displayHo(s.hoText);
  const f = nameFont(s.font).font;
  await Promise.all([
    ensureFont(f.family, f.weight, name),
    /* 備用字型：等寬字型裡沒有的中文字以同樣粗細的思源黑體顯示 */
    f.family === HO_FONT.family ? null : ensureFont(HO_FONT.family, f.weight, name),
    ensureFont(HO_FONT.family, HO_FONT.weight, ho),
  ]);
}

export interface IconImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

/* ---------- 外框與背景 ---------- */

/** 花紋一格的大小（1024 畫布上的 px） */
const PATTERN_SIZE: Record<PatternBackground, number> = {
  dots: 30,
  stripes: 28,
  checker: 64,
};

function frameFill(
  ctx: CanvasRenderingContext2D,
  preset: ColorPreset,
  kind: FrameKind,
  w: number,
  h: number,
): string | CanvasGradient {
  if (kind === 'solid') return preset.frame;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, preset.gradient[0]);
  g.addColorStop(0.5, preset.gradient[1]);
  g.addColorStop(1, preset.gradient[2]);
  return g;
}

/** 內側背景（呼叫端已經裁在內側區域裡）；patternScale 是花紋大小的倍率（縮圖用） */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  kind: BackgroundKind,
  preset: ColorPreset,
  r: Box,
  patternScale = 1,
): void {
  if (kind === 'transparent') return;
  if (kind === 'gradient') {
    const g = ctx.createLinearGradient(r.x, r.y, r.x + r.width, r.y + r.height);
    for (const [t, c] of backgroundGradientStops(preset)) g.addColorStop(t, c);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = preset.background;
  }
  ctx.fillRect(r.x, r.y, r.width, r.height);
  if (kind === 'dots' || kind === 'stripes' || kind === 'checker') {
    fillPattern(ctx, kind, r, {
      ...patternInk(preset, kind),
      size: PATTERN_SIZE[kind] * patternScale,
    });
  }
}

export interface FrameSpec {
  width: number;
  height: number;
  outerRadius: number;
  inner: Box;
  innerRadius: number;
  preset: ColorPreset;
  frameKind: FrameKind;
  background: BackgroundKind;
  patternScale?: number;
}

/**
 * 外框＋內側背景。回傳內側區域的 Path2D（之後的圖片與文字裁在裡面）。
 * 背景透明時外框畫成環狀（內側真的透明）；否則先整片塗外框色再蓋上背景（內緣沒有接縫）。
 */
export function drawFrame(ctx: CanvasRenderingContext2D, f: FrameSpec): Path2D {
  const outer = roundRectPath2D(0, 0, f.width, f.height, f.outerRadius);
  const inner = roundRectPath2D(f.inner.x, f.inner.y, f.inner.width, f.inner.height, f.innerRadius);
  ctx.fillStyle = frameFill(ctx, f.preset, f.frameKind, f.width, f.height);
  if (f.background === 'transparent') {
    const ring = new Path2D();
    ring.addPath(outer);
    ring.addPath(inner);
    ctx.fill(ring, 'evenodd');
  } else {
    ctx.fill(outer);
  }
  ctx.save();
  ctx.clip(inner);
  drawBackground(ctx, f.background, f.preset, f.inner, f.patternScale);
  ctx.restore();
  return inner;
}

/* ---------- 圖片與佔位圖 ---------- */

/** 佔位圖的顏色（不透明的中性灰，深淺背景都看得清楚） */
const PLACEHOLDER_COLOR = '#9ca4b3';

/** 人形佔位圖（頭＋肩膀），畫在 box 裡（box 的比例是 PLACEHOLDER_SIZE） */
export function drawPlaceholder(ctx: CanvasRenderingContext2D, b: Box): void {
  const cx = b.x + b.width / 2;
  ctx.save();
  ctx.fillStyle = PLACEHOLDER_COLOR;
  ctx.beginPath();
  ctx.arc(cx, b.y + b.height * 0.245, b.width * 0.2, 0, Math.PI * 2);
  ctx.fill();
  /* 肩膀：上方兩角大圓角的長方形，下緣在框外 */
  const r = b.width * 0.36;
  ctx.beginPath();
  roundRectPath(ctx, b.x + b.width * 0.05, b.y + b.height * 0.45, b.width * 0.9, b.height * 0.6, [
    r,
    r,
    0,
    0,
  ]);
  ctx.fill();
  ctx.restore();
}

/** 圖片（或佔位圖）的原始大小：決定高寬比 */
export const imageSize = (image: IconImage | null) =>
  image ? { width: image.width, height: image.height } : PLACEHOLDER_SIZE;

/* ---------- 名字牌與 HO 牌 ---------- */

const SHADOW = { color: 'rgba(10, 14, 25, 0.3)', blur: 22, offsetY: 6 } as const;

/** 牌子的底：外側柔和陰影（不透進半透明的底）＋底色 */
function drawPlate(
  ctx: CanvasRenderingContext2D,
  b: Box,
  fill: string | CanvasGradient,
  alpha: number,
  border?: string,
): void {
  const path = roundRectPath2D(b.x, b.y, b.width, b.height, PLATE_RADIUS);
  /* 陰影只畫在牌子外側：裁掉牌子本身的範圍 */
  ctx.save();
  const outside = new Path2D();
  outside.rect(-CANVAS, -CANVAS, CANVAS * 3, CANVAS * 3);
  outside.addPath(path);
  ctx.clip(outside, 'evenodd');
  ctx.shadowColor = SHADOW.color;
  ctx.shadowBlur = SHADOW.blur;
  ctx.shadowOffsetY = SHADOW.offsetY;
  ctx.fillStyle = '#000000';
  ctx.fill(path);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fill(path);
  ctx.restore();
  if (border) {
    ctx.save();
    ctx.strokeStyle = border;
    ctx.lineWidth = 2;
    ctx.beginPath();
    roundRectPath(ctx, b.x + 1, b.y + 1, b.width - 2, b.height - 2, PLATE_RADIUS - 1);
    ctx.stroke();
    ctx.restore();
  }
}

const measureWith =
  (ctx: CanvasRenderingContext2D, font: { family: string; weight: number }): MeasureFn =>
  (text, size) => {
    ctx.font = fontCss(font, size);
    return ctx.measureText(text).width;
  };

function drawName(ctx: CanvasRenderingContext2D, s: IconSettings, b: Box): void {
  drawPlate(ctx, b, NAME_PLATE.fill, 1);
  const font = nameFont(s.font).font;
  const text = displayName(s.name);
  ctx.save();
  ctx.fillStyle = NAME_PLATE.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (s.orientation === 'vertical') {
    const v = layoutVertical(text, b);
    ctx.font = fontCss(font, v.size);
    v.chars.forEach((ch, i) => {
      ctx.fillText(ch, v.x, v.centers[i]);
    });
  } else {
    const h = layoutHorizontal(text, b, measureWith(ctx, font));
    ctx.font = fontCss(font, h.size);
    ctx.fillText(text, h.x, h.y);
  }
  ctx.restore();
}

function drawHo(ctx: CanvasRenderingContext2D, s: IconSettings, b: Box): void {
  const look = HO_LOOKS[s.hoStyle];
  let fill: string | CanvasGradient;
  if (typeof look.fill === 'string') fill = look.fill;
  else {
    const g = ctx.createLinearGradient(b.x, 0, b.x + b.width, 0);
    g.addColorStop(0, look.fill[0]);
    g.addColorStop(1, look.fill[1]);
    fill = g;
  }
  drawPlate(ctx, b, fill, look.alpha, look.border);
  const text = displayHo(s.hoText);
  const l = layoutHo(text, b, measureWith(ctx, HO_FONT));
  ctx.save();
  ctx.fillStyle = look.text;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = fontCss(HO_FONT, l.size);
  ctx.translate(l.x, l.y);
  ctx.scale(l.scaleX, 1);
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

/* ---------- 整張 ---------- */

/** 畫整張頭像（1024 × 1024）。預覽與下載都用這個函式。 */
export function drawIcon(
  ctx: CanvasRenderingContext2D,
  s: IconSettings,
  image: IconImage | null,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, CANVAS, CANVAS);
  const inner = innerRect(s.frameWidth);
  const clip = drawFrame(ctx, {
    width: CANVAS,
    height: CANVAS,
    outerRadius: OUTER_RADIUS,
    inner,
    innerRadius: INNER_RADIUS,
    preset: presetById(s.preset),
    frameKind: s.frameKind,
    background: s.background,
  });
  ctx.save();
  ctx.clip(clip);
  const im = percentToBox(imageBox(s.imageCenter, s.imageScale, imageSize(image)), inner);
  if (image) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, im.x, im.y, im.width, im.height);
  } else {
    drawPlaceholder(ctx, im);
  }
  drawName(ctx, s, percentToBox(nameBoxOf(s), inner));
  drawHo(ctx, s, percentToBox(s.ho, inner));
  ctx.restore();
}

/** 下載與複製用：另開一張 1024 畫布、等字型載好再畫 */
export async function renderIcon(
  s: IconSettings,
  image: IconImage | null,
): Promise<HTMLCanvasElement> {
  await ensureIconFonts(s);
  const c = document.createElement('canvas');
  c.width = CANVAS;
  c.height = CANVAS;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('無法建立畫布');
  drawIcon(ctx, s, image);
  return c;
}

/* ---------- 選項縮圖 ---------- */

/** 配色卡片的色條、背景類型的縮圖：同一套外框與背景畫法，縮小版 */
export function drawFrameThumb(
  ctx: CanvasRenderingContext2D,
  preset: ColorPreset,
  frameKind: FrameKind,
  background: BackgroundKind,
): void {
  const { width: w, height: h } = ctx.canvas;
  ctx.clearRect(0, 0, w, h);
  const inset = Math.max(4, Math.round(Math.min(w, h) * 0.14));
  drawFrame(ctx, {
    width: w,
    height: h,
    outerRadius: Math.min(w, h) * 0.24,
    inner: { x: inset, y: inset, width: w - 2 * inset, height: h - 2 * inset },
    innerRadius: Math.min(w, h) * 0.14,
    preset,
    frameKind,
    background,
    patternScale: 0.4,
  });
}
