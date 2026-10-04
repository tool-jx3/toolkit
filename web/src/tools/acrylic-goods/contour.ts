/**
 * 由圖片的透明度算出壓克力的外框（規格 3.1）：
 * 1. 圖片縮到長邊最多 500 px（只用來算外框，貼圖仍是原圖）。
 * 2. 透明度 > 30 的像素算圖的一部分，往外擴「外框留白」（依縮小的比例換算；圓形外擴＝距離 ≤ 留白）。
 * 3. 沿著每一塊的外緣描邊（8 方向相連；洞不算，被別塊圍住的小塊略過）。
 * 4. 7 點移動平均讓邊緣圓滑，再去掉間隔不到 2 px 的點。
 * 5. 換算回原圖的 px：以所有外框的範圍中心為原點、y 往上；圖片平面的中心相對於原點的位置另外給。
 * 純函式（像素陣列進出），Node 也能跑。
 */
import { distanceField } from '@/core/image';

export interface Pt {
  x: number;
  y: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/** 算外框用的縮圖長邊上限（px） */
export const CONTOUR_MAX_DIM = 500;
/** 透明度大於這個值（0～255）的像素算圖的一部分 */
export const ALPHA_THRESHOLD = 30;
/** 平滑的視窗（點數） */
export const SMOOTH_WINDOW = 7;
/** 簡化：與上一個保留的點距離超過這個值（縮圖 px）才保留 */
export const SIMPLIFY_DISTANCE = 2;
/** 外擴後少於這麼多像素的小塊略過（雜點） */
export const MIN_BLOB_PIXELS = 8;
/** 最多幾塊 */
export const MAX_BLOBS = 64;

/** 算外框用的透明度圖（已縮小） */
export interface AlphaMap {
  /** 縮圖的寬高 */
  width: number;
  height: number;
  /** 每個像素的透明度 0～255 */
  alpha: Uint8Array | Uint8ClampedArray;
  /** 原圖的寬高 */
  sourceWidth: number;
  sourceHeight: number;
}

/** 外框（世界座標＝原圖 px，y 往上，原點＝所有外框範圍的中心） */
export interface ContourShape {
  outlines: Pt[][];
  bounds: Bounds;
  /** 圖片平面（原尺寸）的中心位置 */
  planeOffset: Pt;
  imageWidth: number;
  imageHeight: number;
}

/** 縮圖尺寸：長邊超過 max 時等比縮小（無條件捨去） */
export function contourScale(width: number, height: number, max = CONTOUR_MAX_DIM) {
  const s = width > max || height > max ? max / Math.max(width, height) : 1;
  return {
    scale: s,
    width: Math.max(1, Math.floor(width * s)),
    height: Math.max(1, Math.floor(height * s)),
  };
}

const DX = [1, 1, 0, -1, -1, -1, 0, 1];
const DY = [0, 1, 1, 1, 0, -1, -1, -1];

/** 點在多邊形裡（偶奇規則） */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/**
 * 描出 mask（1＝實心）每一塊的外緣（像素座標，順時針）。
 * 由每塊最上面一列最左邊的像素開始，沿 8 個方向找下一個實心像素；回到起點、而且下一步與第一步相同時結束。
 * 被別塊外緣圍住的塊（在洞裡）略過；太小的塊（少於 minPixels）略過。
 */
export function traceContours(
  mask: Uint8Array,
  width: number,
  height: number,
  { minPixels = MIN_BLOB_PIXELS, maxBlobs = MAX_BLOBS } = {},
): Pt[][] {
  const solid = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === 1;
  const label = new Int32Array(width * height);
  const out: Pt[][] = [];
  let next = 0;
  const stack: number[] = [];
  for (let i = 0; i < mask.length && out.length < maxBlobs; i++) {
    if (mask[i] !== 1 || label[i]) continue;
    /* 標記這一塊（8 方向相連） */
    next += 1;
    let count = 0;
    stack.push(i);
    label[i] = next;
    while (stack.length) {
      const k = stack.pop()!;
      count++;
      const kx = k % width;
      const ky = (k - kx) / width;
      for (let d = 0; d < 8; d++) {
        const nx = kx + DX[d];
        const ny = ky + DY[d];
        if (!solid(nx, ny)) continue;
        const nk = ny * width + nx;
        if (label[nk]) continue;
        label[nk] = next;
        stack.push(nk);
      }
    }
    if (count < minPixels) continue;
    const sx = i % width;
    const sy = (i - sx) / width;
    if (out.some((poly) => pointInPolygon({ x: sx, y: sy }, poly))) continue;
    out.push(traceFrom(solid, sx, sy, width * height));
  }
  return out;
}

function traceFrom(
  solid: (x: number, y: number) => boolean,
  sx: number,
  sy: number,
  cap: number,
): Pt[] {
  const pts: Pt[] = [];
  let x = sx;
  let y = sy;
  /* 起點是這一塊最上面一列最左邊的像素：左邊、上面都是空的，假設是從左下（方向 3 的反方向）來的 */
  let back = 3;
  let firstDir = -1;
  for (let guard = 0; guard <= cap * 2; guard++) {
    pts.push({ x, y });
    const start = (back + 2) % 8;
    let dir = -1;
    for (let i = 0; i < 8; i++) {
      const d = (start + i) % 8;
      if (solid(x + DX[d], y + DY[d])) {
        dir = d;
        break;
      }
    }
    if (dir < 0) break; /* 孤立的一點 */
    if (x === sx && y === sy) {
      if (firstDir < 0) firstDir = dir;
      else if (dir === firstDir) {
        pts.pop();
        break;
      }
    }
    x += DX[dir];
    y += DY[dir];
    back = (dir + 4) % 8;
  }
  return pts;
}

/** 環狀移動平均（視窗 window 點），再去掉離上一個保留點不到 minDist 的點。少於 window 點時原樣回傳 */
export function smoothContour(
  points: readonly Pt[],
  window = SMOOTH_WINDOW,
  minDist = SIMPLIFY_DISTANCE,
): Pt[] {
  const n = points.length;
  if (n < window) return points.slice();
  const half = Math.floor(window / 2);
  const smoothed: Pt[] = [];
  for (let i = 0; i < n; i++) {
    let sx = 0;
    let sy = 0;
    for (let j = 0; j < window; j++) {
      const p = points[(i + j - half + n) % n];
      sx += p.x;
      sy += p.y;
    }
    smoothed.push({ x: sx / window, y: sy / window });
  }
  const out = [smoothed[0]];
  for (let i = 1; i < smoothed.length; i++) {
    const last = out[out.length - 1];
    if (Math.hypot(smoothed[i].x - last.x, smoothed[i].y - last.y) > minDist) out.push(smoothed[i]);
  }
  return out;
}

/** 實心遮罩：圖放在四周各留 pad px 的畫布裡，透明度 > threshold 的像素為 1 */
export function solidMask(map: AlphaMap, pad: number, threshold = ALPHA_THRESHOLD) {
  const w = map.width + pad * 2;
  const h = map.height + pad * 2;
  const mask = new Uint8Array(w * h);
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (map.alpha[y * map.width + x] > threshold) mask[(y + pad) * w + x + pad] = 1;
  return { mask, width: w, height: h };
}

/** 往外擴 radius px（到最近的實心像素距離 ≤ radius 的都算實心） */
export function dilateMask(mask: Uint8Array, width: number, height: number, radius: number) {
  if (radius <= 0) return mask;
  const dist = distanceField(mask, width, height);
  const out = new Uint8Array(mask.length);
  const r = radius + 1e-6;
  for (let i = 0; i < out.length; i++) out[i] = dist[i] <= r ? 1 : 0;
  return out;
}

/**
 * 一張圖的外框。expandPx＝外框留白（原圖 px）。抓不到任何外框（整張透明）時回傳 null。
 */
export function contourShape(map: AlphaMap, expandPx: number): ContourShape | null {
  const sx = map.width / map.sourceWidth;
  const sy = map.height / map.sourceHeight;
  const scale = Math.min(1, Math.max(sx, sy));
  const pad = Math.max(0, Math.floor(expandPx * scale));
  const solid = solidMask(map, pad);
  const mask = dilateMask(solid.mask, solid.width, solid.height, pad);
  const raw = traceContours(mask, solid.width, solid.height);
  /* 像素中心：+0.5 */
  const lines = raw
    .map((poly) => smoothContour(poly.map((p) => ({ x: p.x + 0.5, y: p.y + 0.5 }))))
    .filter((poly) => poly.length >= 3);
  if (!lines.length) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const poly of lines)
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const toWorld = (p: Pt): Pt => ({ x: (p.x - cx) / sx, y: -(p.y - cy) / sy });
  return {
    outlines: lines.map((poly) => poly.map(toWorld)),
    bounds: {
      minX: (minX - cx) / sx,
      maxX: (maxX - cx) / sx,
      minY: -(maxY - cy) / sy,
      maxY: -(minY - cy) / sy,
    },
    planeOffset: { x: (solid.width / 2 - cx) / sx, y: (cy - solid.height / 2) / sy },
    imageWidth: map.sourceWidth,
    imageHeight: map.sourceHeight,
  };
}
