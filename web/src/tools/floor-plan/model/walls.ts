/**
 * 自動牆壁：由房間的範圍算出要畫的牆，再加上手畫的牆，最後用門窗把牆切開。
 *
 * - 每一格的主人＝蓋在那一格上的最後一個房間（後放的在上面，所以房間裡可以再放房間，例如客房裡的浴室）。
 * - 每條格線依兩側的房間決定種類：兩個不同的室內房間之間是內牆、室內與外面（或戶外房間）之間是外牆；
 *   兩個戶外房間之間沒有牆；戶外房間面對外面時依種類畫欄杆、岩壁或不畫；任一側「不產生牆」時是虛線的分區線（只在編輯畫面）。
 * - 同一條線上相鄰、同種類的段接成一長段（core/grid 的 squareEdgeRuns）；門窗所在的範圍從牆上扣掉，切口不加收邊。
 */
import { type EdgeRun, squareEdgeRuns, subtractSpans } from '@/core/grid';
import { CAT } from './catalog';
import type { Floor, Opening, Room, Wall, WallKind } from './types';

/** 牆的段的種類：zone＝「不產生牆」的分區線 */
export type RunKind = WallKind | 'zone';

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
}

export interface WallResult {
  runs: WallRun[];
  /** 斜的手畫牆（不會被門窗切開） */
  diagonal: Wall[];
  /** 門窗所在的牆的種類（決定門窗的厚度） */
  openingKind: Map<string, WallKind>;
}

/** 兩側的房間 → 這條邊的種類（null＝沒有牆） */
export function edgeKind(a: Room | null, b: Room | null): RunKind | null {
  if (a === b) return null;
  if (a && b) {
    if (a.noWall || b.noWall) return 'zone';
    const ao = Boolean(CAT[a.cat]?.outdoor);
    const bo = Boolean(CAT[b.cat]?.outdoor);
    if (ao && bo) return null;
    if (ao || bo) return 'ext';
    return 'int';
  }
  const room = (a ?? b) as Room;
  const cat = CAT[room.cat];
  if (cat?.outdoor) return cat.edge === 'rail' || cat.edge === 'rock' ? cat.edge : null;
  return 'ext';
}

const EPS = 1e-6;

/** 房間的格子 → 自動牆的段（還沒被門窗切開） */
export function roomRuns(rooms: readonly Room[]): EdgeRun<RunKind>[] {
  if (!rooms.length) return [];
  const owner = new Map<number, Room>();
  const key = (x: number, y: number) => (x + 4096) * 8192 + (y + 4096);
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const r of rooms) {
    for (let x = r.x; x < r.x + r.w; x++)
      for (let y = r.y; y < r.y + r.h; y++) owner.set(key(x, y), r);
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return squareEdgeRuns({ x0, y0, x1, y1 }, (x, y) => owner.get(key(x, y)) ?? null, edgeKind);
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
  const auto = roomRuns(floor.rooms);
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
  const all: WallRun[] = auto.map((r) => ({ ...r, capA: true, capB: true })).concat(freeRuns);

  /* 門窗所在的牆的種類：先看自動牆（分區線不算），再看手畫的牆，都沒有就當內牆 */
  const openingKind = new Map<string, WallKind>();
  for (const o of cutting) {
    const line = lineOf(o);
    const mid = startOf(o) + o.len / 2;
    const unit = Math.floor(mid);
    const at = auto.find(
      (r) =>
        r.o === o.o && Math.abs(r.c - line) < EPS && r.kind !== 'zone' && r.a <= unit && unit < r.b,
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
      .filter((op) => op.o === o && Math.abs(lineOf(op) - c) < EPS)
      .map((op) => [startOf(op), startOf(op) + op.len] as const);
    for (const piece of subtractSpans(list, cuts)) {
      const { cutA, cutB, ...rest } = piece;
      runs.push({ ...rest, capA: rest.capA && !cutA, capB: rest.capB && !cutB });
    }
  }
  return { runs, diagonal, openingKind };
}

/** 門窗與家具吸附用的牆線（不扣門窗、不含分區線） */
export function wallLines(floor: Pick<Floor, 'rooms' | 'walls' | 'openings'>): WallRun[] {
  return computeWalls(floor, { openings: false }).runs.filter((r) => r.kind !== 'zone');
}
