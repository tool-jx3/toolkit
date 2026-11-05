/**
 * 自動牆壁：由房間的範圍算出要畫的牆，再加上手畫的牆，最後用門窗把牆切開。
 *
 * - 每一格的主人＝蓋在那一格上的最後一個房間（後放的在上面，所以房間裡可以再放房間，例如客房裡的浴室）。
 * - 每條格線依兩側的房間決定種類：兩個不同的室內房間之間是內牆、室內與外面（或戶外房間）之間是外牆；
 *   兩個戶外房間之間沒有牆；戶外房間面對外面時依種類畫欄杆、岩壁或不畫；任一側「不產生牆」時是虛線的分區線（只在編輯畫面）。
 * - 室內房間設了牆種類（`Room.wall`，2026-10 第二批）時，原本是內牆或外牆的邊改成那個種類；兩側的室內房間都有設時取比較厚的
 *   （一樣厚時取上面／左邊那一間的；戶外房間的設定沒有作用）——同原作 v1.05 的規則。
 * - 同一條線上相鄰、同種類的段接成一長段（core/grid 的 squareEdgeRuns）；門窗所在的範圍從牆上扣掉，切口不加收邊。
 */
import { type EdgeRun, squareEdgeRuns, subtractSpans } from '@/core/grid';
import { CAT, WALL } from './catalog';
import {
  curvedHas,
  outlineOf as curvedOutline,
  curveEdges,
  nearestOnCurve,
  type Pt,
} from './curve';
import { roomCells } from './shape';
import type { Floor, Opening, Room, Wall, WallKind } from './types';

/** 牆的段的種類：zone＝「不產生牆」的分區線 */
/**
 * 牆的段的種類：zone＝「不產生牆」的分區線；step＝甲板上的甲板的段差線（2026-11-05，F299：疊在另一間甲板上的甲板、
 * 露台的外圍，細線＋刻度，不是牆）
 */
export type RunKind = WallKind | 'zone' | 'step';

/** 甲板類（2026-11-05，F299）：外圍是欄杆的戶外房間（陽台・露台、屋頂平台、甲板） */
export const isDeckCat = (cat: Room['cat']): boolean =>
  !!CAT[cat]?.outdoor && CAT[cat]?.edge === 'rail';
export const isDeck = (r: Room | null | undefined): boolean => !!r && isDeckCat(r.cat);

/**
 * 疊放的邊照甲板的規則（F299）：甲板類而且設了「甲板的外圍」（`deck`，D102）。舊的地圖沒有這個欄位，照以前的規則。
 */
export const isStackDeck = (r: Room | null | undefined): boolean => !!r?.deck && isDeck(r);

/** 不是真的牆的段（分區線、段差線）：門窗不吸、不決定門窗的厚度 */
export const isSoftRun = (k: RunKind): boolean => k === 'zone' || k === 'step';

export interface WallRun {
  o: 'h' | 'v';
  c: number;
  a: number;
  b: number;
  kind: RunKind;
  /** 兩端要不要往外延伸半個牆厚（轉角接起來）；被門窗切開的一端不延伸 */
  capA: boolean;
  capB: boolean;
  /** 手畫的牆的 id */
  free?: string;
  /**
   * 曲線的房間的外框線上、沒有直的牆的那幾段（2026-11-05，F291）：門窗吸附用的「虛擬的線」，放下去的門窗畫在外形上
   * （curveSnapLines；不是真的牆，不畫）
   */
  curve?: Room;
}

/**
 * 曲線的牆（2026-11-05，曲線的房間的外形不在外框線上的部分，F290）：折線；種類照兩側的房間（同格線的規則）。
 * capA／capB：端點畫成圓的（接到直的牆或另一段）；被門窗切開的一端不畫。
 */
export interface CurveRun {
  pts: Pt[];
  kind: RunKind;
  capA: boolean;
  capB: boolean;
}

/**
 * 放在曲線的房間的外框線上、那裡沒有直的牆的門窗（2026-11-05，F291；KIIN 的做法）：畫在外形上離它最近的一點、
 * 沿著那裡的切線轉。(x, y)＝外形上的點（門窗的中點畫在這裡），rot＝從直的位置轉過的角度（弧度）。
 */
export interface OpeningPose {
  x: number;
  y: number;
  rot: number;
}

export interface WallResult {
  runs: WallRun[];
  /** 斜的手畫牆（不會被門窗切開） */
  diagonal: Wall[];
  /** 門窗所在的牆的種類（決定門窗的厚度） */
  openingKind: Map<string, WallKind>;
  /** 曲線的牆（沒有曲線的房間時是空的） */
  curves: CurveRun[];
  /** 放在曲線上的門窗的位置（沒有時是空的） */
  poses: Map<string, OpeningPose>;
}

/**
 * 房間設的牆種類（2026-10 第二批）：兩側的室內房間都有設時取比較厚的，一樣厚時取前面那一間（上面／左邊）的；
 * 戶外房間、不認得的種類不算；都沒有設時 null（照一般的規則）。
 */
export function roomWallKind(...rooms: (Room | null)[]): WallKind | null {
  let best: WallKind | null = null;
  for (const r of rooms) {
    const k = r?.wall;
    if (!r || !k || !Object.hasOwn(WALL, k) || CAT[r.cat]?.outdoor) continue;
    if (!best || WALL[k].t > WALL[best].t) best = k;
  }
  return best;
}

/** 兩側的房間 → 這條邊的種類（null＝沒有牆） */
export function edgeKind(a: Room | null, b: Room | null): RunKind | null {
  if (a === b) return null;
  if (a && b) {
    if (a.noWall || b.noWall) return 'zone';
    const ao = Boolean(CAT[a.cat]?.outdoor);
    const bo = Boolean(CAT[b.cat]?.outdoor);
    if (ao && bo) return null;
    if (ao || bo) return roomWallKind(a, b) ?? 'ext';
    return roomWallKind(a, b) ?? 'int';
  }
  const room = (a ?? b) as Room;
  const cat = CAT[room.cat];
  if (cat?.outdoor) return cat.edge === 'rail' || cat.edge === 'rock' ? cat.edge : null;
  return roomWallKind(room) ?? 'ext';
}

const EPS = 1e-6;

/**
 * 甲板疊在另一間戶外房間上（2026-11-05，F299）：清單後面的甲板類房間和前面的戶外房間有重疊的格子。
 * 有的時候自動牆用照點算的那一套（curvedWalls；疊放的邊是欄杆或段差線），沒有的時候照原本的（輸出不變）。
 */
export function hasStackedDeck(rooms: readonly Room[]): boolean {
  for (let j = 0; j < rooms.length; j++) {
    const d = rooms[j];
    if (!isStackDeck(d)) continue;
    for (let i = 0; i < j; i++) {
      const b = rooms[i];
      if (!CAT[b.cat]?.outdoor) continue;
      if (b.x < d.x + d.w && d.x < b.x + b.w && b.y < d.y + d.h && d.y < b.y + b.h) return true;
    }
  }
  return false;
}

/** 這一層的自動牆要不要用照點算的那一套（曲線的房間、疊在戶外房間上的甲板） */
export const needsGeoWalls = (rooms: readonly Room[]): boolean =>
  rooms.some((r) => r.shape) || hasStackedDeck(rooms);

/** 房間的格子 → 自動牆的段（還沒被門窗切開） */
export function roomRuns(rooms: readonly Room[]): EdgeRun<RunKind>[] {
  if (!rooms.length) return [];
  /* 曲線的房間、疊放的甲板（2026-11-05）：另一套（都沒有時照原本的，輸出不變） */
  if (needsGeoWalls(rooms)) return curvedWalls(rooms).straight;
  const owner = new Map<number, Room>();
  const key = (x: number, y: number) => (x + 4096) * 8192 + (y + 4096);
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of rooms) {
    /* L 形房間（2026-10-29）：缺角的格子不是這間房的（底下的房間或外面） */
    for (const [x, y] of roomCells(r)) owner.set(key(x, y), r);
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return squareEdgeRuns({ x0, y0, x1, y1 }, (x, y) => owner.get(key(x, y)) ?? null, edgeKind);
}

/* ---------- 曲線的房間（2026-11-05，F290；規格 3.17.2） ---------- */

const gkey = (x: number, y: number) => (x + 4096) * 8192 + (y + 4096);

/**
 * 某一點是誰的（最後蓋上去、外形包含這一點的房間）。格子的主人照外框算（曲線的房間佔整個外框），主人是曲線的房間時
 * 再看那一點在不在外形裡，不在就往下一間找（底下的房間、外面）。長方形與 L 形的房間是整格的，所以和格子的主人相同。
 */
export function pointOwner(rooms: readonly Room[]): (x: number, y: number) => Room | null {
  const owner = new Map<number, number>();
  rooms.forEach((r, i) => {
    if (r.shape) {
      for (let x = r.x; x < r.x + r.w; x++)
        for (let y = r.y; y < r.y + r.h; y++) owner.set(gkey(x, y), i);
    } else for (const [x, y] of roomCells(r)) owner.set(gkey(x, y), i);
  });
  return (x, y) => {
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    const top = owner.get(gkey(cx, cy));
    if (top === undefined) return null;
    for (let i = top; i >= 0; i--) {
      const r = rooms[i];
      if (r.shape) {
        if (curvedHas(r, x, y)) return r;
      } else if (
        cx >= r.x &&
        cx < r.x + r.w &&
        cy >= r.y &&
        cy < r.y + r.h &&
        !inCutCell(r, cx, cy)
      )
        return r;
    }
    return null;
  };
}

function inCutCell(r: Room, cx: number, cy: number): boolean {
  const c = r.cut;
  if (!c) return false;
  const kx = c.c === 'nw' || c.c === 'sw' ? r.x : r.x + r.w - c.w;
  const ky = c.c === 'nw' || c.c === 'ne' ? r.y : r.y + r.h - c.h;
  return cx >= kx && cx < kx + c.w && cy >= ky && cy < ky + c.h;
}

const NUDGE = 1e-4;

/** 房間的外形包含這一點（不含邊） */
function covers(r: Room, x: number, y: number): boolean {
  if (r.shape) return curvedHas(r, x, y);
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  return cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h && !inCutCell(r, cx, cy);
}

/**
 * 兩側的房間＋兩側的點 → 這條邊的種類：edgeKind，再加上疊放的甲板（F299）——兩側都是戶外、照規則沒有牆，而一側是甲板類、
 * 疊在另一側的房間上（另一側的房間在清單前面、外形也包含甲板這一側的點）時：另一側也是甲板類＝段差線，其他＝欄杆。
 */
function stackedKind(
  rooms: readonly Room[],
  a: Room | null,
  b: Room | null,
  pa: readonly [number, number],
  pb: readonly [number, number],
): RunKind | null {
  const base = edgeKind(a, b);
  if (base !== null || !a || !b || a === b) return base;
  const on = (top: Room, low: Room, p: readonly [number, number]) =>
    isStackDeck(top) && rooms.indexOf(low) < rooms.indexOf(top) && covers(low, p[0], p[1]);
  if (on(a, b, pa) || on(b, a, pb)) return isDeck(a) && isDeck(b) ? 'step' : 'rail';
  return null;
}

interface CurvedAuto {
  straight: EdgeRun<RunKind>[];
  curves: CurveRun[];
}

const autoCache = new Map<string, CurvedAuto>();

/** 有曲線的房間時的自動牆：格線上的段（在曲線的地方切開、兩側照點的主人）＋曲線的牆 */
export function curvedWalls(rooms: readonly Room[]): CurvedAuto {
  const k = JSON.stringify(
    rooms.map((r) => [
      r.x,
      r.y,
      r.w,
      r.h,
      r.cat,
      r.noWall,
      r.wall,
      r.cut,
      r.shape,
      r.radius,
      r.deck,
    ]),
  );
  const hit = autoCache.get(k);
  if (hit) return hit;
  const out = computeCurvedWalls(rooms);
  if (autoCache.size > 60) autoCache.clear();
  autoCache.set(k, out);
  return out;
}

function computeCurvedWalls(rooms: readonly Room[]): CurvedAuto {
  const geo = pointOwner(rooms);
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of rooms) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  const curved = rooms.filter((r) => r.shape);
  /* 外形和一條格線的交點（橫線 y＝c 時是 x） */
  const crossings = (o: 'h' | 'v', c: number): number[] => {
    const out: number[] = [];
    for (const r of curved) {
      const [lo, hi] = o === 'h' ? [r.y, r.y + r.h] : [r.x, r.x + r.w];
      if (c < lo - 1e-9 || c > hi + 1e-9) continue;
      const pts = curvedOutline(r);
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i];
        const q = pts[(i + 1) % pts.length];
        const [pa, pc, qa, qc] = o === 'h' ? [p[0], p[1], q[0], q[1]] : [p[1], p[0], q[1], q[0]];
        if (Math.abs(pc - c) < 1e-9) out.push(pa);
        if (Math.abs(qc - c) < 1e-9) out.push(qa);
        if ((pc - c) * (qc - c) < 0) out.push(pa + ((qa - pa) * (c - pc)) / (qc - pc));
      }
    }
    return out;
  };
  const straight: EdgeRun<RunKind>[] = [];
  const scan = (o: 'h' | 'v', c: number, a0: number, a1: number) => {
    const cuts = new Set<number>();
    for (let v = a0; v <= a1; v++) cuts.add(v);
    for (const v of crossings(o, c)) if (v > a0 && v < a1) cuts.add(Math.round(v * 1e9) / 1e9);
    const list = [...cuts].sort((p, q) => p - q);
    let cur: EdgeRun<RunKind> | null = null;
    for (let i = 0; i + 1 < list.length; i++) {
      const a = list[i];
      const b = list[i + 1];
      if (b - a < 1e-7) continue;
      const m = (a + b) / 2;
      const pb: [number, number] = o === 'h' ? [m, c - NUDGE] : [c - NUDGE, m];
      const pa: [number, number] = o === 'h' ? [m, c + NUDGE] : [c + NUDGE, m];
      const before = geo(pb[0], pb[1]);
      const after = geo(pa[0], pa[1]);
      const kind = stackedKind(rooms, before, after, pb, pa);
      if (cur && kind !== null && cur.kind === kind && Math.abs(cur.b - a) < 1e-7) {
        cur.b = b;
        continue;
      }
      if (cur) straight.push(cur);
      cur = kind === null ? null : { o, c, a, b, kind };
    }
    if (cur) straight.push(cur);
  };
  for (let y = y0; y <= y1; y++) scan('h', y, x0, x1);
  for (let x = x0; x <= x1; x++) scan('v', x, y0, y1);

  /* 曲線的牆：外形不在外框線上的邊，在格線的地方切開，兩側照點的主人 */
  const curves: CurveRun[] = [];
  for (const r of curved) {
    let chain: CurveRun | null = null;
    const chains: CurveRun[] = [];
    let last: Pt | null = null;
    for (const [p, q] of curveEdges(r)) {
      const ts = [0, 1];
      for (const axis of [0, 1] as const) {
        const lo = Math.min(p[axis], q[axis]);
        const hi = Math.max(p[axis], q[axis]);
        for (let g = Math.ceil(lo); g <= Math.floor(hi); g++) {
          const t = (g - p[axis]) / (q[axis] - p[axis]);
          if (t > 1e-9 && t < 1 - 1e-9) ts.push(t);
        }
      }
      ts.sort((a, b) => a - b);
      for (let i = 0; i + 1 < ts.length; i++) {
        const u: Pt = [p[0] + (q[0] - p[0]) * ts[i], p[1] + (q[1] - p[1]) * ts[i]];
        const v: Pt = [p[0] + (q[0] - p[0]) * ts[i + 1], p[1] + (q[1] - p[1]) * ts[i + 1]];
        const dx = v[0] - u[0];
        const dy = v[1] - u[1];
        const len = Math.hypot(dx, dy);
        if (len < 1e-9) continue;
        const mx = (u[0] + v[0]) / 2;
        const my = (u[1] + v[1]) / 2;
        /* 順時針的外形：(dy, −dx) 朝外 */
        const nx = dy / len;
        const ny = -dx / len;
        const pi: [number, number] = [mx - nx * NUDGE, my - ny * NUDGE];
        const po: [number, number] = [mx + nx * NUDGE, my + ny * NUDGE];
        const inner = geo(pi[0], pi[1]);
        const outer = geo(po[0], po[1]);
        const kind = stackedKind(rooms, inner, outer, pi, po);
        const joined = last && Math.abs(last[0] - u[0]) < 1e-9 && Math.abs(last[1] - u[1]) < 1e-9;
        if (chain && joined && kind !== null && chain.kind === kind) chain.pts.push(v);
        else {
          if (chain) chains.push(chain);
          chain = kind === null ? null : { pts: [u, v], kind, capA: true, capB: true };
        }
        last = v;
      }
    }
    if (chain) chains.push(chain);
    /* 外形是一圈：最後一段接回第一段（同種類時接成一段） */
    if (chains.length > 1) {
      const f = chains[0];
      const l = chains[chains.length - 1];
      const fp = f.pts[0];
      const lp = l.pts[l.pts.length - 1];
      if (f.kind === l.kind && Math.abs(fp[0] - lp[0]) < 1e-9 && Math.abs(fp[1] - lp[1]) < 1e-9) {
        chains[0] = { ...f, pts: l.pts.concat(f.pts.slice(1)) };
        chains.pop();
      }
    }
    curves.push(...chains);
  }
  /* 直的牆接到曲線的牆的那一端不往外延伸（曲線那一端畫成圓的接起來） */
  const ends = curves.flatMap((cr) => [cr.pts[0], cr.pts[cr.pts.length - 1]]);
  const touches = (x: number, y: number) =>
    ends.some((e) => Math.abs(e[0] - x) < 1e-6 && Math.abs(e[1] - y) < 1e-6);
  for (const r of straight as (EdgeRun<RunKind> & { capA?: boolean; capB?: boolean })[]) {
    const [ax, ay] = r.o === 'h' ? [r.a, r.c] : [r.c, r.a];
    const [bx, by] = r.o === 'h' ? [r.b, r.c] : [r.c, r.b];
    if (touches(ax, ay)) r.capA = false;
    if (touches(bx, by)) r.capB = false;
  }
  return { straight, curves };
}

/** 一條折線的長度 */
function polyLen(pts: readonly Pt[]): number {
  let s = 0;
  for (let i = 1; i < pts.length; i++)
    s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  return s;
}

/** 折線上 (x, y) 的弧長位置（離折線 tol 以內才算；不在時 null） */
function arcPos(pts: readonly Pt[], x: number, y: number, tol = 1e-6): number | null {
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy);
    if (l < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (l * l)));
    if (Math.hypot(x - (a[0] + dx * t), y - (a[1] + dy * t)) <= tol) return s + l * t;
    s += l;
  }
  return null;
}

/** 折線的 [s0, s1] 那一段（弧長） */
function slicePoly(pts: readonly Pt[], s0: number, s1: number): Pt[] {
  const out: Pt[] = [];
  let s = 0;
  const at = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const e = s + l;
    if (e >= s0 - 1e-12 && s <= s1 + 1e-12 && l > 1e-12) {
      if (!out.length) out.push(at(a, b, Math.max(0, (s0 - s) / l)));
      if (e <= s1) out.push(b);
      else {
        out.push(at(a, b, Math.min(1, (s1 - s) / l)));
        break;
      }
    }
    s = e;
  }
  return out;
}

/** 曲線的牆扣掉門窗（弧長的範圍） */
function cutCurve(run: CurveRun, cuts: readonly (readonly [number, number])[]): CurveRun[] {
  const total = polyLen(run.pts);
  const spans = subtractSpans([{ a: 0, b: total }], cuts);
  return spans
    .map((sp) => ({
      pts: slicePoly(run.pts, sp.a, sp.b),
      kind: run.kind,
      capA: sp.cutA ? false : run.capA,
      capB: sp.cutB ? false : run.capB,
    }))
    .filter((r) => r.pts.length > 1);
}

/**
 * 放在曲線上的門窗（F291）：門窗在曲線的房間的外框線上、中點不在任何直的牆（自動牆、手畫的牆、分區線）上時，
 * 放到外形的曲線部分上離中點最近的一點、沿著切線轉（橫線的門窗轉 −90°～90°，直線的轉成 0°～180° 再減 90°）。
 */
export function openingPoses(
  rooms: readonly Room[],
  openings: readonly Opening[],
  straight: readonly { o: 'h' | 'v'; c: number; a: number; b: number }[],
): Map<string, OpeningPose> {
  const out = new Map<string, OpeningPose>();
  const curved = rooms.filter((r) => r.shape);
  if (!curved.length) return out;
  for (const o of openings) {
    const line = lineOf(o);
    const mid = startOf(o) + o.len / 2;
    if (
      straight.some(
        (r) => r.o === o.o && Math.abs(r.c - line) < EPS && mid >= r.a - EPS && mid <= r.b + EPS,
      )
    )
      continue;
    const mx = o.o === 'h' ? mid : line;
    const my = o.o === 'h' ? line : mid;
    let host: Room | null = null;
    for (let i = curved.length - 1; i >= 0 && !host; i--) {
      const r = curved[i];
      const onBox =
        o.o === 'h'
          ? (Math.abs(line - r.y) < EPS || Math.abs(line - (r.y + r.h)) < EPS) &&
            mid >= r.x - EPS &&
            mid <= r.x + r.w + EPS
          : (Math.abs(line - r.x) < EPS || Math.abs(line - (r.x + r.w)) < EPS) &&
            mid >= r.y - EPS &&
            mid <= r.y + r.h + EPS;
      if (onBox) host = r;
    }
    if (!host) continue;
    const n = nearestOnCurve(host, mx, my);
    if (!n) continue;
    let deg = n.deg;
    if (o.o === 'h') {
      while (deg > 90) deg -= 180;
      while (deg <= -90) deg += 180;
    } else {
      while (deg < 0) deg += 180;
      while (deg >= 180) deg -= 180;
      deg -= 90;
    }
    out.set(o.id, { x: n.x, y: n.y, rot: (deg * Math.PI) / 180 });
  }
  return out;
}

const lineOf = (o: Pick<Opening, 'o' | 'x' | 'y'>) => (o.o === 'h' ? o.y : o.x);
const startOf = (o: Pick<Opening, 'o' | 'x' | 'y'>) => (o.o === 'h' ? o.x : o.y);

/**
 * 整層的牆。`playerView`：PL 檢視時暗門不切開牆（看起來就是一般的牆）。
 * `openings: false`：不扣門窗（找門窗、家具吸附的牆線用）。
 */
export function computeWalls(
  floor: Pick<Floor, 'rooms' | 'walls' | 'openings'>,
  options: { playerView?: boolean; openings?: boolean } = {},
): WallResult {
  const cutting =
    options.openings === false
      ? []
      : floor.openings.filter((o) => !(options.playerView && o.kind === 'secret'));
  const cw = needsGeoWalls(floor.rooms) ? curvedWalls(floor.rooms) : null;
  const auto = cw ? cw.straight : roomRuns(floor.rooms);
  const freeRuns: WallRun[] = [];
  const diagonal: Wall[] = [];
  for (const w of floor.walls) {
    const kind = w.kind || 'int';
    if (w.y1 === w.y2 && w.x1 !== w.x2)
      freeRuns.push({
        o: 'h',
        c: w.y1,
        a: Math.min(w.x1, w.x2),
        b: Math.max(w.x1, w.x2),
        kind,
        capA: true,
        capB: true,
        free: w.id,
      });
    else if (w.x1 === w.x2 && w.y1 !== w.y2)
      freeRuns.push({
        o: 'v',
        c: w.x1,
        a: Math.min(w.y1, w.y2),
        b: Math.max(w.y1, w.y2),
        kind,
        capA: true,
        capB: true,
        free: w.id,
      });
    else if (w.x1 !== w.x2 || w.y1 !== w.y2) diagonal.push(w);
  }
  const all: WallRun[] = auto
    .map((r) => {
      const capped = r as EdgeRun<RunKind> & { capA?: boolean; capB?: boolean };
      return { ...r, capA: capped.capA !== false, capB: capped.capB !== false };
    })
    .concat(freeRuns);
  /* 放在曲線上的門窗（2026-11-05，F291）：不切直的牆，切曲線的牆 */
  const poses = cw
    ? openingPoses(floor.rooms, floor.openings, all)
    : new Map<string, OpeningPose>();

  /* 門窗所在的牆的種類：先看自動牆（分區線不算），再看手畫的牆，都沒有就當內牆 */
  const openingKind = new Map<string, WallKind>();
  for (const o of cutting) {
    if (poses.has(o.id)) continue;
    const line = lineOf(o);
    const mid = startOf(o) + o.len / 2;
    const unit = Math.floor(mid);
    const at = auto.find(
      (r) =>
        r.o === o.o &&
        Math.abs(r.c - line) < EPS &&
        !isSoftRun(r.kind) &&
        r.a <= unit &&
        unit < r.b,
    );
    const free = at
      ? null
      : freeRuns.find((r) => r.o === o.o && Math.abs(r.c - line) < EPS && mid > r.a && mid < r.b);
    openingKind.set(o.id, ((at?.kind as WallKind | undefined) ?? free?.kind ?? 'int') as WallKind);
  }

  /* 每條線各自扣掉線上的門窗 */
  const byLine = new Map<string, WallRun[]>();
  for (const r of all) {
    const k = `${r.o}:${r.c}`;
    const list = byLine.get(k);
    if (list) list.push(r);
    else byLine.set(k, [r]);
  }
  const runs: WallRun[] = [];
  for (const list of byLine.values()) {
    const { o, c } = list[0];
    const cuts = cutting
      .filter((op) => !poses.has(op.id) && op.o === o && Math.abs(lineOf(op) - c) < EPS)
      .map((op) => [startOf(op), startOf(op) + op.len] as const);
    for (const piece of subtractSpans(list, cuts)) {
      const { cutA, cutB, ...rest } = piece;
      runs.push({ ...rest, capA: rest.capA && !cutA, capB: rest.capB && !cutB });
    }
  }
  /* 曲線的牆扣掉放在上面的門窗；門窗的厚度照那一段的種類 */
  let curves: CurveRun[] = [];
  if (cw) {
    const cuts = new Map<CurveRun, [number, number][]>();
    for (const o of floor.openings) {
      const p = poses.get(o.id);
      if (!p) continue;
      for (const run of cw.curves) {
        const at = arcPos(run.pts, p.x, p.y, 1e-6);
        if (at === null) continue;
        if (!isSoftRun(run.kind) && !openingKind.has(o.id))
          openingKind.set(o.id, run.kind as WallKind);
        if (cutting.includes(o)) {
          const list = cuts.get(run) ?? [];
          list.push([at - o.len / 2, at + o.len / 2]);
          cuts.set(run, list);
        }
        break;
      }
      if (!openingKind.has(o.id)) openingKind.set(o.id, 'int');
    }
    curves = cw.curves.flatMap((run) => {
      const list = cuts.get(run);
      return list ? cutCurve(run, list) : [{ ...run, pts: run.pts.slice() }];
    });
  }
  return { runs, diagonal, openingKind, curves, poses };
}

/**
 * 曲線的房間的外框線上沒有直的牆的段（門窗吸到這裡時畫在外形上，F291）。kind＝那間房的外牆種類（吸附時的厚度）。
 */
export function curveSnapLines(floor: Pick<Floor, 'rooms' | 'walls' | 'openings'>): WallRun[] {
  const curved = floor.rooms.filter((r) => r.shape);
  if (!curved.length) return [];
  const straight = computeWalls(floor, { openings: false }).runs;
  const out: WallRun[] = [];
  for (const r of curved) {
    const kind = (edgeKind(r, null) ?? 'ext') as RunKind;
    const edges: ['h' | 'v', number, number, number][] = [
      ['h', r.y, r.x, r.x + r.w],
      ['h', r.y + r.h, r.x, r.x + r.w],
      ['v', r.x, r.y, r.y + r.h],
      ['v', r.x + r.w, r.y, r.y + r.h],
    ];
    for (const [o, c, a, b] of edges) {
      const taken = straight
        .filter((q) => q.o === o && Math.abs(q.c - c) < EPS)
        .map((q) => [q.a, q.b] as const);
      for (const sp of subtractSpans([{ a, b }], taken))
        if (sp.b - sp.a > 0.5 - EPS)
          out.push({
            o,
            c,
            a: sp.a,
            b: sp.b,
            kind: isSoftRun(kind) ? 'int' : kind,
            capA: false,
            capB: false,
            curve: r,
          });
    }
  }
  return out;
}

/** 門窗與家具吸附用的牆線（不扣門窗、不含分區線） */
export function wallLines(floor: Pick<Floor, 'rooms' | 'walls' | 'openings'>): WallRun[] {
  return computeWalls(floor, { openings: false }).runs.filter((r) => !isSoftRun(r.kind));
}
