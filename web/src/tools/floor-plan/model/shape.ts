/**
 * L 形房間（2026-10-29，參考 KIIN マップ制作スタジオ；規格 F257～F260、3.14.1、D71）。
 *
 * 資料：外框（x、y、w、h，整格）＋缺角 `cut: { c, w, h }`——外框的 c 那個角缺一塊 w × h 的長方形。
 * 缺角至少 1 × 1，而且比外框各少至少 1 格（L 的兩隻手至少 1 格寬），所以外框至少 2 × 2。
 * 沒有 `cut` 的房間就是長方形，所有函式對長方形的結果和原本（直接用外框）相同。
 */
import type { Corner, Rect, Room, RoomCut } from './types';

export const CORNERS: readonly Corner[] = ['nw', 'ne', 'se', 'sw'];
export const isCorner = (v: unknown): v is Corner =>
  typeof v === 'string' && (CORNERS as readonly string[]).includes(v);

/** L 形的外框最小幾格（每一邊） */
export const L_MIN = 2;

type Shape = Pick<Room, 'x' | 'y' | 'w' | 'h' | 'cut'>;

const EPS = 1e-6;

/** 缺角合不合法（整格、1～外框減 1） */
export function validCut(room: Pick<Room, 'w' | 'h'>, cut: RoomCut | undefined | null): boolean {
  return (
    !!cut &&
    isCorner(cut.c) &&
    Number.isInteger(cut.w) &&
    Number.isInteger(cut.h) &&
    cut.w >= 1 &&
    cut.h >= 1 &&
    cut.w <= room.w - 1 &&
    cut.h <= room.h - 1
  );
}

/** 缺的那一塊（長方形的房間 null） */
export function cutRect(r: Shape): Rect | null {
  const c = r.cut;
  if (!c) return null;
  const x = c.c === 'nw' || c.c === 'sw' ? r.x : r.x + r.w - c.w;
  const y = c.c === 'nw' || c.c === 'ne' ? r.y : r.y + r.h - c.h;
  return { x, y, w: c.w, h: c.h };
}

export const isLShape = (r: Shape): boolean => !!r.cut;

/**
 * 點在缺角那一邊：缺角的兩條內側的邊（L 的轉角）往外。`strict`：剛好在內側的邊上不算（closed 的判斷用）；
 * 不 strict：內側的邊上也算（open 的判斷用）。
 */
function inCut(r: Shape, x: number, y: number, strict: boolean): boolean {
  const k = cutRect(r);
  if (!k || !r.cut) return false;
  const west = r.cut.c === 'nw' || r.cut.c === 'sw';
  const north = r.cut.c === 'nw' || r.cut.c === 'ne';
  const xin = west ? k.x + k.w : k.x;
  const yin = north ? k.y + k.h : k.y;
  const e = strict ? -EPS : EPS;
  const xOut = west ? x < xin + e : x > xin - e;
  const yOut = north ? y < yin + e : y > yin - e;
  return xOut && yOut;
}

/** 點在房間裡（不含邊界） */
export function roomHasPoint(r: Shape, x: number, y: number): boolean {
  if (!(x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h)) return false;
  return !inCut(r, x, y, false);
}

/** 點在房間裡或邊上（含缺角的那兩條邊） */
export function roomHasPointClosed(r: Shape, x: number, y: number): boolean {
  if (!(x >= r.x - EPS && x <= r.x + r.w + EPS && y >= r.y - EPS && y <= r.y + r.h + EPS))
    return false;
  return !inCut(r, x, y, true);
}

/** 格子 (cx, cy)（[cx, cx+1] × [cy, cy+1]）是不是這間房的 */
export function roomHasCell(r: Shape, cx: number, cy: number): boolean {
  return roomHasPoint(r, cx + 0.5, cy + 0.5);
}

/** 房間的格子（自動牆用；外框裡扣掉缺角） */
export function* roomCells(r: Shape): Generator<[number, number]> {
  const k = cutRect(r);
  for (let x = r.x; x < r.x + r.w; x++)
    for (let y = r.y; y < r.y + r.h; y++) {
      if (k && x >= k.x && x < k.x + k.w && y >= k.y && y < k.y + k.h) continue;
      yield [x, y];
    }
}

/** 面積（格²）＝外框減缺角 */
export function roomCellArea(r: Shape): number {
  return r.w * r.h - (r.cut ? r.cut.w * r.cut.h : 0);
}

/**
 * 組成房間的長方形（不重疊）：長方形的房間是外框本身；L 形是兩塊——缺角那一側切開的寬的一塊與窄的一塊。
 * 畫地板、判斷長方形在不在房間裡用。
 */
export function roomRects(r: Shape): Rect[] {
  const k = cutRect(r);
  if (!k) return [{ x: r.x, y: r.y, w: r.w, h: r.h }];
  const top = k.y === r.y;
  /* 沒缺的那一條整列（上或下）＋缺角旁邊那一段 */
  const full: Rect = top
    ? { x: r.x, y: r.y + k.h, w: r.w, h: r.h - k.h }
    : { x: r.x, y: r.y, w: r.w, h: r.h - k.h };
  const side: Rect = {
    x: k.x === r.x ? r.x + k.w : r.x,
    y: top ? r.y : r.y + r.h - k.h,
    w: r.w - k.w,
    h: k.h,
  };
  return [full, side];
}

/**
 * L 形裡最大的長方形（房間名字、編號、鎖與筆記的標記放在這裡）：沒缺的整列與沒缺的整欄取面積大的，
 * 一樣大時取整列（橫的）。長方形的房間是外框本身。
 */
export function roomMainRect(r: Shape): Rect {
  const k = cutRect(r);
  if (!k) return { x: r.x, y: r.y, w: r.w, h: r.h };
  const row: Rect =
    k.y === r.y
      ? { x: r.x, y: r.y + k.h, w: r.w, h: r.h - k.h }
      : { x: r.x, y: r.y, w: r.w, h: r.h - k.h };
  const col: Rect =
    k.x === r.x
      ? { x: r.x + k.w, y: r.y, w: r.w - k.w, h: r.h }
      : { x: r.x, y: r.y, w: r.w - k.w, h: r.h };
  return col.w * col.h > row.w * row.h ? col : row;
}

/** 房間的外形（多邊形，順時針；長方形 4 點、L 形 6 點） */
export function roomPolygon(r: Shape): [number, number][] {
  const x1 = r.x;
  const y1 = r.y;
  const x2 = r.x + r.w;
  const y2 = r.y + r.h;
  const c = r.cut;
  if (!c)
    return [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ];
  const { w, h } = c;
  switch (c.c) {
    case 'nw':
      return [
        [x1 + w, y1],
        [x2, y1],
        [x2, y2],
        [x1, y2],
        [x1, y1 + h],
        [x1 + w, y1 + h],
      ];
    case 'ne':
      return [
        [x1, y1],
        [x2 - w, y1],
        [x2 - w, y1 + h],
        [x2, y1 + h],
        [x2, y2],
        [x1, y2],
      ];
    case 'se':
      return [
        [x1, y1],
        [x2, y1],
        [x2, y2 - h],
        [x2 - w, y2 - h],
        [x2 - w, y2],
        [x1, y2],
      ];
    default:
      return [
        [x1, y1],
        [x2, y1],
        [x2, y2],
        [x1 + w, y2],
        [x1 + w, y2 - h],
        [x1, y2 - h],
      ];
  }
}

/** 轉角裡面的那一點（缺角的控制點；長方形的房間 null） */
export function cutHandlePoint(r: Shape): { x: number; y: number } | null {
  const k = cutRect(r);
  if (!k || !r.cut) return null;
  return {
    x: r.cut.c === 'nw' || r.cut.c === 'sw' ? k.x + k.w : k.x,
    y: r.cut.c === 'nw' || r.cut.c === 'ne' ? k.y + k.h : k.y,
  };
}

/** 把房間的外形加進目前的路徑（畫地板、蓋灰、剪裁用） */
export function traceRoom(c: CanvasRenderingContext2D, r: Shape): void {
  if (!r.cut) {
    c.rect(r.x, r.y, r.w, r.h);
    return;
  }
  const pts = roomPolygon(r);
  c.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
  c.closePath();
}

/** 長方形整個在房間裡（含邊界；L 形時不能碰到缺角的內部） */
export function roomContainsRect(r: Shape, inner: Rect): boolean {
  if (
    !(
      inner.x >= r.x - EPS &&
      inner.y >= r.y - EPS &&
      inner.x + inner.w <= r.x + r.w + EPS &&
      inner.y + inner.h <= r.y + r.h + EPS
    )
  )
    return false;
  const k = cutRect(r);
  if (!k) return true;
  return !(
    inner.x < k.x + k.w - EPS &&
    k.x < inner.x + inner.w - EPS &&
    inner.y < k.y + k.h - EPS &&
    k.y < inner.y + inner.h - EPS
  );
}

/** 房間（可能是 L 形）整個在另一間房間裡 */
export function roomContainsRoom(outer: Shape, inner: Shape): boolean {
  return roomRects(inner).every((p) => roomContainsRect(outer, p));
}

/** 兩間房間有沒有重疊的格子（只碰到邊不算） */
export function roomsOverlap(a: Shape, b: Shape): boolean {
  return roomRects(a).some((p) =>
    roomRects(b).some(
      (q) =>
        p.x < q.x + q.w - EPS &&
        q.x < p.x + p.w - EPS &&
        p.y < q.y + q.h - EPS &&
        q.y < p.y + p.h - EPS,
    ),
  );
}

/** 預設的缺角：右上、外框的一半（往下取整，至少 1） */
export function defaultCut(w: number, h: number): RoomCut | undefined {
  if (w < L_MIN || h < L_MIN) return undefined;
  return { c: 'ne', w: Math.max(1, Math.floor(w / 2)), h: Math.max(1, Math.floor(h / 2)) };
}

/** 外框改了之後的缺角：角不變、大小夾到合法的範圍（外框小於 2 × 2 時拿掉） */
export function fitCut(cut: RoomCut | undefined, w: number, h: number): RoomCut | undefined {
  if (!cut) return undefined;
  if (w < L_MIN || h < L_MIN) return undefined;
  return {
    c: cut.c,
    w: Math.min(Math.max(1, cut.w), w - 1),
    h: Math.min(Math.max(1, cut.h), h - 1),
  };
}

/** 順時針轉 90° 之後的缺角（角跟著轉，寬深對調） */
export function rotateCutCW(cut: RoomCut): RoomCut {
  const next: Record<Corner, Corner> = { nw: 'ne', ne: 'se', se: 'sw', sw: 'nw' };
  return { c: next[cut.c], w: cut.h, h: cut.w };
}

/**
 * 兩塊長方形（不重疊、合起來是 L 形或長方形）→ 外框＋缺角。合不起來（不是 L 形）時 null。
 * 自動走廊（F251）用。
 */
export function shapeFromRects(rects: readonly Rect[]): (Rect & { cut?: RoomCut }) | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const w = Math.max(...rects.map((r) => r.x + r.w)) - x;
  const h = Math.max(...rects.map((r) => r.y + r.h)) - y;
  const area = rects.reduce((s, r) => s + r.w * r.h, 0);
  if (area === w * h) return { x, y, w, h };
  for (const c of CORNERS) {
    /* 缺角的大小：從那個角往裡找第一個有東西的格子 */
    const has = (cx: number, cy: number) =>
      rects.some((r) => cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h);
    const cx0 = c === 'nw' || c === 'sw' ? x : x + w - 1;
    const cy0 = c === 'nw' || c === 'ne' ? y : y + h - 1;
    if (has(cx0, cy0)) continue;
    const dx = c === 'nw' || c === 'sw' ? 1 : -1;
    const dy = c === 'nw' || c === 'ne' ? 1 : -1;
    let cw = 0;
    while (cw < w && !has(cx0 + dx * cw, cy0)) cw++;
    let ch = 0;
    while (ch < h && !has(cx0, cy0 + dy * ch)) ch++;
    const cut: RoomCut = { c, w: cw, h: ch };
    const room = { x, y, w, h, cut };
    if (!validCut(room, cut)) return null;
    if (roomCellArea(room) !== area) return null;
    return room;
  }
  return null;
}
