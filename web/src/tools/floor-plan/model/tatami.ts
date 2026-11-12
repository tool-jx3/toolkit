/**
 * 榻榻米的鋪法（2026-11-12 參考 KIIN「マップ制作スタジオ」v3.0 的「畳の敷き方」，規格 F334、3.20.4）。
 *
 * 一張榻榻米約 0.9 × 1.8 m（半張 0.9 m 見方）。房間的大小是整格（0.5 m），通常不是整數張，所以和原作一樣
 * **照房間的外框把張數取整、再把每一張伸縮到剛好鋪滿**（不是實際尺寸的榻榻米；L 形、曲線的房間照外框排、剪在外形裡）：
 *
 * - **祝儀鋪法**（一般住宅：四張的角不會集中在一點）：照外框的大小與長寬比選一種排法——
 *   短邊 3.6 m 以內、長邊 5 m 以內而且接近正方形（長寬比 < 1.18）或細長（≥ 1.6）時是四疊半（3 × 3 個半張的格子，
 *   中間一個半張、四張繞著它）；長寬比 ≥ 1.25 時是六疊（4 × 3，長的那一邊放在房間的長邊）；其他是八疊（4 × 4）。
 * - **不祝儀鋪法**（寺院、大廣間：全部同一個方向排成格子，四張的角集中成十字）：長邊方向每 1.8 m 一張、
 *   短邊方向每 0.9 m 一張（取整，至少 1）。
 * - **半疊市松**（琉球疊、無邊）：每 0.9 m 一個半張（取整，至少 1），相鄰的半張紋路方向交錯。
 *
 * 只算張的位置與方向（格）；畫法在 draw/render.ts。
 */
import { CELL_M } from './catalog';
import type { Rect, TatamiLayout } from './types';

export const TATAMI_LAYOUTS: readonly TatamiLayout[] = ['shugi', 'fushugi', 'ryukyu'];
export const isTatamiLayout = (v: unknown): v is TatamiLayout =>
  typeof v === 'string' && (TATAMI_LAYOUTS as readonly string[]).includes(v);

/** 一張（或半張）榻榻米：外框（格）、紋路沿著橫向（`across`）、有沒有邊（疊緣）、是不是半張 */
export interface Mat {
  x: number;
  y: number;
  w: number;
  h: number;
  across: boolean;
  edge: boolean;
  half: boolean;
}

/** 一張的長、半張的邊（m） */
const MAT_LONG = 1.8;
const MAT_HALF = 0.9;

/** 祝儀鋪法的三種排法（以半張為一格：x、y、寬、深） */
type Cells = readonly (readonly [number, number, number, number])[];
const YOJOHAN: Cells = [
  [0, 0, 2, 1],
  [2, 0, 1, 2],
  [1, 2, 2, 1],
  [0, 1, 1, 2],
  [1, 1, 1, 1],
];
const ROKUJO: Cells = [
  [0, 0, 2, 1],
  [2, 0, 2, 1],
  [0, 1, 1, 2],
  [1, 1, 2, 1],
  [1, 2, 2, 1],
  [3, 1, 1, 2],
];
const HACHIJO: Cells = [
  [0, 0, 1, 2],
  [0, 2, 1, 2],
  [3, 0, 1, 2],
  [3, 2, 1, 2],
  [1, 0, 2, 1],
  [1, 1, 1, 2],
  [2, 1, 1, 2],
  [1, 3, 2, 1],
];

/** 祝儀鋪法用哪一種排法（四疊半、六疊、八疊）與格子數 */
export function shugiPlan(
  wCells: number,
  hCells: number,
): {
  name: 'yojohan' | 'rokujo' | 'hachijo';
  cols: number;
  rows: number;
  cells: Cells;
} {
  const wm = wCells * CELL_M;
  const hm = hCells * CELL_M;
  const short = Math.min(wm, hm);
  const long = Math.max(wm, hm);
  const ratio = long / short;
  const compact = short <= 3.6 && long <= 5;
  if (compact && (ratio < 1.18 || ratio >= 1.6))
    return { name: 'yojohan', cols: 3, rows: 3, cells: YOJOHAN };
  if (ratio >= 1.25) {
    /* 六疊：長的那一邊放在房間的長邊（直的房間把排法轉過來） */
    if (hm > wm)
      return {
        name: 'rokujo',
        cols: 3,
        rows: 4,
        cells: ROKUJO.map(([x, y, w, h]) => [y, x, h, w] as const),
      };
    return { name: 'rokujo', cols: 4, rows: 3, cells: ROKUJO };
  }
  return { name: 'hachijo', cols: 4, rows: 4, cells: HACHIJO };
}

/** 房間的外框照鋪法排成一張一張的榻榻米（格） */
export function tatamiMats(r: Rect, layout: TatamiLayout): Mat[] {
  if (layout === 'shugi') {
    const plan = shugiPlan(r.w, r.h);
    const cw = r.w / plan.cols;
    const ch = r.h / plan.rows;
    return plan.cells.map(([x, y, w, h]) => ({
      x: r.x + x * cw,
      y: r.y + y * ch,
      w: w * cw,
      h: h * ch,
      across: w >= h,
      edge: true,
      half: w === h,
    }));
  }
  const wm = r.w * CELL_M;
  const hm = r.h * CELL_M;
  const checker = layout === 'ryukyu';
  const across = wm >= hm;
  const cols = Math.max(1, Math.round(wm / (checker || !across ? MAT_HALF : MAT_LONG)));
  const rows = Math.max(1, Math.round(hm / (checker || across ? MAT_HALF : MAT_LONG)));
  const w = r.w / cols;
  const h = r.h / rows;
  const out: Mat[] = [];
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++)
      out.push({
        x: r.x + i * w,
        y: r.y + j * h,
        w,
        h,
        across: checker ? (i + j) % 2 === 0 : across,
        edge: !checker,
        half: checker,
      });
  return out;
}

/**
 * 四張榻榻米的角集中在一點的地方（祝儀鋪法要避開的「十字」；測試與說明用）：所有張的角，
 * 剛好是四張的共同角的點。
 */
export function tatamiCrosses(mats: readonly Mat[]): { x: number; y: number }[] {
  const key = (x: number, y: number) => `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
  const count = new Map<string, { x: number; y: number; n: number }>();
  for (const m of mats)
    for (const [x, y] of [
      [m.x, m.y],
      [m.x + m.w, m.y],
      [m.x, m.y + m.h],
      [m.x + m.w, m.y + m.h],
    ]) {
      const k = key(x, y);
      const e = count.get(k) ?? { x, y, n: 0 };
      e.n++;
      count.set(k, e);
    }
  return [...count.values()].filter((e) => e.n >= 4).map(({ x, y }) => ({ x, y }));
}
