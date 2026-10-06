/**
 * 自動縮小與擺放：放不下時整體縮小（外框、光暈、陰影、裝飾都算進去），錨點定位，發光會超出畫面時往內推。
 * 移植自 text-fx（本站以無塵室方式撰寫，MIT）的 scene.js。
 */

/** 九宮格錨點：t／m／b（上中下）＋ l／c／r（左中右），例如 'mc'＝正中央、'bl'＝左下 */
export type Anchor = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export const ANCHORS: readonly Anchor[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

const ANCHOR_X: Record<string, number> = { l: 0, c: 0.5, r: 1 };
const ANCHOR_Y: Record<string, number> = { t: 0, m: 0.5, b: 1 };

/** 錨點換算成 0～1 的比例 */
export function anchorRatio(anchor: string): { x: number; y: number } {
  return { x: ANCHOR_X[anchor[1]] ?? 0.5, y: ANCHOR_Y[anchor[0]] ?? 0.5 };
}

export interface FitArea {
  /** 畫面寬高 */
  width: number;
  height: number;
  /** 左右、上下邊距 */
  marginX?: number;
  marginY?: number;
  /** 外框、光暈、陰影往外擴的距離（要留在畫面內） */
  pad?: number;
}

/** 可用區域（扣掉邊距；邊距最多到畫面的一半） */
export function availableArea(area: FitArea): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const mx = Math.min(Math.max(area.marginX ?? 0, 0), area.width / 2 - 1);
  const my = Math.min(Math.max(area.marginY ?? 0, 0), area.height / 2 - 1);
  return {
    x: mx,
    y: my,
    width: Math.max(1, area.width - 2 * mx),
    height: Math.max(1, area.height - 2 * my),
  };
}

/**
 * 要縮小多少才放得下：回傳「最大的超出倍數」（≤ 1 表示放得下）。
 * 每個框都要同時放進可用區域、且加上 pad 後放進畫面。ignoreX／ignoreY：不檢查某個方向（例如捲動方向）。
 */
export function overflowRatio(
  boxes: readonly { w: number; h: number }[],
  area: FitArea,
  { ignoreX = false, ignoreY = false }: { ignoreX?: boolean; ignoreY?: boolean } = {},
): number {
  const av = availableArea(area);
  const pad = area.pad ?? 0;
  let need = 0;
  for (const b of boxes) {
    const nx = ignoreX ? 0 : Math.max(b.w / av.width, (b.w + 2 * pad) / area.width);
    const ny = ignoreY ? 0 : Math.max(b.h / av.height, (b.h + 2 * pad) / area.height);
    need = Math.max(need, nx, ny);
  }
  return need;
}

/**
 * 依超出倍數算出縮小後的字級：超出時縮成 (1 / need) × slack；不得小於 minSize（但也不放大）。
 * 回傳新字級與比例 k（新字級／原字級）。
 */
export function shrinkSize(
  size: number,
  need: number,
  { minSize = 4, slack = 0.985 }: { minSize?: number; slack?: number } = {},
): { size: number; k: number } {
  let k = need > 1 ? (1 / need) * slack : 1;
  let S = size * k;
  const min = Math.max(4, minSize);
  if (S < min) S = Math.min(size, min);
  k = S / size;
  return { size: S, k };
}

/**
 * 依錨點把一個框擺到畫面上（回傳左上角）。keepInside：pad 會超出畫面時往內推（框本身放得下時）。
 */
export function placeBox(
  box: { w: number; h: number },
  area: FitArea,
  anchor: string,
  {
    offsetX = 0,
    offsetY = 0,
    keepInside = true,
  }: {
    offsetX?: number;
    offsetY?: number;
    keepInside?: boolean;
  } = {},
): { x: number; y: number } {
  const av = availableArea(area);
  const r = anchorRatio(anchor);
  let x = av.x + (av.width - box.w) * r.x + offsetX;
  let y = av.y + (av.height - box.h) * r.y + offsetY;
  if (keepInside) {
    const pad = area.pad ?? 0;
    const W = area.width;
    const H = area.height;
    if (box.w + 2 * pad <= W) {
      if (x - pad < 0) x = pad;
      if (x + box.w + pad > W) x = W - pad - box.w;
    }
    if (box.h + 2 * pad <= H) {
      if (y - pad < 0) y = pad;
      if (y + box.h + pad > H) y = H - pad - box.h;
    }
  }
  return { x, y };
}
