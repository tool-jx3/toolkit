/**
 * 畫布的平移縮放（規格 F51～F54）：純計算，畫布元件與單元測試共用。
 * 畫面座標 ＝ 排版座標 × s ＋ (tx, ty)。
 */

export interface View {
  s: number;
  tx: number;
  ty: number;
}

export const ZOOM_MIN = 0.12;
export const ZOOM_MAX = 2.5;
/** 全覽的最大倍率 */
export const FIT_MAX = 1.15;
/** 滾輪一格、按鈕一下的倍率 */
export const WHEEL_STEP = 1.1;
export const BUTTON_STEP = 1.2;

export const clampZoom = (s: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, s));

/** 以畫面上的 (cx, cy) 為中心縮放 f 倍（那一點不動） */
export function zoomAt(v: View, f: number, cx: number, cy: number): View {
  const s = clampZoom(v.s * f);
  const k = s / v.s;
  return { s, tx: cx - (cx - v.tx) * k, ty: cy - (cy - v.ty) * k };
}

export function toCanvas(v: View, sx: number, sy: number): { x: number; y: number } {
  return { x: (sx - v.tx) / v.s, y: (sy - v.ty) / v.s };
}

export interface Bounds {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** 全覽：整張放進畫面（左右各留 24、上方 40、下方約 70），最大 115%，左右置中 */
export function fitView(b: Bounds, vw: number, vh: number): View {
  const w = Math.max(1, b.x1 - b.x0);
  const h = Math.max(1, b.y1 - b.y0 + 40);
  const s = Math.min(FIT_MAX, Math.max(ZOOM_MIN, Math.min((vw - 48) / w, (vh - 110) / h)));
  return { s, tx: (vw - w * s) / 2 - b.x0 * s, ty: 40 - b.y0 * s };
}

/** 讓排版座標 (x, y) 落在畫面正中央 */
export function centerView(v: View, x: number, y: number, vw: number, vh: number): View {
  return { s: v.s, tx: vw / 2 - x * v.s, ty: vh / 2 - y * v.s };
}

/** 一個範圍（排版座標）是不是不在畫面裡（離邊 margin 以內也算） */
export function isOffscreen(v: View, b: Bounds, vw: number, vh: number, margin = 10): boolean {
  const sx = b.x0 * v.s + v.tx;
  const sy = b.y0 * v.s + v.ty;
  return (
    sx < margin ||
    sy < margin ||
    sx + (b.x1 - b.x0) * v.s > vw - margin ||
    sy + (b.y1 - b.y0) * v.s > vh - margin
  );
}

/**
 * 滑鼠的滾輪（不是觸控板的雙指捲動）：以「行」「頁」計，或一次 ≥ 50 px 的純直向滾動（沒按 Shift）。
 * 滑鼠滾輪與 Ctrl＋滾輪縮放；觸控板的捲動平移（F51、F52）。
 */
export function isMouseWheel(e: {
  deltaMode: number;
  deltaX: number;
  deltaY: number;
  shiftKey: boolean;
}): boolean {
  return e.deltaMode !== 0 || (Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) >= 50 && !e.shiftKey);
}
