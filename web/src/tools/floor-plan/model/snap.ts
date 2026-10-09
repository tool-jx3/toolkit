/**
 * 吸附：門窗吸到最近的牆線、家具貼牆（背面朝牆）、手畫牆的端點。
 */
import { ASSET, assetDims } from './assets';
import { OPEN, wallThickness } from './catalog';
import { clamp, snap } from './geometry';
import type { Floor, Opening, OpeningKind, Rect } from './types';
import type { WallRun } from './walls';

const lineOf = (o: Pick<Opening, 'o' | 'x' | 'y'>) => (o.o === 'h' ? o.y : o.x);
const startOf = (o: Pick<Opening, 'o' | 'x' | 'y'>) => (o.o === 'h' ? o.x : o.y);

export interface OpeningGhost {
  kind: OpeningKind;
  o: 'h' | 'v';
  x: number;
  y: number;
  len: number;
  side: 1 | -1;
  /** 所在的牆的厚度 */
  t: number;
  /** 和既有的門窗重疊（不能放） */
  clash: boolean;
}

/**
 * 游標附近的牆線上放門窗：離線 1.25 格以內、沿線方向在牆段兩端外 0.4 格以內的最近一條。
 * 寬度＝想要的寬度與牆段長度取小；起點對齊 0.25 格並夾在牆段內；門往游標那一側開。
 * `ignoreId`：拖曳既有的門窗時，不和自己比重疊。
 */
export function snapOpening(
  lines: readonly WallRun[],
  openings: readonly Opening[],
  wx: number,
  wy: number,
  kind: OpeningKind,
  len?: number,
  ignoreId?: string,
): OpeningGhost | null {
  const want = len || OPEN[kind].len;
  let best: { r: WallRun; d: number; along: number; across: number } | null = null;
  for (const r of lines) {
    const along = r.o === 'h' ? wx : wy;
    const across = r.o === 'h' ? wy : wx;
    const d = Math.abs(across - r.c);
    if (d > 1.25 || along < r.a - 0.4 || along > r.b + 0.4) continue;
    if (!best || d < best.d) best = { r, d, along, across };
  }
  if (!best) return null;
  const { r, along, across } = best;
  const size = Math.min(want, r.b - r.a);
  const start = clamp(snap(along - size / 2, 0.25), r.a, r.b - size);
  const pos =
    r.o === 'h' ? { o: 'h' as const, x: start, y: r.c } : { o: 'v' as const, x: r.c, y: start };
  const clash = openings.some(
    (op) =>
      op.id !== ignoreId &&
      op.o === pos.o &&
      Math.abs(lineOf(op) - r.c) < 1e-6 &&
      startOf(op) < start + size - 1e-6 &&
      start < startOf(op) + op.len - 1e-6,
  );
  return {
    kind,
    ...pos,
    len: size,
    side: across >= r.c ? 1 : -1,
    t: wallThickness(r.kind),
    clash,
  };
}

/** 外框貼牆：邊緣離牆線 reach 格以內就對齊到牆線（x、y 各自找最近的） */
export function magnet(lines: readonly WallRun[], rect: Rect, reach = 0.3): Rect {
  let bestX: { d: number; x: number } | null = null;
  let bestY: { d: number; y: number } | null = null;
  for (const r of lines) {
    if (r.o === 'v' && r.a < rect.y + rect.h && r.b > rect.y) {
      for (const [edge, x] of [
        [rect.x, r.c],
        [rect.x + rect.w, r.c - rect.w],
      ] as const) {
        const d = Math.abs(edge - r.c);
        if (d < reach && (!bestX || d < bestX.d)) bestX = { d, x };
      }
    }
    if (r.o === 'h' && r.a < rect.x + rect.w && r.b > rect.x) {
      for (const [edge, y] of [
        [rect.y, r.c],
        [rect.y + rect.h, r.c - rect.h],
      ] as const) {
        const d = Math.abs(edge - r.c);
        if (d < reach && (!bestY || d < bestY.d)) bestY = { d, y };
      }
    }
  }
  return { ...rect, x: bestX ? bestX.x : rect.x, y: bestY ? bestY.y : rect.y };
}

export interface ArmedItem {
  t: string;
  rot: number;
  /** 使用者按 R 轉過：不再自動轉向 */
  manual?: boolean;
}

export interface ItemGhost extends Rect {
  t: string;
  rot: number;
}

/**
 * 要放的家具跟著游標（中心對齊游標、0.25 格）。`free`（Alt）時不吸附。
 * 會背面朝牆的家具：游標在牆段範圍內、離牆線「深度 ÷ 2 ＋ 1.1 格」以內時，轉成背面朝牆（使用者自己轉過就不改方向）
 * 並貼到牆線上；欄杆不算牆。最後一律貼牆（magnet）。
 */
export function itemGhost(
  lines: readonly WallRun[],
  wx: number,
  wy: number,
  armed: ArmedItem,
  free = false,
): ItemGhost {
  const asset = ASSET[armed.t];
  let rot = armed.rot || 0;
  let d = assetDims(asset, rot);
  let rect: Rect = { x: snap(wx - d.w / 2, 0.25), y: snap(wy - d.h / 2, 0.25), w: d.w, h: d.h };
  if (free) return { t: armed.t, rot, ...rect };
  if (asset.orient) {
    const depth = asset.h;
    let best: { d: number; r: WallRun; dir: 'up' | 'down' | 'left' | 'right' } | null = null;
    for (const r of lines) {
      if (r.kind === 'rail') continue;
      if (r.o === 'h' && wx > r.a && wx < r.b) {
        const dist = Math.abs(wy - r.c);
        if (dist < depth / 2 + 1.1 && (!best || dist < best.d))
          best = { d: dist, r, dir: wy > r.c ? 'up' : 'down' };
      }
      if (r.o === 'v' && wy > r.a && wy < r.b) {
        const dist = Math.abs(wx - r.c);
        if (dist < depth / 2 + 1.1 && (!best || dist < best.d))
          best = { d: dist, r, dir: wx > r.c ? 'left' : 'right' };
      }
    }
    if (best) {
      if (!armed.manual) rot = { up: 0, right: 90, down: 180, left: 270 }[best.dir];
      d = assetDims(asset, rot);
      const c = best.r.c;
      if (best.dir === 'up') rect = { x: snap(wx - d.w / 2, 0.25), y: c, w: d.w, h: d.h };
      else if (best.dir === 'down')
        rect = { x: snap(wx - d.w / 2, 0.25), y: c - d.h, w: d.w, h: d.h };
      else if (best.dir === 'left') rect = { x: c, y: snap(wy - d.h / 2, 0.25), w: d.w, h: d.h };
      else rect = { x: c - d.w, y: snap(wy - d.h / 2, 0.25), w: d.w, h: d.h };
      return { t: armed.t, rot, ...magnet(lines, rect) };
    }
  }
  return { t: armed.t, rot, ...magnet(lines, rect) };
}

/** 畫牆時的點：對齊 0.5 格；離既有手畫牆的端點 reach 格以內時吸到那個端點 */
export function snapWallPoint(
  floor: Pick<Floor, 'walls'>,
  wx: number,
  wy: number,
  reach: number,
): { x: number; y: number } {
  let p = { x: snap(wx, 0.5), y: snap(wy, 0.5) };
  for (const w of floor.walls) {
    for (const [x, y] of [
      [w.x1, w.y1],
      [w.x2, w.y2],
    ] as const) {
      if (Math.hypot(wx - x, wy - y) < reach) p = { x, y };
    }
  }
  return p;
}

/** 不按 Shift 時：牆只能水平或垂直（取移動量較大的方向） */
export function axisLock(
  a: { x: number; y: number },
  b: { x: number; y: number },
): { x: number; y: number } {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
}
