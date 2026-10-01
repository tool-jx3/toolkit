/**
 * core/shapes：常用圖形的路徑（星、愛心、六角形、菱形、三角形、方形、圓、花瓣、圓角矩形）。
 *
 * 每個圖形以「中心 (cx, cy)、大小 size（外接圓半徑；愛心、花瓣是外接框的半寬）」描述，三種用法：
 * - `traceShape(ctx, kind, cx, cy, size, opts)`：在 canvas 上建路徑（會先 beginPath），之後自己 fill／stroke；
 * - `shapePath2D(...)`：Path2D（重複使用、點選測試 isPointInPath）；
 * - `shapePolygon(...)`：折線頂點（圓、愛心、花瓣依 segments 取樣），給純函式計算（到達先後圖、點選測試）。
 * `shapeRadialProfile(kind)` 給「從中心等比放大」的轉場：每個角度上邊界離中心多遠（size＝1）。
 *
 * 角度一律是畫面座標（y 向下）、弧度、順時針為正；預設方向：星與三角形一角朝上、六角形尖角朝上（flatTop 改平頂）、
 * 菱形四角在上下左右、愛心凹口朝上。
 */

export type ShapeKind =
  | 'circle'
  | 'square'
  | 'diamond'
  | 'triangle'
  | 'star'
  | 'heart'
  | 'hexagon'
  | 'petal'
  | 'roundRect';

export const SHAPE_KINDS: readonly ShapeKind[] = [
  'circle',
  'square',
  'diamond',
  'triangle',
  'star',
  'heart',
  'hexagon',
  'petal',
  'roundRect',
];

export interface ShapeOptions {
  /** 旋轉（弧度，順時針） */
  rotation?: number;
  /** 星：角數（預設 5） */
  points?: number;
  /** 星：內凹點半徑 ÷ 外角半徑（預設 0.42） */
  innerRatio?: number;
  /** 六角形：平頂（預設尖角朝上） */
  flatTop?: boolean;
  /** 圓角矩形：寬、高（預設 2size × 2size） */
  width?: number;
  height?: number;
  /** 圓角矩形：圓角半徑（px，預設短邊的 24%） */
  radius?: number;
  /** 花瓣（橢圓）：短軸 ÷ 長軸（預設 0.55）；長軸沿 rotation 方向（0＝朝上） */
  aspect?: number;
  /** 曲線取樣段數（圓、愛心、花瓣、圓角；預設 96） */
  segments?: number;
}

export interface ShapePoint {
  x: number;
  y: number;
}

/** 經典心形曲線（凹口朝上、尖端朝下），已正規化成外接框半寬＝1、置中 */
function heartPoints(segments: number): ShapePoint[] {
  const raw: ShapePoint[] = [];
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    raw.push({ x, y });
  }
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const p of raw) {
    x0 = Math.min(x0, p.x);
    x1 = Math.max(x1, p.x);
    y0 = Math.min(y0, p.y);
    y1 = Math.max(y1, p.y);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const half = Math.max(x1 - x0, y1 - y0) / 2;
  return raw.map((p) => ({ x: (p.x - cx) / half, y: (p.y - cy) / half }));
}

const HEART_CACHE = new Map<number, ShapePoint[]>();

/** 以單位大小（size＝1、中心 0,0、未旋轉）描述的頂點 */
function unitPolygon(kind: ShapeKind, o: ShapeOptions): ShapePoint[] {
  const seg = Math.max(8, Math.round(o.segments ?? 96));
  const ring = (n: number, r: number, start: number) =>
    Array.from({ length: n }, (_, i) => {
      const a = start + (i / n) * Math.PI * 2;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    });
  const up = -Math.PI / 2;
  switch (kind) {
    case 'circle':
      return ring(seg, 1, up);
    case 'square':
      return [
        { x: -1, y: -1 },
        { x: 1, y: -1 },
        { x: 1, y: 1 },
        { x: -1, y: 1 },
      ];
    case 'diamond':
      return ring(4, 1, up);
    case 'triangle':
      return ring(3, 1, up);
    case 'hexagon':
      return ring(6, 1, o.flatTop ? 0 : up);
    case 'star': {
      const n = Math.max(3, Math.round(o.points ?? 5));
      const inner = o.innerRatio ?? 0.42;
      return Array.from({ length: n * 2 }, (_, i) => {
        const a = up + (i / (n * 2)) * Math.PI * 2;
        const r = i % 2 ? inner : 1;
        return { x: Math.cos(a) * r, y: Math.sin(a) * r };
      });
    }
    case 'heart': {
      let h = HEART_CACHE.get(seg);
      if (!h) {
        h = heartPoints(seg);
        HEART_CACHE.set(seg, h);
      }
      return h;
    }
    case 'petal': {
      const k = o.aspect ?? 0.55;
      return Array.from({ length: seg }, (_, i) => {
        const a = (i / seg) * Math.PI * 2;
        return { x: Math.cos(a) * k, y: Math.sin(a) };
      });
    }
    case 'roundRect': {
      const w = (o.width ?? 2) / 2;
      const h = (o.height ?? 2) / 2;
      const r = Math.max(0, Math.min(w, h, o.radius ?? Math.min(w, h) * 0.48));
      const per = Math.max(2, Math.round(seg / 4));
      const out: ShapePoint[] = [];
      const corners: [number, number, number][] = [
        [w - r, -h + r, -Math.PI / 2],
        [w - r, h - r, 0],
        [-w + r, h - r, Math.PI / 2],
        [-w + r, -h + r, Math.PI],
      ];
      for (const [cx, cy, a0] of corners) {
        for (let i = 0; i <= per; i++) {
          const a = a0 + (i / per) * (Math.PI / 2);
          out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
        }
      }
      return out;
    }
    default:
      return ring(seg, 1, up);
  }
}

/**
 * 圖形的頂點（閉合折線，不重複第一點）。圓角矩形的 width／height／radius 是 px（不乘 size）。
 */
export function shapePolygon(
  kind: ShapeKind,
  cx: number,
  cy: number,
  size: number,
  options: ShapeOptions = {},
): ShapePoint[] {
  const rot = options.rotation ?? 0;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const k = kind === 'roundRect' ? 1 : size;
  const unit =
    kind === 'roundRect'
      ? unitPolygon(kind, {
          ...options,
          width: options.width ?? size * 2,
          height: options.height ?? size * 2,
          radius:
            options.radius ??
            Math.min(options.width ?? size * 2, options.height ?? size * 2) * 0.24,
        })
      : unitPolygon(kind, options);
  return unit.map((p) => ({ x: cx + (p.x * c - p.y * s) * k, y: cy + (p.x * s + p.y * c) * k }));
}

interface PathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  arc?(x: number, y: number, r: number, a0: number, a1: number): void;
  ellipse?(
    x: number,
    y: number,
    rx: number,
    ry: number,
    rotation: number,
    a0: number,
    a1: number,
  ): void;
  bezierCurveTo?(a: number, b: number, c: number, d: number, e: number, f: number): void;
}

function emit(
  path: PathSink,
  kind: ShapeKind,
  cx: number,
  cy: number,
  size: number,
  o: ShapeOptions,
) {
  /* 圓與花瓣用原生的弧（邊緣最平順），其他用頂點 */
  if (kind === 'circle' && path.arc) {
    path.moveTo(cx + size, cy);
    path.arc(cx, cy, size, 0, Math.PI * 2);
    path.closePath();
    return;
  }
  if (kind === 'petal' && path.ellipse) {
    const rot = o.rotation ?? 0;
    const k = o.aspect ?? 0.55;
    path.moveTo(cx + Math.cos(rot) * size * k, cy + Math.sin(rot) * size * k);
    path.ellipse(cx, cy, size * k, size, rot, 0, Math.PI * 2);
    path.closePath();
    return;
  }
  const pts = shapePolygon(kind, cx, cy, size, { segments: 128, ...o });
  pts.forEach((p, i) => {
    if (i) path.lineTo(p.x, p.y);
    else path.moveTo(p.x, p.y);
  });
  path.closePath();
}

/** 在 ctx 上建立圖形路徑（先 beginPath；之後自己 fill／stroke） */
export function traceShape(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  kind: ShapeKind,
  cx: number,
  cy: number,
  size: number,
  options: ShapeOptions = {},
): void {
  ctx.beginPath();
  emit(ctx, kind, cx, cy, size, options);
}

/** 圖形的 Path2D（沒有 Path2D 的環境丟錯） */
export function shapePath2D(
  kind: ShapeKind,
  cx: number,
  cy: number,
  size: number,
  options: ShapeOptions = {},
): Path2D {
  const p = new Path2D();
  emit(p, kind, cx, cy, size, options);
  return p;
}

/** 點在多邊形內（奇偶規則） */
export function pointInPolygon(points: readonly ShapePoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/**
 * 從中心往外的邊界距離（size＝1）：回傳 samples 個值，第 i 個是角度 i ÷ samples × 2π（從右方起、順時針）時，
 * 射線最後一次穿出圖形的距離。給「圖形以中心等比放大」的轉場：點 (dx, dy) 的放大倍率＝距離 ÷ profile(角度)。
 */
export function shapeRadialProfile(
  kind: ShapeKind,
  options: ShapeOptions = {},
  samples = 720,
): Float32Array {
  const poly = shapePolygon(kind, 0, 0, 1, { segments: 256, ...options });
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    let far = 0;
    for (let j = 0, k = poly.length - 1; j < poly.length; k = j++) {
      const p = poly[k];
      const q = poly[j];
      /* 射線 t·(dx, dy) 與線段 p→q 的交點 */
      const ex = q.x - p.x;
      const ey = q.y - p.y;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (p.x * ey - p.y * ex) / den;
      const u = (p.x * dy - p.y * dx) / den;
      if (t > 0 && u >= 0 && u <= 1 && t > far) far = t;
    }
    out[i] = far || 1e-6;
  }
  return out;
}

/** 依角度（弧度，畫面座標）從 profile 取邊界距離（線性內插） */
export function profileAt(profile: Float32Array, angle: number): number {
  const n = profile.length;
  let f = (angle / (Math.PI * 2)) * n;
  f = ((f % n) + n) % n;
  const i = Math.floor(f);
  const j = (i + 1) % n;
  const w = f - i;
  return profile[i] * (1 - w) + profile[j] * w;
}
