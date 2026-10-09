/**
 * 畫拍立得（預覽與下載同一段程式，規格 3.2）：相框（圓角、陰影、底色）→ 照片範圍（照片或灰底、細線）→ 文字 →
 * 貼紙（白邊＋圖）→ 三個筆畫圖層（各自畫在透明畫布上，橡皮擦只擦自己的圖層）→ 相框外框線。
 * 所有座標是相框單位，畫的時候整個乘上 scale（預覽 2、輸出 3）。貼紙的選取框不在這裡畫（疊在預覽上的操作層）。
 */
import { ensureFont, FALLBACK_STACK } from '@/core/fonts';
import { canvasToBlob, makeCanvas, roundRectPath } from '@/core/image';
import {
  CAPTION_MARGIN,
  type Caption,
  type CaptionFont,
  CORNER,
  captionArea,
  captionText,
  cardSize,
  EMPTY_FILL,
  EXPORT_SCALE,
  exportSize,
  fitCaptionSize,
  type PenLayer,
  PHOTO_CORNER,
  type PolaroidState,
  photoArea,
  photoDrawRect,
  type Size,
  type Sticker,
  type Stroke,
  stickerOutline,
  strokeWidth,
} from './model';

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

/** 畫面用到的圖（解碼後）：照片、貼紙（資產 id → 圖） */
export interface Images {
  photo: CanvasImageSource | null;
  stickers: ReadonlyMap<string, CanvasImageSource>;
}

const ctx2d = (c: AnyCanvas): Ctx => {
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('canvas');
  return ctx;
};

/* ---------- 字型 ---------- */

/** 兩種字型：英數字的字型＋中文補字的字型（D2） */
export const CAPTION_FONT_SPEC: Record<
  CaptionFont,
  { family: string; weight: number; cjk: string; cjkWeight: number }
> = {
  bold: { family: 'Poppins', weight: 800, cjk: 'Noto Sans TC', cjkWeight: 800 },
  cursive: { family: 'Caveat', weight: 700, cjk: 'LXGW WenKai TC', cjkWeight: 700 },
};

/** canvas 的 font（字級是相框單位） */
export function captionFontCss(font: CaptionFont, size: number): string {
  const f = CAPTION_FONT_SPEC[font];
  /* 備用堆疊裡已經有的字型不再列一次 */
  const rest = FALLBACK_STACK.split(',')
    .map((s) => s.trim())
    .filter((s) => s.replace(/['"]/g, '') !== f.cjk)
    .join(', ');
  return `${f.weight} ${size}px "${f.family}", "${f.cjk}", ${rest}`;
}

/** 有拉丁字母以外的字（中文等）：要另外載入補字的字型 */
const hasNonLatin = (text: string): boolean =>
  Array.from(text).some((ch) => {
    const c = ch.codePointAt(0) ?? 0;
    return c > 0x24f && !(c >= 0x2000 && c <= 0x206f);
  });

/** 文字用到的字型都載好（只下載這些字需要的部分）；逾時就先用備用字型 */
export async function ensureCaptionFont(c: Caption): Promise<void> {
  const text = captionText(c);
  if (!text) return;
  const f = CAPTION_FONT_SPEC[c.font];
  await Promise.all([
    ensureFont(f.family, f.weight, text),
    hasNonLatin(text) ? ensureFont(f.cjk, f.cjkWeight, text) : null,
  ]);
}

/* ---------- 相框、照片、文字 ---------- */

/** 圓角矩形的路徑 */
function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  roundRectPath(ctx, x, y, w, h, r);
}

/** 文字實際的字級（自動縮小後；F19） */
export function captionFitSize(ctx: Ctx, c: Caption, cardWidth: number): number {
  const text = captionText(c);
  return fitCaptionSize(
    (size) => {
      ctx.font = captionFontCss(c.font, size);
      return ctx.measureText(text).width;
    },
    c.size,
    cardWidth - CAPTION_MARGIN,
  );
}

/**
 * 相框、照片、文字、貼紙（筆畫圖層下面的部分）。ctx 的座標是相框單位（呼叫端已經乘上 scale）。
 */
export function paintBase(ctx: Ctx, d: PolaroidState, images: Images, scale: number): void {
  const card = cardSize(d.aspect);
  ctx.clearRect(0, 0, card.width, card.height);

  /* 相框：陰影以輸出 px 計，不跟著倍率（規格 3.2） */
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
  ctx.shadowBlur = 26;
  ctx.shadowOffsetY = 10;
  roundRect(ctx, 0, 0, card.width, card.height, CORNER);
  ctx.fillStyle = d.cardBg;
  ctx.fill();
  ctx.restore();

  /* 照片範圍 */
  const area = photoArea(d.aspect);
  ctx.save();
  roundRect(ctx, area.x, area.y, area.width, area.height, PHOTO_CORNER);
  ctx.clip();
  if (images.photo && d.photo) {
    const r = photoDrawRect(area, d.photo, d.view);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(images.photo, r.x, r.y, r.width, r.height);
  } else {
    ctx.fillStyle = EMPTY_FILL;
    ctx.fillRect(area.x, area.y, area.width, area.height);
  }
  ctx.restore();
  ctx.save();
  roundRect(ctx, area.x, area.y, area.width, area.height, PHOTO_CORNER);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
  ctx.stroke();
  ctx.restore();

  /* 文字 */
  const text = captionText(d.caption);
  if (text) {
    const cap = captionArea(d.aspect);
    ctx.save();
    const size = captionFitSize(ctx, d.caption, card.width);
    ctx.font = captionFontCss(d.caption.font, size);
    ctx.fillStyle = d.caption.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, cap.x + cap.width / 2, cap.y + cap.height / 2);
    ctx.restore();
  }

  /* 貼紙 */
  for (const s of d.stickers) {
    const img = images.stickers.get(s.asset);
    if (img) drawSticker(ctx, s, img, scale);
  }
}

/** 相框外框線（最上面） */
export function paintBorder(ctx: Ctx, d: PolaroidState): void {
  const card = cardSize(d.aspect);
  ctx.save();
  roundRect(ctx, 0, 0, card.width, card.height, CORNER);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.1)';
  ctx.stroke();
  ctx.restore();
}

/* ---------- 貼紙 ---------- */

/** 白邊的計算解析度上限（倍率；輸出 3 倍時白邊以 2 倍算好再放大，圖本身照樣以輸出解析度畫） */
const OUTLINE_SCALE_MAX = 2;
const outlineCache = new Map<string, AnyCanvas>();
const OUTLINE_CACHE_MAX = 24;
const imageKeys = new WeakMap<object, number>();
let imageSeq = 0;
const imageKey = (img: CanvasImageSource): number => {
  let k = imageKeys.get(img as object);
  if (k === undefined) {
    k = ++imageSeq;
    imageKeys.set(img as object, k);
  }
  return k;
};

/**
 * 貼紙的白邊（D9）：圖的不透明處往外擴「白邊寬度」（F35）的白色剪影，四周各留 pad（相框單位）。
 * 做法：把縮好的圖往外移動三圈（白邊寬度的 1、2/3、1/3，各圈的方向夠密）疊起來，再塗白。
 * 回傳的畫布涵蓋 (寬＋2 × pad) ×（高＋2 × pad）相框單位；同一張圖、同一個大小只算一次（預覽與輸出共用）。
 */
export function stickerOutlineMask(
  img: CanvasImageSource,
  size: Size,
  scale: number,
): { canvas: AnyCanvas; pad: number } {
  const outline = stickerOutline(size);
  const pad = Math.ceil(outline * 1.8);
  const k = Math.min(scale, OUTLINE_SCALE_MAX);
  const w = Math.max(1, Math.round((size.width + pad * 2) * k));
  const h = Math.max(1, Math.round((size.height + pad * 2) * k));
  const iw = Math.max(1, Math.round(size.width * k));
  const ih = Math.max(1, Math.round(size.height * k));
  const key = `${imageKey(img)}|${iw}|${ih}|${w}|${h}`;
  const hit = outlineCache.get(key);
  if (hit) {
    outlineCache.delete(key);
    outlineCache.set(key, hit);
    return { canvas: hit, pad };
  }
  /* 先把圖縮到要用的大小（之後每次位移都畫這張，不必每次重新縮放大圖） */
  const small = makeCanvas(iw, ih);
  const sg = ctx2d(small);
  sg.imageSmoothingEnabled = true;
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(img, 0, 0, iw, ih);
  const c = makeCanvas(w, h);
  const g = ctx2d(c);
  const ox = (w - iw) / 2;
  const oy = (h - ih) / 2;
  const r = outline * k;
  g.drawImage(small, ox, oy);
  for (const ring of [1, 2 / 3, 1 / 3]) {
    const rr = r * ring;
    const n = Math.max(24, Math.ceil((Math.PI * 2 * rr) / 2));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      g.drawImage(small, ox + Math.cos(a) * rr, oy + Math.sin(a) * rr);
    }
  }
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  outlineCache.set(key, c);
  while (outlineCache.size > OUTLINE_CACHE_MAX) {
    const first = outlineCache.keys().next().value;
    if (first === undefined) break;
    outlineCache.delete(first);
  }
  return { canvas: c, pad };
}

/** 畫一張貼紙（白邊＋圖，以中心旋轉；圖以 ctx 的解析度畫） */
export function drawSticker(ctx: Ctx, s: Sticker, img: CanvasImageSource, scale: number): void {
  const { canvas, pad } = stickerOutlineMask(img, { width: s.width, height: s.height }, scale);
  ctx.save();
  ctx.translate(s.cx, s.cy);
  ctx.rotate((s.rotation * Math.PI) / 180);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    canvas,
    -s.width / 2 - pad,
    -s.height / 2 - pad,
    s.width + pad * 2,
    s.height + pad * 2,
  );
  ctx.drawImage(img, -s.width / 2, -s.height / 2, s.width, s.height);
  ctx.restore();
}

/* ---------- 筆畫 ---------- */

/** 經過每一點的平滑路徑（相鄰兩點的中點用二次曲線相接；F24） */
function smoothPath(ctx: Ctx, pts: readonly number[]): void {
  const n = pts.length / 2;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2];
    const y = pts[i * 2 + 1];
    ctx.quadraticCurveTo(x, y, (x + pts[i * 2 + 2]) / 2, (y + pts[i * 2 + 3]) / 2);
  }
  ctx.lineTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
}

/** 畫一筆（ctx 是這個圖層自己的畫布；橡皮擦用「擦除」合成，只擦這個圖層） */
export function drawStroke(ctx: Ctx, s: Stroke): void {
  const n = Math.floor(s.points.length / 2);
  if (!n) return;
  const width = strokeWidth(s.size, s.pressure);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalCompositeOperation = s.eraser ? 'destination-out' : 'source-over';
  ctx.globalAlpha = 1;
  const ink = s.eraser ? '#000000' : s.color;
  if (n === 1) {
    ctx.beginPath();
    ctx.arc(s.points[0], s.points[1], width / 2, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  } else {
    ctx.strokeStyle = ink;
    ctx.lineWidth = width;
    smoothPath(ctx, s.points);
    ctx.stroke();
  }
  ctx.restore();
  /* 壓克力筆的光澤：筆（不是橡皮擦）、兩點以上才畫 */
  if (!s.eraser && n > 1) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.32)';
    ctx.lineWidth = width * 0.34;
    smoothPath(ctx, s.points);
    ctx.stroke();
    ctx.restore();
  }
}

/** 一個圖層的畫布（輸出解析度）；extra 是正在畫、還沒寫進狀態的一筆 */
export function renderLayer(
  strokes: readonly Stroke[],
  card: Size,
  scale: number,
  extra?: Stroke | null,
  base?: AnyCanvas | null,
): AnyCanvas {
  const c = makeCanvas(Math.round(card.width * scale), Math.round(card.height * scale));
  const ctx = ctx2d(c);
  if (base) ctx.drawImage(base, 0, 0);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  if (!base) for (const s of strokes) drawStroke(ctx, s);
  if (extra) drawStroke(ctx, extra);
  return c;
}

/** 圖層要不要畫（顯示中、有筆畫或正在畫） */
export const layerHasInk = (l: PenLayer, live?: Stroke | null): boolean =>
  l.visible && (l.strokes.length > 0 || !!live);

/* ---------- 整張 ---------- */

/** 整張拍立得（輸出用；預覽用 Preview 裡有快取的版本，畫法相同） */
export function renderPolaroid(d: PolaroidState, images: Images, scale = EXPORT_SCALE): AnyCanvas {
  const size = exportSize(d.aspect, scale);
  const card = cardSize(d.aspect);
  const c = makeCanvas(size.width, size.height);
  const ctx = ctx2d(c);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  paintBase(ctx, d, images, scale);
  for (const l of d.layers) {
    if (!layerHasInk(l)) continue;
    const lc = renderLayer(l.strokes, card, scale);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(lc, 0, 0);
    ctx.restore();
  }
  paintBorder(ctx, d);
  return c;
}

/** 下載用的 PNG（等字型載好再畫） */
export async function renderPng(d: PolaroidState, images: Images): Promise<Blob> {
  await ensureCaptionFont(d.caption);
  return canvasToBlob(renderPolaroid(d, images, EXPORT_SCALE));
}
