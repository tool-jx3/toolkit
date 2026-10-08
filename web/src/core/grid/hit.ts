/**
 * 點擊判定：找離點最近的格子中心。
 */
import type { Point } from './types';

/**
 * 最近的點（例如格子中心）；距離相同時取先出現的。超過 `maxDistance` 時回傳 null（剛好等於還算）。
 * 舊版六角格量尺：在畫出來的格子裡找最近的中心，距離超過格子大小 × 0.65 就當作點在格子外。
 */
export function nearestPoint<T extends Point>(
  points: Iterable<T>,
  x: number,
  y: number,
  maxDistance = Number.POSITIVE_INFINITY,
): T | null {
  let best: T | null = null;
  let bestD2 = Number.POSITIVE_INFINITY;
  for (const p of points) {
    const d2 = (x - p.x) ** 2 + (y - p.y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  if (!best || bestD2 > maxDistance ** 2) return null;
  return best;
}

/** 元素上的滑鼠位置 → 畫布像素座標（畫布被 CSS 縮放時也正確） */
export function clientToCanvas(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  canvasWidth: number,
  canvasHeight: number,
): Point {
  return {
    x: (clientX - rect.left) * (canvasWidth / rect.width),
    y: (clientY - rect.top) * (canvasHeight / rect.height),
  };
}
