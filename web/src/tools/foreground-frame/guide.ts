/**
 * 沿框裝飾的導引線（規格 3.7）：把窗的輪廓往框外推「離窗距離」單位，每隔幾個單位取一點；
 * 每一點知道往外的法線、屬於哪一邊、是不是在角上。依配置（上、下、四個角…）與延伸量篩出連續的幾段。
 * 純計算（不依賴 canvas），單元測試直接驗。
 */
import { cornerAt, openingRect, type WindowRect } from './geometry';
import type { FrameState, Placement } from './model';

const TAU = Math.PI * 2;

export type Side = 't' | 'b' | 'l' | 'r';

export interface GuidePoint {
  x: number;
  y: number;
  /** 往框外的單位法線 */
  nx: number;
  ny: number;
  /** 切線（順時針前進方向） */
  tx: number;
  ty: number;
  /** 在第幾個角的弧上（0 左上、1 右上、2 右下、3 左下），不在角上是 -1 */
  corner: number;
  side: Side;
  /** 沿整圈的長度 */
  s: number;
  /** 沿所在那一段的長度（guideRuns 填入） */
  u: number;
}

export interface Guide {
  pts: GuidePoint[];
  /** 整圈長度 */
  L: number;
  /** 四個角的頂點在整圈上的位置 */
  apex: number[];
}

type Shape = Pick<FrameState, 'size' | 'opening'>;

function sideOf(nx: number, ny: number): Side {
  return Math.abs(ny) >= Math.abs(nx) ? (ny < 0 ? 't' : 'b') : nx > 0 ? 'r' : 'l';
}

/** 取樣導引線：offset 往框外推（負值往窗內），step 單位取一點。圓角照弧線，其他角形當直角 */
export function sampleGuide(state: Shape, offset: number, step: number): Guide {
  const r = openingRect(state);
  const o = offset;
  const pts: GuidePoint[] = [];
  const push = (x: number, y: number, nx: number, ny: number, corner: number) =>
    pts.push({ x, y, nx, ny, tx: -ny, ty: nx, corner, side: sideOf(nx, ny), s: 0, u: 0 });
  if (state.opening.shape === 'ellipse') {
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const a = r.w / 2 + o;
    const b = r.h / 2 + o;
    const n = Math.max(32, Math.round((Math.PI * (a + b)) / step));
    for (let i = 0; i < n; i++) {
      const t = -0.75 * Math.PI + (i / n) * TAU;
      const nx = Math.cos(t) / a;
      const ny = Math.sin(t) / b;
      const len = Math.hypot(nx, ny);
      const q = ((t + 0.75 * Math.PI) / (Math.PI / 2)) % 4;
      const corner = Math.abs(q - Math.round(q)) < 0.12 ? Math.round(q) % 4 : -1;
      push(cx + Math.cos(t) * a, cy + Math.sin(t) * b, nx / len, ny / len, corner);
    }
  } else {
    const lim = Math.min(r.w, r.h) / 2;
    const rad = (i: number) => {
      const c = cornerAt(state.opening, i);
      return c.type === 'round' ? Math.min(c.size, lim) : 0;
    };
    const centers: [number, number][] = [
      [r.x0 + rad(0), r.y0 + rad(0)],
      [r.x1 - rad(1), r.y0 + rad(1)],
      [r.x1 - rad(2), r.y1 - rad(2)],
      [r.x0 + rad(3), r.y1 - rad(3)],
    ];
    const starts = [Math.PI, -Math.PI / 2, 0, Math.PI / 2];
    const arc = (i: number) => {
      const R = rad(i) + o;
      const [cx, cy] = centers[i];
      const n = Math.max(1, Math.round((Math.max(0, R) * Math.PI) / 2 / step));
      for (let k = 0; k < n; k++) {
        const t = starts[i] + (k / n) * (Math.PI / 2);
        push(cx + Math.cos(t) * R, cy + Math.sin(t) * R, Math.cos(t), Math.sin(t), i);
      }
    };
    const edge = (ax: number, ay: number, bx: number, by: number, nx: number, ny: number) => {
      const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
      for (let k = 0; k < n; k++)
        push(ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n, nx, ny, -1);
    };
    const x0 = r.x0 - o;
    const y0 = r.y0 - o;
    const x1 = r.x1 + o;
    const y1 = r.y1 + o;
    arc(0);
    edge(centers[0][0], y0, centers[1][0], y0, 0, -1);
    arc(1);
    edge(x1, centers[1][1], x1, centers[2][1], 1, 0);
    arc(2);
    edge(centers[2][0], y1, centers[3][0], y1, 0, 1);
    arc(3);
    edge(x0, centers[3][1], x0, centers[0][1], -1, 0);
  }
  let s = 0;
  pts.forEach((p, i) => {
    if (i) s += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    p.s = s;
  });
  const last = pts[pts.length - 1];
  const L = s + Math.hypot(pts[0].x - last.x, pts[0].y - last.y);
  const apex = [0, 1, 2, 3].map((i) => {
    const mine = pts.filter((p) => p.corner === i);
    return mine.length ? mine[Math.floor(mine.length / 2)].s : 0;
  });
  return { pts, L, apex };
}

const EDGE_SIDES: Partial<Record<Placement, string>> = {
  all: 'tblr',
  top: 't',
  bottom: 'b',
  topbottom: 'tb',
  sides: 'lr',
};
const CORNER_SETS: Partial<Record<Placement, number[]>> = {
  corners: [0, 1, 2, 3],
  topcorners: [0, 1],
  bottomcorners: [2, 3],
};

export interface RunOptions {
  placement: Placement;
  coverage: number;
  offset: number;
}

/**
 * 符合配置與延伸量的連續幾段（每一點的 u＝沿該段的長度）。
 * 邊的配置：每條邊從兩端的角往中間長，長度＝延伸量 ×（窗長邊的一半＋|距離|），100% 整條；
 * 角的配置：從角往兩邊長「延伸量 × 窗短邊的一半」。延伸量至少 5%。
 */
export function guideRuns(state: Shape, d: RunOptions, step = 6): GuidePoint[][] {
  const { pts, L, apex } = sampleGuide(state, d.offset || 0, step);
  const r = openingRect(state);
  const dist = (s: number, i: number) => {
    const x = Math.abs(s - apex[i]) % L;
    return Math.min(x, L - x);
  };
  const near = (p: GuidePoint, set: number[], reach: number) =>
    set.some((i) => dist(p.s, i) <= reach);
  const set = CORNER_SETS[d.placement];
  const cover = Math.max(0.05, d.coverage == null ? 1 : d.coverage);
  const keep = pts.map((p) => {
    if (set) return near(p, set, Math.min(r.w, r.h) * 0.5 * cover);
    if (!(EDGE_SIDES[d.placement] ?? 'tblr').includes(p.side)) return false;
    return (
      cover >= 0.999 ||
      near(p, [0, 1, 2, 3], cover * (Math.max(r.w, r.h) / 2 + Math.abs(d.offset || 0)))
    );
  });
  const runs: GuidePoint[][] = [];
  const start = keep.indexOf(false);
  if (start < 0) {
    runs.push([...pts, { ...pts[0] }]);
  } else {
    let cur: GuidePoint[] | null = null;
    for (let k = 1; k <= pts.length; k++) {
      const i = (start + k) % pts.length;
      if (keep[i]) {
        cur ??= [];
        cur.push({ ...pts[i] });
      } else if (cur) {
        runs.push(cur);
        cur = null;
      }
    }
    if (cur) runs.push(cur);
  }
  for (const run of runs) {
    run[0].u = 0;
    for (let i = 1; i < run.length; i++)
      run[i].u = run[i - 1].u + Math.hypot(run[i].x - run[i - 1].x, run[i].y - run[i - 1].y);
  }
  return runs;
}

/** 角落類裝飾的配置對應：上、上方兩角 → 上面兩角；下、下方兩角 → 下面兩角；其他 → 四個角 */
const CORNER_PICK: Partial<Record<Placement, number[]>> = {
  corners: [0, 1, 2, 3],
  topcorners: [0, 1],
  bottomcorners: [2, 3],
  top: [0, 1],
  bottom: [2, 3],
};

export interface DecoCorner {
  i: number;
  /** 推出去之後的窗角 */
  x: number;
  y: number;
  /** 往框外的對角方向 */
  dx: number;
  dy: number;
  /** 沿上／下邊往中間的方向 */
  ex: number;
  ey: number;
  /** 沿側邊往中間的方向 */
  fx: number;
  fy: number;
  turn: number;
}

export function decoCorners(rect: WindowRect, placement: Placement, offset: number): DecoCorner[] {
  const r = rect;
  const o = offset || 0;
  const all: DecoCorner[] = [
    { i: 0, x: r.x0 - o, y: r.y0 - o, dx: -1, dy: -1, ex: 1, ey: 0, fx: 0, fy: 1, turn: 1 },
    { i: 1, x: r.x1 + o, y: r.y0 - o, dx: 1, dy: -1, ex: -1, ey: 0, fx: 0, fy: 1, turn: -1 },
    { i: 2, x: r.x1 + o, y: r.y1 + o, dx: 1, dy: 1, ex: -1, ey: 0, fx: 0, fy: -1, turn: 1 },
    { i: 3, x: r.x0 - o, y: r.y1 + o, dx: -1, dy: 1, ex: 1, ey: 0, fx: 0, fy: -1, turn: -1 },
  ];
  const pick = CORNER_PICK[placement] ?? [0, 1, 2, 3];
  return all.filter((k) => pick.includes(k.i));
}
