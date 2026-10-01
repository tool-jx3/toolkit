/**
 * 逐字預先畫好的小畫布（sprite），外框與光暈分層：
 *
 *   halo  ─ 光暈（只在字形外側，字形本體挖空）
 *   body  ─ 陰影（字形本體挖空）＋外側外框＋外框＋塗色，在同一張裡疊好
 *   flash ─ 字形剪影（塗色＋外框範圍）塗白，給「閃白」效果用（用到時才畫）
 *
 * 淡入淡出時整張 body 一起變透明，所以半透明的字裡不會透出外框或陰影。
 * 移植自 text-fx（本專案原創，MIT）的 glyphs.js；漸層改成任意色標（舊的 2～3 色＝平均分布的色標）。
 */
import type { GlyphMetrics } from './measure';

export type SpriteCanvas = HTMLCanvasElement | OffscreenCanvas;
type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** 一律優先用 DOM canvas（各瀏覽器都能 drawImage）；沒有 DOM 時用 OffscreenCanvas */
export function createSpriteCanvas(w: number, h: number): SpriteCanvas {
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    return c;
  }
  return new OffscreenCanvas(W, H);
}

const ctx2d = (c: SpriteCanvas): Ctx => {
  const x = c.getContext('2d') as Ctx | null;
  if (!x) throw new Error('無法建立畫布');
  return x;
};

export interface GradientStop {
  /** 0～1 */
  offset: number;
  color: string;
}

export interface GlyphFill {
  type: 'solid' | 'gradient';
  /** 單色（或漸層色標不足兩個時的備用色） */
  color: string;
  /** 漸層色標 */
  stops: readonly GradientStop[];
  /** 塗色不透明度 0～1（0＋外框＝空心字） */
  opacity: number;
}

/** 已換算成 px 的樣式 */
export interface GlyphStyle {
  fill: GlyphFill;
  /** 外框（w＝單側粗細） */
  stroke: { w: number; color: string } | null;
  /** 外側外框（在外框更外面再描一圈） */
  outer: { w: number; color: string } | null;
  /** 陰影（color 可含透明度） */
  shadow: { color: string; blur: number; x: number; y: number } | null;
  /** 光暈 */
  glow: { color: string; spread: number } | null;
}

/**
 * 漸層範圍（相對於筆位與基線）：
 * - v：垂直，從 y0 到 y1（例如那一行的墨跡上下緣）；
 * - h、d：從 (x0, y0) 到 (x1, y1)（例如整段文字的左右、左上到右下）。
 */
export type GlyphGradient =
  | { kind: 'v'; y0: number; y1: number }
  | { kind: 'h' | 'd'; x0: number; y0: number; x1: number; y1: number };

export interface GlyphArt {
  body: SpriteCanvas;
  halo: SpriteCanvas | null;
  w: number;
  h: number;
  /** 樞紐點（字身中心）在 sprite 內的位置 */
  px: number;
  py: number;
  /** 閃白用的白色剪影（第一次呼叫時才畫） */
  flash(): SpriteCanvas;
}

/** 陰影技巧：把形狀畫在畫布外，只留下陰影 */
const FAR = 4096;

function silhouette(x: Ctx, ch: string, ox: number, oy: number, strokeTotal: number) {
  x.fillText(ch, ox, oy);
  if (strokeTotal > 0) {
    x.lineWidth = strokeTotal * 2;
    x.strokeText(ch, ox, oy);
  }
}

function fillStyleFor(
  x: Ctx,
  fill: GlyphFill,
  grad: GlyphGradient | null,
  ox: number,
  oy: number,
): string | CanvasGradient {
  if (fill.type !== 'gradient' || !grad) return fill.color;
  const stops = fill.stops.filter((s) => !!s.color);
  if (stops.length < 2) return stops[0]?.color || fill.color;
  const g =
    grad.kind === 'v'
      ? x.createLinearGradient(0, oy + grad.y0, 0, oy + grad.y1)
      : x.createLinearGradient(ox + grad.x0, oy + grad.y0, ox + grad.x1, oy + grad.y1);
  for (const s of [...stops].sort((a, b) => a.offset - b.offset))
    g.addColorStop(Math.min(1, Math.max(0, s.offset)), s.color);
  return g;
}

/** 外框、陰影、光暈往外擴的距離（決定 sprite 要留多少邊） */
export function glyphPadding(style: GlyphStyle): number {
  const strokeTotal = (style.stroke?.w ?? 0) + (style.outer?.w ?? 0);
  const shadowExt = style.shadow
    ? style.shadow.blur * 1.5 + Math.max(Math.abs(style.shadow.x), Math.abs(style.shadow.y))
    : 0;
  const haloExt = style.glow ? style.glow.spread * 1.7 : 0;
  return Math.ceil(strokeTotal + Math.max(shadowExt, haloExt) + 3);
}

/**
 * 畫一個字的 sprite。空白回傳 null。
 * @param css canvas 的 font 字串
 * @param m 量測結果；adv：前進寬度；central：字身中心在基線上方的距離
 * @param style 已換算成 px 的樣式；grad：漸層範圍（相對筆位與基線）
 * @param italic 斜體時多留傾斜的空間
 */
export function paintGlyph(
  ch: string,
  css: string,
  m: GlyphMetrics,
  adv: number,
  central: number,
  style: GlyphStyle,
  grad: GlyphGradient | null,
  italic = false,
): GlyphArt | null {
  if (!ch.trim()) return null;
  const sw = style.stroke ? style.stroke.w : 0;
  const ow = style.outer ? style.outer.w : 0;
  const strokeTotal = sw + ow;
  const pad = glyphPadding(style);
  const slant = italic ? Math.ceil((m.a + m.d) * 0.25) : 0;
  const left = Math.ceil(Math.max(m.l, 0)) + pad + slant;
  const top = Math.ceil(Math.max(m.a, 0)) + pad;
  const w = left + Math.ceil(Math.max(m.r, adv * 0.5)) + pad + slant;
  const h = top + Math.ceil(Math.max(m.d, 0)) + pad;
  const ox = left;
  const oy = top;

  const prep = (x: Ctx) => {
    x.font = css;
    x.textBaseline = 'alphabetic';
    x.textAlign = 'left';
    x.lineJoin = 'round';
    x.lineCap = 'round';
    x.miterLimit = 2;
  };

  const body = createSpriteCanvas(w, h);
  const b = ctx2d(body);
  prep(b);
  if (style.shadow) {
    b.save();
    b.shadowColor = style.shadow.color;
    b.shadowBlur = style.shadow.blur;
    b.shadowOffsetX = style.shadow.x + FAR;
    b.shadowOffsetY = style.shadow.y;
    b.fillStyle = '#000';
    b.strokeStyle = '#000';
    silhouette(b, ch, ox - FAR, oy, strokeTotal);
    b.restore();
    b.globalCompositeOperation = 'destination-out';
    b.fillStyle = '#000';
    b.strokeStyle = '#000';
    silhouette(b, ch, ox, oy, strokeTotal);
    b.globalCompositeOperation = 'source-over';
  }
  if (style.outer) {
    b.lineWidth = strokeTotal * 2;
    b.strokeStyle = style.outer.color;
    b.strokeText(ch, ox, oy);
  }
  if (style.stroke) {
    b.lineWidth = sw * 2;
    b.strokeStyle = style.stroke.color;
    b.strokeText(ch, ox, oy);
  }
  const fillA = style.fill.opacity;
  if (fillA < 1 && strokeTotal > 0) {
    /* 塗色半透明時，先把字形內側的外框挖掉：透明的地方就是透明，不是外框色 */
    b.globalCompositeOperation = 'destination-out';
    b.fillStyle = '#000';
    b.fillText(ch, ox, oy);
    b.globalCompositeOperation = 'source-over';
  }
  if (fillA > 0) {
    b.globalAlpha = fillA;
    b.fillStyle = fillStyleFor(b, style.fill, grad, ox, oy);
    b.fillText(ch, ox, oy);
    b.globalAlpha = 1;
  }

  let halo: SpriteCanvas | null = null;
  if (style.glow) {
    halo = createSpriteCanvas(w, h);
    const g = ctx2d(halo);
    prep(g);
    g.shadowColor = style.glow.color;
    g.shadowBlur = style.glow.spread;
    g.shadowOffsetX = FAR;
    g.fillStyle = '#000';
    g.strokeStyle = '#000';
    silhouette(g, ch, ox - FAR, oy, strokeTotal);
    silhouette(g, ch, ox - FAR, oy, strokeTotal); // 疊兩次讓強度 1 就有明顯的光
    g.shadowColor = 'transparent';
    g.globalCompositeOperation = 'destination-out';
    silhouette(g, ch, ox, oy, strokeTotal);
  }

  let flash: SpriteCanvas | null = null;
  return {
    body,
    halo,
    w,
    h,
    px: ox + adv / 2,
    py: oy - central,
    flash() {
      if (!flash) {
        flash = createSpriteCanvas(w, h);
        const x = ctx2d(flash);
        prep(x);
        x.fillStyle = '#fff';
        x.strokeStyle = '#fff';
        silhouette(x, ch, ox, oy, strokeTotal);
      }
      return flash;
    },
  };
}
