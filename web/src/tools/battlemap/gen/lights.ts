/**
 * 沒有房間的生成法（洞窟、迷宮）的火光位置：挑地板圍起來的格線交點，彼此至少隔 LIGHT_SPACING 格，
 * 數量約每 FLOOR_PER_LIGHT 格地板一團（改版前的房間地圖平均約每 18 格地板一團）。
 * 優先挑四周四格都是地板的交點（空地中央），沒有時退而求其次（三格、兩格）。
 */
import type { Random } from '@/core/timeline';
import { countOpen, type Mask, shuffle } from './mask';

export const FLOOR_PER_LIGHT = 22;
export const LIGHT_SPACING = 4;

export interface GridPoint {
  /** 格線交點（格為單位：x＝第幾條直線） */
  x: number;
  y: number;
}

export function scatterLights(m: Mask, rng: Random): GridPoint[] {
  const { cols, rows, open } = m;
  const target = Math.max(1, Math.round(countOpen(m) / FLOOR_PER_LIGHT));
  const candidates: (GridPoint & { score: number })[] = [];
  for (let y = 1; y < rows; y++) {
    for (let x = 1; x < cols; x++) {
      const score =
        open[(y - 1) * cols + x - 1] +
        open[(y - 1) * cols + x] +
        open[y * cols + x - 1] +
        open[y * cols + x];
      if (score >= 2) candidates.push({ x, y, score });
    }
  }
  /* 先洗牌再依分數排序（排序是穩定的，同分的順序由亂數決定） */
  const order = shuffle(candidates, rng).sort((a, b) => b.score - a.score);
  const picked: GridPoint[] = [];
  const min2 = LIGHT_SPACING * LIGHT_SPACING;
  for (const c of order) {
    if (picked.length >= target) break;
    if (picked.every((p) => (p.x - c.x) ** 2 + (p.y - c.y) ** 2 >= min2))
      picked.push({ x: c.x, y: c.y });
  }
  return picked;
}
