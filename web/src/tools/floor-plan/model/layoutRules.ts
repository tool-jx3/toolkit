/**
 * 格局的規則（規格 F194、F212、F242）：門的開門範圍與門前、家具擋路、長方形的重疊。
 *
 * 2026-10-29 從測試輔助（`tests/helpers/floorPlanLayout.ts`）搬過來：範本的格局檢查、連接房間放門（F250）、
 * 整理家具（F253）共用同一份規則，測試輔助照舊匯出這些名字。
 */
import { ASSET } from './assets';
import { DOUBLE_DOORS, OPEN, SWING_DOORS } from './catalog';
import type { Item, Opening, Rect } from './types';

export const EPS = 1e-6;

/** 門前（牆的兩側各一條）要空出來的深度：一格 */
export const FRONT = 1;

/** 四分之一圓：圓心（鉸鍊）、半徑（門板長），往 (dx, dy) 那一象限 */
export interface Sector {
  cx: number;
  cy: number;
  r: number;
  dx: 1 | -1;
  dy: 1 | -1;
}

/**
 * 門要空出來的範圍：門前一格（牆的兩側，寬度＝門寬）；會開的門另加門板掃過的扇形
 * （單開門類：鉸鍊為圓心、門寬為半徑；雙開門類〔雙開門、大型雙開門，`DOUBLE_DOORS`〕：兩端各一片、半徑是門寬的一半），
 * 折門加門板折出來的深度，旋轉門加圓往牆的兩側凸出的半個寬度（2026-10 第三批後半）。
 */
export function doorClearance(o: Opening): { rects: Rect[]; sectors: Sector[] } {
  const h = o.o === 'h';
  const a = h ? o.x : o.y;
  const c = h ? o.y : o.x;
  const s = o.side < 0 ? -1 : 1;
  /** 沿著牆 [a0, a0＋len]、往牆的 side 那一側 depth 格的長方形 */
  const band = (a0: number, len: number, side: 1 | -1, depth: number): Rect => {
    const c0 = side > 0 ? c : c - depth;
    return h ? { x: a0, y: c0, w: len, h: depth } : { x: c0, y: a0, w: depth, h: len };
  };
  const rects = [band(a, o.len, 1, FRONT), band(a, o.len, -1, FRONT)];
  const sectors: Sector[] = [];
  const leaf = (at: number, dir: 1 | -1, r: number) =>
    sectors.push(h ? { cx: at, cy: c, r, dx: dir, dy: s } : { cx: c, cy: at, r, dx: s, dy: dir });
  if (DOUBLE_DOORS.has(o.kind)) {
    leaf(a, 1, o.len / 2);
    leaf(a + o.len, -1, o.len / 2);
  } else if (SWING_DOORS.has(o.kind)) {
    if (o.hinge) leaf(a + o.len, -1, o.len);
    else leaf(a, 1, o.len);
  } else if (o.kind === 'folding') {
    const panel = o.len >= 2.4 ? o.len / 2 : o.len;
    rects.push(band(a, o.len, s, panel / 2));
  } else if (o.kind === 'revolve') {
    rects.push(band(a, o.len, 1, o.len / 2), band(a, o.len, -1, o.len / 2));
  }
  return { rects, sectors };
}

/** 窗前要空出來的範圍（整理家具用）：窗的兩側各一格 */
export function windowFront(o: Opening, depth = FRONT): Rect[] {
  const h = o.o === 'h';
  const a = h ? o.x : o.y;
  const c = h ? o.y : o.x;
  return [-1, 1].map((side) => {
    const c0 = side > 0 ? c : c - depth;
    return h ? { x: a, y: c0, w: o.len, h: depth } : { x: c0, y: a, w: depth, h: o.len };
  });
}

export const overlapLen = (a0: number, a1: number, b0: number, b1: number): number =>
  Math.min(a1, b1) - Math.max(a0, b0);

/** 兩個長方形重疊（只碰到邊不算） */
export const rectHits = (a: Rect, b: Rect): boolean =>
  overlapLen(a.x, a.x + a.w, b.x, b.x + b.w) > EPS &&
  overlapLen(a.y, a.y + a.h, b.y, b.y + b.h) > EPS;

/** 長方形碰到四分之一圓（不算剛好貼著） */
export function sectorHits(s: Sector, r: Rect): boolean {
  const qx0 = Math.min(s.cx, s.cx + s.dx * s.r);
  const qy0 = Math.min(s.cy, s.cy + s.dy * s.r);
  const x0 = Math.max(r.x, qx0);
  const x1 = Math.min(r.x + r.w, qx0 + s.r);
  const y0 = Math.max(r.y, qy0);
  const y1 = Math.min(r.y + r.h, qy0 + s.r);
  if (x1 - x0 <= EPS || y1 - y0 <= EPS) return false;
  const px = Math.min(Math.max(s.cx, x0), x1);
  const py = Math.min(Math.max(s.cy, y0), y1);
  return Math.hypot(px - s.cx, py - s.cy) < s.r - 1e-3;
}

/** 長方形碰到門的開門範圍或門前 */
export function hitsDoor(o: Opening, r: Rect): boolean {
  const zone = doorClearance(o);
  return zone.rects.some((z) => rectHits(z, r)) || zone.sectors.some((s) => sectorHits(s, r));
}

/** 擋路的家具：畫在其他家具底下的（地毯、血跡、舞台…）不算 */
export const blocking = (it: Pick<Item, 't'>): boolean => !ASSET[it.t]?.under;

/** 門類的門窗（門、開口、牆上的破洞…；窗以外） */
export const doorKinds = (o: Pick<Opening, 'kind'>): boolean => OPEN[o.kind].group === 'door';
