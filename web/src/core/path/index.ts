/**
 * core/path：折線軌跡（預設形狀、長度、依長度等距取樣、取點與切線、外接框、縮放、反轉）。
 *
 * 座標是畫面座標（左上角為原點、y 往下），「順時針」指畫面上看到的順時針。
 * 文字軌跡（沿軌跡排字成文字圖案）、打字機的圖形模式（字排在圓／方／三角形上）、手繪軌跡（PathPad）共用。
 */

export interface Point {
  x: number;
  y: number;
}

export type Path = readonly Point[];

/* ---------- 長度與取樣 ---------- */

/** 每一點從起點量起的累計長度（第 0 點為 0，最後一點＝總長） */
export function cumulativeLengths(path: Path): number[] {
  const out = new Array<number>(path.length);
  let acc = 0;
  for (let i = 0; i < path.length; i++) {
    if (i > 0) acc += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
    out[i] = acc;
  }
  return out;
}

/** 折線總長 */
export function pathLength(path: Path): number {
  let acc = 0;
  for (let i = 1; i < path.length; i++)
    acc += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y);
  return acc;
}

export interface PathSample extends Point {
  /** 切線方向的角度（弧度，atan2(dy, dx)；畫面上 0＝往右、π/2＝往下） */
  angle: number;
  /** 單位切線向量 */
  tx: number;
  ty: number;
  /** 落在第幾段（第 i 點到第 i+1 點） */
  segment: number;
  /** 實際取樣的長度位置（夾住或繞圈後） */
  s: number;
}

export interface PointAtOptions {
  /**
   * 閉合軌跡（最後一點接回第一點）：超出總長時繞圈（可繞好幾圈），負數從終點往回。
   * 不閉合時超出範圍夾在起點／終點。
   */
  closed?: boolean;
  /** 已算好的累計長度（同一條軌跡取很多點時傳入，省得重算） */
  lengths?: readonly number[];
}

/**
 * 沿折線長度 s 處的點與切線。少於 2 點時回傳第一點（沒有點時是原點），切線朝右。
 * 正好落在轉角上時取後面那一段的方向（例如正方形過了轉角的字直接轉 90°）。
 */
export function pointAtLength(path: Path, s: number, options: PointAtOptions = {}): PathSample {
  const pts = options.closed && path.length > 1 ? closePath(path) : path;
  if (pts.length < 2) {
    const p = pts[0] ?? { x: 0, y: 0 };
    return { x: p.x, y: p.y, angle: 0, tx: 1, ty: 0, segment: 0, s: 0 };
  }
  const cum =
    options.lengths && options.lengths.length === pts.length
      ? options.lengths
      : cumulativeLengths(pts);
  const L = cum[cum.length - 1];
  let d = s;
  if (options.closed && L > 0) d = ((s % L) + L) % L;
  else d = Math.min(Math.max(s, 0), L);
  /* 二分搜尋：cum[i] <= d < cum[i+1]；d＝L 時落在最後一段 */
  let lo = 0;
  let hi = pts.length - 2;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  /* 跳過長度 0 的段 */
  let i = lo;
  while (i < pts.length - 2 && cum[i + 1] - cum[i] === 0) i++;
  const a = pts[i];
  const b = pts[i + 1];
  const seg = cum[i + 1] - cum[i];
  const u = seg > 0 ? Math.min(1, Math.max(0, (d - cum[i]) / seg)) : 0;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const tx = len > 0 ? dx / len : 1;
  const ty = len > 0 ? dy / len : 0;
  return {
    x: a.x + dx * u,
    y: a.y + dy * u,
    angle: Math.atan2(ty, tx),
    tx,
    ty,
    segment: i,
    s: d,
  };
}

/**
 * 沿折線依長度等距取 n 點：第 1 點是起點、第 n 點是終點，中間等分；n＝1 時只取起點。
 * 少於 2 點的軌跡回傳 n 個第一點（沒有點時回傳空陣列）。
 */
export function sampleEvenly(path: Path, n: number): Point[] {
  const count = Math.max(0, Math.floor(n));
  if (!path.length || count === 0) return [];
  if (count === 1 || path.length < 2)
    return Array.from({ length: count }, () => ({ x: path[0].x, y: path[0].y }));
  const cum = cumulativeLengths(path);
  const L = cum[cum.length - 1];
  const out: Point[] = [];
  for (let k = 0; k < count; k++) {
    if (k === count - 1) {
      const last = path[path.length - 1];
      out.push({ x: last.x, y: last.y });
      continue;
    }
    const p = pointAtLength(path, (L * k) / (count - 1), { lengths: cum });
    out.push({ x: p.x, y: p.y });
  }
  return out;
}

/* ---------- 幾何 ---------- */

export interface PathBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 中心 */
  cx: number;
  cy: number;
}

/** 外接框（沒有點時全部是 0） */
export function pathBounds(path: Path): PathBounds {
  if (!path.length) return { x: 0, y: 0, w: 0, h: 0, cx: 0, cy: 0 };
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const p of path) {
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.y > y1) y1 = p.y;
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
}

/** 以 center（預設外接框中心）等比縮放 */
export function scalePath(path: Path, k: number, center?: Point): Point[] {
  const c = center ?? (({ cx, cy }) => ({ x: cx, y: cy }))(pathBounds(path));
  return path.map((p) => ({ x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k }));
}

/** 平移 */
export function translatePath(path: Path, dx: number, dy: number): Point[] {
  return path.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** 起點與終點對調 */
export function reversePath(path: Path): Point[] {
  return path.map((p) => ({ x: p.x, y: p.y })).reverse();
}

/** 閉合：最後一點與第一點不同時，在最後補上第一點 */
export function closePath(path: Path): Point[] {
  const out = path.map((p) => ({ x: p.x, y: p.y }));
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (a.x !== b.x || a.y !== b.y) out.push({ x: a.x, y: a.y });
  }
  return out;
}

/**
 * 手繪時加點：和最後一點的距離至少 minDistance 才加（第一點一律加）。回傳是否加入。
 * 會直接改 path 陣列。
 */
export function appendIfFar(path: Point[], p: Point, minDistance = 2): boolean {
  const last = path[path.length - 1];
  if (last && Math.hypot(p.x - last.x, p.y - last.y) < minDistance) return false;
  path.push({ x: p.x, y: p.y });
  return true;
}

/* ---------- 預設形狀 ---------- */

export interface CurveOptions {
  /** 取樣間隔（弧度，預設 0.05） */
  step?: number;
}

/**
 * 圓：起點在正上方、順時針；取樣角度 0、step、2·step… 小於 2π 的點（不閉合，終點停在起點左邊一點點）。
 * closed：在最後補上起點（排字用的完整一圈）。
 */
export function circlePath(
  cx: number,
  cy: number,
  r: number,
  { step = 0.05, closed = false }: CurveOptions & { closed?: boolean } = {},
): Point[] {
  const out: Point[] = [];
  for (let k = 0; k * step < Math.PI * 2; k++) {
    const t = k * step;
    out.push({ x: cx + r * Math.sin(t), y: cy - r * Math.cos(t) });
  }
  return closed ? closePath(out) : out;
}

/**
 * 等距螺旋：由中心往外、順時針，第一段往上；共 turns 圈，最外圈半徑 r（終點在中心正上方約 r 處）。
 * 半徑＝r × (θ ÷ 2π·turns) ＋ r ÷ 1200（起點離中心一點點）。取樣到 θ ≤ 2π·turns。
 */
export function spiralPath(
  cx: number,
  cy: number,
  r: number,
  { step = 0.05, turns = 3 }: CurveOptions & { turns?: number } = {},
): Point[] {
  const out: Point[] = [];
  const end = Math.PI * 2 * turns;
  const inner = r / 1200;
  for (let k = 0; k * step <= end; k++) {
    const t = k * step;
    const rad = (r * t) / end + inner;
    out.push({ x: cx + rad * Math.sin(t), y: cy - rad * Math.cos(t) });
  }
  return out;
}

/**
 * 愛心：常見的愛心曲線（x＝16 sin³t、y＝13 cos t − 5 cos 2t − 2 cos 3t − cos 4t），
 * 以 s ÷ 16 為一單位、往上移 0.1 s。左右寬 2s；起點在上方凹口，先往右（順時針）繞一圈。
 */
export function heartPath(
  cx: number,
  cy: number,
  s: number,
  { step = 0.05 }: CurveOptions = {},
): Point[] {
  const out: Point[] = [];
  const u = s / 16;
  for (let k = 0; k * step < Math.PI * 2; k++) {
    const t = k * step;
    const yh = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push({ x: cx + u * 16 * Math.sin(t) ** 3, y: cy - 0.1 * s - u * yh });
  }
  return out;
}

/** 正方形（中心、邊長的一半）：起點在左上角，沿上邊往右、順時針一圈（閉合） */
export function squarePath(cx: number, cy: number, half: number): Point[] {
  return [
    { x: cx - half, y: cy - half },
    { x: cx + half, y: cy - half },
    { x: cx + half, y: cy + half },
    { x: cx - half, y: cy + half },
    { x: cx - half, y: cy - half },
  ];
}

/** 正三角形（中心、外接圓半徑）：頂點朝上，起點在頂點、往右下，順時針一圈（閉合） */
export function trianglePath(cx: number, cy: number, radius: number): Point[] {
  const pts: Point[] = [];
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * Math.PI * 2) / 3;
    pts.push({ x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) });
  }
  return closePath(pts);
}

export type PresetShape = 'circle' | 'square' | 'triangle' | 'spiral' | 'heart';

export const PRESET_SHAPES: readonly PresetShape[] = [
  'circle',
  'square',
  'triangle',
  'spiral',
  'heart',
];

export const PRESET_SHAPE_LABELS: Record<PresetShape, string> = {
  circle: '圓',
  square: '方',
  triangle: '三角',
  spiral: '螺旋',
  heart: '愛心',
};

/**
 * 以畫面大小產生預設形狀（文字軌跡的做法）：中心在畫面中央，基準大小 S＝0.8 × min(寬, 高) ÷ 2。
 * 圓的半徑、螺旋最外圈的半徑、愛心的半寬、正方形的半邊長、三角形的外接圓半徑都是 S。
 * 圓、螺旋、愛心以 0.05 弧度取樣（與文字軌跡的附件逐點相符）。
 */
export function presetPath(shape: PresetShape, width: number, height: number): Point[] {
  const cx = width / 2;
  const cy = height / 2;
  const S = (0.8 * Math.min(width, height)) / 2;
  switch (shape) {
    case 'circle':
      return circlePath(cx, cy, S);
    case 'spiral':
      return spiralPath(cx, cy, S);
    case 'heart':
      return heartPath(cx, cy, S);
    case 'square':
      return squarePath(cx, cy, S);
    case 'triangle':
      return trianglePath(cx, cy, S);
  }
}

/**
 * 排字用的閉合形狀（打字機的圖形模式）：中心 (cx, cy)，size＝圓的半徑／正方形邊長的一半／正三角形的外接圓半徑。
 * 圓取 720 點（每 0.5°），排在上面的字與真正的圓相差不到 0.01 px。
 */
export function loopShape(
  shape: 'circle' | 'square' | 'triangle',
  cx: number,
  cy: number,
  size: number,
): Point[] {
  if (shape === 'circle') {
    const pts: Point[] = [];
    for (let k = 0; k < 720; k++) {
      const t = (k / 720) * Math.PI * 2;
      pts.push({ x: cx + size * Math.sin(t), y: cy - size * Math.cos(t) });
    }
    return closePath(pts);
  }
  if (shape === 'square') return squarePath(cx, cy, size);
  return trianglePath(cx, cy, size);
}
