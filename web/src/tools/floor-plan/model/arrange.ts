/**
 * 自動擺放家具（2026-10-29，參考 KIIN マップ制作スタジオ；規格 F253、3.14.3、D68）。純函式：算出每件家具的新位置，
 * 呼叫端一次改進去（一步復原）。
 *
 * 規則：
 * - 對象：中心在房間裡、而且那一格是這間房的（不在巢狀的房間裡）的家具；畫在底下的（地毯、血跡…）與貼牆素材不動。
 * - 分組：桌子（有桌面的家具）＋放在上面的小物（F255）＋旁邊 0.5 格以內的椅子；其他各自一組。
 * - 順序：靠牆的家具（`orient`，放在牆邊會背面朝牆的）→ 桌子那一組 → 其他；同一類大的先。
 * - 靠牆的那一組只貼到**離它 1 m（2 格）以內的牆**上（背面朝牆：北牆 0°、東牆 90°、南牆 180°、西牆 270°，整組一起轉），
 *   而且中心最多移動 2 m（4 格），找離原本的位置最近的；貼不上（或附近沒有牆：放在房間中間的收銀櫃台、棧板架）就照「其他」
 *   處理（2026-10-29 驗證後修訂：原本一律貼到任何一道牆，會被推到幾公尺外的牆邊）。
 * - 其他的先試原本的位置，不行（擋到門、窗前、和別的疊在一起）才照原本的方向找離原本的位置最近的空位（0.25 格一步）。
 * - 合法：整組都在這間房的格子裡、不穿過手畫的牆、不碰到門的開門範圍與門前一格（F194）、不碰到窗前一格、
 *   不和別的家具疊在一起（畫在底下的不算；同一組裡的不比）。
 * - 排不下的組：先把它們留在原位（當成障礙）再排一次其他的；還是有排不下的就整個不改。
 */
import { ASSET, isWallMounted } from './assets';
import { OPEN } from './catalog';
import { round2, snap } from './geometry';
import { blocking, doorKinds, EPS, hitsDoor, rectHits, windowFront } from './layoutRules';
import { roomCells, roomHasPoint } from './shape';
import { restingOn, SURFACES } from './tabletop';
import type { Floor, Item, Rect, Room } from './types';
import { edgeKind, wallLines } from './walls';

/** 和桌子成對的椅子 */
export const CHAIRS: ReadonlySet<string> = new Set(['chair', 'stool', 'zabuton']);
/** 椅子離桌子幾格以內算一組 */
export const CHAIR_GAP = 0.5;
/** 靠牆的家具離牆幾格以內才貼牆（1 m） */
export const NEAR_WALL = 2;
/** 貼牆時中心最多移動幾格（2 m） */
export const SNAP_MAX = 4;

export interface ArrangeResult {
  /** 成功（有移動的件數；pinned 是排不下、留在原位的） */
  ok: boolean;
  reason?: 'empty' | 'full';
  /** 新的位置（id → 外框與方向） */
  moves: Map<string, Pick<Item, 'x' | 'y' | 'w' | 'h' | 'rot'>>;
  /** 整理的件數 */
  count: number;
  /** 排不下、留在原位的家具 id */
  pinned: string[];
}

type Box = Pick<Item, 'id' | 't' | 'x' | 'y' | 'w' | 'h' | 'rot'>;

interface Unit {
  anchor: Item;
  members: Item[];
  kind: 0 | 1 | 2;
  area: number;
}

const key = (x: number, y: number) => `${x},${y}`;

/** 兩個長方形之間的距離（重疊時 0） */
function gapBetween(a: Rect, b: Rect): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h));
  return Math.hypot(dx, dy);
}

/** 一組轉 delta 度（90 的倍數，繞 anchor 的中心）：每一件的中心跟著轉、方向加 delta、寬深對調 */
function rotateUnit(members: readonly Box[], anchor: Box, delta: number): Box[] {
  const d = ((delta % 360) + 360) % 360;
  if (!d) return members.map((m) => ({ ...m }));
  const ax = anchor.x + anchor.w / 2;
  const ay = anchor.y + anchor.h / 2;
  return members.map((m) => {
    let dx = m.x + m.w / 2 - ax;
    let dy = m.y + m.h / 2 - ay;
    let w = m.w;
    let h = m.h;
    for (let k = 0; k < d / 90; k++) {
      [dx, dy] = [-dy, dx];
      [w, h] = [h, w];
    }
    return {
      ...m,
      w,
      h,
      rot: ((((m.rot || 0) + d) % 360) + 360) % 360,
      x: ax + dx - w / 2,
      y: ay + dy - h / 2,
    };
  });
}

export function arrangeRoom(floor: Floor, roomId: string): ArrangeResult {
  const empty: ArrangeResult = { ok: false, moves: new Map(), count: 0, pinned: [] };
  const found = floor.rooms.find((r) => r.id === roomId);
  if (!found) return { ...empty, reason: 'empty' };
  const room: Room = found;
  const owner = new Map<string, Room>();
  for (const r of floor.rooms) for (const [x, y] of roomCells(r)) owner.set(key(x, y), r);
  const own = (x: number, y: number) => owner.get(key(x, y)) === room;
  const targets = floor.items.filter((it) => {
    if (!blocking(it) || isWallMounted(it.t)) return false;
    const cx = it.x + it.w / 2;
    const cy = it.y + it.h / 2;
    return roomHasPoint(room, cx, cy) && own(Math.floor(cx), Math.floor(cy));
  });
  if (!targets.length) return { ...empty, reason: 'empty' };
  const targetIds = new Set(targets.map((t) => t.id));

  /* ---------- 分組 ---------- */
  const used = new Set<string>();
  const units: Unit[] = [];
  const surfaces = targets.filter((t) => SURFACES.has(t.t));
  const chairOwner = new Map<string, Item>();
  for (const ch of targets.filter((t) => CHAIRS.has(t.t))) {
    let best: { s: Item; d: number } | null = null;
    for (const s of surfaces) {
      /* 推進桌子底下（和桌子重疊）的椅子不算一組：格局檢查算重疊（F242），另外找空位 */
      if (rectHits(ch, s)) continue;
      const d = gapBetween(ch, s);
      if (d <= CHAIR_GAP + EPS && (!best || d < best.d)) best = { s, d };
    }
    if (best) chairOwner.set(ch.id, best.s);
  }
  for (const s of surfaces) {
    const smalls = restingOn(s, floor.items).filter((x) => targetIds.has(x.id));
    const chairs = targets.filter((c) => chairOwner.get(c.id) === s);
    const members = [s, ...smalls, ...chairs].filter((m) => !used.has(m.id));
    for (const m of members) used.add(m.id);
    const orient = Boolean(ASSET[s.t]?.orient);
    units.push({ anchor: s, members, kind: orient ? 0 : 1, area: s.w * s.h });
  }
  for (const t of targets) {
    if (used.has(t.id)) continue;
    used.add(t.id);
    units.push({ anchor: t, members: [t], kind: ASSET[t.t]?.orient ? 0 : 2, area: t.w * t.h });
  }

  /* ---------- 障礙 ---------- */
  const fixed = floor.items.filter((it) => blocking(it) && !targetIds.has(it.id));
  const doors = floor.openings.filter(doorKinds);
  const windows = floor.openings.filter((o) => OPEN[o.kind].group === 'window');
  const windowZones = windows.flatMap((o) => windowFront(o));
  const freeLines = wallLines(floor).filter((r) => r.free);
  const crossesWall = (b: Rect) =>
    freeLines.some((r) => {
      const [c0, c1, a0, a1] =
        r.o === 'h' ? [b.y, b.y + b.h, b.x, b.x + b.w] : [b.x, b.x + b.w, b.y, b.y + b.h];
      return c0 < r.c - EPS && c1 > r.c + EPS && Math.min(a1, r.b) - Math.max(a0, r.a) > EPS;
    });
  const inRoom = (b: Rect) => {
    for (let x = Math.floor(b.x + EPS); x < b.x + b.w - EPS; x++)
      for (let y = Math.floor(b.y + EPS); y < b.y + b.h - EPS; y++) if (!own(x, y)) return false;
    return true;
  };
  const okBox = (b: Rect, placed: readonly Rect[]) =>
    inRoom(b) &&
    !crossesWall(b) &&
    !doors.some((o) => hitsDoor(o, b)) &&
    !windowZones.some((z) => rectHits(z, b)) &&
    !placed.some((p) => rectHits(p, b));

  /* ---------- 這間房的牆（貼牆用）：格子的邊，另一邊不是這間房、而且真的有牆 ---------- */
  interface WallSeg {
    /** 家具的背面朝哪邊：n＝牆在上面（rot 0） */
    dir: 'n' | 'e' | 's' | 'w';
    c: number;
    a: number;
    b: number;
  }
  const units1: WallSeg[] = [];
  const hasWall = (other: Room | undefined) => {
    const k = edgeKind(room, other ?? null);
    return k !== null && k !== 'zone';
  };
  for (const [x, y] of roomCells(room)) {
    if (!own(x, y)) continue;
    const n = owner.get(key(x, y - 1));
    const s = owner.get(key(x, y + 1));
    const w = owner.get(key(x - 1, y));
    const e = owner.get(key(x + 1, y));
    if (n !== room && hasWall(n)) units1.push({ dir: 'n', c: y, a: x, b: x + 1 });
    if (s !== room && hasWall(s)) units1.push({ dir: 's', c: y + 1, a: x, b: x + 1 });
    if (w !== room && hasWall(w)) units1.push({ dir: 'w', c: x, a: y, b: y + 1 });
    if (e !== room && hasWall(e)) units1.push({ dir: 'e', c: x + 1, a: y, b: y + 1 });
  }
  const walls: WallSeg[] = [];
  const groups = new Map<string, WallSeg[]>();
  for (const u of units1) {
    const k = `${u.dir}:${u.c}`;
    const l = groups.get(k);
    if (l) l.push(u);
    else groups.set(k, [u]);
  }
  for (const list of groups.values()) {
    list.sort((p, q) => p.a - q.a);
    let cur = { ...list[0] };
    for (const s of list.slice(1)) {
      if (s.a <= cur.b + EPS) cur.b = Math.max(cur.b, s.b);
      else {
        walls.push(cur);
        cur = { ...s };
      }
    }
    walls.push(cur);
  }
  const ROT = { n: 0, e: 90, s: 180, w: 270 } as const;

  /* 靠牆的家具離最近的牆超過 NEAR_WALL 時不貼牆（放在房間中間的櫃台、架子） */
  const wallGap = (b: Rect, w: WallSeg) => {
    const horiz = w.dir === 'n' || w.dir === 's';
    const across =
      w.dir === 'n'
        ? b.y - w.c
        : w.dir === 's'
          ? w.c - (b.y + b.h)
          : w.dir === 'w'
            ? b.x - w.c
            : w.c - (b.x + b.w);
    /* 中心在那道牆的另一邊（L 形的內角）：不算；凸出牆線的算貼著（0） */
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const behind =
      w.dir === 'n' ? cy < w.c : w.dir === 's' ? cy > w.c : w.dir === 'w' ? cx < w.c : cx > w.c;
    if (behind) return Number.POSITIVE_INFINITY;
    const [a0, a1] = horiz ? [b.x, b.x + b.w] : [b.y, b.y + b.h];
    return Math.hypot(Math.max(0, across), Math.max(0, w.a - a1, a0 - w.b));
  };
  for (const u of units)
    if (u.kind === 0 && !walls.some((w) => wallGap(u.anchor, w) <= NEAR_WALL + EPS))
      u.kind = SURFACES.has(u.anchor.t) ? 1 : 2;
  units.sort(
    (a, b) => a.kind - b.kind || b.area - a.area || a.anchor.id.localeCompare(b.anchor.id),
  );

  /* ---------- 一組的候選位置（離原本的位置近的先） ---------- */
  const bbox = (bs: readonly Rect[]): Rect => {
    const x = Math.min(...bs.map((b) => b.x));
    const y = Math.min(...bs.map((b) => b.y));
    return {
      x,
      y,
      w: Math.max(...bs.map((b) => b.x + b.w)) - x,
      h: Math.max(...bs.map((b) => b.y + b.h)) - y,
    };
  };
  function* candidates(u: Unit): Generator<Box[]> {
    const ax = u.anchor.x + u.anchor.w / 2;
    const ay = u.anchor.y + u.anchor.h / 2;
    if (u.kind === 0) {
      const near: { d: number; boxes: Box[] }[] = [];
      for (const wseg of walls) {
        if (wallGap(u.anchor, wseg) > NEAR_WALL + EPS) continue;
        const rot = ROT[wseg.dir];
        const turned = rotateUnit(u.members, u.anchor, rot - (u.anchor.rot || 0));
        const a = turned[0];
        const horiz = wseg.dir === 'n' || wseg.dir === 's';
        const len = horiz ? a.w : a.h;
        for (let s = wseg.a; s + len <= wseg.b + EPS; s += 0.25) {
          const nx = horiz ? s : wseg.dir === 'w' ? wseg.c : wseg.c - a.w;
          const ny = horiz ? (wseg.dir === 'n' ? wseg.c : wseg.c - a.h) : s;
          const dx = nx - a.x;
          const dy = ny - a.y;
          const d = Math.hypot(nx + a.w / 2 - ax, ny + a.h / 2 - ay);
          if (d > SNAP_MAX + EPS) continue;
          near.push({ d, boxes: turned.map((m) => ({ ...m, x: m.x + dx, y: m.y + dy })) });
        }
      }
      near.sort((p, q) => p.d - q.d);
      for (const c of near) yield c.boxes;
    }
    /* 其他（靠牆的貼不上時也是）：原本的位置，再來是附近的空位 */
    const list: { d: number; boxes: Box[] }[] = [];
    const b = bbox(u.members);
    /* 原本的位置（不在 0.25 格上的也算）最先試 */
    list.push({ d: 0, boxes: u.members.map((m) => ({ ...m })) });
    for (let x = snap(room.x, 0.25); x + b.w <= room.x + room.w + EPS; x += 0.25)
      for (let y = snap(room.y, 0.25); y + b.h <= room.y + room.h + EPS; y += 0.25) {
        const dx = x - b.x;
        const dy = y - b.y;
        list.push({
          d: Math.hypot(dx, dy),
          boxes: u.members.map((m) => ({ ...m, x: m.x + dx, y: m.y + dy })),
        });
      }
    list.sort((p, q) => p.d - q.d);
    for (const c of list) yield c.boxes;
  }

  /* ---------- 排 ---------- */
  const tryPlace = (pinned: ReadonlySet<Unit>) => {
    const placed: Rect[] = fixed.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h }));
    for (const u of pinned)
      for (const m of u.members) placed.push({ x: m.x, y: m.y, w: m.w, h: m.h });
    const moves = new Map<string, Box>();
    const failed: Unit[] = [];
    for (const u of units) {
      if (pinned.has(u)) continue;
      let chosen: Box[] | null = null;
      for (const boxes of candidates(u)) {
        if (boxes.every((b) => okBox(b, placed))) {
          chosen = boxes;
          break;
        }
      }
      if (!chosen) {
        failed.push(u);
        continue;
      }
      for (const b of chosen) {
        placed.push({ x: b.x, y: b.y, w: b.w, h: b.h });
        moves.set(b.id, b);
      }
    }
    return { moves, failed };
  };
  let pinned = new Set<Unit>();
  let r = tryPlace(pinned);
  if (r.failed.length) {
    pinned = new Set(r.failed);
    r = tryPlace(pinned);
    /* 還是有排不下的，或全部都排不下：整個不改 */
    if (r.failed.length || pinned.size === units.length) return { ...empty, reason: 'full' };
  }
  const moves = new Map<string, Pick<Item, 'x' | 'y' | 'w' | 'h' | 'rot'>>();
  for (const [id, b] of r.moves)
    moves.set(id, {
      x: round2(b.x),
      y: round2(b.y),
      w: round2(b.w),
      h: round2(b.h),
      rot: b.rot || 0,
    });
  return {
    ok: true,
    moves,
    count: targets.length,
    pinned: [...pinned].flatMap((u) => u.members.map((m) => m.id)),
  };
}
