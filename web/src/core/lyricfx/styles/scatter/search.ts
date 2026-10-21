/**
 * 「散落」找位置（lyric-fx 規格 3.5）：在錨點的範圍裡用這一句自己的亂數流試點，避開畫面上的其他句與避開區域。
 * - scatterSearch：沒有避開區域時（角度清單 × 每個角度 40 個隨機點；都不行時在第一個角度再取一個點當備用）。
 * - bandSearch：有避開區域時（區域上、下、左、右四條帶子依面積加權排順序，每條 12 個隨機點；
 *   透視後的整塊也不能壓到區域；都不行時用試過的點裡和區域重疊最少的當備用，F54）。
 * - escapeRegion：連帶子都沒有時，從範圍正中央推到區域外最近的地方。
 * 亂數只從呼叫端給的 rng 取，取用的順序固定（同樣的種子一定得到同樣的結果）。
 */
import { type Perspective, projectBox } from '../../perspective';
import type { Rng } from '../../random';
import { anchorSpan, boxAt, type Metrics, type Shape, type Side, type Span } from './layout';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 重疊的面積（沒有重疊、只碰到邊＝0） */
export function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** 兩個矩形重疊（規格 3.5：四邊都嚴格相交）＝重疊的面積大於 0（整塊的寬高一定大於 0） */
export const rectsHit = (a: Rect, b: Rect): boolean => overlapArea(a, b) > 0;

/** 避開區域（基準畫面的整數座標：由畫面的比例換算後四捨五入） */
export interface Zone {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const zoneRect = (z: Zone): Rect => ({
  x: z.left,
  y: z.top,
  width: z.right - z.left,
  height: z.bottom - z.top,
});

/** 找到的位置 */
export interface Spot {
  shape: Shape;
  x: number;
  y: number;
}

/** 這一次找位置的條件 */
export interface SearchContext {
  m: Metrics;
  rng: Rng;
  /** 要避開的句（透視前的整塊，殘影已經算進上飄的距離） */
  avoid: readonly Rect[];
  /** 左右分區 */
  side: Side;
  /** 這一個折行在角度 a 的樣子（快取由呼叫端做） */
  shape(rows: readonly string[], angle: number): Shape;
  /** 錨點在 (x, y) 時的透視參數 */
  perspAt(x: number, y: number): Perspective;
}

const clear = (box: Rect, avoid: readonly Rect[]) => avoid.every((o) => !rectsHit(box, o));

/** 角度清單：先抽一個，再依序加上範圍內、還沒有的固定角度（越來越接近 0 度） */
function angleList(ctx: SearchContext, fixed: readonly number[]): number[] {
  const { angleLo: lo, angleHi: hi } = ctx.m;
  const list = [ctx.rng.randint(lo, hi)];
  for (const a of fixed) if (a >= lo && a <= hi && !list.includes(a)) list.push(a);
  return list;
}

const FREE_ANGLES = [0, 1, -1, 2, -2, 3, -3, 5, -5, 8, -8] as const;
const ZONE_ANGLES = [0, 1, -1, 2, -2, 3, -3] as const;
const FREE_TRIES = 40;
const BAND_TRIES = 12;

const pick = (rng: Rng, x: Span, y: Span): [number, number] => {
  const px = rng.randint(x.lo, x.hi);
  return [px, rng.randint(y.lo, y.hi)];
};

/**
 * 沒有避開區域：每個角度試 40 個點，整塊不和要避開的句重疊就放下。
 * 回傳 found（放下了）或 fallback（在第一個角度的範圍再取的一個點；允許重疊）。
 */
export function scatterSearch(
  ctx: SearchContext,
  rows: readonly string[],
): { found: Spot | null; fallback: Spot } {
  const angles = angleList(ctx, FREE_ANGLES);
  for (const angle of angles) {
    const shape = ctx.shape(rows, angle);
    const span = anchorSpan(shape.ext, ctx.m, true, ctx.side);
    for (let i = 0; i < FREE_TRIES; i++) {
      const [x, y] = pick(ctx.rng, span.x, span.y);
      if (clear(boxAt(shape.ext, x, y), ctx.avoid))
        return { found: { shape, x, y }, fallback: { shape, x, y } };
    }
  }
  const shape = ctx.shape(rows, angles[0]);
  const span = anchorSpan(shape.ext, ctx.m, true, ctx.side);
  const [x, y] = pick(ctx.rng, span.x, span.y);
  return { found: null, fallback: { shape, x, y } };
}

interface Band {
  x: Span;
  y: Span;
  area: number;
}

/** 整塊在區域的上、下、左、右時錨點可以在的帶子（和錨點的範圍取交集；寬或高 ≤ 0 的不要） */
function bandsAround(shape: Shape, z: Zone, span: { x: Span; y: Span }): Band[] {
  const { ext } = shape;
  const raw: { x: Span; y: Span }[] = [
    {
      x: span.x,
      y: { lo: span.y.lo, hi: Math.min(span.y.hi, Math.floor(z.top - 1 - ext.bottom)) },
    },
    { x: span.x, y: { lo: Math.max(span.y.lo, Math.ceil(z.bottom + 1 - ext.top)), hi: span.y.hi } },
    {
      x: { lo: span.x.lo, hi: Math.min(span.x.hi, Math.floor(z.left - 1 - ext.right)) },
      y: span.y,
    },
    { x: { lo: Math.max(span.x.lo, Math.ceil(z.right + 1 - ext.left)), hi: span.x.hi }, y: span.y },
  ];
  const out: Band[] = [];
  for (const b of raw) {
    const w = b.x.hi - b.x.lo;
    const h = b.y.hi - b.y.lo;
    if (w > 0 && h > 0) out.push({ ...b, area: w * h });
  }
  return out;
}

/** 透視後的整塊和區域重疊的面積（透視前的整塊也算進去） */
function zoneCost(ctx: SearchContext, shape: Shape, x: number, y: number, zone: Rect): number {
  const box = boxAt(shape.ext, x, y);
  return overlapArea(box, zone) + overlapArea(projectBox(ctx.perspAt(x, y), box), zone);
}

/**
 * 有避開區域：每個角度把四條帶子依面積加權打亂（鍵＝random()^(1 ÷ max(面積, 1))，大的先試），
 * 每條試 12 個點；整塊不和要避開的句重疊、透視後的整塊也不壓到區域（D2）就放下。
 * 回傳 found、或 backup（試過的點裡透視後和區域重疊最少的，同樣多時取先試的：F54）；連帶子都沒有時兩者都是 null。
 */
export function bandSearch(
  ctx: SearchContext,
  rows: readonly string[],
  z: Zone,
): { found: Spot | null; backup: Spot | null } {
  const zone = zoneRect(z);
  let backup: Spot | null = null;
  let backupCost = Number.POSITIVE_INFINITY;
  for (const angle of angleList(ctx, ZONE_ANGLES)) {
    const shape = ctx.shape(rows, angle);
    const bands = bandsAround(shape, z, anchorSpan(shape.ext, ctx.m, false, ctx.side));
    const order = bands
      .map((band) => ({ band, key: ctx.rng.random() ** (1 / Math.max(band.area, 1)) }))
      .sort((a, b) => b.key - a.key);
    for (const { band } of order) {
      for (let i = 0; i < BAND_TRIES; i++) {
        const [x, y] = pick(ctx.rng, band.x, band.y);
        const cost = zoneCost(ctx, shape, x, y, zone);
        if (cost === 0 && clear(boxAt(shape.ext, x, y), ctx.avoid))
          return { found: { shape, x, y }, backup };
        if (cost < backupCost) {
          backup = { shape, x, y };
          backupCost = cost;
        }
      }
    }
  }
  return { found: null, backup };
}

/**
 * 推出區域（規格 3.5）：角度隨機、錨點在範圍正中央；整塊（或透視後的整塊）壓到區域時，試推到區域的上、下、左、右
 * （同帶子的公式、夾回範圍），選不壓到而且移動最少的；四個都會壓到時選重疊最少的（F54）。
 */
export function escapeRegion(ctx: SearchContext, rows: readonly string[], z: Zone): Spot {
  const shape = ctx.shape(rows, ctx.rng.randint(ctx.m.angleLo, ctx.m.angleHi));
  const { ext } = shape;
  const span = anchorSpan(ext, ctx.m, false, ctx.side);
  const clampX = (v: number) => Math.min(span.x.hi, Math.max(span.x.lo, v));
  const clampY = (v: number) => Math.min(span.y.hi, Math.max(span.y.lo, v));
  const cx = Math.floor((span.x.lo + span.x.hi) / 2);
  const cy = Math.floor((span.y.lo + span.y.hi) / 2);
  const zone = zoneRect(z);
  const centerCost = zoneCost(ctx, shape, cx, cy, zone);
  if (centerCost === 0) return { shape, x: cx, y: cy };
  const options: [number, number][] = [
    [cx, clampY(Math.floor(z.top - 1 - ext.bottom))],
    [cx, clampY(Math.ceil(z.bottom + 1 - ext.top))],
    [clampX(Math.floor(z.left - 1 - ext.right)), cy],
    [clampX(Math.ceil(z.right + 1 - ext.left)), cy],
  ];
  let best: [number, number] = [cx, cy];
  let bestCost = centerCost;
  let bestMove = 0;
  for (const [x, y] of options) {
    const cost = zoneCost(ctx, shape, x, y, zone);
    const move = Math.abs(x - cx) + Math.abs(y - cy);
    if (cost < bestCost || (cost === bestCost && move < bestMove)) {
      best = [x, y];
      bestCost = cost;
      bestMove = move;
    }
  }
  return { shape, x: best[0], y: best[1] };
}

/** 連帶子都沒有的槽位：最小角、錨點在範圍內隨機（可能壓到區域；規格 3.5「放槽位」） */
export function anywhere(ctx: SearchContext, rows: readonly string[]): Spot {
  const shape = ctx.shape(rows, ctx.m.angleLo);
  const span = anchorSpan(shape.ext, ctx.m, false, ctx.side);
  const [x, y] = pick(ctx.rng, span.x, span.y);
  return { shape, x, y };
}
