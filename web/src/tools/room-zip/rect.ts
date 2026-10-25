/**
 * 讀入房間 ZIP 時的位置換算（規格 3.7.4，不依賴 React）。
 *
 * 工具內的位置是**整數格的中心座標**，匯出時才換成 CCFOLIA 的左上角（`centerToTopLeft`：先把中心取整、再減半寬、再取整，
 * 剛好 .5 往絕對值大的方向）。這個換算不是一對一：奇數寬的物件，左上角 x＝0 找不到任何整數中心換得回來
 * （中心 1 → −0.5 → −1；中心 2 → 0.5 → 1），CCFOLIA 的房間裡卻常見。所以讀入時：
 * - 找得到整數中心、匯出會得到同樣的左上角時，直接用它（本工具匯出的房間讀回來，模型和原本相同）；
 * - 找不到（或位置、大小不是整數）時，中心用精確值（可以有小數）、並記下原始的左上角與大小（`origin`）：
 *   位置、大小都沒改過就用原始值匯出，改過了就照工具的規則取整。
 */
import { centerToTopLeft, type GridRect, gridLength, roundGrid } from '@/ccfolia';

interface Axis {
  /** 模型裡的中心 */
  center: number;
  /** 模型裡的長度（整數、至少 1） */
  length: number;
  /** 匯出時不靠 origin 也能換回原本的左上角與長度 */
  exact: boolean;
}

/** 一個方向：左端 `left`、長度 `len` → 模型裡的中心與長度 */
function fitAxis(left: number, len: number): Axis {
  const length = gridLength(len);
  if (Number.isInteger(left) && len === length) {
    const half = length / 2;
    /* 偶數長度的中心是整數；奇數長度的中心在 ±0.5 之外各有一個候選，驗算哪一個匯出會回到 left */
    const candidates =
      length % 2 === 0 ? [left + half] : [left + (length - 1) / 2, left + (length + 1) / 2];
    for (const center of candidates) {
      if (roundGrid(roundGrid(center) - half) === left) return { center, length, exact: true };
    }
  }
  return { center: left + len / 2, length, exact: false };
}

export interface FittedRect {
  /** 模型裡的中心座標與大小 */
  model: GridRect;
  /** 模型換不回原始值時的原始左上角與大小 */
  origin?: GridRect;
}

/** CCFOLIA 的左上角＋大小 → 工具的中心＋大小（3.7.4） */
export function fitRect(raw: GridRect): FittedRect {
  const ax = fitAxis(raw.x, raw.width);
  const ay = fitAxis(raw.y, raw.height);
  const model = { x: ax.center, y: ay.center, width: ax.length, height: ay.length };
  return ax.exact && ay.exact ? { model } : { model, origin: { ...raw } };
}

/**
 * 工具的中心＋大小 → CCFOLIA 的左上角＋大小。有 origin 時，位置與大小和讀入時一樣的方向用原始值（沒改過），
 * 其餘照 `centerToTopLeft`。
 */
export function exportRect(model: GridRect, origin?: GridRect): GridRect {
  const r = centerToTopLeft(model);
  if (!origin) return r;
  const ax = fitAxis(origin.x, origin.width);
  const ay = fitAxis(origin.y, origin.height);
  return {
    x: model.x === ax.center && model.width === ax.length ? origin.x : r.x,
    y: model.y === ay.center && model.height === ay.length ? origin.y : r.y,
    width: model.width === ax.length ? origin.width : r.width,
    height: model.height === ay.length ? origin.height : r.height,
  };
}

export const sameRect = (a: GridRect, b: GridRect): boolean =>
  a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
