/**
 * 版面位置（規格 3.3、3.8、3.9.5）：整塊文字放在畫布的哪裡。座標以字的「字身框」計
 * （字身框上緣＝字級的頂端、高＝字級）；core/typeset 的區塊左上角就是第一行字身框的左上角。
 *
 * - 橫書：行距＝字級 × 倍數；靠上時第一行字身框上緣在 y＝10、置中、靠下時在「畫布高 − 行數 × 行距 − 10」。
 *   每行各自水平對齊（左右留白 10）；水平縮放 s＝在寬度 ÷ s 的畫面排版、再整個水平乘 s（留白也跟著乘）。
 * - 直書：欄由右往左；整組寬＝欄數 × 欄距，第一欄的字身框貼在整組的右緣；每欄各自垂直對齊（上下留白 10）。
 * - 片尾名單：左右留白 20、沒有水平縮放。
 */
import type { HAlign, VAlign } from './settings';

export const MARGIN = 10;
export const CREDITS_MARGIN = 20;

/** 橫書：區塊（各行已在區塊內對齊）的左緣 x。blockW 是未縮放的寬度，回傳的是縮放後畫布上的 x */
export function horizontalBlockX(
  align: HAlign,
  canvasW: number,
  blockW: number,
  scaleX = 1,
  margin = MARGIN,
): number {
  const s = scaleX > 0 ? scaleX : 1;
  const W = canvasW / s;
  const x = align === 'left' ? margin : align === 'right' ? W - margin - blockW : (W - blockW) / 2;
  return x * s;
}

/** 橫書：第一行字身框上緣的 y（整塊高＝行數 × 行距） */
export function horizontalBlockY(
  valign: VAlign,
  canvasH: number,
  lines: number,
  size: number,
  leading: number,
): number {
  const pitch = size * leading;
  const n = Math.max(1, lines);
  if (valign === 'top') return MARGIN;
  if (valign === 'bottom') return canvasH - n * pitch - MARGIN;
  return (canvasH - ((n - 1) * pitch + size)) / 2;
}

/** 直書：區塊左緣 x（第一欄中心：靠右＝畫布寬 − 10 − 字級 ÷ 2；靠左＝10 ＋ 整組寬 − 字級 ÷ 2；置中＝(畫布寬＋整組寬) ÷ 2 − 字級 ÷ 2） */
export function verticalBlockX(
  align: HAlign,
  canvasW: number,
  cols: number,
  size: number,
  leading: number,
  scaleX = 1,
): number {
  const s = scaleX > 0 ? scaleX : 1;
  const W = canvasW / s;
  const pitch = size * leading;
  const n = Math.max(1, cols);
  const group = n * pitch;
  const blockW = (n - 1) * pitch + size;
  const firstCenter =
    align === 'right'
      ? W - MARGIN - size / 2
      : align === 'left'
        ? MARGIN + group - size / 2
        : (W + group) / 2 - size / 2;
  return (firstCenter + size / 2 - blockW) * s;
}

/** 直書：區塊上緣 y（每欄已在區塊內各自對齊） */
export function verticalBlockY(valign: VAlign, canvasH: number, blockH: number): number {
  if (valign === 'top') return MARGIN;
  if (valign === 'bottom') return canvasH - MARGIN - blockH;
  return (canvasH - blockH) / 2;
}

/** 卡拉 OK：第 row 行的字身框上緣 y（行數＝rows，規則同橫書） */
export function karaokeRowTop(
  row: number,
  rows: number,
  valign: VAlign,
  canvasH: number,
  size: number,
  leading: number,
): number {
  return horizontalBlockY(valign, canvasH, rows, size, leading) + row * size * leading;
}

/** 卡拉 OK 的遮罩上下範圍：延伸到行與行的中線，第一行到畫布頂、最後一行到畫布底 */
export function karaokeRowBand(
  row: number,
  rows: number,
  top: number,
  canvasH: number,
  size: number,
  leading: number,
): { top: number; bottom: number } {
  const half = (size * leading - size) / 2;
  return {
    top: row === 0 ? 0 : top - half,
    bottom: row === rows - 1 ? canvasH : top + size + half,
  };
}

/**
 * 依文字裁切（卡拉 OK）：寬＝最寬一句 × 水平縮放＋2 × 外框＋2 × 陰影模糊＋40，
 * 高＝行數 × 字級 × 行距＋同樣的留白；皆無條件進位、至少 50。
 */
export function karaokeFitSize(o: {
  maxLineWidth: number;
  scaleX: number;
  rows: number;
  size: number;
  leading: number;
  strokeWidth: number;
  shadowBlur: number;
}): { width: number; height: number } {
  const pad = 2 * o.strokeWidth + 2 * o.shadowBlur + 40;
  return {
    width: Math.max(50, Math.ceil(o.maxLineWidth * o.scaleX + pad - 1e-9)),
    height: Math.max(50, Math.ceil(o.rows * o.size * o.leading + pad - 1e-9)),
  };
}

/** 依文字裁切（打字／故障）：墨跡範圍＋四周各 30 */
export function inkFitSize(ink: { width: number; height: number }): {
  width: number;
  height: number;
} {
  return { width: Math.round(ink.width + 60), height: Math.round(ink.height + 60) };
}
