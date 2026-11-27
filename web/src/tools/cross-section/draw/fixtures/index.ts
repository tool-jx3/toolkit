/**
 * 設備的畫法：種類 → 畫圖的函式（座標：底部的中間是 (0, 0)，往上是負的；單位是格）。
 */
import { box, type Kit } from '../kit';
import { FACILITY_DRAW } from './facility';
import { INCIDENT_DRAW } from './incidents';
import { OPENING_DRAW } from './openings';
import type { DrawOpts } from './types';

export { BREAKABLE } from './openings';
export type { DrawOpts } from './types';

const DRAW: Record<string, (k: Kit, o: DrawOpts) => void> = {
  ...FACILITY_DRAW,
  ...OPENING_DRAW,
  ...INCIDENT_DRAW,
};

export function drawFixture(k: Kit, kind: string, o: DrawOpts): void {
  const fn = DRAW[kind];
  if (fn) fn(k, o);
  else box(k, -0.5, -1, 1, 1, k.p.body, 0.03);
}

export const hasDrawing = (kind: string): boolean => kind in DRAW;
