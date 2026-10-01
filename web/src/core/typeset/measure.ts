/**
 * 字形量測：字寬與墨跡範圍（canvas measureText），同一個字型字串共用快取。
 * 移植自 text-fx（本專案原創，MIT）的 typeset.js。
 */
import { hasCjk } from './chars';

/** 一個字的量測結果（px，以基線、筆位為原點） */
export interface GlyphMetrics {
  /** 前進寬度 */
  w: number;
  /** 墨跡左緣在筆位左側的距離 */
  l: number;
  /** 墨跡右緣在筆位右側的距離 */
  r: number;
  /** 墨跡頂端在基線上方的距離 */
  a: number;
  /** 墨跡底端在基線下方的距離 */
  d: number;
}

/** 量測函式：(canvas 的 font 字串, 字) → 量測結果。測試時可換成假的。 */
export type MeasureFn = (font: string, ch: string) => GlyphMetrics;

let sharedCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

function measureContext(): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!sharedCtx) {
    const ctx =
      typeof document !== 'undefined'
        ? document.createElement('canvas').getContext('2d')
        : typeof OffscreenCanvas !== 'undefined'
          ? new OffscreenCanvas(8, 8).getContext('2d')
          : null;
    if (!ctx) throw new Error('無法建立量測用的畫布');
    sharedCtx = ctx;
  }
  return sharedCtx;
}

/** 用瀏覽器的 canvas 量測 */
export const canvasMeasure: MeasureFn = (font, ch) => {
  const x = measureContext();
  x.font = font;
  const t = x.measureText(ch);
  return {
    w: t.width,
    l: t.actualBoundingBoxLeft || 0,
    r: t.actualBoundingBoxRight || t.width,
    a: t.actualBoundingBoxAscent || 0,
    d: t.actualBoundingBoxDescent || 0,
  };
};

/**
 * 同一個字型字串（同字級）的量測快取。
 * `central`：字身中心在基線上方的距離——有中日韓字時用「永」的墨跡中心（接近表意字框中心），
 * 純西文用大寫 H 的中心；量不到時用 0.38 倍字級。
 */
export class Meter {
  readonly css: string;
  readonly size: number;
  readonly central: number;
  private readonly cache = new Map<string, GlyphMetrics>();
  private readonly measure: MeasureFn;

  constructor(css: string, size: number, sample = '', measure: MeasureFn = canvasMeasure) {
    this.css = css;
    this.size = size;
    this.measure = measure;
    const m = this.get(hasCjk(sample) ? '永' : 'H');
    const central = (m.a - m.d) / 2;
    this.central = central > 0 ? central : size * 0.38;
  }

  get(ch: string): GlyphMetrics {
    let r = this.cache.get(ch);
    if (!r) {
      r = this.measure(this.css, ch);
      this.cache.set(ch, r);
    }
    return r;
  }
}
