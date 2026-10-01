/**
 * core/layout：版面編輯的幾何計算（LayoutEditor、PanZoomViewport、CropFrame 共用；工具也可以直接用）。
 * 純函式，座標單位由呼叫端決定（px、百分比、cm 都可以）。
 *
 * ```ts
 * const next = resizeBox(start, 'se', dx, dy, { minWidth: 8, minHeight: 6, maxWidth: 80, maxHeight: 80 });
 * const g = boxGuides(next, { x: 0, y: 0, width: 100, height: 100 });   // 中心線、四邊、與上下左右的距離
 * const hit = hitTest(items, wx, wy);                                     // 最前面那個
 * ```
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type BoxHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

export interface SizeLimits {
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
  /** 維持寬高比（拖角落時） */
  keepAspect?: boolean;
}

export const moveBox = (b: Box, dx: number, dy: number): Box => ({
  ...b,
  x: b.x + dx,
  y: b.y + dy,
});

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * 拖曳控點調整大小：對角（或對邊）固定，寬高夾在 limits 內。
 * 例：右下角控點 → 左上角不動。
 */
export function resizeBox(
  b: Box,
  handle: BoxHandle,
  dx: number,
  dy: number,
  limits: SizeLimits = {},
): Box {
  const {
    minWidth = 0,
    minHeight = 0,
    maxWidth = Number.POSITIVE_INFINITY,
    maxHeight = Number.POSITIVE_INFINITY,
    keepAspect,
  } = limits;
  let w = b.width;
  let h = b.height;
  if (handle.includes('e')) w = b.width + dx;
  if (handle.includes('w')) w = b.width - dx;
  if (handle.includes('s')) h = b.height + dy;
  if (handle.includes('n')) h = b.height - dy;
  if (keepAspect && b.width > 0 && b.height > 0 && handle.length === 2) {
    const k = Math.max(w / b.width, h / b.height);
    w = b.width * k;
    h = b.height * k;
  }
  w = clampNum(w, minWidth, maxWidth);
  h = clampNum(h, minHeight, maxHeight);
  return {
    x: handle.includes('w') ? b.x + b.width - w : b.x,
    y: handle.includes('n') ? b.y + b.height - h : b.y,
    width: w,
    height: h,
  };
}

/** 以中心為基準縮放（例如圖片的放大／縮小按鈕） */
export function scaleBoxAt(
  b: Box,
  factor: number,
  cx = b.x + b.width / 2,
  cy = b.y + b.height / 2,
): Box {
  return {
    x: cx - (cx - b.x) * factor,
    y: cy - (cy - b.y) * factor,
    width: b.width * factor,
    height: b.height * factor,
  };
}

/**
 * 夾住位置：anchor 為 'topleft' 時限制左上角、'center' 時限制中心點，範圍可以是函式（例如「110% − 自身寬」）。
 * ```ts
 * clampBoxPosition(b, { minX: -10, maxX: 110 - b.width, minY: -10, maxY: 110 - b.height });            // 名字牌
 * clampBoxPosition(b, { minX: -20, maxX: 120, minY: -20, maxY: 120 }, 'center');                       // 圖片中心
 * ```
 */
export function clampBoxPosition(
  b: Box,
  range: { minX?: number; maxX?: number; minY?: number; maxY?: number },
  anchor: 'topleft' | 'center' = 'topleft',
): Box {
  const ox = anchor === 'center' ? b.width / 2 : 0;
  const oy = anchor === 'center' ? b.height / 2 : 0;
  const x = clampNum(
    b.x + ox,
    range.minX ?? Number.NEGATIVE_INFINITY,
    range.maxX ?? Number.POSITIVE_INFINITY,
  );
  const y = clampNum(
    b.y + oy,
    range.minY ?? Number.NEGATIVE_INFINITY,
    range.maxY ?? Number.POSITIVE_INFINITY,
  );
  return { ...b, x: x - ox, y: y - oy };
}

/** 方向鍵的移動量；不是方向鍵時 null */
export function arrowDelta(key: string, step: number): { dx: number; dy: number } | null {
  switch (key) {
    case 'ArrowLeft':
      return { dx: -step, dy: 0 };
    case 'ArrowRight':
      return { dx: step, dy: 0 };
    case 'ArrowUp':
      return { dx: 0, dy: -step };
    case 'ArrowDown':
      return { dx: 0, dy: step };
    default:
      return null;
  }
}

export interface BoxGuides {
  /** 參考範圍的中心 */
  center: { x: number; y: number };
  /** 物件的四邊 */
  edges: { left: number; right: number; top: number; bottom: number };
  /** 物件與參考範圍四邊的距離（同單位；可以是負的＝超出） */
  distance: { left: number; right: number; top: number; bottom: number };
}

/** 對齊參考線：參考範圍的中心十字、物件的四條邊線、與四邊的距離 */
export function boxGuides(b: Box, frame: Box): BoxGuides {
  return {
    center: { x: frame.x + frame.width / 2, y: frame.y + frame.height / 2 },
    edges: { left: b.x, right: b.x + b.width, top: b.y, bottom: b.y + b.height },
    distance: {
      left: b.x - frame.x,
      right: frame.x + frame.width - (b.x + b.width),
      top: b.y - frame.y,
      bottom: frame.y + frame.height - (b.y + b.height),
    },
  };
}

/** 百分比（相對 frame）→ 實際座標 */
export function percentToBox(p: Box, frame: Box): Box {
  return {
    x: frame.x + (p.x / 100) * frame.width,
    y: frame.y + (p.y / 100) * frame.height,
    width: (p.width / 100) * frame.width,
    height: (p.height / 100) * frame.height,
  };
}

/** 實際座標 → 百分比（相對 frame） */
export function boxToPercent(b: Box, frame: Box): Box {
  return {
    x: ((b.x - frame.x) / frame.width) * 100,
    y: ((b.y - frame.y) / frame.height) * 100,
    width: (b.width / frame.width) * 100,
    height: (b.height / frame.height) * 100,
  };
}

/**
 * 指標座標換算：螢幕（clientX／Y）→ 元素內容的原始座標。元素被 CSS 縮放（例如 Stage 的縮放）也正確，
 * 因為用的是 getBoundingClientRect 的實際顯示大小。
 */
export function clientToLocal(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  size: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: rect.width ? ((clientX - rect.left) / rect.width) * size.width : 0,
    y: rect.height ? ((clientY - rect.top) / rect.height) * size.height : 0,
  };
}

export function pointInBox(b: Box, x: number, y: number, tolerance = 0): boolean {
  return (
    x >= b.x - tolerance &&
    x <= b.x + b.width + tolerance &&
    y >= b.y - tolerance &&
    y <= b.y + b.height + tolerance
  );
}

/**
 * 點選測試：items 依「後面 → 前面」排列（畫的順序），回傳點到的**最前面**那一個；都沒點到時 null。
 */
export function hitTest<T extends { box: Box; hidden?: boolean }>(
  items: readonly T[],
  x: number,
  y: number,
  tolerance = 0,
): T | null {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (!it.hidden && pointInBox(it.box, x, y, tolerance)) return it;
  }
  return null;
}

/**
 * 只能水平移動的框（例如立繪裁切框）：左緣夾在 0～（範圍寬 − 框寬）；框比範圍寬時固定在 0。
 */
export function clampSpan(start: number, length: number, extent: number): number {
  if (length >= extent) return 0;
  return clampNum(start, 0, extent - length);
}
