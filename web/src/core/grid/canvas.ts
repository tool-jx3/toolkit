/**
 * 畫網格用的小工具（純函式，只產生 canvas 要的值）。
 */
import { parseColor } from '../color';

/** 線型：實線、虛線、點線 */
export type GridLineStyle = 'solid' | 'dashed' | 'dotted';
export const GRID_LINE_STYLES: readonly GridLineStyle[] = ['solid', 'dashed', 'dotted'];

/** setLineDash 的值：虛線＝線寬 × 4 畫、× 3 空；點線＝線寬畫、線寬 × 2.5 空 */
export function gridLineDash(style: GridLineStyle, width: number): number[] {
  if (style === 'dashed') return [width * 4, width * 3];
  if (style === 'dotted') return [width, width * 2.5];
  return [];
}

/**
 * 色碼（#rrggbb／#rrggbbaa）→ canvas 的 `rgba(R,G,B,A)`，A 寫到小數 4 位。
 * `alphaMul` 乘上整體不透明度（例如 0.5）；`alpha` 直接指定透明度（例如發光一律不透明）。
 * 與舊版相同的寫法，同一個顏色在兩邊會得到同樣的像素。
 */
export function canvasRgba(color: string, alphaMul = 1, alpha?: number): string {
  const c = parseColor(color) ?? { r: 0, g: 0, b: 0, a: 1 };
  const a = alpha ?? c.a * alphaMul;
  return `rgba(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)},${a.toFixed(4)})`;
}

/** 色碼的透明度（0～1） */
export function colorAlpha(color: string): number {
  return parseColor(color)?.a ?? 1;
}
