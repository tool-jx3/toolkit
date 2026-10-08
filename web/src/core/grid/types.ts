/**
 * core/grid 的共用型別。
 *
 * 座標一律是畫面座標：左上角為原點、x 往右、y 往下（與 canvas 相同）。
 */

export interface Point {
  x: number;
  y: number;
}

/** 一格的位址（方格：欄、列；六角格依座標系統而定，見 hex.ts） */
export interface Cell {
  col: number;
  row: number;
}

/** 一段直線（格線） */
export interface Segment {
  from: Point;
  to: Point;
}

/** 世界座標的可見範圍（地圖編輯器的視窗） */
export interface View {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * 吸附點：交點（方格的格子點、六角格的頂點）、格子中心、邊的中點。
 * 呼叫端依自己開啟的吸附種類篩選。
 */
export interface SnapPoint extends Point {
  type: 'intersection' | 'center' | 'midpoint';
}

/** 拖曳位移吸附成整格：移了幾格，以及那幾格的實際位移（px） */
export interface SnapDelta {
  colDelta: number;
  rowDelta: number;
  dx: number;
  dy: number;
}

/**
 * 六角格的方向：
 * - `flat`：平頂（上下是平的邊、左右是尖角；舊版的「橫向」）
 * - `pointy`：尖頂（上下是尖角；舊版的「直向」）。尖頂的所有幾何都是把平頂的結果 x、y 對調（沿對角線翻轉）。
 */
export type HexOrientation = 'flat' | 'pointy';

/**
 * 畫網格圖的畫布上限：超過時瀏覽器畫不出來（畫布變成空白）。Chrome 的上限是單邊 32767 px、
 * 總面積 16384 × 16384（約 2.68 億像素）；舊版的欄位範圍內（例如量尺範圍 20、格子 200 px 的 8200 × 8200）都在上限內。
 */
export const GRID_CANVAS_LIMIT = { maxSide: 32767, maxPixels: 16384 * 16384 } as const;

/** 畫布尺寸是否超過上限（寬或高為 0 也算畫不出來） */
export function exceedsCanvasLimit(width: number, height: number): boolean {
  return (
    !(width >= 1 && height >= 1) ||
    width > GRID_CANVAS_LIMIT.maxSide ||
    height > GRID_CANVAS_LIMIT.maxSide ||
    width * height > GRID_CANVAS_LIMIT.maxPixels
  );
}
