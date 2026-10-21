/**
 * 量字（lyric-fx 規格 3.5）：每個字（code point）的前進寬度，依 canvas 的 font 字串快取。
 * - createCanvasMeasure()：瀏覽器用畫布量（OffscreenCanvas，沒有時用 <canvas>）；字型載好之後要建一個新的（舊的快取作廢）。
 * - fixedMeasure(fn)：單元測試用固定寬度。
 */
import type { LyricMeasureEnv } from './types';

export function createCanvasMeasure(): LyricMeasureEnv {
  let ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;
  const cache = new Map<string, Map<string, number>>();
  let current = '';
  const context = () => {
    if (ctx) return ctx;
    if (typeof OffscreenCanvas !== 'undefined') ctx = new OffscreenCanvas(8, 8).getContext('2d');
    if (!ctx && typeof document !== 'undefined')
      ctx = document.createElement('canvas').getContext('2d');
    return ctx;
  };
  return {
    advance(ch, font) {
      let m = cache.get(font);
      if (!m) {
        m = new Map();
        cache.set(font, m);
      }
      const hit = m.get(ch);
      if (hit !== undefined) return hit;
      const g = context();
      let w = 0;
      if (g) {
        if (current !== font) {
          g.font = font;
          current = font;
        }
        w = g.measureText(ch).width;
      }
      m.set(ch, w);
      return w;
    },
  };
}

/** 固定寬度（測試用）：fn(字, font) → 寬度 */
export function fixedMeasure(fn: (ch: string, font: string) => number): LyricMeasureEnv {
  return { advance: fn };
}

/** 測試用的簡單寬度：中日韓字＝字級、其他＝0.55 × 字級（從 font 字串讀出字級） */
export const roughMeasure = (): LyricMeasureEnv =>
  fixedMeasure((ch, font) => {
    const size = Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? '16');
    const c = ch.codePointAt(0) ?? 0;
    return c >= 0x2e80 ? size : size * 0.55;
  });
