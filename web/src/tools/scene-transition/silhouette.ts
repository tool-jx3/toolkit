/**
 * 剪影轉場（花瓣、羽毛、眨眼、蝙蝠群；2026-11-20 新增，參考くま。「演出APNGメーカー」的功能與數值，程式與圖形本站自己做）。
 *
 * 和 core/transition 的「到達先後圖」不同，剪影是一片片會移動、旋轉、拍翅膀的東西，所以每一格重畫覆蓋率（0～1）：
 * - 每一片（花瓣、羽毛、蝙蝠）有自己的出發時間 start（依出現順序與花紋編號）、飛行 FLY 之後落定在自己的位置；
 *   落定以後外形不再改變，所以「已經落定的部分」事先算成每個像素的落定時間（landing 圖），每一格只要比大小，
 *   只有飛行中的那幾片要點陣化。
 * - 蓋上（arrive）：進度 level 0 → 1，一片片飛進來落定，1 時整片蓋滿（最後補一層，保證不透明）。
 * - 揭開（depart）：最先蓋上的最先離開，每一片照飛來的路倒著飛走（蝙蝠「從下方湧上」的往上飛走）；1 時完全透明。
 * - 掃過（band）：前緣照蓋上、後緣照揭開，兩者相差「帶寬」。
 * - 眨眼沒有一片片的東西：上下眼皮（弧形的邊）閉合，直接算每個像素。
 */
import { hashUnit } from '@/core/timeline';
import type { CellOrder, Direction8 } from '@/core/transition';
import { batOutline, ellipseOutline, FEATHER, PETAL_ROUND, PETAL_SAKURA } from './outlines';
import { blurCoverage, Rasterizer } from './raster';

export type SilhouetteShape = 'petals' | 'feathers' | 'blink' | 'bats';
export const SILHOUETTE_SHAPES: readonly SilhouetteShape[] = [
  'petals',
  'feathers',
  'blink',
  'bats',
];
export const isSilhouetteShape = (shape: string): shape is SilhouetteShape =>
  (SILHOUETTE_SHAPES as readonly string[]).includes(shape);

export interface SilhouetteParams {
  /** 花瓣：'sakura'｜'round'；眨眼：'flutter'｜'once'；蝙蝠：'rise'｜'close'｜'direction' */
  option: string;
  /** 花瓣、羽毛的出現順序 */
  order: CellOrder;
  direction: Direction8;
  /** 中心（0～1）：花瓣、羽毛「從中心」；蝙蝠「從四周合攏」的聚集點 */
  center: readonly [number, number];
  /** 橫向片數／隻數 */
  count: number;
  /** 0～100：花瓣、羽毛的飄動幅度；眨眼的眼皮弧度 */
  strength: number;
  seed: number;
  /** 反向順序 */
  reverse: boolean;
  /** 邊緣柔和度 1～255 */
  softness: number;
}

/** 一格的狀態（level、lead、trail 都是速度曲線換算後、乘上推進比例的進度） */
export type SilhouettePhase =
  | { kind: 'arrive'; level: number }
  | { kind: 'depart'; level: number }
  | { kind: 'band'; lead: number; trail: number };

export interface SilhouetteScene {
  readonly width: number;
  readonly height: number;
  /** 把這一格的覆蓋率（0～1）寫進 out（長度＝寬 × 高）；time 是秒（蝙蝠拍翅膀用） */
  paint(phase: SilhouettePhase, time: number, out: Float32Array): void;
}

export interface SceneOptions {
  /**
   * 揭開前蓋到哪裡（蓋上再揭開的回程：去程停在的進度＝推進比例）。1＝全部落定（揭開模式）。
   * 回程時只有這個進度以前落定的會「離開」，還在飛的照原路退回。
   */
  departFrom?: number;
}

/* ---------- 時間的分配（進度 0～1） ---------- */

/** 出發時間依出現順序散開的範圍 */
const ORDER_RANGE = 0.5;
/** 出發時間另外的隨機錯開 */
const JITTER = 0.1;
/** 從出發到落定 */
const FLY = 0.38;
/** 花瓣、羽毛飄在遠處時的大小（相對落定時） */
const FAR_SCALE = 0.26;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeSmooth = (v: number) => {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
};
const band01 = (v: number, a: number, b: number) => easeSmooth((v - a) / (b - a));

/** 方向的單位向量（畫面座標，往右下為正） */
function unitOf(d: Direction8): [number, number] {
  const s = Math.SQRT1_2;
  switch (d) {
    case 'left':
      return [-1, 0];
    case 'down':
      return [0, 1];
    case 'up':
      return [0, -1];
    case 'down-right':
      return [s, s];
    case 'down-left':
      return [-s, s];
    case 'up-right':
      return [s, -s];
    case 'up-left':
      return [-s, -s];
    default:
      return [1, 0];
  }
}

/** 沿方向的先後（u、v 是畫面上的 0～1 位置）：直向照那一軸，斜向是兩軸的平均 */
function alongDirection(d: Direction8, u: number, v: number): number {
  const fx = d.endsWith('left') ? 1 - u : u;
  const fy = d.startsWith('up') ? 1 - v : v;
  switch (d) {
    case 'right':
    case 'left':
      return fx;
    case 'down':
    case 'up':
      return fy;
    default:
      return (fx + fy) / 2;
  }
}

/** 從 (x, y) 沿 (dx, dy) 走到畫面外要多遠 */
function exitDistance(x: number, y: number, dx: number, dy: number, W: number, H: number): number {
  const tx = dx > 1e-9 ? (W - x) / dx : dx < -1e-9 ? -x / dx : Infinity;
  const ty = dy > 1e-9 ? (H - y) / dy : dy < -1e-9 ? -y / dy : Infinity;
  return Math.max(0, Math.min(tx, ty));
}

const farthestCorner = (cx: number, cy: number, W: number, H: number) =>
  Math.max(
    Math.hypot(cx, cy),
    Math.hypot(W - cx, cy),
    Math.hypot(cx, H - cy),
    Math.hypot(W - cx, H - cy),
  ) || 1;

/* ---------- 一片片的東西 ---------- */

interface Pose {
  x: number;
  y: number;
  scale: number;
  angle: number;
  /** 蝙蝠：翅膀的位置（−1～1） */
  flap: number;
  /** 蝙蝠：身體下面那一團黑的大小（0～1） */
  blob: number;
}

interface Piece {
  /** 落定的位置、大小（每單位幾 px）、角度 */
  x: number;
  y: number;
  size: number;
  angle: number;
  /** 出發的進度 */
  start: number;
  /** 飄動：起點的偏移、左右擺動的方向與幅度、旋轉量 */
  ox: number;
  oy: number;
  px: number;
  py: number;
  sway: number;
  spin: number;
  phase: number;
  /** 蝙蝠：出發點、飛走的目標、拍翅膀的頻率（次／秒） */
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  wobble: number;
  rate: number;
}

const transformInto = (
  dst: Float64Array,
  src: Float64Array,
  x: number,
  y: number,
  scale: number,
  angle: number,
): number => {
  const c = Math.cos(angle) * scale;
  const s = Math.sin(angle) * scale;
  const n = src.length / 2;
  for (let i = 0; i < n; i++) {
    const u = src[i * 2];
    const v = src[i * 2 + 1];
    dst[i * 2] = x + u * c - v * s;
    dst[i * 2 + 1] = y + u * s + v * c;
  }
  return n;
};

/** 落定的部分：每個像素「完全蓋住／部分蓋住」的最早落定（或最晚離開）時間與部分覆蓋率 */
interface Landing {
  full: Float32Array;
  part: Float32Array;
  partCover: Float32Array;
}

class PieceScene implements SilhouetteScene {
  readonly width: number;
  readonly height: number;
  private readonly kind: 'petals' | 'feathers' | 'bats';
  private readonly pieces: Piece[];
  private readonly outline: Float64Array | null;
  private readonly blob: Float64Array;
  private readonly raster: Rasterizer;
  private readonly scratch = new Float64Array(256);
  private readonly blurRadius: number;
  private readonly departFrom: number;
  private arriveMap: Landing | null = null;
  private departMap: Landing | null = null;
  private readonly batCache = new Map<number, Float64Array>();

  constructor(
    kind: 'petals' | 'feathers' | 'bats',
    W: number,
    H: number,
    p: SilhouetteParams,
    o: SceneOptions,
  ) {
    this.kind = kind;
    this.width = W;
    this.height = H;
    this.raster = new Rasterizer(W, H);
    this.departFrom = o.departFrom ?? 1;
    this.blurRadius = (p.softness / 255) * 0.015 * H;
    this.outline =
      kind === 'feathers'
        ? FEATHER
        : kind === 'petals'
          ? p.option === 'round'
            ? PETAL_ROUND
            : PETAL_SAKURA
          : null;
    this.blob = ellipseOutline(0.72, 0.64);
    this.pieces = kind === 'bats' ? layoutBats(W, H, p) : layoutLeaves(kind, W, H, p);
  }

  /* ---------- 姿勢 ---------- */

  /** 飛來的姿勢（u：0＝剛出發、1＝落定） */
  private arrivePose(q: Piece, u: number, time: number): Pose {
    if (this.kind === 'bats') {
      const e = easeSmooth(u);
      const k = Math.sin(Math.PI * u) * q.wobble;
      const dx = q.x - q.sx;
      const dy = q.y - q.sy;
      const len = Math.hypot(dx, dy) || 1;
      return {
        x: q.sx + dx * e - (dy / len) * k,
        y: q.sy + dy * e + (dx / len) * k,
        scale: q.size * (0.5 + 0.5 * e),
        angle: q.angle + q.spin * (1 - e),
        flap: Math.sin(Math.PI * 2 * (q.rate * time + q.phase)) * (1 - band01(u, 0.82, 1)),
        blob: band01(u, 0.72, 1),
      };
    }
    /* 先小小的飄過來（遠處），最後一段迎面撲過來變大（近處），落定時蓋住自己那一塊 */
    const a = clamp01(u / 0.8);
    const r = (1 - a) * (1 - a);
    const w = Math.sin(Math.PI * 2 * (0.9 * u + q.phase)) * q.sway * r;
    const angle =
      this.kind === 'feathers'
        ? q.angle + q.spin * Math.sin(Math.PI * 2 * (1.3 * u + q.phase)) * r
        : q.angle + q.spin * r;
    return {
      x: q.x + q.ox * r + q.px * w,
      y: q.y + q.oy * r + q.py * w,
      scale: q.size * (FAR_SCALE + (1 - FAR_SCALE) * band01(u, 0.55, 1)),
      angle,
      flap: 0,
      blob: 0,
    };
  }

  /** 蝙蝠飛走的姿勢（v：0＝還在原位、1＝飛出畫面） */
  private departPose(q: Piece, v: number, time: number): Pose {
    const e = v * v;
    const k = Math.sin(Math.PI * v) * q.wobble * 0.5;
    const dx = q.tx - q.x;
    const dy = q.ty - q.y;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: q.x + dx * e - (dy / len) * k,
      y: q.y + dy * e + (dx / len) * k,
      scale: q.size * (1 - 0.5 * easeSmooth(v)),
      angle: q.angle,
      flap: Math.sin(Math.PI * 2 * (q.rate * time + q.phase)) * band01(v, 0, 0.2),
      blob: 1 - band01(v, 0, 0.28),
    };
  }

  /** 畫一片（union：c ＋ a(1 − c)） */
  private draw(pose: Pose, out: Float32Array): void {
    const W = this.width;
    const sink = (y: number, x0: number, x1: number, row: Float32Array) => {
      const o = y * W;
      for (let x = x0; x < x1; x++) {
        const a = row[x] > 1 ? 1 : row[x];
        if (a <= 0) continue;
        const c = out[o + x];
        out[o + x] = c + a * (1 - c);
      }
    };
    this.fillPose(pose, sink);
  }

  private fillPose(
    pose: Pose,
    sink: (y: number, x0: number, x1: number, row: Float32Array) => void,
  ) {
    const outline = this.outline ?? this.batShape(pose.flap);
    const n = transformInto(this.scratch, outline, pose.x, pose.y, pose.scale, pose.angle);
    this.raster.fill(this.scratch, n, sink);
    if (pose.blob > 0) {
      const m = transformInto(
        this.scratch,
        this.blob,
        pose.x,
        pose.y,
        pose.scale * pose.blob,
        pose.angle,
      );
      this.raster.fill(this.scratch, m, sink);
    }
  }

  /** 蝙蝠的外形依翅膀位置取樣（32 階，快取） */
  private batShape(flap: number): Float64Array {
    const key = Math.round(flap * 16);
    let s = this.batCache.get(key);
    if (!s) {
      s = batOutline(key / 16);
      this.batCache.set(key, s);
    }
    return s;
  }

  /* ---------- 落定的部分 ---------- */

  /**
   * which：'arrive'＝每個像素最早落定的時間（落定＝start ＋ FLY）；'depart'＝最晚開始離開的時間（start），
   * 只算 departFrom 以前落定的（cap）。
   */
  private landing(which: 'arrive' | 'depart', cap: number): Landing {
    const N = this.width * this.height;
    const arrive = which === 'arrive';
    const full = new Float32Array(N).fill(arrive ? Infinity : -Infinity);
    const part = new Float32Array(N).fill(arrive ? Infinity : -Infinity);
    const partCover = new Float32Array(N);
    const W = this.width;
    for (const q of this.pieces) {
      const land = q.start + FLY;
      if (!arrive && land > cap + 1e-9) continue;
      const t = arrive ? land : q.start;
      const sink = (y: number, x0: number, x1: number, row: Float32Array) => {
        const o = y * W;
        for (let x = x0; x < x1; x++) {
          const a = row[x];
          if (a <= 0) continue;
          const i = o + x;
          if (a >= 0.999) {
            if (arrive ? t < full[i] : t > full[i]) full[i] = t;
          } else {
            if (arrive ? t < part[i] : t > part[i]) part[i] = t;
            partCover[i] = partCover[i] + a * (1 - partCover[i]);
          }
        }
      };
      this.fillPose(this.landedPose(q), sink);
    }
    return { full, part, partCover };
  }

  private landedPose(q: Piece): Pose {
    return {
      x: q.x,
      y: q.y,
      scale: q.size,
      angle: q.angle,
      flap: 0,
      blob: this.kind === 'bats' ? 1 : 0,
    };
  }

  /* ---------- 一格 ---------- */

  paint(phase: SilhouettePhase, time: number, out: Float32Array): void {
    const N = this.width * this.height;
    if (phase.kind === 'arrive') {
      const e = phase.level;
      if (e <= 0) return void out.fill(0, 0, N);
      if (e >= 1) return void out.fill(1, 0, N);
      this.arriveMap ??= this.landing('arrive', 1);
      const m = this.arriveMap;
      for (let i = 0; i < N; i++) out[i] = m.full[i] <= e ? 1 : m.part[i] <= e ? m.partCover[i] : 0;
      for (const q of this.pieces) {
        const u = clamp01((e - q.start) / FLY);
        if (u > 0 && u < 1) this.draw(this.arrivePose(q, u, time), out);
      }
    } else if (phase.kind === 'depart') {
      const t = phase.level;
      const capLevel = this.departFrom;
      if (t >= 1 || capLevel <= 0) return void out.fill(0, 0, N);
      if (t <= 0 && capLevel >= 1) return void out.fill(1, 0, N);
      this.departMap ??= this.landing('depart', capLevel);
      const m = this.departMap;
      for (let i = 0; i < N; i++) out[i] = m.full[i] >= t ? 1 : m.part[i] >= t ? m.partCover[i] : 0;
      for (const q of this.pieces) {
        const cap = clamp01((capLevel - q.start) / FLY);
        const v = clamp01((t - q.start) / FLY);
        const pose = this.leavingPose(q, cap, v, time);
        if (pose) this.draw(pose, out);
      }
    } else {
      const { lead, trail } = phase;
      if (trail >= 1 || lead <= 0) return void out.fill(0, 0, N);
      if (lead >= 1 && trail <= 0) return void out.fill(1, 0, N);
      /* 掃過時一定是全部落定以後才離開（departFrom＝1） */
      this.arriveMap ??= this.landing('arrive', 1);
      this.departMap ??= this.landing('depart', 1);
      const a = this.arriveMap;
      const d = this.departMap;
      for (let i = 0; i < N; i++) {
        const ca = a.full[i] <= lead ? 1 : a.part[i] <= lead ? a.partCover[i] : 0;
        const cd = d.full[i] >= trail ? 1 : d.part[i] >= trail ? d.partCover[i] : 0;
        out[i] = ca < cd ? ca : cd;
      }
      for (const q of this.pieces) {
        const u = clamp01((lead - q.start) / FLY);
        const v = clamp01((trail - q.start) / FLY);
        if (u <= 0 || v >= 1) continue;
        /* 還在飛來（比離開的進度少）：照飛來的姿勢；否則照離開的姿勢 */
        const pose = u < 1 - v ? this.arrivePose(q, u, time) : this.leavingPose(q, u, v, time);
        if (pose) this.draw(pose, out);
      }
    }
    if (this.blurRadius >= 1) blurCoverage(out, this.width, this.height, this.blurRadius);
  }

  /**
   * 離開中的姿勢：cap 是開始離開時飛到哪裡（1＝已落定）、v 是離開的進度。
   * 已落定的照「飛走」的路（花瓣、羽毛是飛來的路倒過來）；還沒落定就開始離開的照飛來的路退回。
   * 完全在原位（還沒離開的落定者）或已經離開的回傳 null。
   */
  private leavingPose(q: Piece, cap: number, v: number, time: number): Pose | null {
    if (cap <= 0 || v >= 1) return null;
    if (cap >= 1) {
      if (v <= 0) return null;
      return this.kind === 'bats' ? this.departPose(q, v, time) : this.arrivePose(q, 1 - v, time);
    }
    return this.arrivePose(q, Math.min(cap, 1 - v), time);
  }
}

/* ---------- 版面：花瓣、羽毛 ---------- */

/** 出現順序（0～1）→ 出發時間；反向順序時顛倒 */
function startOf(order: number, seed: number, index: number, reverse: boolean): number {
  const o = clamp01(reverse ? 1 - order : order);
  return o * ORDER_RANGE + hashUnit(seed, index, 11) * JITTER;
}

function layoutLeaves(
  kind: 'petals' | 'feathers',
  W: number,
  H: number,
  p: SilhouetteParams,
): Piece[] {
  const cols = Math.max(1, Math.round(p.count));
  const cell = W / cols;
  const rows = Math.ceil(H / cell);
  const k = Math.max(0, Math.min(100, p.strength)) / 100;
  const [cx, cy] = [p.center[0] * W, p.center[1] * H];
  const far = farthestCorner(cx, cy, W, H);
  const travel = unitOf(p.direction);
  const pieces: Piece[] = [];
  let index = 0;
  for (let j = -1; j <= rows; j++)
    for (let i = -1; i <= cols; i++) {
      const r = (n: number) => hashUnit(p.seed, index, n);
      const x = (i + 0.5 + (r(1) - 0.5) * 0.6) * cell;
      const y = (j + 0.5 + (r(2) - 0.5) * 0.6) * cell;
      /* 出現順序與飄來的方向（「風」：花瓣從上風處飄來，羽毛主要往下落） */
      let order: number;
      let wind: [number, number];
      if (p.order === 'center') {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        order = d / far;
        wind = d > 1e-6 ? [dx / d, dy / d] : [0, 1];
      } else if (p.order === 'random') {
        order = r(3);
        wind = [0.45, 0.9];
      } else if (p.order === 'alternate') {
        order = ((i + j) & 1) * 0.8 + r(3) * 0.2;
        wind = [0.45, 0.9];
      } else {
        order = alongDirection(p.direction, (x + 0.5) / W, (y + 0.5) / H);
        wind = travel;
      }
      if (kind === 'feathers') wind = [wind[0] * 0.6, wind[1] * 0.6 + 1];
      else wind = [wind[0], wind[1] + 0.5];
      const wl = Math.hypot(wind[0], wind[1]) || 1;
      const drift = cell * 6 * k * (0.8 + 0.4 * r(4));
      const ox = (-wind[0] / wl) * drift;
      const oy = (-wind[1] / wl) * drift;
      const feather = kind === 'feathers';
      pieces.push({
        x,
        y,
        size: cell * (feather ? 2.5 : 1.85) * (0.9 + 0.2 * r(5)),
        angle: r(6) * Math.PI * 2,
        start: startOf(order, p.seed, index, p.reverse),
        ox,
        oy,
        /* 左右擺動：和飄來的方向垂直 */
        px: -wind[1] / wl,
        py: wind[0] / wl,
        sway: cell * (feather ? 1.6 : 0.7) * k,
        spin: feather
          ? 0.6 * k
          : (r(7) < 0.5 ? -1 : 1) * Math.PI * 2 * 1.2 * k * (0.7 + 0.6 * r(8)),
        phase: r(9),
        sx: 0,
        sy: 0,
        tx: 0,
        ty: 0,
        wobble: 0,
        rate: 0,
      });
      index++;
    }
  return pieces;
}

/* ---------- 版面：蝙蝠 ---------- */

function layoutBats(W: number, H: number, p: SilhouetteParams): Piece[] {
  const cols = Math.max(1, Math.round(p.count));
  const cell = W / cols;
  const rows = Math.ceil(H / cell);
  const mode = p.option === 'close' || p.option === 'direction' ? p.option : 'rise';
  const [cx, cy] = [p.center[0] * W, p.center[1] * H];
  const far = farthestCorner(cx, cy, W, H);
  const travel = unitOf(p.direction);
  const pieces: Piece[] = [];
  let index = 0;
  for (let j = -1; j <= rows; j++)
    for (let i = -1; i <= cols; i++) {
      const r = (n: number) => hashUnit(p.seed, index, 40 + n);
      const x = (i + 0.5 + (r(1) - 0.5) * 0.5) * cell;
      const y = (j + 0.5 + (r(2) - 0.5) * 0.5) * cell;
      const size = cell * 1.55 * (0.9 + 0.2 * r(3));
      const margin = size * 1.3 + cell;
      let order: number;
      let sx: number;
      let sy: number;
      let tx: number;
      let ty: number;
      if (mode === 'close') {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        const a = r(4) * Math.PI * 2;
        const [ux, uy] = d > 1e-6 ? [dx / d, dy / d] : [Math.cos(a), Math.sin(a)];
        order = 1 - d / far;
        const out = exitDistance(x, y, ux, uy, W, H) + margin;
        sx = x + ux * out;
        sy = y + uy * out;
        tx = sx;
        ty = sy;
      } else if (mode === 'direction') {
        const [ux, uy] = travel;
        order = alongDirection(p.direction, (x + 0.5) / W, (y + 0.5) / H);
        const back = exitDistance(x, y, -ux, -uy, W, H) + margin;
        const side = (r(4) - 0.5) * 0.3 * Math.min(W, H);
        sx = x - ux * back - uy * side;
        sy = y - uy * back + ux * side;
        tx = x - ux * back + uy * side;
        ty = y - uy * back - ux * side;
      } else {
        /* 從下方湧上：畫面下緣中央最先、左右上角最後；飛走時往上 */
        const u = (x + 0.5) / W;
        const v = (y + 0.5) / H;
        order = Math.hypot((u - 0.5) * 0.9, 1 - v) / Math.hypot(0.45, 1);
        sx = W * (0.5 + (r(4) - 0.5) * 0.7);
        sy = H + margin + r(5) * cell * 2;
        tx = x + (r(6) - 0.5) * 0.6 * W;
        ty = -margin - r(7) * cell * 2;
      }
      pieces.push({
        x,
        y,
        size,
        angle: (r(8) - 0.5) * 0.5,
        start: startOf(order, p.seed, index, p.reverse),
        ox: 0,
        oy: 0,
        px: 0,
        py: 0,
        sway: 0,
        spin: (r(9) - 0.5) * 0.8,
        phase: r(10),
        sx,
        sy,
        tx,
        ty,
        wobble: (r(11) - 0.5) * cell * 3,
        rate: 3 + 2 * r(12),
      });
      index++;
    }
  return pieces;
}

/* ---------- 眨眼 ---------- */

/**
 * 閉合的程度（0＝張開、1＝閉上）。'flutter'（先眨一下）：先閉到約 72%、張回到約 40%，再閉上；'once'：直接閉上。
 */
export function blinkClosure(option: string, q: number): number {
  const t = clamp01(q);
  if (option === 'once') return t;
  if (t < 0.4) return 0.72 * easeSmooth(t / 0.4);
  if (t < 0.6) return 0.72 - 0.32 * easeSmooth((t - 0.4) / 0.2);
  return 0.4 + 0.6 * easeSmooth((t - 0.6) / 0.4);
}

class BlinkScene implements SilhouetteScene {
  readonly width: number;
  readonly height: number;
  private readonly option: string;
  /** 眼皮邊緣的弧度（(1 − ξ²) 的次方；0＝平直） */
  private readonly gamma: number;
  /** 邊緣的漸層寬度（px） */
  private readonly soft: number;

  constructor(W: number, H: number, p: SilhouetteParams) {
    this.width = W;
    this.height = H;
    this.option = p.option;
    this.gamma = (Math.max(0, Math.min(100, p.strength)) / 100) * 2.5;
    this.soft = Math.max(1, (p.softness / 255) * 0.06 * H);
  }

  /** 眨眼的「蓋上程度」：蓋上＝閉起來；揭開＝張開（倒過來）；掃過＝閉上再張開 */
  private closureOf(phase: SilhouettePhase): number {
    if (phase.kind === 'arrive') return blinkClosure(this.option, phase.level);
    if (phase.kind === 'depart') return blinkClosure(this.option, 1 - phase.level);
    return blinkClosure(this.option, Math.min(phase.lead, 1 - phase.trail));
  }

  paint(phase: SilhouettePhase, _time: number, out: Float32Array): void {
    const W = this.width;
    const H = this.height;
    const N = W * H;
    const c = this.closureOf(phase);
    if (c <= 0) return void out.fill(0, 0, N);
    if (c >= 1) return void out.fill(1, 0, N);
    const open = 1 - c;
    const g = this.gamma;
    const w = this.soft;
    const shapeAt = (xi: number) => (g === 0 ? 1 : (1 - xi * xi) ** g);
    /* 眼角在畫面外 m 的地方；張得越開眼角越往外，全開時眼皮整個在畫面外 */
    const corner = (o: number) => W * (0.04 + 1.6 * o ** 4);
    const half = W / 2;
    const fullOpen = (H / 2 + w) / shapeAt(half / (half + corner(1)));
    const m = corner(open);
    const d = open * fullOpen * 1.04;
    const mid = H / 2;
    for (let x = 0; x < W; x++) {
      const xi = (x + 0.5 - half) / (half + m);
      let top: number;
      let slope: number;
      if (xi <= -1 || xi >= 1) {
        /* 眼角外：上下眼皮已經合在一起 */
        top = 0;
        slope = 0;
      } else {
        top = d * shapeAt(xi);
        /* 斜率（dy／dx），把垂直的漸層換成和邊緣垂直的寬度 */
        slope = g === 0 ? 0 : (d * g * (1 - xi * xi) ** (g - 1) * 2 * Math.abs(xi)) / (half + m);
      }
      const k = 1 / (w * Math.sqrt(1 + Math.min(2500, slope * slope)));
      const yu = mid - top;
      const yl = mid + top;
      for (let y = 0; y < H; y++) {
        const yc = y + 0.5;
        const a = clamp01((yu - yc) * k + 0.5);
        const b = clamp01((yc - yl) * k + 0.5);
        out[y * W + x] = 1 - (1 - a) * (1 - b);
      }
    }
  }
}

/** 建立剪影的畫面（同一組設定、同一個尺寸畫出來的每一格都一樣） */
export function buildSilhouetteScene(
  shape: SilhouetteShape,
  width: number,
  height: number,
  params: SilhouetteParams,
  options: SceneOptions = {},
): SilhouetteScene {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  if (shape === 'blink') return new BlinkScene(W, H, params);
  return new PieceScene(shape, W, H, params, options);
}

/** 單元測試用：各形狀的時間分配 */
export const SILHOUETTE_TIMING = { ORDER_RANGE, JITTER, FLY } as const;
