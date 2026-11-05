/**
 * 自由線（2026-11-05，參考 KIIN マップ制作スタジオ v2.0 的「自由線」；規格 F285、F286、3.16.8）。
 *
 * 兩端 (x1, y1)、(x2, y2) 與控制點 (cx, cy) 的二次曲線：曲線的欄杆、內牆、段差、繩索、箭頭。
 * 只是畫在圖上的線——不產生牆、不切門窗、不擋家具（KIIN 也是「図面上の描画」）。
 * 編輯時中間的方塊控制點在曲線的正中間（t＝0.5），拖它就是改彎曲：控制點＝2 × 中點 − 兩端的中點。
 */
import type { FreeLine, LineKind, Rect } from './types';

export const LINE_KINDS: readonly LineKind[] = ['rail', 'wall', 'step', 'rope', 'arrow'];
export const isLineKind = (v: unknown): v is LineKind =>
  typeof v === 'string' && (LINE_KINDS as readonly string[]).includes(v);

/** 線的粗細倍率的範圍 */
export const LINE_W_MIN = 0.5;
export const LINE_W_MAX = 3;

/** 每一種線的基本粗細（格；倍率 1 時） */
export const LINE_BASE: Record<LineKind, number> = {
  rail: 0.16,
  wall: 0.2,
  step: 0.06,
  rope: 0.1,
  arrow: 0.09,
};

/** 一條線最短幾格（畫的時候太短就不新增） */
export const LINE_MIN_LEN = 0.5;

type Pt = { x: number; y: number };
type Curve = Pick<FreeLine, 'x1' | 'y1' | 'cx' | 'cy' | 'x2' | 'y2'>;

/** 曲線上 t（0～1）的點 */
export function linePoint(l: Curve, t: number): Pt {
  const u = 1 - t;
  return {
    x: u * u * l.x1 + 2 * u * t * l.cx + t * t * l.x2,
    y: u * u * l.y1 + 2 * u * t * l.cy + t * t * l.y2,
  };
}

/** 曲線上 t 的切線方向（沒有長度時用兩端的方向） */
export function lineTangent(l: Curve, t: number): Pt {
  const dx = 2 * (1 - t) * (l.cx - l.x1) + 2 * t * (l.x2 - l.cx);
  const dy = 2 * (1 - t) * (l.cy - l.y1) + 2 * t * (l.y2 - l.cy);
  if (Math.hypot(dx, dy) > 1e-9) return { x: dx, y: dy };
  return { x: l.x2 - l.x1, y: l.y2 - l.y1 };
}

/** 曲線切成 n 段的折線（畫法、點選、範圍用） */
export function lineSamples(l: Curve, n = 32): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) out.push(linePoint(l, i / n));
  return out;
}

/** 曲線的長度（折線近似） */
export function lineLength(l: Curve): number {
  const s = lineSamples(l);
  let len = 0;
  for (let i = 1; i < s.length; i++) len += Math.hypot(s[i].x - s[i - 1].x, s[i].y - s[i - 1].y);
  return len;
}

/** 曲線的正中間（編輯時的方塊控制點） */
export const lineMid = (l: Curve): Pt => linePoint(l, 0.5);

/** 拖中間的控制點到 m：控制點＝2m − 兩端的中點（曲線通過 m） */
export function bendTo(l: Curve, m: Pt): Pt {
  return { x: 2 * m.x - (l.x1 + l.x2) / 2, y: 2 * m.y - (l.y1 + l.y2) / 2 };
}

/** 點到曲線的距離 */
export function lineDistance(l: Curve, px: number, py: number): number {
  const s = lineSamples(l);
  let best = Number.POSITIVE_INFINITY;
  for (let i = 1; i < s.length; i++) {
    const a = s[i - 1];
    const b = s[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1e-12;
    const k = Math.min(1, Math.max(0, ((px - a.x) * dx + (py - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(px - (a.x + k * dx), py - (a.y + k * dy)));
  }
  return best;
}

/** 線畫出來的範圍（折線的外接範圍＋粗細的一半；箭頭多留箭頭的大小） */
export function lineBounds(l: FreeLine): Rect {
  const s = lineSamples(l);
  const xs = s.map((p) => p.x);
  const ys = s.map((p) => p.y);
  const pad = (LINE_BASE[l.kind] ?? 0.1) * (l.w ?? 1) * (l.kind === 'arrow' ? 4 : 1) + 0.1;
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return { x, y, w: Math.max(...xs) + pad - x, h: Math.max(...ys) + pad - y };
}

/** 線的每一個點換掉（平移、旋轉、反轉共用） */
export function mapLine(l: FreeLine, f: (x: number, y: number) => [number, number]): void {
  [l.x1, l.y1] = f(l.x1, l.y1);
  [l.cx, l.cy] = f(l.cx, l.cy);
  [l.x2, l.y2] = f(l.x2, l.y2);
}

/** 以兩端的中點為中心左右（axis 'x'）或上下（'y'）反轉 */
export function flipLine(l: FreeLine, axis: 'x' | 'y'): void {
  const mx = (l.x1 + l.x2) / 2;
  const my = (l.y1 + l.y2) / 2;
  const r = (v: number) => Math.round(v * 100) / 100;
  mapLine(l, (x, y) => (axis === 'x' ? [r(2 * mx - x), y] : [x, r(2 * my - y)]));
}
