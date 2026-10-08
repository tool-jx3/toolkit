/**
 * 六角格的幾何。
 *
 * 一律先在「平頂座標系」計算（平頂六角格：上下是平的邊、左右是尖角），尖頂（pointy）是把結果的 x、y 對調
 * （沿左上—右下的對角線翻轉）；舊版的網格產生器、量尺、地圖編輯器都是這樣做的。
 *
 * 尺寸（size＝舊版的「大小」：平頂時是格子的高，尖頂時是寬）：
 * - 一般：相鄰兩欄的中心距離 step＝size × √3 ÷ 2（正六角形）。
 * - 網格化（fit，CCFOLIA 這類只支援正方形網格的工具用）：step＝size，六角格橫向拉長、欄距剛好一格。
 * - 平頂座標系裡 dx＝step ÷ 3、dy＝size ÷ 2；六個角在中心的 (±dx, ±dy) 與 (±2dx, 0)，格子寬 4dx、高 2dy。
 */
import type { HexOrientation, Point, SnapDelta, SnapPoint, View } from './types';

export interface HexMetrics {
  orientation: HexOrientation;
  fit: boolean;
  /** 「大小」：平頂時是格子的高，尖頂時是寬 */
  size: number;
  /** 平頂座標系裡相鄰兩欄的中心距離（舊版的 csx） */
  step: number;
  /** 平頂座標系的單位：角在中心的 (±dx, ±dy)、(±2dx, 0) */
  dx: number;
  dy: number;
  /** 一格在畫面上的外接框（尖頂時已對調） */
  width: number;
  height: number;
}

export function hexMetrics(
  size: number,
  { orientation = 'flat', fit = false }: { orientation?: HexOrientation; fit?: boolean } = {},
): HexMetrics {
  const step = fit ? size : (size / 2) * Math.sqrt(3);
  const dx = step / 3;
  const dy = size / 2;
  const w = 4 * dx;
  const h = size;
  return {
    orientation,
    fit,
    size,
    step,
    dx,
    dy,
    width: orientation === 'flat' ? w : h,
    height: orientation === 'flat' ? h : w,
  };
}

/** 平頂座標 ↔ 畫面座標（尖頂時對調 x、y；對調兩次會回到原點，所以兩個方向是同一個函式） */
export function orientPoint(p: Point, orientation: HexOrientation): Point {
  return orientation === 'flat' ? p : { x: p.y, y: p.x };
}

/** 平頂座標系裡六個角相對於中心的位移（倍數：x 以 dx、y 以 dy 為單位），順序見 hexCorners */
const CORNER_UNITS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [1, -1],
  [2, 0],
  [1, 1],
  [-1, 1],
  [-2, 0],
];

/**
 * 六個角（畫面座標）。`scale` < 1 時以中心縮小（格子所佔的範圍不變）。
 *
 * 順序（第 i 條邊＝角 i → 角 i＋1，外側的鄰格是 `hexEdgeNeighbors` 的第 i 個）：
 * - 平頂：左上、右上、右、右下、左下、左（畫面上順時針）。
 * - 尖頂：上面的順序對調 x、y 的結果：左上、左下、下、右下、右上、上（畫面上逆時針）。
 *
 * 舊版網格產生器與量尺的畫法用的是 0、5、4、3、2、1 這個順序（從左上角往左邊繞），見各工具的繪圖程式。
 */
export function hexCorners(center: Point, m: HexMetrics, scale = 1): Point[] {
  const c = orientPoint(center, m.orientation);
  return CORNER_UNITS.map(([ux, uy]) =>
    orientPoint({ x: c.x + ux * m.dx * scale, y: c.y + uy * m.dy * scale }, m.orientation),
  );
}

/**
 * 從「左上角」（平頂座標系的角 0）算六個角，順序同 hexCorners。
 * 舊版量尺以這個角為基準點逐一加減（anchor.x − step ÷ 3 …），和由中心算的結果在浮點數最後一位可能不同；
 * 要和舊版逐像素相同時用這個。`anchor` 是平頂座標系的點（還沒對調）。
 */
export function hexCornersFromAnchor(anchor: Point, m: HexMetrics): Point[] {
  const { x, y } = anchor;
  const sx = m.step;
  const sy = m.size;
  const flat: Point[] = [
    { x, y },
    { x: x + (sx * 2) / 3, y },
    { x: x + sx, y: y + sy / 2 },
    { x: x + (sx * 2) / 3, y: y + sy },
    { x, y: y + sy },
    { x: x - sx / 3, y: y + sy / 2 },
  ];
  return flat.map((p) => orientPoint(p, m.orientation));
}

/* ---------- 軸座標（地圖編輯器的無限六角格） ---------- */

/** 軸座標：所有整數組合都是一格（平行四邊形座標） */
export interface Axial {
  q: number;
  r: number;
}

/**
 * 軸座標的中心。原點：(0, 0) 格的外接框左上角在 (0, 0)。
 * - 平頂：q 每加 1 往右 3dx、往下 dy（每欄往下錯開半格），r 每加 1 往下 2dy。
 * - 尖頂：q 每加 1 往右一格寬，r 每加 1 往下並往右錯開半格。
 */
export function axialCenter(q: number, r: number, m: HexMetrics): Point {
  const [a, b] = m.orientation === 'flat' ? [q, r] : [r, q];
  const fx = 2 * m.dx + 3 * m.dx * a;
  const fy = m.dy + m.dy * a + 2 * m.dy * b;
  return orientPoint({ x: fx, y: fy }, m.orientation);
}

/** 浮點數軸座標 → 最近的整數格（立方座標四捨五入，誤差最大的那個分量由另外兩個推回） */
export function axialRound(qf: number, rf: number): Axial {
  const xf = qf;
  const zf = rf;
  const yf = -xf - zf;
  let rx = Math.round(xf);
  let ry = Math.round(yf);
  let rz = Math.round(zf);
  const ex = Math.abs(rx - xf);
  const ey = Math.abs(ry - yf);
  const ez = Math.abs(rz - zf);
  if (ex > ey && ex > ez) rx = -ry - rz;
  else if (ey > ez) ry = -rx - rz;
  else rz = -rx - ry;
  /* −0 換成 0（Object.is 比較、當成 Map 的鍵時才不會出錯） */
  return { q: rx + 0, r: rz + 0 };
}

/** 像素 → 所在的格子（軸座標） */
export function pixelToAxial(x: number, y: number, m: HexMetrics): Axial {
  const f = orientPoint({ x, y }, m.orientation);
  const a = (f.x - 2 * m.dx) / (3 * m.dx);
  const b = (f.y - m.dy - m.dy * a) / (2 * m.dy);
  return m.orientation === 'flat' ? axialRound(a, b) : axialRound(b, a);
}

/** 兩格之間的步數（立方座標距離） */
export function axialDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

/** 六個鄰格的方向，順序對應 hexCorners 的六條邊（平頂：上、右上、右下、下、左下、左上） */
export function hexEdgeNeighbors(orientation: HexOrientation): readonly Axial[] {
  return orientation === 'flat' ? FLAT_NEIGHBORS : POINTY_NEIGHBORS;
}

const FLAT_NEIGHBORS: readonly Axial[] = [
  { q: 0, r: -1 },
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
];
/* 尖頂：平頂的方向對調 q、r（左、左下、右下、右、右上、左上） */
const POINTY_NEIGHBORS: readonly Axial[] = FLAT_NEIGHBORS.map(({ q, r }) => ({ q: r, r: q }));

/** 六個鄰格（填色的 BFS 用；順序同 hexEdgeNeighbors） */
export function hexNeighbors(q: number, r: number, orientation: HexOrientation): Axial[] {
  return hexEdgeNeighbors(orientation).map((d) => ({ q: q + d.q, r: r + d.r }));
}

/**
 * 這一點附近的吸附候選：所在格與 6 個鄰格各自的中心、6 個角、6 條邊的中點
 * （舊版地圖編輯器的「三角形頂點＝六角格頂點＋中心」，另加邊的中點）。
 */
export function hexSnapPoints(x: number, y: number, m: HexMetrics): SnapPoint[] {
  const { q, r } = pixelToAxial(x, y, m);
  const offsets: readonly (readonly [number, number])[] = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, -1],
    [-1, 1],
  ];
  const out: SnapPoint[] = [];
  for (const [dq, dr] of offsets) {
    const c = axialCenter(q + dq, r + dr, m);
    out.push({ ...c, type: 'center' });
    const corners = hexCorners(c, m);
    for (const v of corners) out.push({ ...v, type: 'intersection' });
    for (let i = 0; i < 6; i++) {
      const a = corners[i];
      const b = corners[(i + 1) % 6];
      out.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, type: 'midpoint' });
    }
  }
  return out;
}

/** 拖曳位移吸附成整格（軸座標的整數位移） */
export function hexSnapDelta(dx: number, dy: number, m: HexMetrics): SnapDelta {
  const f = orientPoint({ x: dx, y: dy }, m.orientation);
  const a = Math.round(f.x / (3 * m.dx));
  const b = Math.round((f.y - a * m.dy) / (2 * m.dy));
  const snapped = orientPoint({ x: a * 3 * m.dx, y: a * m.dy + b * 2 * m.dy }, m.orientation);
  const [colDelta, rowDelta] = m.orientation === 'flat' ? [a, b] : [b, a];
  return { colDelta, rowDelta, dx: snapped.x, dy: snapped.y };
}

/**
 * 蓋滿可見範圍的格線：每格只畫 3 條邊（其他 3 條由鄰格畫），四周多算 2 格。
 * 回傳每格一條 4 個點的折線（平頂：左上 → 右上 → 右 → 右下；尖頂：上 → 右上 → 右下 → 下），
 * 依 q 由小到大、同一個 q 裡 r 由小到大。地圖編輯器畫無限網格用。
 */
export function hexGridPolylines(view: View, m: HexMetrics): Point[][] {
  const margin = 2;
  const W = m.width;
  const H = m.height;
  const lx0 = view.left - W / 2;
  const lx1 = view.right - W / 2;
  const ly0 = view.top - H / 2;
  const ly1 = view.bottom - H / 2;
  let qMin: number;
  let qMax: number;
  let rMin: number;
  let rMax: number;
  if (m.orientation === 'flat') {
    /* 畫面上的 dx、dy＝平頂座標系的 dx、dy */
    qMin = Math.floor(lx0 / (3 * m.dx)) - margin;
    qMax = Math.ceil(lx1 / (3 * m.dx)) + margin;
    rMin = Math.floor(Math.min(ly0 / (2 * m.dy) - qMax / 2, ly0 / (2 * m.dy) - qMin / 2)) - margin;
    rMax = Math.ceil(Math.max(ly1 / (2 * m.dy) - qMin / 2, ly1 / (2 * m.dy) - qMax / 2)) + margin;
  } else {
    /* 尖頂：畫面上的「dx」是平頂座標系的 dy、「dy」是 dx */
    const sdx = m.dy;
    const sdy = m.dx;
    rMin = Math.floor(ly0 / (3 * sdy)) - margin;
    rMax = Math.ceil(ly1 / (3 * sdy)) + margin;
    qMin = Math.floor(Math.min(lx0 / (2 * sdx) - rMax / 2, lx0 / (2 * sdx) - rMin / 2)) - margin;
    qMax = Math.ceil(Math.max(lx1 / (2 * sdx) - rMin / 2, lx1 / (2 * sdx) - rMax / 2)) + margin;
  }
  const order = m.orientation === 'flat' ? [0, 1, 2, 3] : [5, 4, 3, 2];
  const out: Point[][] = [];
  for (let q = qMin; q <= qMax; q++) {
    for (let r = rMin; r <= rMax; r++) {
      const corners = hexCorners(axialCenter(q, r, m), m);
      out.push(order.map((i) => corners[i]));
    }
  }
  return out;
}

/* ---------- 偏移座標（量尺用） ---------- */

/** 欄的奇偶（負數也正確：−1 是奇數） */
export function colParity(col: number): 0 | 1 {
  return (((col % 2) + 2) % 2) as 0 | 1;
}

/**
 * odd-q 偏移座標（平頂、奇數欄往下錯開半格）→ 軸座標。舊版六角格量尺的 (c, r) 就是這種座標，原點在偶數欄。
 */
export function oddqToAxial(col: number, row: number): Axial {
  return { q: col, r: row - (col - colParity(col)) / 2 };
}

export function axialToOddq(q: number, r: number): { col: number; row: number } {
  return { col: q, row: r + (q - colParity(q)) / 2 };
}

/**
 * odd-q 偏移座標的中心相對於 (0, 0) 格中心的位移（平頂座標系；尖頂時再 orientPoint）：
 * x＝col × step、y＝(row ＋ 奇數欄 ÷ 2) × size。
 */
export function oddqOffset(col: number, row: number, m: HexMetrics): Point {
  return { x: col * m.step, y: (row + colParity(col) / 2) * m.size };
}
