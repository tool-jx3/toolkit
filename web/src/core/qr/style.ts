/**
 * 有樣式的 QR code：模組矩陣＋樣式 → 「場景」（背景、點、三個角的外框與中心、中間的圖），
 * canvas（`canvas.ts`）與 SVG（`svg.ts`）都照同一個場景畫，所以預覽、PNG、SVG 一致。
 *
 * 版面、點與角的分層、漸層的方向、中間放圖的大小與要拿掉的格子、圓形時外圍補的點，
 * 都參考 kozakdenys/qr-code-styling（MIT，commit 43d4171，`src/core/QRSVG.ts`、`src/tools/calculateImageSize.ts`）改寫，
 * 數值與預設照原作。和原作不同的地方：
 * - 「點的大小取整數」關掉時，圓形外圍補的點的圈數仍取整數（原作會變成小數、補的點幾乎都消失）；
 * - 補點時取原圖格子的位置夾在範圍內（原作在點很小時可能超出範圍而出錯）。
 */
import type { Gradient, GradientStop } from '../gradient';
import { sortStops } from '../gradient';
import type { QrEcl, QrMatrix } from './encode';
import { QR_ECL_PERCENT } from './encode';
import {
  CORNER_DOT_MASK,
  CORNER_SQUARE_MASK,
  cornerDotPath,
  cornerSquarePath,
  dotPath,
  type QrCornerDotType,
  type QrCornerSquareType,
  type QrDotType,
} from './figures';

export type QrShape = 'square' | 'circle';

/** 單色或漸層（漸層的角度同 CSS：0° 由下往上、90° 由左往右） */
export type QrPaint = { kind: 'solid'; color: string } | { kind: 'gradient'; gradient: Gradient };

export interface QrStyle {
  width: number;
  height: number;
  /** 四周的邊距（px） */
  margin: number;
  shape: QrShape;
  dots: { type: QrDotType; paint: QrPaint; roundSize: boolean };
  /** type：null＝用點的樣式畫；paint：null＝跟著點 */
  cornerSquare: { type: QrCornerSquareType | null; paint: QrPaint | null };
  /** type：null＝用點的樣式畫；paint：null＝跟著角的外框 */
  cornerDot: { type: QrCornerDotType | null; paint: QrPaint | null };
  /** paint：null＝透明；round：0～1（1＝圓形） */
  background: { paint: QrPaint | null; round: number };
  /** 中間的圖（width、height＝原圖的像素）；size＝大小係數、margin＝圖四周的空白（px） */
  image: {
    width: number;
    height: number;
    size: number;
    margin: number;
    hideBackgroundDots: boolean;
  } | null;
}

export type QrFill =
  | { kind: 'solid'; color: string }
  | { kind: 'linear'; x1: number; y1: number; x2: number; y2: number; stops: GradientStop[] }
  | { kind: 'radial'; cx: number; cy: number; r: number; stops: GradientStop[] };

export interface QrLayer {
  /** 'dots'、'corner-square-0'～2、'corner-dot-0'～2 */
  id: string;
  d: string;
  rule: 'nonzero' | 'evenodd';
  fill: QrFill;
}

export interface QrScene {
  width: number;
  height: number;
  /** 「點的大小取整數」關掉時（SVG 的 shape-rendering 用 crispEdges，同原作） */
  crisp: boolean;
  background: {
    x: number;
    y: number;
    width: number;
    height: number;
    rx: number;
    fill: QrFill;
  } | null;
  layers: QrLayer[];
  /** 中間的圖要畫在哪裡（等比放進這個範圍；寬或高是 0 時不畫） */
  image: { x: number; y: number; width: number; height: number } | null;
  /** 格子：左上角、一格的大小、一邊幾格（讀得出來的檢查用） */
  grid: { x: number; y: number; cell: number; count: number };
  /** 被圖蓋住、拿掉點的範圍（列、行的起訖，含起不含訖；沒有時 null） */
  hidden: { r0: number; r1: number; c0: number; c1: number } | null;
}

export type QrSceneResult =
  | { ok: true; scene: QrScene }
  /** 太小：每格不到 1 px，或比格數還窄 */
  | { ok: false; error: 'too-small' };

/* ---------- 中間的圖（原作 calculateImageSize） ---------- */

export interface QrImageSize {
  width: number;
  height: number;
  hideXDots: number;
  hideYDots: number;
}

/**
 * 圖的大小與要拿掉的格數：拿掉的格數不超過 maxHiddenDots、每邊不超過 maxHiddenAxisDots，格數取奇數（置中）。
 */
export function qrImageSize(o: {
  originalWidth: number;
  originalHeight: number;
  maxHiddenDots: number;
  maxHiddenAxisDots?: number;
  dotSize: number;
}): QrImageSize {
  const { originalWidth, originalHeight, maxHiddenDots, maxHiddenAxisDots, dotSize } = o;
  if (originalHeight <= 0 || originalWidth <= 0 || maxHiddenDots <= 0 || dotSize <= 0)
    return { width: 0, height: 0, hideXDots: 0, hideYDots: 0 };
  const k = originalHeight / originalWidth;
  let hx = Math.floor(Math.sqrt(maxHiddenDots / k));
  if (hx <= 0) hx = 1;
  if (maxHiddenAxisDots && maxHiddenAxisDots < hx) hx = maxHiddenAxisDots;
  if (hx % 2 === 0) hx--;
  let w = hx * dotSize;
  let hy = 1 + 2 * Math.ceil((hx * k - 1) / 2);
  let h = Math.round(w * k);
  if (hy * hx > maxHiddenDots || (maxHiddenAxisDots && maxHiddenAxisDots < hy)) {
    if (maxHiddenAxisDots && maxHiddenAxisDots < hy) {
      hy = maxHiddenAxisDots;
      /* 原作的寫法（偶數時減的是 x）；maxHiddenAxisDots＝格數 − 14 一定是奇數，所以不會發生 */
      if (hy % 2 === 0) hx--;
    } else {
      hy -= 2;
    }
    h = hy * dotSize;
    hx = 1 + 2 * Math.ceil((hy / k - 1) / 2);
    w = Math.round(h / k);
  }
  return { width: w, height: h, hideXDots: hx, hideYDots: hy };
}

/* ---------- 漸層（原作 _createColor） ---------- */

/** 漸層角度（CSS）→ 原作的旋轉（弧度，0＝由左往右，順時針） */
const rotationOf = (cssAngle: number): number => ((cssAngle - 90) * Math.PI) / 180;

/**
 * 把畫法換成範圍 (x, y, w, h) 裡的填色：線性漸層的端點落在範圍的邊上（原作的算法，和 CSS 不同），
 * 放射漸層的中心在範圍中央、半徑＝長邊的一半；extraRotation＝角的漸層依角的位置多轉的角度。
 */
export function paintFill(
  paint: QrPaint,
  x: number,
  y: number,
  w: number,
  h: number,
  extraRotation = 0,
): QrFill {
  if (paint.kind === 'solid') return { kind: 'solid', color: paint.color };
  const g = paint.gradient;
  const stops = sortStops(g.stops).map((s) => ({
    offset: Math.min(1, Math.max(0, s.offset)),
    color: s.color,
  }));
  if (g.kind === 'radial')
    return { kind: 'radial', cx: x + w / 2, cy: y + h / 2, r: Math.max(w, h) / 2, stops };
  const TAU = 2 * Math.PI;
  const rotation = (rotationOf(g.angle) + extraRotation) % TAU;
  const pos = (rotation + TAU) % TAU;
  let x0 = x + w / 2;
  let y0 = y + h / 2;
  let x1 = x0;
  let y1 = y0;
  if ((pos >= 0 && pos <= 0.25 * Math.PI) || (pos > 1.75 * Math.PI && pos <= TAU)) {
    x0 -= w / 2;
    y0 -= (h / 2) * Math.tan(rotation);
    x1 += w / 2;
    y1 += (h / 2) * Math.tan(rotation);
  } else if (pos > 0.25 * Math.PI && pos <= 0.75 * Math.PI) {
    y0 -= h / 2;
    x0 -= w / 2 / Math.tan(rotation);
    y1 += h / 2;
    x1 += w / 2 / Math.tan(rotation);
  } else if (pos > 0.75 * Math.PI && pos <= 1.25 * Math.PI) {
    x0 += w / 2;
    y0 += (h / 2) * Math.tan(rotation);
    x1 -= w / 2;
    y1 -= (h / 2) * Math.tan(rotation);
  } else if (pos > 1.25 * Math.PI && pos <= 1.75 * Math.PI) {
    y0 += h / 2;
    x0 += w / 2 / Math.tan(rotation);
    y1 -= h / 2;
    x1 -= w / 2 / Math.tan(rotation);
  }
  return {
    kind: 'linear',
    x1: Math.round(x0),
    y1: Math.round(y0),
    x2: Math.round(x1),
    y2: Math.round(y1),
    stops,
  };
}

/* ---------- 場景 ---------- */

const inMask = (mask: readonly (readonly number[])[], r: number, c: number, n: number): boolean =>
  !!(mask[r]?.[c] || mask[r - n + 7]?.[c] || mask[r]?.[c - n + 7]);

/** 三個角：左上、右上、左下（行、列、角的漸層多轉的角度） */
const CORNERS: readonly [number, number, number][] = [
  [0, 0, 0],
  [1, 0, Math.PI / 2],
  [0, 1, -Math.PI / 2],
];

export function buildQrScene(matrix: QrMatrix, ecl: QrEcl, style: QrStyle): QrSceneResult {
  const { width, height } = style;
  const round = (v: number) => (style.dots.roundSize ? Math.floor(v) : v);
  const margin = Math.min(Math.max(0, style.margin), Math.min(width, height));
  const count = matrix.size;
  const minSize = Math.min(width, height) - margin * 2;
  const realSize = style.shape === 'circle' ? minSize / Math.SQRT2 : minSize;
  const cell = round(realSize / count);
  if (count > width || count > height || !(cell > 0)) return { ok: false, error: 'too-small' };
  const x0 = round((width - count * cell) / 2);
  const y0 = round((height - count * cell) / 2);

  /* 中間的圖：大小與拿掉的格子 */
  let img: QrImageSize = { width: 0, height: 0, hideXDots: 0, hideYDots: 0 };
  if (style.image) {
    const cover = style.image.size * QR_ECL_PERCENT[ecl];
    img = qrImageSize({
      originalWidth: style.image.width,
      originalHeight: style.image.height,
      maxHiddenDots: Math.floor(cover * count * count),
      maxHiddenAxisDots: count - 14,
      dotSize: cell,
    });
  }
  const hideImage = !!style.image?.hideBackgroundDots;
  const hidden =
    style.image && img.hideXDots > 0 && img.hideYDots > 0
      ? {
          r0: Math.ceil((count - img.hideYDots) / 2),
          r1: Math.ceil((count + img.hideYDots) / 2),
          c0: Math.ceil((count - img.hideXDots) / 2),
          c1: Math.ceil((count + img.hideXDots) / 2),
        }
      : null;
  const visible = (r: number, c: number): boolean => {
    if (hideImage && hidden && r >= hidden.r0 && r < hidden.r1 && c >= hidden.c0 && c < hidden.c1)
      return false;
    if (inMask(CORNER_SQUARE_MASK, r, c, count) || inMask(CORNER_DOT_MASK, r, c, count))
      return false;
    return true;
  };

  /* 點 */
  let dots = '';
  for (let r = 0; r < count; r++)
    for (let c = 0; c < count; c++) {
      if (!visible(r, c) || !matrix.dark(r, c)) continue;
      dots += dotPath(style.dots.type, x0 + c * cell, y0 + r * cell, cell, (dx, dy) => {
        const rr = r + dy;
        const cc = c + dx;
        if (rr < 0 || cc < 0 || rr >= count || cc >= count) return false;
        return visible(rr, cc) && matrix.dark(rr, cc);
      });
    }

  /* 圓形：外圍補上取自原圖的點（離 QR code 留一格，圓以外不畫） */
  if (style.shape === 'circle') {
    const extra = Math.max(0, Math.floor((minSize / cell - count) / 2));
    const fake = count + extra * 2;
    const fx = x0 - extra * cell;
    const fy = y0 - extra * cell;
    const center = Math.floor(fake / 2);
    const src = (i: number) => {
      const v = i - 2 * extra < 0 ? i : i >= count ? i - 2 * extra : i - extra;
      return Math.min(count - 1, Math.max(0, v));
    };
    const on = new Uint8Array(fake * fake);
    for (let r = 0; r < fake; r++)
      for (let c = 0; c < fake; c++) {
        if (r >= extra - 1 && r <= fake - extra && c >= extra - 1 && c <= fake - extra) continue;
        if (Math.hypot(r - center, c - center) > center) continue;
        /* 原作的寫法：行、列對調取原圖的格子 */
        if (matrix.dark(src(c), src(r))) on[r * fake + c] = 1;
      }
    const at = (r: number, c: number) =>
      r >= 0 && c >= 0 && r < fake && c < fake && on[r * fake + c] === 1;
    for (let r = 0; r < fake; r++)
      for (let c = 0; c < fake; c++) {
        if (!on[r * fake + c]) continue;
        dots += dotPath(style.dots.type, fx + c * cell, fy + r * cell, cell, (dx, dy) =>
          at(r + dy, c + dx),
        );
      }
  }

  const dotsFill = paintFill(style.dots.paint, 0, 0, width, height);
  const layers: QrLayer[] = [{ id: 'dots', d: dots, rule: 'nonzero', fill: dotsFill }];

  /* 三個角 */
  CORNERS.forEach(([col, row, rot], k) => {
    const x = x0 + col * cell * (count - 7);
    const y = y0 + row * cell * (count - 7);
    const squareFill = style.cornerSquare.paint
      ? paintFill(style.cornerSquare.paint, x, y, cell * 7, cell * 7, rot)
      : dotsFill;
    const sq = cornerSquarePath(style.cornerSquare.type, style.dots.type, x, y, cell);
    layers.push({ id: `corner-square-${k}`, d: sq.d, rule: sq.rule, fill: squareFill });
    const dotFill = style.cornerDot.paint
      ? paintFill(style.cornerDot.paint, x + cell * 2, y + cell * 2, cell * 3, cell * 3, rot)
      : squareFill;
    const dt = cornerDotPath(style.cornerDot.type, style.dots.type, x, y, cell);
    layers.push({ id: `corner-dot-${k}`, d: dt.d, rule: dt.rule, fill: dotFill });
  });

  /* 背景：圓角時是置中的正方形（邊長＝短邊） */
  let background: QrScene['background'] = null;
  if (style.background.paint) {
    const r = Math.min(1, Math.max(0, style.background.round));
    const w = r > 0 ? Math.min(width, height) : width;
    const h = r > 0 ? Math.min(width, height) : height;
    background = {
      x: round((width - w) / 2),
      y: round((height - h) / 2),
      width: w,
      height: h,
      rx: r > 0 ? (h / 2) * r : 0,
      fill: paintFill(style.background.paint, 0, 0, width, height),
    };
  }

  /* 圖的位置 */
  let image: QrScene['image'] = null;
  if (style.image && img.width > 0 && img.height > 0) {
    const m = Math.max(0, style.image.margin);
    const w = img.width - m * 2;
    const h = img.height - m * 2;
    if (w > 0 && h > 0)
      image = {
        x: x0 + round(m + (count * cell - img.width) / 2),
        y: y0 + round(m + (count * cell - img.height) / 2),
        width: w,
        height: h,
      };
  }

  return {
    ok: true,
    scene: {
      width,
      height,
      crisp: !style.dots.roundSize,
      background,
      layers,
      image,
      grid: { x: x0, y: y0, cell, count },
      hidden,
    },
  };
}

/** 圖等比放進範圍（置中；SVG 的 preserveAspectRatio 預設 xMidYMid meet） */
export function containRect(
  box: { x: number; y: number; width: number; height: number },
  iw: number,
  ih: number,
): { x: number; y: number; width: number; height: number } {
  if (iw <= 0 || ih <= 0) return box;
  const k = Math.min(box.width / iw, box.height / ih);
  const w = iw * k;
  const h = ih * k;
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h };
}
