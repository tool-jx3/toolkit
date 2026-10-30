/**
 * 戰鬥地圖的繪製：直接寫 RGBA 像素（不依賴 canvas），所以在 Node 也能測、每個瀏覽器畫出來都一樣。
 *
 * 圖層（由下往上，規格 3.2）：空無底色 → 牆紋理 → 地板紋理 → 磚縫（整張）→ 裂縫、碎石（地板）
 * → 苔蘚（牆，洞穴與墓室）→ 火光（開關）→ 格線（開關）。
 *
 * 前六層由 renderBase() 畫成「底圖」，只看格局、地形與種子；火光與格線由 applyOverlays() 疊在底圖的複本上。
 * 所以切換格線或火光時，底圖的亂數與像素完全不受影響（規格 5.）。
 *
 * 2026-10-30：每格 px 可以是 50／70／100（規格 F39）。所有以 px 為單位的量（磚縫、紋理斑點、裂縫、碎石、苔蘚、
 * 火光半徑）都乘上「每格 px ÷ 70」；70 px 時乘數剛好是 1，算式與改版前逐位元相同（規格 F40）。
 */
import { createRandom, type Random } from '@/core/timeline';
import { CELL, FLOOR, type Layout, WALL } from './layout';
import { DEFAULT_SETTINGS, type GeneratorId, isDefaultSize, type LayoutSettings } from './settings';

/* 熱迴圈裡用模組內的常數（測試環境把 import 轉成屬性存取，逐像素讀取會變慢） */
const BASE_CELL = CELL;
const K_FLOOR = FLOOR;
const K_WALL = WALL;

export type TerrainId = 'dungeon' | 'cave' | 'crypt';

type Rgb = readonly [number, number, number];

export interface TerrainStyle {
  void: Rgb;
  wall: Rgb;
  floor: Rgb;
  /** 苔蘚的顏色；null 表示沒有苔蘚 */
  moss: Rgb | null;
}

/** 三種地形的配色（規格 3.4 的平均色；紋理與裝飾的平均值接近 0，所以底色直接取平均色） */
export const TERRAIN_STYLES: Record<TerrainId, TerrainStyle> = {
  dungeon: { void: [10, 9, 9], wall: [46, 42, 40], floor: [96, 92, 88], moss: null },
  cave: { void: [8, 8, 8], wall: [48, 40, 32], floor: [85, 75, 61], moss: [68, 98, 46] },
  crypt: { void: [6, 6, 9], wall: [52, 52, 60], floor: [104, 104, 112], moss: [60, 88, 72] },
};

export const TERRAIN_IDS: readonly TerrainId[] = ['dungeon', 'cave', 'crypt'];

/** 磚縫（每格 70 px 時）：橫縫每 35 px、直縫每 70 px，奇數排錯開 35 px；其他每格 px 時等比例（半格、一格） */
export const BRICK_HEIGHT = 35;
export const BRICK_WIDTH = 70;
const SEAM_ALPHA = 0.3;
/** 磚縫的顏色＝空無色再亮 20 階（在空無上看起來略亮、在地板上看起來較暗） */
const SEAM_LIFT = 20;

/** 紋理的明暗幅度（每個色版加減的最大量，約略值） */
const FLOOR_TEXTURE = 6;
const WALL_TEXTURE = 5;

/** 裝飾的密度（每格的機率） */
const CRACK_CHANCE = 0.2;
const RUBBLE_CHANCE = 0.125;
const MOSS_CHANCE = 0.28;
const CRACK_COLOR: Rgb = [18, 16, 14];
const CRACK_ALPHA = 0.5;
const RUBBLE_COLOR: Rgb = [12, 10, 9];
const RUBBLE_ALPHA = 0.25;

/** 火光：暖橘色，中心混合 32%，半徑 2 格（每格 70 px 時 140 px）處降到 0 */
export const LIGHT_COLOR: Rgb = [255, 176, 96];
export const LIGHT_ALPHA = 0.32;
export const LIGHT_RADIUS = 2 * BASE_CELL;

/** 格線：黑色、不透明度 24%、1 px */
export const GRID_ALPHA = 0.24;

export interface OverlayOptions {
  grid: boolean;
  light: boolean;
}

/* ---------- 亂數串流：同一個種子分成幾條互不影響的串流 ---------- */

const stream = (seed: number, salt: number): Random =>
  createRandom((Math.imul(seed ^ 0x5bd1e995, 0x9e3779b1) + salt * 0x632be5ab) | 0);

/* ---------- 紋理：兩層平滑的數值雜訊（斑點約 5～15 px，依每格 px 等比例），整張圖連續 ---------- */

interface Octave {
  spacing: number;
  weight: number;
}

/** 每格 70 px 時的兩層雜訊 */
const OCTAVES: readonly Octave[] = [
  { spacing: 13, weight: 0.65 },
  { spacing: 6, weight: 0.35 },
];

interface NoiseField {
  octaves: readonly Octave[];
  /** 每層的格點值 */
  lattice: Float32Array[];
  stride: number[];
  xTables: AxisTable[];
  yTables: AxisTable[];
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** 每層雜訊在 x（或 y）方向的格點索引與內插權重 */
interface AxisTable {
  index: Int32Array;
  frac: Float32Array;
}

function axisTable(length: number, spacing: number): AxisTable {
  const index = new Int32Array(length);
  const frac = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const g = (i + 0.5) / spacing;
    const k = Math.floor(g);
    index[i] = k;
    frac[i] = smooth(g - k);
  }
  return { index, frac };
}

/** 同樣的長度與間距只算一次表（表只看尺寸，不看種子） */
const axisCache = new Map<string, AxisTable>();
function cachedAxis(length: number, spacing: number): AxisTable {
  const key = `${length}:${spacing}`;
  let t = axisCache.get(key);
  if (!t) {
    t = axisTable(length, spacing);
    if (axisCache.size > 32) axisCache.clear();
    axisCache.set(key, t);
  }
  return t;
}

function noiseField(rng: Random, W: number, H: number, scale: number): NoiseField {
  const octaves = OCTAVES.map((o) => ({ spacing: o.spacing * scale, weight: o.weight }));
  const lattice: Float32Array[] = [];
  const stride: number[] = [];
  for (const o of octaves) {
    const nx = Math.ceil(W / o.spacing) + 2;
    const ny = Math.ceil(H / o.spacing) + 2;
    const v = new Float32Array(nx * ny);
    for (let i = 0; i < v.length; i++) v[i] = rng.signed();
    lattice.push(v);
    stride.push(nx);
  }
  return {
    octaves,
    lattice,
    stride,
    xTables: octaves.map((o) => cachedAxis(W, o.spacing)),
    yTables: octaves.map((o) => cachedAxis(H, o.spacing)),
  };
}

/** 算出第 y 列每個像素的雜訊值（約 −1～1）。逐列計算：先在格點上做直向內插，再逐像素做橫向內插。 */
function noiseRow(f: NoiseField, y: number, out: Float32Array, tmp: Float32Array): void {
  out.fill(0);
  const W = out.length;
  for (let k = 0; k < f.octaves.length; k++) {
    const s = f.stride[k];
    const L = f.lattice[k];
    const yt = f.yTables[k];
    const xt = f.xTables[k];
    const w = f.octaves[k].weight;
    const o = yt.index[y] * s;
    const fy = yt.frac[y];
    for (let i = 0; i < s; i++) tmp[i] = L[o + i] + (L[o + s + i] - L[o + i]) * fy;
    const xi = xt.index;
    const xf = xt.frac;
    for (let x = 0; x < W; x++) {
      const a = tmp[xi[x]];
      out[x] += (a + (tmp[xi[x] + 1] - a) * xf[x]) * w;
    }
  }
}

/* ---------- 像素工具 ---------- */

/** 一張圖的尺寸資訊（裝飾的繪圖函式共用） */
interface Canvas {
  px: Uint8ClampedArray;
  cells: Uint8Array;
  W: number;
  H: number;
  cell: number;
  cols: number;
  /** 每個像素欄所在的格子欄 */
  colOf: Uint8Array;
}

/** 每個像素欄所在的格子欄 */
function columnTable(W: number, cell: number): Uint8Array {
  const t = new Uint8Array(W);
  for (let x = 0; x < W; x++) t[x] = Math.floor(x / cell);
  return t;
}

/** 像素所在格子的種類 */
const kindAt = (c: Canvas, x: number, y: number): number =>
  c.cells[Math.floor(y / c.cell) * c.cols + c.colOf[x]];

function blend(px: Uint8ClampedArray, i: number, c: Rgb, a: number): void {
  px[i] += (c[0] - px[i]) * a;
  px[i + 1] += (c[1] - px[i + 1]) * a;
  px[i + 2] += (c[2] - px[i + 2]) * a;
}

/** 只在指定種類的格子裡上色 */
function blendIn(cv: Canvas, kind: number, x: number, y: number, c: Rgb, a: number): void {
  if (x < 0 || y < 0 || x >= cv.W || y >= cv.H) return;
  if (kindAt(cv, x, y) !== kind) return;
  blend(cv.px, (y * cv.W + x) * 4, c, a);
}

/** 柔邊實心圓 */
function dot(cv: Canvas, kind: number, cx: number, cy: number, r: number, c: Rgb, a: number): void {
  const x0 = Math.floor(cx - r - 1);
  const x1 = Math.ceil(cx + r + 1);
  const y0 = Math.floor(cy - r - 1);
  const y1 = Math.ceil(cy + r + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ddx = x + 0.5 - cx;
      const ddy = y + 0.5 - cy;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      const cover = Math.min(1, Math.max(0, r + 0.5 - d));
      if (cover > 0) blendIn(cv, kind, x, y, c, a * cover);
    }
  }
}

/** 正規化成單位向量（長度為 0 時取向右） */
function unitVector(x: number, y: number): [number, number] {
  const len = Math.sqrt(x * x + y * y);
  return len > 1e-9 ? [x / len, y / len] : [1, 0];
}

/** 1 px 折線：每個像素只上色一次（轉折處不會變深） */
function polyline(
  cv: Canvas,
  kind: number,
  points: readonly { x: number; y: number }[],
  c: Rgb,
  a: number,
): void {
  const seen = new Set<number>();
  for (let k = 1; k < points.length; k++) {
    const p = points[k - 1];
    const q = points[k];
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(q.x - p.x), Math.abs(q.y - p.y))));
    for (let s = 0; s <= steps; s++) {
      const x = Math.floor(p.x + ((q.x - p.x) * s) / steps);
      const y = Math.floor(p.y + ((q.y - p.y) * s) / steps);
      if (x < 0 || y < 0 || x >= cv.W || y >= cv.H) continue;
      const key = y * cv.W + x;
      if (seen.has(key)) continue;
      seen.add(key);
      blendIn(cv, kind, x, y, c, a);
    }
  }
}

/* ---------- 底圖 ---------- */

/** 整張圖的像素尺寸 */
export const mapPixelSize = (
  layout: Pick<Layout, 'cols' | 'rows'>,
  cellPx: number = BASE_CELL,
): { width: number; height: number } => ({
  width: layout.cols * cellPx,
  height: layout.rows * cellPx,
});

/**
 * 畫出底圖（圖層 1～6）。同樣的格局、地形、種子、每格 px 永遠得到同樣的像素。
 * cellPx：每格幾 px（不給＝70）。
 */
export function renderBase(
  layout: Layout,
  terrain: TerrainId,
  cellPx: number = BASE_CELL,
): Uint8ClampedArray<ArrayBuffer> {
  const style = TERRAIN_STYLES[terrain];
  const seed = layout.seed;
  const CELL_PX = cellPx;
  /** px 量的乘數（70 px 時剛好是 1） */
  const k = cellPx / BASE_CELL;
  const NCOLS = layout.cols;
  const NROWS = layout.rows;
  const W = NCOLS * CELL_PX;
  const H = NROWS * CELL_PX;
  const brickHeight = CELL_PX / 2;
  const brickWidth = CELL_PX;
  const floorNoise = noiseField(stream(seed, 1), W, H, k);
  const wallNoise = noiseField(stream(seed, 2), W, H, k);
  const seam: Rgb = [
    style.void[0] + SEAM_LIFT,
    style.void[1] + SEAM_LIFT,
    style.void[2] + SEAM_LIFT,
  ];
  const px = new Uint8ClampedArray(W * H * 4);
  const COL_OF = columnTable(W, CELL_PX);
  const cells = layout.cells;

  const floorRow = new Float32Array(W);
  const wallRow = new Float32Array(W);
  const tmp = new Float32Array(Math.max(...floorNoise.stride));
  const [vr, vg, vb] = style.void;
  const [fr, fg, fb] = style.floor;
  const [wr, wg, wb] = style.wall;
  const [sr, sg, sb] = seam;
  for (let y = 0; y < H; y++) {
    const rowBase = Math.floor(y / CELL_PX) * NCOLS;
    const brickRow = Math.floor(y / brickHeight);
    const horizontalSeam = y % brickHeight === 0;
    const seamOffset = brickRow % 2 === 1 ? brickWidth / 2 : 0;
    noiseRow(floorNoise, y, floorRow, tmp);
    noiseRow(wallNoise, y, wallRow, tmp);
    let i = y * W * 4;
    for (let x = 0; x < W; x++, i += 4) {
      const kind = cells[rowBase + COL_OF[x]];
      let r: number;
      let g: number;
      let b: number;
      if (kind === K_FLOOR) {
        const n = floorRow[x] * FLOOR_TEXTURE;
        r = fr + n;
        g = fg + n;
        b = fb + n;
      } else if (kind === K_WALL) {
        const n = wallRow[x] * WALL_TEXTURE;
        r = wr + n;
        g = wg + n;
        b = wb + n;
      } else {
        r = vr;
        g = vg;
        b = vb;
      }
      if (horizontalSeam || x % brickWidth === seamOffset) {
        r += (sr - r) * SEAM_ALPHA;
        g += (sg - g) * SEAM_ALPHA;
        b += (sb - b) * SEAM_ALPHA;
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }

  /* 裂縫與碎石（只在地板格），苔蘚（只在牆格） */
  const cv: Canvas = { px, cells, W, H, cell: CELL_PX, cols: NCOLS, colOf: COL_OF };
  const deco = stream(seed, 3);
  for (let cy = 0; cy < NROWS; cy++) {
    for (let cx = 0; cx < NCOLS; cx++) {
      const kind = cells[cy * NCOLS + cx];
      const ox = cx * CELL_PX;
      const oy = cy * CELL_PX;
      if (kind === K_FLOOR) {
        if (deco.next() < CRACK_CHANCE) {
          let x = ox + CELL_PX / 2 + deco.range(-12 * k, 12 * k);
          let y = oy + CELL_PX / 2 + deco.range(-12 * k, 12 * k);
          /* 方向用單位向量（只用加減乘除與開根號，每個瀏覽器算出來都一樣；三角函數的末位可能不同） */
          let [dx, dy] = unitVector(deco.signed(), deco.signed());
          const points = [{ x, y }];
          const segments = deco.int(3, 4);
          for (let s = 0; s < segments; s++) {
            if (s > 0) {
              /* 轉一個不大的角度：沿垂直方向偏 tanθ（|θ| ≲ 0.55 rad） */
              const t = deco.range(-0.6, 0.6);
              [dx, dy] = unitVector(dx - dy * t, dy + dx * t);
            }
            const len = deco.range(5 * k, 13 * k);
            x += dx * len;
            y += dy * len;
            points.push({ x, y });
          }
          polyline(cv, K_FLOOR, points, CRACK_COLOR, CRACK_ALPHA);
        }
        if (deco.next() < RUBBLE_CHANCE) {
          const x = ox + deco.range(16 * k, CELL_PX - 16 * k);
          const y = oy + deco.range(16 * k, CELL_PX - 16 * k);
          const n = deco.int(3, 6);
          for (let m = 0; m < n; m++) {
            const r = deco.range(2 * k, 4 * k);
            dot(
              cv,
              K_FLOOR,
              x + deco.range(-8 * k, 8 * k),
              y + deco.range(-8 * k, 8 * k),
              r,
              RUBBLE_COLOR,
              RUBBLE_ALPHA,
            );
          }
        }
      } else if (kind === K_WALL && style.moss) {
        if (deco.next() < MOSS_CHANCE) {
          const x = ox + deco.range(12 * k, CELL_PX - 12 * k);
          const y = oy + deco.range(12 * k, CELL_PX - 12 * k);
          const n = deco.int(4, 8);
          for (let m = 0; m < n; m++) {
            const r = deco.range(2 * k, 5 * k);
            dot(
              cv,
              K_WALL,
              x + deco.range(-6 * k, 6 * k),
              y + deco.range(-6 * k, 6 * k),
              r,
              style.moss,
              deco.range(0.15, 0.4),
            );
          }
        }
      }
    }
  }
  return px;
}

/* ---------- 火光與格線 ---------- */

/** 火光中心（px）：格線交點；有房間的生成法是房間左上角往內一格 */
export function lightCenters(
  layout: Layout,
  cellPx: number = BASE_CELL,
): { x: number; y: number }[] {
  return layout.lights.map((p) => ({ x: p.x * cellPx, y: p.y * cellPx }));
}

/** 火光的半徑（px）：2 格 */
export const lightRadius = (cellPx: number = BASE_CELL): number => 2 * cellPx;

/** 格線所在的像素欄（列）：0、每格 px、…，最後一條外框落在最後一個像素 */
export function gridLines(length: number, cellPx: number = BASE_CELL): number[] {
  const out: number[] = [];
  for (let p = 0; p < length; p += cellPx) out.push(p);
  out.push(length - 1);
  return out;
}

/** 在底圖的複本上疊火光與格線（底圖本身不變） */
export function applyOverlays(
  base: Uint8ClampedArray,
  layout: Layout,
  { grid, light }: OverlayOptions,
  cellPx: number = BASE_CELL,
): Uint8ClampedArray<ArrayBuffer> {
  const { width: W, height: H } = mapPixelSize(layout, cellPx);
  const px = new Uint8ClampedArray(base);
  if (light) {
    const R = lightRadius(cellPx);
    for (const c of lightCenters(layout, cellPx)) {
      for (let y = Math.max(0, c.y - R); y <= Math.min(H - 1, c.y + R); y++) {
        for (let x = Math.max(0, c.x - R); x <= Math.min(W - 1, c.x + R); x++) {
          const ddx = x - c.x;
          const ddy = y - c.y;
          const d = Math.sqrt(ddx * ddx + ddy * ddy);
          if (d >= R) continue;
          blend(px, (y * W + x) * 4, LIGHT_COLOR, LIGHT_ALPHA * (1 - d / R));
        }
      }
    }
  }
  if (grid) {
    /* 格線上的每個像素只變暗一次（橫豎交叉處也一次）；只走線上的像素 */
    const k = 1 - GRID_ALPHA;
    const cols = gridLines(W, cellPx);
    const rows = new Set(gridLines(H, cellPx));
    for (let y = 0; y < H; y++) {
      const row = y * W * 4;
      const full = rows.has(y);
      const n = full ? W : cols.length;
      for (let j = 0; j < n; j++) {
        const i = row + (full ? j : cols[j]) * 4;
        px[i] *= k;
        px[i + 1] *= k;
        px[i + 2] *= k;
      }
    }
  }
  return px;
}

/** 生成法在檔名裡的代號 */
export const GENERATOR_CODES: Record<GeneratorId, string> = {
  rooms: 'rooms',
  digger: 'digger',
  uniform: 'uniform',
  rogue: 'rogue',
  cave: 'cavern',
  maze: 'maze',
};

/**
 * 匯出檔名（規格 3.1）：battlemap_<地形代號>_<種子>.png；
 * 生成法不是「房間＋走道」時接 _<生成法代號>，尺寸不是 22 × 16、70 px 時接 _<欄>x<列>_<每格 px>px。
 */
export function mapFileName(
  terrain: TerrainId,
  seed: number,
  settings?: Pick<LayoutSettings, 'generator' | 'cols' | 'rows' | 'cellPx'>,
): string {
  const s = settings ?? DEFAULT_SETTINGS;
  const parts = ['battlemap', terrain, String(seed)];
  if (s.generator !== DEFAULT_SETTINGS.generator) parts.push(GENERATOR_CODES[s.generator]);
  if (!isDefaultSize(s)) parts.push(`${s.cols}x${s.rows}`, `${s.cellPx}px`);
  return `${parts.join('_')}.png`;
}

/** 底圖＋火光＋格線 */
export function renderMap(
  layout: Layout,
  terrain: TerrainId,
  options: OverlayOptions,
  cellPx: number = BASE_CELL,
): Uint8ClampedArray<ArrayBuffer> {
  return applyOverlays(renderBase(layout, terrain, cellPx), layout, options, cellPx);
}
