/**
 * 立體樓層圖與樓層總覽的投影、版面與上下樓層的連接（2026-11-09 參考 KIIN「立体フロアガイド制作スタジオ」的
 * 立体積層図・統合ボード；規格 F303～F306、3.18）。純函式：畫圖（draw/stack.ts）、編輯畫面的點選與拖曳、匯出、測試共用。
 * 之後的演出（跨樓層的移動箭頭、鏡頭跟隨、藏起來的房間）也用這裡的投影（`stackProject`、`levelMatrix`、`stackFocus`）。
 *
 * 座標的單位是「格」（1 格＝0.5 m）。原作的長度單位是 m，數值照原作換成格（× 2）。
 *
 * 投影（等角的斜俯瞰）：以所有樓層的共同範圍的中心 (cx, cy) 為原點，水平轉 angle 度，縱向壓成 pitch 倍，
 * 第 level 層往上移 level × gap，z（離這一層地板的高度，格）再往上移：
 *   X ＝ dx cos θ − dy sin θ
 *   Y ＝ (dx sin θ ＋ dy cos θ) × pitch − level × gap − z
 */
import { ASSET, VERTICAL_LINKS } from './assets';
import { clamp, floorBounds, itemLocalSize, unionRect } from './geometry';
import { roomHasPoint } from './shape';
import type { Floor, Item, Project, Rect, StackCamera } from './types';

/** 預設的視角（原作的標準） */
export const STACK_DEFAULT: Readonly<StackCamera> = { angle: -28, pitch: 0.56, gap: 1, rise: 1 };
export const STACK_ANGLE_MIN = -180;
export const STACK_ANGLE_MAX = 180;
export const STACK_PITCH_MIN = 0.35;
export const STACK_PITCH_MAX = 0.82;
/** 拖曳時的俯視範圍（太平或太陡時樓層疊在一起看不清楚） */
export const STACK_PITCH_DRAG_MIN = 0.38;
export const STACK_PITCH_DRAG_MAX = 0.78;
export const STACK_GAP_MIN = 0.65;
export const STACK_GAP_MAX = 1.8;
export const STACK_RISE_MIN = 0.5;
export const STACK_RISE_MAX = 2.2;
/** 「左轉／右轉」一次幾度 */
export const STACK_ROTATE_STEP = 45;
/** 拖曳一 px 轉幾度、俯視比例變多少（原作的手感） */
export const ORBIT_DEG_PER_PX = 0.45;
export const ORBIT_PITCH_PER_PX = 0.002;

/** 樓板的厚度（格；0.38 m） */
export const SLAB = 0.76;
/** 樓層牌（畫面左邊的樓層名稱）的大小（格） */
export const PLATE_W = 8.6;
export const PLATE_H = 2.3;

const round2 = (v: number) => Math.round(v * 100) / 100 + 0;

/** 角度整理到 −180～180（−180 和 180 是同一個方向；整數度） */
export function wrapAngle(deg: number): number {
  const a = Math.round(deg);
  return ((((a + 180) % 360) + 360) % 360) - 180;
}

/** 視角整理成範圍裡的值（讀檔、拖曳、滑桿都經過這裡） */
export function clampCamera(c: Partial<StackCamera>): StackCamera {
  const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  return {
    angle: clamp(Math.round(n(c.angle, STACK_DEFAULT.angle)), STACK_ANGLE_MIN, STACK_ANGLE_MAX),
    pitch: round2(clamp(n(c.pitch, STACK_DEFAULT.pitch), STACK_PITCH_MIN, STACK_PITCH_MAX)),
    gap: round2(clamp(n(c.gap, STACK_DEFAULT.gap), STACK_GAP_MIN, STACK_GAP_MAX)),
    rise: round2(clamp(n(c.rise, STACK_DEFAULT.rise), STACK_RISE_MIN, STACK_RISE_MAX)),
  };
}

export const isDefaultCamera = (c: StackCamera): boolean =>
  c.angle === STACK_DEFAULT.angle &&
  c.pitch === STACK_DEFAULT.pitch &&
  c.gap === STACK_DEFAULT.gap &&
  c.rise === STACK_DEFAULT.rise;

/** 地圖的視角（沒有設定時是預設） */
export const stackCamera = (p: Pick<Project, 'stack'>): StackCamera =>
  p.stack ? clampCamera(p.stack) : { ...STACK_DEFAULT };

/** 俯角（度）：pitch＝sin(俯角)（畫面上的「俯視角度」滑桿用） */
export const pitchDegrees = (pitch: number): number =>
  Math.round((Math.asin(pitch) * 180) / Math.PI);
export const pitchFromDegrees = (deg: number): number => round2(Math.sin((deg * Math.PI) / 180));

/* ---------- 樓層 ---------- */

/** 疊在立體圖裡的一層：`index` 是在地圖的樓層清單裡的位置 */
export interface StackLevel {
  floor: Floor;
  index: number;
}

/**
 * 立體圖由下往上的樓層：樓層清單的順序（左邊＝下面，同「下一層」F55）。外觀層打開「顯示內部」的（F230：別一層疊上來的
 * 畫面，不是真的一層）不放；全部都是時照樣放。
 */
export function stackLevels(floors: readonly Floor[]): StackLevel[] {
  const all = floors.map((floor, index) => ({ floor, index }));
  const real = all.filter((l) => !l.floor.showInside);
  return real.length ? real : all;
}

/** 一層有沒有東西（快速建立的「空的樓層」：沒有房間） */
export const floorHasRooms = (f: Pick<Floor, 'rooms'>): boolean => f.rooms.length > 0;

/* ---------- 投影 ---------- */

export interface StackLayout {
  cam: StackCamera;
  /** 立體圖的層數 */
  count: number;
  /** 所有樓層的共同範圍（格） */
  content: Rect;
  cx: number;
  cy: number;
  cos: number;
  sin: number;
  /** 縱向的壓扁比例（＝pitch） */
  sy: number;
  /** 樓層的間距（格） */
  gap: number;
  /** 投影後的共同範圍的寬、高 */
  spanX: number;
  spanY: number;
  /** 整張圖的範圍（投影後的座標） */
  bounds: Rect;
  /** 有沒有樓梯（上方留給樓梯與名牌的空間） */
  stairs: boolean;
}

export interface Projected {
  x: number;
  y: number;
  /** 前後（越大越靠近看的人） */
  depth: number;
}

/** 沒有東西時的共同範圍（原作 20 × 14 m） */
const EMPTY_CONTENT: Rect = { x: 0, y: 0, w: 40, h: 28 };

/** 所有樓層的共同範圍（立體圖、總覽的版面用；PL／GM／揭露用都用同一個，三張圖的位置對得齊） */
export function stackContent(floors: readonly Floor[]): Rect {
  let box: Rect | null = null;
  for (const f of floors) {
    const b = floorBounds(f);
    if (b) box = unionRect(box, b);
  }
  return box ?? { ...EMPTY_CONTENT };
}

/**
 * 立體圖的版面。`floors`＝立體圖由下往上的樓層（stackLevels 的 floor），算共同範圍與「有沒有樓梯」用；
 * 只有一層時也留第二層的空間（快速建立的「＋」）。
 */
export function stackLayout(floors: readonly Floor[], cam: StackCamera): StackLayout {
  const content = stackContent(floors);
  const rad = (cam.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const sy = cam.pitch;
  const spanY = (Math.abs(content.w * sin) + Math.abs(content.h * cos)) * sy;
  const spanX = Math.abs(content.w * cos) + Math.abs(content.h * sin);
  /* 原作：max(4.5 m, 投影後的深 × 0.72 ＋ 1.6 m) × 間距 */
  const gap = Math.max(9, spanY * 0.72 + 3.2) * cam.gap;
  const stairs = floors.some((f) => f.items.some((i) => VERTICAL_LINKS.has(i.t)));
  const shown = Math.max(2, floors.length);
  /* 上：樓梯（最高的段高）與名牌、下：樓板與影子、左：樓層牌（原作的留白，換成格） */
  const top = -(shown - 1) * gap - spanY / 2 - (stairs ? 15.42 : 8.4);
  const bottom = spanY / 2 + (stairs ? 7.88 : 5.2);
  const left = -spanX / 2 - 14.4;
  const right = spanX / 2 + 5.2;
  return {
    cam,
    count: floors.length,
    content,
    cx: content.x + content.w / 2,
    cy: content.y + content.h / 2,
    cos,
    sin,
    sy,
    gap,
    spanX,
    spanY,
    bounds: { x: left, y: top, w: right - left, h: bottom - top },
    stairs,
  };
}

/** 平面上的一點 (x, y) 在第 level 層、高 z（格）的地方投影到立體圖上 */
export function stackProject(
  L: StackLayout,
  x: number,
  y: number,
  level: number,
  z = 0,
): Projected {
  const dx = x - L.cx;
  const dy = y - L.cy;
  const depth = dx * L.sin + dy * L.cos;
  return { x: dx * L.cos - dy * L.sin, y: depth * L.sy - level * L.gap - z, depth };
}

/** 立體圖上的一點 → 第 level 層（高 z）的平面座標（點選樓層、拖曳用） */
export function stackUnproject(
  L: StackLayout,
  X: number,
  Y: number,
  level: number,
  z = 0,
): { x: number; y: number } {
  const depth = (Y + level * L.gap + z) / L.sy;
  return { x: L.cx + X * L.cos + depth * L.sin, y: L.cy - X * L.sin + depth * L.cos };
}

/**
 * 第 level 層的平面（高 z）畫到立體圖上的變換：canvas 的 `transform(a, b, c, d, e, f)`
 * （(x, y) → (a x ＋ c y ＋ e, b x ＋ d y ＋ f)）。平面圖照這個變換畫，就是那一層的樓板。
 */
export function levelMatrix(
  L: StackLayout,
  level: number,
  z = 0,
): [number, number, number, number, number, number] {
  const { cos, sin, sy, cx, cy } = L;
  return [
    cos,
    sy * sin,
    -sin,
    sy * cos,
    -cos * cx + sin * cy,
    -sy * sin * cx - sy * cos * cy - level * L.gap - z,
  ];
}

/** 第 level 層的樓層牌（立體圖左邊的樓層名稱；點一下切到那一層） */
export function plateRect(L: StackLayout, level: number): Rect {
  return { x: L.bounds.x + 2.2, y: -level * L.gap - PLATE_H / 2 - 0.09, w: PLATE_W, h: PLATE_H };
}

/**
 * 立體圖上框住平面上的一塊範圍（第 level 層、地板到 1.6 格高）的長方形（四周留 30%、至少 4 格）。
 * 之後的鏡頭跟隨（放大到某一間房）用；原作的 stackFocusBox。
 */
export function stackFocus(L: StackLayout, rect: Rect, level: number): Rect {
  const pts: Projected[] = [];
  for (const z of [0, 1.6])
    for (const [x, y] of [
      [rect.x, rect.y],
      [rect.x + rect.w, rect.y],
      [rect.x + rect.w, rect.y + rect.h],
      [rect.x, rect.y + rect.h],
    ])
      pts.push(stackProject(L, x, y, level, z));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  const px = Math.max(4, w * 0.3);
  const py = Math.max(4, h * 0.3);
  return { x: x0 - px, y: y0 - py, w: w + px * 2, h: h + py * 2 };
}

/* ---------- 樓層總覽 ---------- */

export interface BoardCard {
  /** 立體圖的第幾層（由下往上） */
  level: number;
  /** 卡片（格） */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 平面圖畫到卡片裡：(x, y) → (tx ＋ x × scale, ty ＋ y × scale) */
  tx: number;
  ty: number;
}

export interface BoardLayout {
  stack: StackLayout;
  /** 各樓層共同的範圍（格；卡片裡的平面圖都用這個範圍，上下樓層的位置對得齊） */
  shared: Rect;
  /** 卡片裡平面圖的倍率 */
  scale: number;
  cols: number;
  rows: number;
  /** 左邊立體圖那一欄的寬 */
  leftW: number;
  /** 立體圖畫到左欄：(X, Y) → (stackTx ＋ X × stackScale, stackTy ＋ Y × stackScale) */
  stackScale: number;
  stackTx: number;
  stackTy: number;
  /** 左欄的框 */
  panel: Rect;
  /** 由上往下的樓層卡片（最上面的樓層在最前面，原作同） */
  cards: BoardCard[];
  width: number;
  height: number;
}

/** 卡片的標題列高（格） */
export const CARD_HEAD = 1.7;
/** 標題（地圖名稱）下緣：左欄與卡片從這裡開始 */
export const BOARD_TOP = 6.2;

/**
 * 樓層總覽的版面（原作「統合ボード」的排法與比例，換成格）：左邊立體圖、右邊每一層的平面圖卡片（3 層以上排成 2 欄），
 * 卡片的平面圖都用所有樓層的共同範圍、同一個倍率。
 */
export function boardLayout(floors: readonly Floor[], cam: StackCamera): BoardLayout {
  const stack = stackLayout(floors, cam);
  const sb = stack.bounds;
  let shared: Rect | null = null;
  for (const f of floors) {
    const b = floorBounds(f);
    if (b)
      shared = unionRect(shared, { x: b.x - 0.32, y: b.y - 0.32, w: b.w + 0.64, h: b.h + 0.64 });
  }
  const box = shared ?? { ...EMPTY_CONTENT };
  const n = Math.max(1, floors.length);
  const cellW = Math.max(27, box.w + 4.8);
  const cellH = Math.max(17, box.h + 5.2);
  const cols = n > 2 ? 2 : 1;
  const rows = Math.ceil(n / cols);
  const rightW = cols * cellW + (cols - 1) * 1.6;
  const rightH = rows * cellH + (rows - 1) * 1.5;
  const height = Math.max(sb.h, rightH) + 7.6;
  const leftW = Math.max(27, sb.w * 0.95);
  const width = leftW + rightW + 6.4;
  const scale = Math.min((cellW - 1.6) / box.w, (cellH - 3) / box.h);
  const stackScale = Math.min((leftW - 1.6) / sb.w, (height - 8.8) / sb.h);
  const stackTx = 2.2 + (leftW - sb.w * stackScale) / 2 - sb.x * stackScale;
  const stackTy = BOARD_TOP + (height - 7.8 - sb.h * stackScale) / 2 - sb.y * stackScale;
  const startX = leftW + 3.6;
  const cards: BoardCard[] = [];
  for (let i = 0; i < floors.length; i++) {
    const level = floors.length - 1 - i;
    const x = startX + (i % cols) * (cellW + 1.6);
    const y = BOARD_TOP + Math.floor(i / cols) * (cellH + 1.5);
    cards.push({
      level,
      x,
      y,
      w: cellW,
      h: cellH,
      tx: x + (cellW - box.w * scale) / 2 - box.x * scale,
      ty: y + 2.2 + (cellH - 2.6 - box.h * scale) / 2 - box.y * scale,
    });
  }
  return {
    stack,
    shared: box,
    scale,
    cols,
    rows,
    leftW,
    stackScale,
    stackTx,
    stackTy,
    panel: { x: 2, y: BOARD_TOP, w: leftW, h: height - 7.8 },
    cards,
    width,
    height,
  };
}

/* ---------- 上下樓層的連接 ---------- */

/** 上下樓層的連接的種類：樓梯、螺旋梯、電梯、梯子與地板的暗門 */
export type LinkKind = 'stairs' | 'spiral' | 'lift' | 'hatch';

const LINK_KIND: Record<string, LinkKind> = {
  stairs: 'stairs',
  stairs_u: 'stairs',
  stairs_down: 'stairs',
  ext_stairs: 'stairs',
  fire_escape: 'stairs',
  temp_stairs: 'stairs',
  spiral: 'spiral',
  spiral_ccw: 'spiral',
  elevator: 'lift',
  trapdoor: 'hatch',
  ladder: 'hatch',
};

/** 家具是哪一種上下樓層的連接（不是時 null；之後新增的 `vertical` 家具當成梯子） */
export function linkKind(t: string): LinkKind | null {
  if (LINK_KIND[t]) return LINK_KIND[t];
  return ASSET[t]?.vertical ? 'hatch' : null;
}

export interface LinkEnd {
  x: number;
  y: number;
  /** 那一端的家具（另一層沒有對應的家具、照原作推測出來的那一端是 null） */
  item: Item | null;
}

export interface VerticalLink {
  /** 下面那一層（立體圖的第幾層；上面是 level ＋ 1） */
  level: number;
  kind: LinkKind;
  low: LinkEnd;
  high: LinkEnd;
}

const center = (i: Item) => ({ x: i.x + i.w / 2, y: i.y + i.h / 2 });

/**
 * 上下相鄰兩層之間的連接（原作的 verticalPairs）：同一種（樓梯、螺旋梯、電梯、梯子）而且中心相距不到
 * 2.2 m（樓梯）／1.8 m（其他）的兩件，近的先配；梯子、地板的暗門、螺旋梯沒配到時，另一層同一個位置有房間就當成通到那裡。
 * `floors` 是立體圖由下往上的樓層（PL 檢視要先整理成看得到的樓層，GM 專用的樓梯不會連起來）。
 */
export function verticalLinks(floors: readonly Floor[]): VerticalLink[] {
  const out: VerticalLink[] = [];
  const hubs = (f: Floor) =>
    f.items
      .map((item) => ({ item, kind: linkKind(item.t), ...center(item) }))
      .filter((h): h is { item: Item; kind: LinkKind; x: number; y: number } => !!h.kind);
  for (let level = 0; level + 1 < floors.length; level++) {
    const lower = hubs(floors[level]);
    const upper = hubs(floors[level + 1]);
    const cands: { a: (typeof lower)[0]; b: (typeof upper)[0]; d: number }[] = [];
    for (const a of lower)
      for (const b of upper) {
        if (a.kind !== b.kind) continue;
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < (a.kind === 'stairs' ? 4.4 : 3.6)) cands.push({ a, b, d });
      }
    cands.sort((p, q) => p.d - q.d);
    const used = new Set<Item>();
    for (const { a, b } of cands) {
      if (used.has(a.item) || used.has(b.item)) continue;
      used.add(a.item);
      used.add(b.item);
      out.push({
        level,
        kind: a.kind,
        low: { x: a.x, y: a.y, item: a.item },
        high: { x: b.x, y: b.y, item: b.item },
      });
    }
    /* 梯子、暗門、螺旋梯：另一層同一個位置有房間 → 通到那裡（原作的推測） */
    const fixture = (k: LinkKind) => k === 'hatch' || k === 'spiral';
    const roomAt = (f: Floor, x: number, y: number) => f.rooms.some((r) => roomHasPoint(r, x, y));
    for (const a of lower)
      if (!used.has(a.item) && fixture(a.kind) && roomAt(floors[level + 1], a.x, a.y))
        out.push({
          level,
          kind: a.kind,
          low: { x: a.x, y: a.y, item: a.item },
          high: { x: a.x, y: a.y, item: null },
        });
    for (const b of upper)
      if (!used.has(b.item) && fixture(b.kind) && roomAt(floors[level], b.x, b.y))
        out.push({
          level,
          kind: b.kind,
          low: { x: b.x, y: b.y, item: null },
          high: { x: b.x, y: b.y, item: b.item },
        });
  }
  return out;
}

/**
 * 樓梯往哪裡走（立體的樓梯模型）：有連到上一層＝上、有連到下一層＝下；都沒有時往有樓層的那一邊
 * （「往地下的樓梯」先往下），只有一層時往上。
 */
export function stairTravel(
  item: Item,
  level: number,
  count: number,
  links: readonly VerticalLink[],
): { up: boolean; down: boolean } {
  let up = links.some((l) => l.level === level && l.low.item === item);
  let down = links.some((l) => l.level === level - 1 && l.high.item === item);
  if (!up && !down) {
    if (item.t === 'stairs_down' && level > 0) down = true;
    else if (level + 1 < count || level === 0) up = true;
    else down = true;
  }
  return { up, down };
}

/** 家具在自己的座標系的寬深與中心（立體的樓梯用；rot 是順時針的度數，0 時背面朝上＝樓梯的上端） */
export function itemFrame(item: Item): {
  cx: number;
  cy: number;
  w: number;
  h: number;
  rot: number;
} {
  const s = itemLocalSize(item);
  return { cx: item.x + item.w / 2, cy: item.y + item.h / 2, w: s.w, h: s.h, rot: item.rot || 0 };
}

/* ---------- 點選 ---------- */

/** 立體圖上 (X, Y) 點到哪一層的樓層牌（由上往下找；沒有時 −1） */
export function plateAt(L: StackLayout, count: number, X: number, Y: number): number {
  for (let level = count - 1; level >= 0; level--) {
    const r = plateRect(L, level);
    if (X >= r.x && X <= r.x + r.w && Y >= r.y && Y <= r.y + r.h) return level;
  }
  return -1;
}

/**
 * 立體圖上 (X, Y) 點到哪一層的樓板（上面的樓層蓋住下面的，所以由上往下找：點在那一層的某一間房裡，
 * 或在樓板的側面〔往下 SLAB 格〕）。沒有時 −1。
 */
export function levelAt(L: StackLayout, floors: readonly Floor[], X: number, Y: number): number {
  for (let level = floors.length - 1; level >= 0; level--) {
    for (const z of [0, -SLAB / 2, -SLAB]) {
      const p = stackUnproject(L, X, Y, level, z);
      if (floors[level].rooms.some((r) => roomHasPoint(r, p.x, p.y))) return level;
    }
  }
  return -1;
}

/** 立體圖上 (X, Y) 是不是在第 level 層的「共同範圍」裡（空的樓層、快速建立的「＋」用） */
export function inLevelContent(L: StackLayout, level: number, X: number, Y: number): boolean {
  const p = stackUnproject(L, X, Y, level);
  const c = L.content;
  return p.x >= c.x && p.x <= c.x + c.w && p.y >= c.y && p.y <= c.y + c.h;
}
