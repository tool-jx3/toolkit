/**
 * 透視（lyric-fx 規格 3.5、3.6）：原作依句子的錨點算一組參數，套在整個畫面的座標上：
 * (X, Y) → (sx × X ÷ w, Y ÷ w)，w＝1＋qx × X＋qy × Y。畫布只有仿射變換，所以每個字用這個投影在
 * 字的基線起點的局部線性近似（雅可比矩陣）畫。
 */

export interface Perspective {
  /** 水平的投影係數 */
  qx: number;
  /** 垂直的投影係數 */
  qy: number;
  /** 橫向放大（右半的句子） */
  sx: number;
}

export const IDENTITY_PERSPECTIVE: Perspective = { qx: 0, qy: 0, sx: 1 };

/**
 * 依錨點 (x, y) 在 W × H 的畫面上的位置算參數。strengthX、strengthY 是實際的係數（滑桿換算後），comp 是水平補償（0.03 之類）。
 */
export function perspectiveAt(
  x: number,
  y: number,
  W: number,
  H: number,
  strengthX: number,
  strengthY: number,
  comp: number,
): Perspective {
  const rx = (x - W / 2) / (W / 2);
  const ry = (y - H / 2) / (H / 2);
  return { qx: strengthX * rx, qy: strengthY * ry, sx: 1 + comp * Math.max(0, rx) };
}

/** 投影一個點 */
export function project(p: Perspective, X: number, Y: number): { x: number; y: number } {
  const w = 1 + p.qx * X + p.qy * Y;
  return { x: (p.sx * X) / w, y: Y / w };
}

/**
 * 在 (X, Y) 的局部線性近似：回傳畫布 setTransform 的 a、b、c、d、e、f（把以 (X, Y) 為原點的局部座標
 * 對到投影後的位置）：x' ≈ e ＋ a·u ＋ c·v、y' ≈ f ＋ b·u ＋ d·v。
 */
export function localAffine(
  p: Perspective,
  X: number,
  Y: number,
): [number, number, number, number, number, number] {
  const w = 1 + p.qx * X + p.qy * Y;
  const w2 = w * w;
  const a = (p.sx * (1 + p.qy * Y)) / w2;
  const c = (-p.sx * X * p.qy) / w2;
  const b = (-Y * p.qx) / w2;
  const d = (1 + p.qx * X) / w2;
  return [a, b, c, d, (p.sx * X) / w, Y / w];
}

/** 投影後的外接矩形（四個角投影後取範圍） */
export function projectBox(
  p: Perspective,
  box: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const pts = [
    project(p, box.x, box.y),
    project(p, box.x + box.width, box.y),
    project(p, box.x, box.y + box.height),
    project(p, box.x + box.width, box.y + box.height),
  ];
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  return { x: x0, y: y0, width: Math.max(...xs) - x0, height: Math.max(...ys) - y0 };
}
