/**
 * 幾何：畫布的單位寬、窗的範圍（規格 3.2）、窗與畫布外緣的路徑、CCFOLIA 格數（3.13）、命中測試。
 * 路徑寫進任何 CanvasPath（ctx 或 Path2D），單位是「畫布高＝1080」。
 */
import { rectToGridCells, suggestGridCells } from '@/ccfolia';
import { BASE_H, type Corner, type FrameState, type Opening } from './model';

const TAU = Math.PI * 2;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

export type PathSink = Pick<
  CanvasPath,
  'moveTo' | 'lineTo' | 'arc' | 'arcTo' | 'ellipse' | 'closePath'
>;

/** 畫布寬（單位）：1080 × 輸出寬 ÷ 輸出高 */
export const virtualWidth = (size: { w: number; h: number }): number => (BASE_H * size.w) / size.h;

export interface WindowRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  w: number;
  h: number;
}

/** 窗的矩形：畫布扣掉四邊邊距（各自限制在畫布內），寬或高不足 8 單位時以中心撐開成 8（F10） */
export function openingRect(state: Pick<FrameState, 'size' | 'opening'>): WindowRect {
  const VW = virtualWidth(state.size);
  const m = state.opening.margin;
  let x0 = clamp(m.l, 0, VW);
  let x1 = clamp(VW - m.r, 0, VW);
  let y0 = clamp(m.t, 0, BASE_H);
  let y1 = clamp(BASE_H - m.b, 0, BASE_H);
  if (x1 - x0 < 8) {
    const c = (x0 + x1) / 2;
    x0 = c - 4;
    x1 = c + 4;
  }
  if (y1 - y0 < 8) {
    const c = (y0 + y1) / 2;
    y0 = c - 4;
    y1 = c + 4;
  }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export const cornerAt = (o: Opening, i: number): Corner =>
  o.linkCorners ? o.corners[0] : (o.corners[i] ?? o.corners[0]);

/** 角的實際大小：直角是 0，其他不超過窗短邊的一半 */
export function cornerSize(o: Opening, i: number, rect: WindowRect): number {
  const c = cornerAt(o, i);
  if (c.type === 'square') return 0;
  return clamp(c.size, 0, Math.min(rect.w, rect.h) / 2);
}

/* 每個角（左上起順時針）：進來的邊的方向、出去的邊的方向 */
const CORNER_DIRS: readonly (readonly [readonly [number, number], readonly [number, number]])[] = [
  [
    [0, -1],
    [1, 0],
  ],
  [
    [1, 0],
    [0, 1],
  ],
  [
    [0, 1],
    [-1, 0],
  ],
  [
    [-1, 0],
    [0, -1],
  ],
];

/** 窗的輪廓（含四角形狀與橢圓，順時針） */
export function traceWindow(p: PathSink, state: Pick<FrameState, 'size' | 'opening'>): void {
  const o = state.opening;
  const r = openingRect(state);
  if (o.shape === 'ellipse') {
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    p.moveTo(r.x1, cy);
    p.ellipse(cx, cy, r.w / 2, r.h / 2, 0, 0, TAU);
    p.closePath();
    return;
  }
  const pts = [
    [r.x0, r.y0],
    [r.x1, r.y0],
    [r.x1, r.y1],
    [r.x0, r.y1],
  ];
  for (let i = 0; i < 4; i++) {
    const c = cornerAt(o, i);
    const [px, py] = pts[i];
    const [din, dout] = CORNER_DIRS[i];
    const s = cornerSize(o, i, r);
    /* 沿進來的邊、離角 s 的點 a，與沿出去的邊、離角 s 的點 b */
    const ax = px - din[0] * s;
    const ay = py - din[1] * s;
    const bx = px + dout[0] * s;
    const by = py + dout[1] * s;
    if (i === 0) p.moveTo(ax, ay);
    else p.lineTo(ax, ay);
    if (s === 0) continue;
    if (c.type === 'round') {
      p.arcTo(px, py, bx, by, s);
    } else if (c.type === 'chamfer') {
      p.lineTo(bx, by);
    } else if (c.type === 'scoop') {
      /* 以窗角為圓心、半徑 s 的四分之一圓（框往窗內凹進） */
      const a0 = Math.atan2(ay - py, ax - px);
      const a1 = Math.atan2(by - py, bx - px);
      let d = a1 - a0;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      p.arc(px, py, s, a0, a1, d < 0);
    } else if (c.type === 'notch') {
      /* 框在窗角伸出一塊 s × s 的正方形 */
      p.lineTo(ax + dout[0] * s, ay + dout[1] * s);
      p.lineTo(bx, by);
    } else {
      p.lineTo(px, py);
    }
  }
  p.closePath();
}

/** 畫布外緣（含外側圓角）；pad > 0 時是往外擴的大矩形（投陰影用，不帶圓角） */
export function traceOuter(
  p: PathSink,
  state: Pick<FrameState, 'size' | 'opening'>,
  pad = 0,
): void {
  const VW = virtualWidth(state.size);
  const r = pad ? 0 : clamp(state.opening.outerRadius, 0, BASE_H / 2);
  const x0 = 0 - pad;
  const y0 = 0 - pad;
  const x1 = VW + pad;
  const y1 = BASE_H + pad;
  p.moveTo(x0 + r, y0);
  p.arcTo(x1, y0, x1, y1, r);
  p.arcTo(x1, y1, x0, y1, r);
  p.arcTo(x0, y1, x0, y0, r);
  p.arcTo(x0, y0, x1, y0, r);
  p.closePath();
}

/** 框＝外緣扣掉窗（用 evenodd 填或裁切） */
export function traceFrame(
  p: PathSink,
  state: Pick<FrameState, 'size' | 'opening'>,
  pad = 0,
): void {
  traceOuter(p, state, pad);
  traceWindow(p, state);
}

/* ---------- CCFOLIA 格數（F05、F11） ---------- */

export interface WindowInfo {
  /** 窗的實際大小（px，四捨五入） */
  pxW: number;
  pxH: number;
  /** 盤面的格數（一位小數的字串） */
  cellsW: string;
  cellsH: string;
  posX: string;
  posY: string;
}

/** 窗的資訊：大小（px）、換算成盤面的格數、左上角的位置（格） */
export function windowInfo(state: Pick<FrameState, 'size' | 'opening'>): WindowInfo {
  const r = openingRect(state);
  const VW = virtualWidth(state.size);
  const k = state.size.h / BASE_H;
  const grid = suggestGridCells(state.size.w, state.size.h);
  const cells = rectToGridCells(
    { x: r.x0, y: r.y0, width: r.w, height: r.h },
    { width: VW, height: BASE_H },
    grid,
  );
  return {
    pxW: Math.round(r.w * k),
    pxH: Math.round(r.h * k),
    cellsW: cells.width.toFixed(1),
    cellsH: cells.height.toFixed(1),
    posX: cells.x.toFixed(1),
    posY: cells.y.toFixed(1),
  };
}

/* ---------- 命中測試（F48） ---------- */

export interface HitBox {
  /** 圖層 id 或 'indicator'（差分標籤） */
  id: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 度 */
  rotation: number;
}

/** 命中最上層（清單最後）的範圍；容許邊緣外 tolerance 單位 */
export function hitTest(
  hits: readonly HitBox[],
  x: number,
  y: number,
  tolerance = 6,
): HitBox | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    const a = (-h.rotation * Math.PI) / 180;
    const dx = x - h.cx;
    const dy = y - h.cy;
    const lx = dx * Math.cos(a) - dy * Math.sin(a);
    const ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= h.w / 2 + tolerance && Math.abs(ly) <= h.h / 2 + tolerance) return h;
  }
  return null;
}

/** 移動量超過這個距離（單位）才開始拖曳 */
export const DRAG_THRESHOLD = 2;

/** Shift 拖曳：只留移動量較大的方向 */
export function lockAxis(dx: number, dy: number, shift: boolean): [number, number] {
  if (!shift) return [dx, dy];
  return Math.abs(dx) > Math.abs(dy) ? [dx, 0] : [0, dy];
}
