/**
 * 圖片段落的尺寸與配置（規格 3.2.9、F150～F156）。紙面座標以 mm 計，A4 210 × 297。
 */
import { isFreeImg } from './blocks';
import type { Block, Doc, ImagePos } from './types';

export const PAPER_W = 210;
export const PAPER_H = 297;
/** 自由配置圖片與文字的距離（mm） */
export const FREE_GAP = 3;
/** 匯入圖片的長邊上限（px） */
export const IMAGE_MAX_SIDE = 1600;

export const fnum = (v: number): number => Math.round(v * 100) / 100;

/** 版心寬（mm） */
export const bodyWidthMm = (doc: Pick<Doc, 'padH'>): number =>
  Math.max(20, PAPER_W - (+doc.padH || 16) * 2);

export function imagePos(b: Block): ImagePos {
  if (b.pos) return b.pos;
  return b.fl === 'l' ? 'left' : b.fl === 'r' ? 'right' : 'inline';
}

/** 圖片寬（mm）：行內與繞排以版心、自由配置以紙寬為準 */
export function imageWidthMm(b: Block, doc: Pick<Doc, 'padH'>): number {
  const free = isFreeImg(b);
  const pct = Math.max(1, Math.min(100, +(b.w ?? 0) || (free ? 40 : 70)));
  return ((free ? PAPER_W : bodyWidthMm(doc)) * pct) / 100;
}

/** 設定配置（F151）：繞排為欄內、其他全寬；自由配置沿用目前的頁 */
export function setImagePos(b: Block, pos: ImagePos, currentPage: number): void {
  const was = imagePos(b);
  b.pos = pos;
  b.fl = pos === 'left' ? 'l' : pos === 'right' ? 'r' : '';
  b.cols = pos === 'left' || pos === 'right' ? 2 : 1;
  if (pos === 'free') {
    if (b.fx == null) b.fx = 0;
    if (b.fy == null) b.fy = 0;
    if (was !== 'free' || !b.pg) b.pg = Math.max(1, currentPage || 1);
    b.cols = 1;
  }
}

/** 靠到紙邊（F154）：往內留紙面間距 */
export function snapImage(
  b: Block,
  which: 'top' | 'bottom' | 'left' | 'right',
  doc: Pick<Doc, 'padH' | 'padV'>,
): void {
  const w = imageWidthMm(b, doc);
  const h = w * (+(b.ar ?? 0) > 0 ? +(b.ar ?? 1) : 1);
  if (which === 'bottom') b.fy = Math.max(0, Math.round(PAPER_H - h - doc.padV));
  if (which === 'top') b.fy = doc.padV;
  if (which === 'right') b.fx = Math.max(0, Math.round(PAPER_W - w - doc.padH));
  if (which === 'left') b.fx = doc.padH;
}

export interface FreeShape {
  side: 'left' | 'right';
  /** 浮動框的寬、高（mm） */
  width: number;
  height: number;
  /** 上方讓位（只裁掉上面的形狀） */
  top: number;
}

/**
 * 自由配置圖片的「避開矩形」浮動框（3.2.9）：單欄頁、知道長寬比、圖片與版心有重疊時才有。
 */
export function freeShape(
  b: Block,
  doc: Pick<Doc, 'padH' | 'padV'>,
  pageCols: number,
): FreeShape | null {
  if (String(b.wrap ?? 'square') === 'none') return null;
  const ar = +(b.ar ?? 0) || 0;
  if (!ar) return null;
  if (pageCols === 2) return null;
  const w = imageWidthMm(b, doc);
  const h = w * ar;
  const x0 = +(b.fx ?? 0) || 0;
  const y0 = +(b.fy ?? 0) || 0;
  const cl = doc.padH;
  const cr = PAPER_W - doc.padH;
  if (x0 + w <= cl || x0 >= cr) return null;
  const mid = (cl + cr) / 2;
  const useLeft = x0 + w / 2 <= mid;
  const sw = useLeft ? Math.min(cr, x0 + w) - cl + FREE_GAP : cr - Math.max(cl, x0) + FREE_GAP;
  if (sw <= 0) return null;
  const top = Math.max(0, y0 - doc.padV - FREE_GAP / 2);
  return { side: useLeft ? 'left' : 'right', width: sw, height: top + h + FREE_GAP, top };
}

/** 繞排圖片的位移（只在單欄頁有效） */
export function imageOffset(b: Block, pageCols: number): { dy: number; dx: number } {
  const on = pageCols !== 2;
  return { dy: on ? +(b.dy ?? 0) || 0 : 0, dx: on ? +(b.dx ?? 0) || 0 : 0 };
}
