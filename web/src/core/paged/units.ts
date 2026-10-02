/**
 * 書頁的單位與尺寸：mm、pt、px 的換算，紙張大小，縮放倍率的階段。
 */

/** 1 mm 是幾 px（CSS 的 96 dpi） */
export const MM_PX = 96 / 25.4;
/** 1 pt 是幾 px */
export const PT_PX = 96 / 72;
/** 1 px 是幾 pt（PDF 座標） */
export const PX_PT = 72 / 96;

export const mmToPx = (mm: number): number => mm * MM_PX;
export const pxToMm = (px: number): number => px / MM_PX;
export const mmToPt = (mm: number): number => (mm * 72) / 25.4;

export interface PaperSize {
  /** mm */
  w: number;
  h: number;
}

export const PAPER_SIZES = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  B5: { w: 182, h: 257 },
} as const satisfies Record<string, PaperSize>;

export type PaperName = keyof typeof PAPER_SIZES;

/** 縮放的階段（25～300％） */
export const ZOOM_STEPS: readonly number[] = [0.25, 0.35, 0.5, 0.65, 0.8, 1, 1.25, 1.5, 2, 2.5, 3];
export const ZOOM_MIN = 0.15;
export const ZOOM_MAX = 3;

/** 下一個（dir > 0）或上一個縮放階段；已經到頭時回傳 null */
export function stepZoom(current: number, dir: number): number | null {
  const n =
    dir > 0
      ? ZOOM_STEPS.find((v) => v > current + 0.001)
      : [...ZOOM_STEPS].reverse().find((v) => v < current - 0.001);
  return n ?? null;
}

/** 配合寬度的倍率：可用寬度 ÷ 紙寬（夾在 15～200％） */
export function fitZoom(availPx: number, paperWmm: number, min = ZOOM_MIN, max = 2): number {
  if (!(availPx > 0)) return 1;
  return Math.max(min, Math.min(max, availPx / mmToPx(paperWmm)));
}

/** 檔名：把 Windows 不能用的字元換成「_」（空白時用 fallback） */
export function paperFileName(title: string, ext: string, fallback = 'scenario'): string {
  const base = String(title ?? '').replace(/[\\/:*?"<>|]/g, '_') || fallback;
  return `${base}.${ext}`;
}
