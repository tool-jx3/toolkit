/**
 * SF 證件的畫布：一張（1 倍＝原生大小、2 倍）、掛繩孔與掛繩（lanyard.ts）、預覽用的解析度、用到的字型。
 */
import { makeCanvas } from '@/core/image';
import { qrMatrix } from '@/core/qr/encode';
import { code128Modules, code128Widths } from '../code128';
import { barcodeText, type FontUse, fontUses, type PhotoSource, type Region } from '../kit';
import {
  drawStrap,
  type LanyardMode,
  lanyardHole,
  lanyardStrap,
  SF_CARD_TOP,
  SF_SLOTS,
  SF_STRAP_PX,
  slotPoly,
  strapGeometry,
} from '../lanyard';
import type { Photo } from '../model';
import { S } from '../strings';
import { isScannableCode } from './codes';
import { sfBlank } from './defs';
import { type DigitalLayout, digitalCardOffset, digitalLayout, paintDigital } from './digital';
import { drawSf, sfCardBounds } from './draw';
import type { Rect } from './geom';
import type { SfState } from './model';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
type C2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 預覽畫布的解析度（原生像素的幾倍） */
export const SF_PREVIEW_SCALE = 0.75;
/** 匯出的倍率（同原作 1 倍、2 倍） */
export const SF_SCALES = [1, 2] as const;

const ctxOf = (c: AnyCanvas): C2D => {
  const ctx = c.getContext('2d') as C2D | null;
  if (!ctx) throw new Error('無法建立畫布');
  return ctx;
};

function reuse(c: AnyCanvas, w: number, h: number): AnyCanvas {
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
    return c;
  }
  const ctx = ctxOf(c) as C2D & { reset?: () => void };
  if (typeof ctx.reset === 'function') ctx.reset();
  else c.width = w;
  return c;
}

export function sfPhotoSource(
  p: Photo | null,
  bitmap: CanvasImageSource | null,
): PhotoSource | null {
  if (!p || !bitmap) return null;
  return { bitmap, width: p.image.width, height: p.image.height, place: p.place };
}

/** 往上延伸的掛繩（原生像素；不畫掛繩時 0） */
export const sfStrapExtent = (mode: LanyardMode): number => (lanyardStrap(mode) ? SF_STRAP_PX : 0);

/** 卡片的畫布（原生像素：卡片＋往上延伸的掛繩） */
function cardSize(s: SfState, mode: LanyardMode): { w: number; h: number; top: number } {
  const b = sfBlank(s.blank);
  const top = sfStrapExtent(mode);
  return { w: b.w, h: b.h + top, top };
}

/** 數位證件的場景（關著時 null） */
export const sfDigitalLayout = (s: SfState, mode: LanyardMode): DigitalLayout | null => {
  if (!s.style.digital) return null;
  const c = cardSize(s, mode);
  return digitalLayout(c.w, c.h);
};

/**
 * 整張的大小（原生像素：卡片＋往上延伸的掛繩；數位證件是整個場景）；
 * x、y＝卡片的畫布在整張裡的位置（數位證件以外是 0）。
 */
export function sfSize(
  s: SfState,
  mode: LanyardMode,
): { w: number; h: number; top: number; x: number; y: number } {
  const c = cardSize(s, mode);
  const d = sfDigitalLayout(s, mode);
  if (!d) return { ...c, x: 0, y: 0 };
  return { w: d.w, h: d.h, top: c.top, x: d.x, y: d.y };
}

/** 輸出的像素 */
export function sfPixels(
  s: SfState,
  k: number,
  mode: LanyardMode,
): { width: number; height: number } {
  const z = sfSize(s, mode);
  return { width: Math.round(z.w * k), height: Math.round(z.h * k) };
}

export interface SfRenderOptions {
  preview: boolean;
  photo: PhotoSource | null;
  image: (id: string) => CanvasImageSource | null;
  fonts?: Map<string, Set<string>>;
  lanyard: LanyardMode;
}

/** 這一款要另外打的掛繩孔（通行證本來就有） */
export function sfExtraSlot(s: SfState, mode: LanyardMode): Rect | null {
  if (!lanyardHole(mode) || s.blank === 'pass') return null;
  return SF_SLOTS[s.blank];
}

/** 畫一張到 ctx（ctx 的大小＝sfPixels）；回傳可以點的範圍（原生像素、原點＝卡片的左上角） */
export function paintSf(
  ctx: C2D,
  s: SfState,
  k: number,
  o: SfRenderOptions,
): { regions: Region[]; logoSpot: Rect | null } {
  const top = sfStrapExtent(o.lanyard);
  const slot = sfExtraSlot(s, o.lanyard);
  ctx.save();
  ctx.scale(k, k);
  ctx.translate(0, top);
  const holes = slot ? [slotPoly(slot)] : [];
  const r = drawSf(ctx, s, k, {
    preview: o.preview,
    photo: o.photo,
    image: o.image,
    fonts: o.fonts,
    holes,
    rims: holes,
  });
  if (lanyardStrap(o.lanyard))
    drawStrap(ctx, strapGeometry(SF_SLOTS[s.blank], SF_CARD_TOP[s.blank], -top), s.style.accent);
  ctx.restore();
  return r;
}

/** 數位證件的字（讀數、連線紀錄） */
export const sfDigitalTexts = () => ({
  readout: S.digitalReadout,
  log: S.digitalLog,
});

/** 數位證件：卡片先畫在另一張畫布（預覽重用同一張） */
let cardScratch: AnyCanvas | null = null;

export function renderSf(
  s: SfState,
  k: number,
  o: SfRenderOptions,
  into?: AnyCanvas,
): { canvas: AnyCanvas; regions: Region[]; logoSpot: Rect | null } {
  const { width, height } = sfPixels(s, k, o.lanyard);
  const canvas = into ? reuse(into, width, height) : makeCanvas(width, height);
  const layout = sfDigitalLayout(s, o.lanyard);
  if (!layout) {
    const r = paintSf(ctxOf(canvas), s, k, o);
    return { canvas, ...r };
  }
  const c = cardSize(s, o.lanyard);
  const cw = Math.round(c.w * k);
  const ch = Math.round(c.h * k);
  let card: AnyCanvas;
  if (into) {
    cardScratch = cardScratch ? reuse(cardScratch, cw, ch) : makeCanvas(cw, ch);
    card = cardScratch;
  } else card = makeCanvas(cw, ch);
  const r = paintSf(ctxOf(card), s, k, o);
  composeDigital(ctxOf(canvas), s, k, layout, card, c.top, o.fonts);
  return { canvas, ...r };
}

function composeDigital(
  ctx: C2D,
  s: SfState,
  k: number,
  layout: DigitalLayout,
  card: AnyCanvas,
  top: number,
  fonts?: Map<string, Set<string>>,
): void {
  const shape = sfCardBounds(s.blank);
  const env = fonts
    ? { ctx, preview: true, value: () => '', label: () => '', photo: null, regions: [], fonts }
    : null;
  paintDigital(ctx, {
    card: card as CanvasImageSource & { width: number; height: number },
    k,
    layout,
    shape: { ...shape, y: shape.y + top },
    bg: s.style.digitalBg,
    accent: s.style.accent,
    ink: s.style.ink,
    seed: s.values.number ?? '',
    texts: sfDigitalTexts(),
    env,
  });
}

/** 卡片的畫布在整張裡的位置（畫布像素；數位證件以外是 0） */
export function sfCardOffset(s: SfState, k: number, mode: LanyardMode): { x: number; y: number } {
  const layout = sfDigitalLayout(s, mode);
  return layout ? digitalCardOffset(layout, k) : { x: 0, y: 0 };
}

/** 用到的字型（畫一次不顯示） */
export function sfFontUses(s: SfState): FontUse[] {
  const fonts = new Map<string, Set<string>>();
  const ctx = ctxOf(makeCanvas(1, 1));
  paintSf(ctx, s, 1, { preview: true, photo: null, image: () => null, fonts, lanyard: 'none' });
  if (s.style.digital) composeDigital(ctx, s, 1, digitalLayout(1, 1), makeCanvas(1, 1), 0, fonts);
  return fontUses(fonts);
}

/** SF 證件的檔名：`sf-<範本>.png`（2 倍 `sf-<範本>-2x.png`；數位證件 `sf-<範本>-digital.png`） */
export const sfFileName = (s: SfState, k: number): string =>
  `sf-${s.blank}${s.style.digital ? '-digital' : ''}${k === 1 ? '' : `-${k}x`}.png`;

/* ---------- 條碼與 QR code 的密度（規格 D39、D40 修訂） ---------- */

/**
 * 匯出時最細的條／QR code 每格至少幾 px（再小手機多半掃不到）：條碼 1.6、QR code 2.7（比票券的 QR code 2 px 嚴：
 * SF 證件的 QR code 照原作直接畫在卡面上、四周沒有留白；複查時 2.3～2.6 px 有解不開的，主控 2026-10-31 提高）。
 */
export const SF_CODE_MIN_PX = { code: 1.6, qr: 2.7 } as const;

/** 畫出來的碼的位置（從預覽的可以點的範圍找；原生像素的寬） */
export interface SfCodeBox {
  kind: 'code' | 'qr';
  w: number;
}

export function sfCodeBox(regions: readonly Region[]): SfCodeBox | null {
  const qr = regions.find((r) => r.kind === 'qr');
  if (qr) return { kind: 'qr', w: qr.w };
  const code = regions.find((r) => r.kind === 'code');
  return code ? { kind: 'code', w: code.w } : null;
}

export interface SfCodeDensity {
  kind: 'code' | 'qr';
  /** 匯出時最細的條（條碼）或每格（QR code）幾 px */
  module: number;
  dense: boolean;
}

/** 目前這一款的碼在 k 倍匯出時每格幾 px；沒有碼或內容不能編碼時 null */
export function sfCodeDensity(s: SfState, box: SfCodeBox | null, k: number): SfCodeDensity | null {
  if (!box || !s.style.barcode || !isScannableCode(s.style.code)) return null;
  const key = sfBlank(s.blank).codeKey;
  const value = s.values[key] ?? '';
  if (box.kind === 'qr') {
    const m = qrMatrix((s.values.qr ?? '').trim() || value.trim() || 'SF');
    if (!m) return null;
    const module = (box.w * k) / m.size;
    return { kind: 'qr', module, dense: module < SF_CODE_MIN_PX.qr };
  }
  const widths = code128Widths(barcodeText(value));
  if (!widths) return null;
  const module = (box.w * k) / code128Modules(widths);
  return { kind: 'code', module, dense: module < SF_CODE_MIN_PX.code };
}
