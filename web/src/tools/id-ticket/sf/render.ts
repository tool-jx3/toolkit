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
import { sfBlank } from './defs';
import { drawSf } from './draw';
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

/** 整張的大小（原生像素：卡片＋往上延伸的掛繩） */
export function sfSize(s: SfState, mode: LanyardMode): { w: number; h: number; top: number } {
  const b = sfBlank(s.blank);
  const top = sfStrapExtent(mode);
  return { w: b.w, h: b.h + top, top };
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

export function renderSf(
  s: SfState,
  k: number,
  o: SfRenderOptions,
  into?: AnyCanvas,
): { canvas: AnyCanvas; regions: Region[]; logoSpot: Rect | null } {
  const { width, height } = sfPixels(s, k, o.lanyard);
  const canvas = into ? reuse(into, width, height) : makeCanvas(width, height);
  const r = paintSf(ctxOf(canvas), s, k, o);
  return { canvas, ...r };
}

/** 用到的字型（畫一次不顯示） */
export function sfFontUses(s: SfState): FontUse[] {
  const fonts = new Map<string, Set<string>>();
  const ctx = ctxOf(makeCanvas(1, 1));
  paintSf(ctx, s, 1, { preview: true, photo: null, image: () => null, fonts, lanyard: 'none' });
  return fontUses(fonts);
}

/** SF 證件的檔名：`sf-<範本>.png`（2 倍 `sf-<範本>-2x.png`） */
export const sfFileName = (s: SfState, k: number): string =>
  `sf-${s.blank}${k === 1 ? '' : `-${k}x`}.png`;

/* ---------- 條碼與 QR code 的密度（規格 D39、D40 修訂） ---------- */

/**
 * 匯出時最細的條／QR code 每格至少幾 px（再小手機多半掃不到）：條碼 1.5、QR code 2（同票券的 QR code；
 * SF 證件的 QR code 照原作直接畫在卡面上、四周沒有留白，更需要大一點）。
 */
export const SF_CODE_MIN_PX = { code: 1.5, qr: 2 } as const;

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
  if (!box || !s.style.barcode) return null;
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
