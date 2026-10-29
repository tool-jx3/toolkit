/**
 * 量字寬（堆疊、刻度、匯出的省略號用）：瀏覽器用 canvas 的 measureText（有快取）；
 * 沒有 canvas 的環境（單元測試）用估計：中日韓全形字 1 字高、其他約 0.56 字高。
 */

export const UI_FAMILY =
  "'Noto Sans TC', 'PingFang TC', 'Heiti TC', 'Microsoft JhengHei', 'Noto Sans CJK TC', system-ui, sans-serif";

export type TextMeasure = (text: string) => number;

/** 估計的字寬（px） */
export function estimateWidth(text: string, size: number): number {
  let w = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x2e80 || (c >= 0xff00 && c <= 0xffef)) w += size;
    else if (ch === ' ') w += size * 0.3;
    else w += size * 0.56;
  }
  return w;
}

let shared: CanvasRenderingContext2D | null | undefined;
function ctx(): CanvasRenderingContext2D | null {
  if (shared !== undefined) return shared;
  try {
    shared =
      typeof document === 'undefined'
        ? null
        : (document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D | null);
  } catch {
    shared = null;
  }
  return shared;
}

/** 某個字型（大小、粗細）的量字函式；同一個字串只量一次 */
export function createMeasure(size: number, weight = 400, family = UI_FAMILY): TextMeasure {
  const cache = new Map<string, number>();
  const font = `${weight} ${size}px ${family}`;
  return (text: string) => {
    const hit = cache.get(text);
    if (hit !== undefined) return hit;
    const c = ctx();
    let w: number;
    if (c) {
      c.font = font;
      w = c.measureText(text).width;
      if (!Number.isFinite(w) || (w === 0 && text)) w = estimateWidth(text, size);
    } else w = estimateWidth(text, size);
    if (cache.size > 5000) cache.clear();
    cache.set(text, w);
    return w;
  };
}

/** 放不下時截短、加「…」 */
export function ellipsize(text: string, max: number, measure: TextMeasure): string {
  if (measure(text) <= max) return text;
  const chars = [...text];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${chars.slice(0, mid).join('')}…`) <= max) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${chars.slice(0, lo).join('')}…` : '';
}
