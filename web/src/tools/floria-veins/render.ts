/**
 * 畫布的繪製（規格 3.1）：編輯畫面（PanZoomViewport 的 draw）與匯出、一覽共用同一套畫法。
 *
 * 由下到上（和原作的圖層順序相同）：紙（白）、傷害格、塗色、格線與座標、線（含預設的對角線）、草稿。
 * 名字在格子上方置中。顏色照原作（不跟介面的深淺色主題）。
 */
import { fontCss } from '@/core/fonts';
import { diagonalSegment } from './model/geometry';
import {
  type Cell,
  COLORS,
  FILL_ALPHA,
  labelOf,
  type Pt,
  UNIT,
  type VeinCanvas,
  type VeinFill,
  type VeinLine,
} from './model/types';

export const CANVAS_FONT = 'Noto Sans TC';
const font = (px: number, weight = 400) => fontCss({ family: CANVAS_FONT, weight }, px);

/** 顯示切換（原作的「表示切替」）：格線與座標、線、塗色、傷害格 */
export interface Layers {
  grid: boolean;
  line: boolean;
  fill: boolean;
  damage: boolean;
}

export const ALL_LAYERS: Layers = { grid: true, line: true, fill: true, damage: true };

/** 格子的左上角在畫布上的位置與一格幾 px */
export interface Place {
  ox: number;
  oy: number;
  cell: number;
}

const toPx = (p: Place, q: Pt) => [p.ox + (q[0] / UNIT) * p.cell, p.oy + (q[1] / UNIT) * p.cell];

/** 線寬：一格 64 px 時 1 px（和原作 1 格約 63 px、線寬 1 px 相同），跟著格子大小 */
const lineWidthFor = (cell: number): number => Math.max(1, cell / 64);

/** 格子的本體（傷害格、塗色、格線、線；不含座標與名字） */
export function paintBody(
  ctx: CanvasRenderingContext2D,
  c: Pick<VeinCanvas, 'size' | 'lines' | 'fills' | 'damage'>,
  p: Place,
  layers: Layers,
  lineWidth = lineWidthFor(p.cell),
): void {
  ctx.save();
  if (layers.damage) paintCells(ctx, c.damage, p, COLORS.damage, FILL_ALPHA);
  if (layers.fill) for (const f of c.fills) paintFill(ctx, f, p, f.color, FILL_ALPHA);
  if (layers.grid) paintGrid(ctx, c.size, p, lineWidth);
  if (layers.line) {
    const [a, b] = diagonalSegment(c.size);
    paintLine(ctx, a, b, p, COLORS.line, lineWidth);
    for (const l of c.lines) paintLine(ctx, l.a, l.b, p, l.color, lineWidth);
  }
  ctx.restore();
}

export function paintCells(
  ctx: CanvasRenderingContext2D,
  cells: readonly Cell[],
  p: Place,
  color: string,
  alpha: number,
): void {
  if (!cells.length) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (const [x, y] of cells) {
    /* 相鄰的格子各自畫：和原作一樣每格一個半透明的方塊 */
    ctx.beginPath();
    ctx.rect(p.ox + x * p.cell, p.oy + y * p.cell, p.cell, p.cell);
    ctx.fill();
  }
  ctx.restore();
}

export function paintFill(
  ctx: CanvasRenderingContext2D,
  f: Pick<VeinFill, 'pts'>,
  p: Place,
  color: string,
  alpha: number,
): void {
  if (f.pts.length < 3) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  f.pts.forEach((q, i) => {
    const [x, y] = toPx(p, q);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function paintLine(
  ctx: CanvasRenderingContext2D,
  a: Pt,
  b: Pt,
  p: Place,
  color: string,
  width: number,
): void {
  const [x1, y1] = toPx(p, a);
  const [x2, y2] = toPx(p, b);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

/** 格線：線寬是奇數 px 時對齊到半個像素，1 px 的線不會糊成 2 px */
function paintGrid(ctx: CanvasRenderingContext2D, size: number, p: Place, lineWidth: number): void {
  const w = Math.max(1, Math.round(lineWidth));
  const crisp = (v: number) => (w % 2 ? Math.round(v - 0.5) + 0.5 : Math.round(v));
  const end = size * p.cell;
  ctx.save();
  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = w;
  ctx.beginPath();
  for (let i = 0; i <= size; i++) {
    const x = crisp(p.ox + i * p.cell);
    const y = crisp(p.oy + i * p.cell);
    ctx.moveTo(x, p.oy);
    ctx.lineTo(x, p.oy + end);
    ctx.moveTo(p.ox, y);
    ctx.lineTo(p.ox + end, y);
  }
  ctx.stroke();
  ctx.restore();
}

/**
 * 座標（上方是欄、左邊是列；11 格標 2～12、6 格標 1～6）。
 * `top`／`left`：上方那一排的底邊、左邊那一排的中心（px）。
 */
export function paintLabels(
  ctx: CanvasRenderingContext2D,
  size: number,
  p: Place,
  px: number,
  top: number,
  left: number,
): void {
  ctx.save();
  ctx.fillStyle = COLORS.label;
  ctx.font = font(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  for (let i = 0; i < size; i++)
    ctx.fillText(String(labelOf(size, i)), p.ox + (i + 0.5) * p.cell, top);
  ctx.textBaseline = 'middle';
  for (let i = 0; i < size; i++)
    ctx.fillText(String(labelOf(size, i)), left, p.oy + (i + 0.5) * p.cell);
  ctx.restore();
}

/** 名字（置中；太長時縮窄到 maxWidth） */
export function paintName(
  ctx: CanvasRenderingContext2D,
  name: string,
  cx: number,
  bottom: number,
  px: number,
  maxWidth: number,
): void {
  if (!name) return;
  ctx.save();
  ctx.fillStyle = COLORS.name;
  ctx.font = font(px);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText(name, cx, bottom, Math.max(1, maxWidth));
  ctx.restore();
}

/* ---------- 匯出與一覽：一張畫布的外框 ---------- */

/** 一張畫布（含名字與座標的留白）的尺寸，px */
export interface BoxGeom {
  cell: number;
  labelPx: number;
  namePx: number;
  gap: number;
  padL: number;
  padT: number;
  padR: number;
  padB: number;
  width: number;
  height: number;
}

/**
 * 外框：1 格 `cell` px 時，座標字 0.28 格、名字 0.44 格（原作 1 格約 63 px 時 18、28 px），
 * 左留白 0.5 格、上留白 0.8 格（放名字與座標）、右下 0.32 格；字太小時用 min 的大小並把留白放寬。
 */
export function boxGeom(size: number, cell: number, min = { label: 0, name: 0 }): BoxGeom {
  const labelPx = Math.max(cell * 0.28, min.label);
  const namePx = Math.max(cell * 0.44, min.name);
  const gap = Math.max(cell * 0.04, 1);
  const padL = Math.ceil(Math.max(cell * 0.5, labelPx * 1.4 + gap * 2));
  const padT = Math.ceil(Math.max(cell * 0.8, namePx + labelPx + gap * 3));
  const padR = Math.ceil(cell * 0.32);
  const padB = Math.ceil(cell * 0.32);
  const grid = size * cell;
  return {
    cell,
    labelPx,
    namePx,
    gap,
    padL,
    padT,
    padR,
    padB,
    width: Math.ceil(padL + grid + padR),
    height: Math.ceil(padT + grid + padB),
  };
}

/** 一張畫布畫在 (x, y)（外框的左上角）：紙（paper＝false 時透明）、名字、座標、本體 */
export function paintBox(
  ctx: CanvasRenderingContext2D,
  c: VeinCanvas,
  x: number,
  y: number,
  g: BoxGeom,
  layers: Layers,
  paper = true,
): void {
  ctx.save();
  if (paper) {
    ctx.fillStyle = COLORS.paper;
    ctx.fillRect(x, y, g.width, g.height);
  }
  const p: Place = { ox: x + g.padL, oy: y + g.padT, cell: g.cell };
  paintName(
    ctx,
    c.name,
    p.ox + (c.size * g.cell) / 2,
    p.oy - g.labelPx - g.gap * 2,
    g.namePx,
    g.width - g.gap * 2,
  );
  paintBody(ctx, c, p, layers);
  if (layers.grid) paintLabels(ctx, c.size, p, g.labelPx, p.oy - g.gap, x + g.padL / 2);
  ctx.restore();
}

/* ---------- 好幾張排在一起（全部排成一張、一覽） ---------- */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Tiled {
  width: number;
  height: number;
  rects: Rect[];
  geoms: BoxGeom[];
}

/**
 * 依順序由左到右排、一列放不下就換列（一列最多 `cols` 張最大的畫布那麼寬；隨從的小畫布可以多放）；
 * 同一列靠上對齊，畫布之間空 0.5 格，四周 0.25 格。
 */
export function tileCanvases(
  sizes: readonly number[],
  cell: number,
  cols: number,
  min = { label: 0, name: 0 },
): Tiled {
  const geoms = sizes.map((s) => boxGeom(s, cell, min));
  const gap = Math.round(cell * 0.5);
  const margin = Math.round(cell * 0.25);
  const unit = Math.max(1, ...geoms.map((g) => g.width));
  const limit = Math.max(1, cols) * unit + (Math.max(1, cols) - 1) * gap;
  const rects: Rect[] = [];
  let x = margin;
  let y = margin;
  let rowH = 0;
  let maxW = 0;
  geoms.forEach((g, i) => {
    if (i > 0 && x - margin + g.width > limit) {
      x = margin;
      y += rowH + gap;
      rowH = 0;
    }
    rects.push({ x, y, w: g.width, h: g.height });
    x += g.width + gap;
    rowH = Math.max(rowH, g.height);
    maxW = Math.max(maxW, x - gap);
  });
  return {
    width: Math.ceil(maxW + margin),
    height: Math.ceil(y + rowH + margin),
    rects,
    geoms,
  };
}

export function paintTiled(
  ctx: CanvasRenderingContext2D,
  canvases: readonly VeinCanvas[],
  t: Tiled,
  layers: Layers,
  background: string | null,
  paper = true,
): void {
  if (background) {
    ctx.save();
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, t.width, t.height);
    ctx.restore();
  }
  canvases.forEach((c, i) => {
    const r = t.rects[i];
    paintBox(ctx, c, r.x, r.y, t.geoms[i], layers, paper);
  });
}

/* ---------- 草稿與游標（只在編輯畫面） ---------- */

export function paintPoint(
  ctx: CanvasRenderingContext2D,
  q: Pt,
  p: Place,
  color: string,
  radius: number,
): void {
  const [x, y] = toPx(p, q);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** 刪除時會刪掉的線：底下加一條粗的半透明紅線 */
export function paintDoomedLine(
  ctx: CanvasRenderingContext2D,
  l: VeinLine,
  p: Place,
  width: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.45;
  paintLine(ctx, l.a, l.b, p, COLORS.doomed, width);
  ctx.restore();
}

/** 刪除時會刪掉的塗色：紅色虛線外框 */
export function paintDoomedFill(
  ctx: CanvasRenderingContext2D,
  f: VeinFill,
  p: Place,
  width: number,
): void {
  ctx.save();
  ctx.strokeStyle = COLORS.doomed;
  ctx.lineWidth = width;
  ctx.setLineDash([width * 3, width * 2]);
  ctx.beginPath();
  f.pts.forEach((q, i) => {
    const [x, y] = toPx(p, q);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** 刪除時會刪掉的傷害格：紅色的叉 */
export function paintDoomedCell(
  ctx: CanvasRenderingContext2D,
  [cx, cy]: Cell,
  p: Place,
  width: number,
): void {
  const x = p.ox + cx * p.cell;
  const y = p.oy + cy * p.cell;
  const k = p.cell * 0.22;
  ctx.save();
  ctx.strokeStyle = COLORS.doomed;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x + k, y + k);
  ctx.lineTo(x + p.cell - k, y + p.cell - k);
  ctx.moveTo(x + p.cell - k, y + k);
  ctx.lineTo(x + k, y + p.cell - k);
  ctx.stroke();
  ctx.restore();
}
