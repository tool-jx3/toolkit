/**
 * 「這間房擁有的範圍」的判斷，給家具的擺放用（2026-11-05，曲線的房間；規格 3.17.3）。
 *
 * 沒有曲線的房間的樓層照原本的做法（每一格的主人＝最後蓋上去的房間），呼叫的地方先問 `curvedMap`，是 false 時用原本的程式
 * （結果逐位元相同）。有曲線的房間時照外形算：長方形整個在這間房的外形裡（曲線的房間是凸的，四個角都在裡面或邊上），
 * 而且不和蓋在上面的房間（清單後面的）的外形重疊。
 */
import {
  convexOverlap,
  curvedContainsPts,
  curvedHas,
  curvedOverlapsRect,
  outlineOf,
  type Pt,
  rectPts,
} from './curve';
import { roomContainsRect, roomHasCell, roomRects } from './shape';
import type { Rect, Room } from './types';

export const curvedMap = (rooms: readonly Room[]): boolean => rooms.some((r) => !!r.shape);

const EPS = 1e-6;

/** 房間的外形和長方形有沒有重疊（只碰到邊不算） */
function overlapsRect(r: Room, b: Rect): boolean {
  if (r.shape) return curvedOverlapsRect(r, b);
  return roomRects(r).some(
    (q) =>
      b.x < q.x + q.w - EPS &&
      q.x < b.x + b.w - EPS &&
      b.y < q.y + q.h - EPS &&
      q.y < b.y + b.h - EPS,
  );
}

/** 房間的外形和凸多邊形有沒有重疊 */
function overlapsPts(r: Room, pts: readonly Pt[]): boolean {
  const parts = r.shape ? [outlineOf(r)] : roomRects(r).map(rectPts);
  return parts.some((p) => convexOverlap(p, pts));
}

/** 長方形整個在這間房擁有的範圍裡（有曲線的房間時用） */
export function ownsRect(rooms: readonly Room[], room: Room): (b: Rect) => boolean {
  const i = rooms.indexOf(room);
  const above = rooms.slice(i + 1);
  return (b) => roomContainsRect(room, b) && !above.some((r) => overlapsRect(r, b));
}

/** 轉過的長方形（四個角）整個在這間房擁有的範圍裡（有曲線的房間時用） */
export function ownsPts(rooms: readonly Room[], room: Room): (pts: readonly Pt[]) => boolean {
  const i = rooms.indexOf(room);
  const above = rooms.slice(i + 1);
  return (pts) => {
    const inside = room.shape
      ? curvedContainsPts(room, pts)
      : pts.every(([x, y]) =>
          roomContainsRect(room, { x: x - EPS / 2, y: y - EPS / 2, w: EPS, h: EPS }),
        );
    return inside && !above.some((r) => overlapsPts(r, pts));
  };
}

/**
 * 這一點是誰的：最後蓋上去、包含這一點的房間。曲線的房間照外形（在外形外面就往下一間找），長方形與 L 形照那一格
 * （和原本的「那一格的主人」相同）。
 */
export function roomAtPoint(rooms: readonly Room[], x: number, y: number): Room | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  for (let i = rooms.length - 1; i >= 0; i--) {
    const r = rooms[i];
    if (r.shape ? curvedHas(r, x, y) : roomHasCell(r, cx, cy)) return r;
  }
  return null;
}
