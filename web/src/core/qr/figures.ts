/**
 * QR code 的點與角的形狀（SVG 路徑字串，canvas 用 Path2D、SVG 匯出直接寫進 `<path d>`）。
 *
 * 形狀與「依上下左右的鄰居決定哪個角變圓」的規則參考 kozakdenys/qr-code-styling（MIT，commit 43d4171，
 * `src/figures/`）改寫：原作每個點是一個 SVG 元素再以 transform 旋轉，這裡直接算出旋轉後的座標，
 * 整層的點合成一條路徑。旋轉都是 90° 的倍數，座標不會有誤差。
 */

export type QrDotType =
  | 'square'
  | 'dots'
  | 'rounded'
  | 'extra-rounded'
  | 'classy'
  | 'classy-rounded';
export type QrCornerSquareType =
  | 'dot'
  | 'square'
  | 'extra-rounded'
  | 'dots'
  | 'rounded'
  | 'classy'
  | 'classy-rounded';
export type QrCornerDotType =
  | 'dot'
  | 'square'
  | 'dots'
  | 'rounded'
  | 'classy'
  | 'classy-rounded'
  | 'extra-rounded';

export const QR_DOT_TYPES: readonly QrDotType[] = [
  'square',
  'dots',
  'rounded',
  'extra-rounded',
  'classy',
  'classy-rounded',
];
/** 角的外框：前三種是整塊的形狀，其餘用 7 × 7 格的點畫 */
export const QR_CORNER_SQUARE_TYPES: readonly QrCornerSquareType[] = [
  'square',
  'dot',
  'extra-rounded',
  'dots',
  'rounded',
  'classy',
  'classy-rounded',
];
/** 角的中心：前兩種是整塊的形狀，其餘用 3 × 3 格的點畫 */
export const QR_CORNER_DOT_TYPES: readonly QrCornerDotType[] = [
  'square',
  'dot',
  'dots',
  'rounded',
  'extra-rounded',
  'classy',
  'classy-rounded',
];

/** 鄰居：(行的偏移, 列的偏移) → 那一格有沒有點 */
export type Neighbor = (dx: number, dy: number) => boolean;

const num = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

/**
 * 一格的路徑：local 座標（0～s）先繞格子中心順時針轉 rot（90° 的倍數；畫面上 y 往下，同 SVG 的 rotate）。
 */
class Cell {
  private readonly cos: number;
  private readonly sin: number;
  out = '';
  constructor(
    private readonly x: number,
    private readonly y: number,
    private readonly s: number,
    rot: number,
  ) {
    const q = ((Math.round(rot / (Math.PI / 2)) % 4) + 4) % 4;
    this.cos = [1, 0, -1, 0][q];
    this.sin = [0, 1, 0, -1][q];
  }
  private pt(u: number, v: number): string {
    const h = this.s / 2;
    const dx = u - h;
    const dy = v - h;
    return `${num(this.x + h + dx * this.cos - dy * this.sin)} ${num(this.y + h + dx * this.sin + dy * this.cos)}`;
  }
  M(u: number, v: number): this {
    this.out += `M${this.pt(u, v)}`;
    return this;
  }
  L(u: number, v: number): this {
    this.out += `L${this.pt(u, v)}`;
    return this;
  }
  /** 圓弧（半徑 r；sweep 1＝順時針，同 SVG） */
  A(r: number, large: 0 | 1, sweep: 0 | 1, u: number, v: number): this {
    this.out += `A${num(r)} ${num(r)} 0 ${large} ${sweep} ${this.pt(u, v)}`;
    return this;
  }
  Z(): string {
    return `${this.out}Z`;
  }
}

/* ---------- 基本形狀（rot＝0 的樣子寫在說明裡） ---------- */

/** 圓 */
function circle(cx: number, cy: number, r: number): string {
  return `M${num(cx - r)} ${num(cy)}A${num(r)} ${num(r)} 0 1 0 ${num(cx + r)} ${num(cy)}A${num(r)} ${num(r)} 0 1 0 ${num(cx - r)} ${num(cy)}Z`;
}

const dot = (x: number, y: number, s: number) => circle(x + s / 2, y + s / 2, s / 2);

const square = (x: number, y: number, s: number) =>
  `M${num(x)} ${num(y)}H${num(x + s)}V${num(y + s)}H${num(x)}Z`;

/** 右邊是半圓 */
const sideRounded = (x: number, y: number, s: number, rot: number) =>
  new Cell(x, y, s, rot)
    .M(0, 0)
    .L(0, s)
    .L(s / 2, s)
    .A(s / 2, 0, 0, s / 2, 0)
    .Z();

/** 右上角圓 */
const cornerRounded = (x: number, y: number, s: number, rot: number) =>
  new Cell(x, y, s, rot)
    .M(0, 0)
    .L(0, s)
    .L(s, s)
    .L(s, s / 2)
    .A(s / 2, 0, 0, s / 2, 0)
    .Z();

/** 右上角大圓（四分之一圓，圓心在左下角） */
const cornerExtraRounded = (x: number, y: number, s: number, rot: number) =>
  new Cell(x, y, s, rot).M(0, 0).L(0, s).L(s, s).A(s, 0, 0, 0, 0).Z();

/** 左下與右上角圓 */
const cornersRounded = (x: number, y: number, s: number, rot: number) =>
  new Cell(x, y, s, rot)
    .M(0, 0)
    .L(0, s / 2)
    .A(s / 2, 0, 0, s / 2, s)
    .L(s, s)
    .L(s, s / 2)
    .A(s / 2, 0, 0, s / 2, 0)
    .Z();

const PI = Math.PI;

/** 一個點（type 決定形狀；rounded 類依鄰居決定哪邊變圓） */
export function dotPath(type: QrDotType, x: number, y: number, s: number, nb: Neighbor): string {
  if (type === 'dots') return dot(x, y, s);
  if (type === 'square') return square(x, y, s);
  const left = nb(-1, 0);
  const right = nb(1, 0);
  const top = nb(0, -1);
  const bottom = nb(0, 1);
  const n = +left + +right + +top + +bottom;
  if (type === 'rounded' || type === 'extra-rounded') {
    if (n === 0) return dot(x, y, s);
    if (n > 2 || (left && right) || (top && bottom)) return square(x, y, s);
    if (n === 2) {
      const rot = left && top ? PI / 2 : top && right ? PI : right && bottom ? -PI / 2 : 0;
      return type === 'rounded' ? cornerRounded(x, y, s, rot) : cornerExtraRounded(x, y, s, rot);
    }
    const rot = top ? PI / 2 : right ? PI : bottom ? -PI / 2 : 0;
    return sideRounded(x, y, s, rot);
  }
  /* classy、classy-rounded */
  if (n === 0) return cornersRounded(x, y, s, PI / 2);
  const corner = type === 'classy' ? cornerRounded : cornerExtraRounded;
  if (!left && !top) return corner(x, y, s, -PI / 2);
  if (!right && !bottom) return corner(x, y, s, PI / 2);
  return square(x, y, s);
}

/* ---------- 角 ---------- */

/** 7 × 7 的外框與 3 × 3 的中心（1＝有點） */
export const CORNER_SQUARE_MASK: readonly (readonly number[])[] = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
];
export const CORNER_DOT_MASK: readonly (readonly number[])[] = [
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 1, 1, 1, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
];

/** 用點畫一個 7 × 7 的遮罩（角的外框或中心選了點的樣式時） */
function maskPath(
  mask: readonly (readonly number[])[],
  type: QrDotType,
  x: number,
  y: number,
  d: number,
): string {
  let out = '';
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 7; c++) {
      if (!mask[r][c]) continue;
      out += dotPath(type, x + c * d, y + r * d, d, (dx, dy) => !!mask[r + dy]?.[c + dx]);
    }
  return out;
}

export interface CornerShape {
  d: string;
  /** 外框有洞：用 evenodd 填 */
  rule: 'nonzero' | 'evenodd';
}

/**
 * 角的外框（x、y＝左上角，d＝一格的大小，整塊 7d）。type 是 null（跟著點）時一格一格用點的樣式 dotType 畫——
 * 點的樣式和整塊的類型有同名的（square、extra-rounded），不能把點的樣式當成外框的類型（原作也是分開的）。
 */
export function cornerSquarePath(
  type: QrCornerSquareType | null,
  dotType: QrDotType,
  x: number,
  y: number,
  d: number,
): CornerShape {
  if (type === null) return { d: maskPath(CORNER_SQUARE_MASK, dotType, x, y, d), rule: 'nonzero' };
  const size = 7 * d;
  if (type === 'square')
    return {
      d: square(x, y, size) + square(x + d, y + d, size - 2 * d),
      rule: 'evenodd',
    };
  if (type === 'dot')
    return {
      d:
        circle(x + size / 2, y + size / 2, size / 2) +
        circle(x + size / 2, y + size / 2, size / 2 - d),
      rule: 'evenodd',
    };
  if (type === 'extra-rounded') {
    const p = (u: number, v: number) => `${num(x + u * d)} ${num(y + v * d)}`;
    const a = (r: number, sweep: 0 | 1, u: number, v: number) =>
      `A${num(r * d)} ${num(r * d)} 0 0 ${sweep} ${p(u, v)}`;
    const outer = `M${p(0, 2.5)}L${p(0, 4.5)}${a(2.5, 0, 2.5, 7)}L${p(4.5, 7)}${a(2.5, 0, 7, 4.5)}L${p(7, 2.5)}${a(2.5, 0, 4.5, 0)}L${p(2.5, 0)}${a(2.5, 0, 0, 2.5)}Z`;
    const inner = `M${p(2.5, 1)}L${p(4.5, 1)}${a(1.5, 1, 6, 2.5)}L${p(6, 4.5)}${a(1.5, 1, 4.5, 6)}L${p(2.5, 6)}${a(1.5, 1, 1, 4.5)}L${p(1, 2.5)}${a(1.5, 1, 2.5, 1)}Z`;
    return { d: outer + inner, rule: 'evenodd' };
  }
  return { d: maskPath(CORNER_SQUARE_MASK, type, x, y, d), rule: 'nonzero' };
}

/** 角的中心（x、y＝整個角〔7 × 7〕的左上角）；type 是 null（跟著點）時一格一格用點的樣式畫 */
export function cornerDotPath(
  type: QrCornerDotType | null,
  dotType: QrDotType,
  x: number,
  y: number,
  d: number,
): CornerShape {
  if (type === null) return { d: maskPath(CORNER_DOT_MASK, dotType, x, y, d), rule: 'nonzero' };
  if (type === 'square') return { d: square(x + 2 * d, y + 2 * d, 3 * d), rule: 'nonzero' };
  if (type === 'dot') return { d: dot(x + 2 * d, y + 2 * d, 3 * d), rule: 'nonzero' };
  return { d: maskPath(CORNER_DOT_MASK, type, x, y, d), rule: 'nonzero' };
}
