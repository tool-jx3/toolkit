/**
 * 整張地圖轉 90°、左右反轉、上下反轉（2026-11-05，參考 KIIN マップ制作スタジオ v2.0 的「全体を90°回転・左右反転・上下反転」；
 * 規格 F276、3.16.4）。純函式：改傳進來的專案（給 Immer 的 recipe 用）。
 *
 * - 所有樓層一起變（以所有樓層的共同範圍為準，上下樓層的樓梯照樣對齊）：房間（含 L 形的缺角、名字的位移）、手畫的牆、門窗
 *   （方向、鉸鍊、開的那一側）、家具（方向、左右翻轉）、文字（只動位置，字照樣是正的、讀得到）、自由線。
 * - 範圍＝所有東西的外接範圍往外取到「單位」的倍數（單位＝棋子方格的大小，沒有棋子方格時 2 格＝1 m），
 *   所以房間還是在整格上、棋子方格與 1 m 的格線照樣對得齊。
 * - 轉 90°（順時針）：新的範圍的左上角＝舊的左上角＋(t, −t)，t＝（寬 − 深）÷ 2 往 0 取到單位的倍數——寬深的差是單位的偶數倍時就是
 *   以中心轉，奇數倍時中心最多偏半個單位，而且**轉四次一定回到原樣**（兩次＝以中心轉 180°）。
 * - 反轉：以範圍的中線反轉（範圍不變），反兩次回到原樣。
 */
import { SWING_DOORS } from './catalog';
import {
  itemFootprint,
  itemLocalSize,
  normDeg,
  openingReach,
  openingRect,
  round2 as round2Raw,
  swapsAxes,
  unionRect,
} from './geometry';
import { lineBounds, mapLine } from './lines';
import type { Corner, Floor, Item, Opening, Project, Rect, Room } from './types';

export type MapTransform = 'rotate' | 'flipX' | 'flipY';

/** 小數 2 位（−0 換成 0：轉四次之後逐欄位相同） */
const round2 = (v: number): number => round2Raw(v) + 0;

type Map2 = (x: number, y: number) => [number, number];

/**
 * 一層的範圍（轉 90° 時跟著轉的算法：文字只算它的位置——字不跟著轉，用字的大略範圍的話轉過之後範圍對不上，
 * 轉四次就回不到原樣）
 */
function contentBounds(f: Floor): Rect | null {
  let box: Rect | null = null;
  for (const r of f.rooms) box = unionRect(box, r);
  for (const i of f.items) box = unionRect(box, itemFootprint(i));
  for (const w of f.walls)
    box = unionRect(box, {
      x: Math.min(w.x1, w.x2),
      y: Math.min(w.y1, w.y2),
      w: Math.abs(w.x2 - w.x1),
      h: Math.abs(w.y2 - w.y1),
    });
  for (const o of f.openings) box = unionRect(box, openingRect(o, openingReach(o)));
  for (const t of f.texts) box = unionRect(box, { x: t.x, y: t.y, w: 0, h: 0 });
  for (const l of f.lines ?? []) box = unionRect(box, lineBounds(l));
  return box;
}

/** 範圍（所有樓層），往外取到 unit 的倍數；沒有東西時 null */
export function transformFrame(floors: readonly Floor[], unit: number): Rect | null {
  let box: Rect | null = null;
  for (const f of floors) {
    const b = contentBounds(f);
    if (b) box = unionRect(box, b);
  }
  if (!box) return null;
  const x0 = Math.floor(box.x / unit + 1e-9) * unit;
  const y0 = Math.floor(box.y / unit + 1e-9) * unit;
  const x1 = Math.ceil((box.x + box.w) / unit - 1e-9) * unit;
  const y1 = Math.ceil((box.y + box.h) / unit - 1e-9) * unit;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** 單位：棋子方格的大小，沒有時 2 格（1 m） */
export const transformUnit = (p: Pick<Project, 'tokenGrid'>): number => p.tokenGrid || 2;

/** 點的對應與線性的部分（方向向量用） */
export function transformMaps(mode: MapTransform, B: Rect, unit: number): { pt: Map2; vec: Map2 } {
  if (mode === 'rotate') {
    const t = Math.trunc((B.w - B.h) / (2 * unit)) * unit;
    const nx = B.x + t;
    const ny = B.y - t;
    return {
      pt: (x, y) => [nx + (B.y + B.h - y), ny + (x - B.x)],
      vec: (x, y) => [-y, x],
    };
  }
  if (mode === 'flipX') return { pt: (x, y) => [2 * B.x + B.w - x, y], vec: (x, y) => [-x, y] };
  return { pt: (x, y) => [x, 2 * B.y + B.h - y], vec: (x, y) => [x, -y] };
}

/** 對應之後四捨五入到小數 2 位（座標的精度） */
const rounded =
  (pt: Map2): Map2 =>
  (x, y) => {
    const [a, b] = pt(x, y);
    return [round2(a), round2(b)];
  };

/** 長方形換過去（四個角的外接範圍） */
function mapRect(r: Rect, pt: Map2): Rect {
  const [ax, ay] = pt(r.x, r.y);
  const [bx, by] = pt(r.x + r.w, r.y + r.h);
  return {
    x: round2(Math.min(ax, bx)),
    y: round2(Math.min(ay, by)),
    w: round2(Math.abs(bx - ax)),
    h: round2(Math.abs(by - ay)),
  };
}

const ROT_CORNER: Record<Corner, Corner> = { nw: 'ne', ne: 'se', se: 'sw', sw: 'nw' };
const FLIPX_CORNER: Record<Corner, Corner> = { nw: 'ne', ne: 'nw', se: 'sw', sw: 'se' };
const FLIPY_CORNER: Record<Corner, Corner> = { nw: 'sw', sw: 'nw', ne: 'se', se: 'ne' };

function room(r: Room, mode: MapTransform, pt: Map2, vec: Map2): void {
  Object.assign(r, mapRect(r, pt));
  if (r.cut) {
    const map = mode === 'rotate' ? ROT_CORNER : mode === 'flipX' ? FLIPX_CORNER : FLIPY_CORNER;
    r.cut =
      mode === 'rotate'
        ? { c: map[r.cut.c], w: r.cut.h, h: r.cut.w }
        : { c: map[r.cut.c], w: r.cut.w, h: r.cut.h };
  }
  if (r.lx || r.ly) {
    const [lx, ly] = vec(r.lx || 0, r.ly || 0);
    delete r.lx;
    delete r.ly;
    if (round2(lx)) r.lx = round2(lx);
    if (round2(ly)) r.ly = round2(ly);
  }
}

/**
 * 家具：中心換過去、外框照新的方向（最接近的 90°）；方向：轉 90° 是 +90°，左右反轉是 −角度、上下反轉是 180° − 角度，
 * 反轉時「左右翻轉」也跟著切換（畫出來是鏡像）。
 */
function item(it: Item, mode: MapTransform, pt: Map2): void {
  const loc = itemLocalSize(it);
  const [cx, cy] = pt(it.x + it.w / 2, it.y + it.h / 2);
  const rot = it.rot || 0;
  if (mode === 'rotate') it.rot = Math.round(normDeg(rot + 90)) % 360;
  else {
    it.rot = Math.round(normDeg(mode === 'flipX' ? -rot : 180 - rot)) % 360;
    if (it.flip) delete it.flip;
    else it.flip = true;
  }
  const swap = swapsAxes(it.rot);
  it.w = swap ? loc.h : loc.w;
  it.h = swap ? loc.w : loc.h;
  it.x = round2(cx - it.w / 2);
  it.y = round2(cy - it.h / 2);
}

/**
 * 門窗：兩端換過去，起點是新的線上座標小的那一端（換了端點時鉸鍊換邊）。開的那一側換成畫面上的方向再換回來：
 * 會開的門（SWING_DOORS）的 side 是畫面的方向（橫線 +＝下、直線 +＝右）；其他的以線的方向為準（直線 +＝左），同 ops.ts 的 rotateOpeningCW。
 */
export function transformOpening(o: Opening, pt: Map2, vec: Map2): void {
  const swing = SWING_DOORS.has(o.kind);
  const a = { x: o.x, y: o.y };
  const z = o.o === 'h' ? { x: o.x + o.len, y: o.y } : { x: o.x, y: o.y + o.len };
  const [ax, ay] = pt(a.x, a.y);
  const [zx, zy] = pt(z.x, z.y);
  const side = o.side === -1 ? -1 : 1;
  const dir: [number, number] = o.o === 'h' ? [0, side] : swing ? [side, 0] : [-side, 0];
  const [dx, dy] = vec(dir[0], dir[1]);
  const horiz = Math.abs(ay - zy) < 1e-9;
  const startIsA = horiz ? ax <= zx : ay <= zy;
  o.o = horiz ? 'h' : 'v';
  o.x = round2(startIsA ? ax : zx);
  o.y = round2(startIsA ? ay : zy);
  if (!startIsA) o.hinge = o.hinge ? 0 : 1;
  const s = horiz ? Math.sign(dy) : swing ? Math.sign(dx) : -Math.sign(dx);
  o.side = s < 0 ? -1 : 1;
}

/** 整張地圖轉 90° 或反轉（所有樓層）；沒有東西時不動，回傳 false */
export function transformProject(p: Project, mode: MapTransform): boolean {
  const unit = transformUnit(p);
  const B = transformFrame(p.floors, unit);
  if (!B) return false;
  const { pt, vec } = transformMaps(mode, B, unit);
  const rpt = rounded(pt);
  for (const f of p.floors) {
    for (const r of f.rooms) room(r, mode, pt, vec);
    for (const w of f.walls) {
      [w.x1, w.y1] = rpt(w.x1, w.y1);
      [w.x2, w.y2] = rpt(w.x2, w.y2);
    }
    for (const o of f.openings) transformOpening(o, pt, vec);
    for (const it of f.items) item(it, mode, pt);
    for (const t of f.texts) [t.x, t.y] = rpt(t.x, t.y);
    for (const l of f.lines ?? []) mapLine(l, rpt);
  }
  return true;
}
