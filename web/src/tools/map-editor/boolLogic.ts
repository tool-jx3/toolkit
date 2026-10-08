/**
 * 布林運算的幾何（規格 F170、3.4）：圖形轉成多邊形的環（曲線每段 24 點、橢圓 64 點），
 * 交給 polygon-clipping，結果接成 SVG path。純函式（不 import Fabric）。
 */
import polygonClipping, { type MultiPolygon, type Polygon } from 'polygon-clipping';

export type BoolOp = 'union' | 'intersection' | 'difference' | 'xor';
export const BOOL_OPS: readonly BoolOp[] = ['union', 'intersection', 'difference', 'xor'];
export type Ring = [number, number][];

/** 曲線每段取幾點 */
export const CURVE_SAMPLES = 24;
/** 橢圓、圓取幾點 */
export const ELLIPSE_SAMPLES = 64;

type Apply = (lx: number, ly: number) => [number, number];

/** 橢圓（rx、ry，以中心為原點的本地座標）→ 一個環 */
export function ellipseRing(rx: number, ry: number, apply: Apply): Ring {
  const out: Ring = [];
  for (let i = 0; i < ELLIPSE_SAMPLES; i++) {
    const a = (i * 2 * Math.PI) / ELLIPSE_SAMPLES;
    out.push(apply(Math.cos(a) * rx, Math.sin(a) * ry));
  }
  return out;
}

/** 路徑（Fabric 的指令陣列：M、L、Q、C、Z；大小寫都接受，視為絕對座標）→ 環；少於 3 點的環丟掉 */
export function pathRings(
  cmds: readonly (readonly (string | number)[])[],
  offset: { x: number; y: number },
  apply: Apply,
): Ring[] {
  const rings: Ring[] = [];
  let cur: Ring | null = null;
  let lx = 0;
  let ly = 0;
  let sx = 0;
  let sy = 0;
  const push = (x: number, y: number) => {
    if (!cur) cur = [];
    cur.push(apply(x - offset.x, y - offset.y));
    lx = x;
    ly = y;
  };
  const N = CURVE_SAMPLES;
  for (const c of cmds) {
    const op = String(c[0]).toUpperCase();
    const n = (i: number) => Number(c[i]);
    if (op === 'M') {
      if (cur && (cur as Ring).length >= 3) rings.push(cur);
      cur = [];
      sx = n(1);
      sy = n(2);
      push(sx, sy);
    } else if (op === 'L') push(n(1), n(2));
    else if (op === 'Q') {
      const [x0, y0] = [lx, ly];
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const u = 1 - t;
        push(
          u * u * x0 + 2 * u * t * n(1) + t * t * n(3),
          u * u * y0 + 2 * u * t * n(2) + t * t * n(4),
        );
      }
    } else if (op === 'C') {
      const [x0, y0] = [lx, ly];
      for (let i = 1; i <= N; i++) {
        const t = i / N;
        const u = 1 - t;
        push(
          u * u * u * x0 + 3 * u * u * t * n(1) + 3 * u * t * t * n(3) + t * t * t * n(5),
          u * u * u * y0 + 3 * u * u * t * n(2) + 3 * u * t * t * n(4) + t * t * t * n(6),
        );
      }
    } else if (op === 'Z') {
      if (cur && (cur as Ring).length >= 3) rings.push(cur);
      cur = null;
      lx = sx;
      ly = sy;
    }
  }
  if (cur && (cur as Ring).length >= 3) rings.push(cur);
  return rings;
}

/** 多個圖形（每個是一組環）做布林運算；polygon-clipping 失敗時丟錯 */
export function booleanOp(op: BoolOp, shapes: readonly Ring[][]): MultiPolygon {
  const [first, ...rest] = shapes as unknown as Polygon[];
  return polygonClipping[op](first, ...rest);
}

/** 結果 → SVG path（每個環 M … L … Z；少於 3 點的環略過） */
export function multiPolygonPath(result: MultiPolygon): string {
  let d = '';
  for (const poly of result)
    for (const ring of poly) {
      if (ring.length < 3) continue;
      d += `M ${ring[0][0]} ${ring[0][1]}`;
      for (let i = 1; i < ring.length; i++) d += ` L ${ring[i][0]} ${ring[i][1]}`;
      d += ' Z ';
    }
  return d.trim();
}
