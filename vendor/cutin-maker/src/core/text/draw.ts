import type { Box, Vec2 } from '../types';
import { fontString, type FontDef } from '../fonts';
import { scratch, scratchCtx, type PoolId } from '../offscreen';
import type { TextLayout, TextMeasurer } from './layout';

export type Paint = string | CanvasGradient | CanvasPattern;

/** 文字形状の描画を抽象化。全デコレータはこれ経由で描く */
export interface GlyphRenderer {
  fill(ctx: CanvasRenderingContext2D, paint: Paint): void;
  stroke(ctx: CanvasRenderingContext2D, paint: Paint, lineWidth: number): void;
  /** 文字形状を白1色で描いたオフスクリーンを返す。バッファは使い回す */
  mask(expandPx?: number): CanvasImageSource;
  box: Box;
}

export interface TextDrawContext {
  w: number;
  h: number;
  /** オフスクリーンの取り合いを避けるためのプール指定 */
  pool: PoolId;
  unit: number;
  fontSize: number;
  /** テキストの外接矩形（グラデの基準に使う） */
  box: Box;
  /** 書体ごとの縁取り倍率 */
  strokeScale: number;
  rng: () => number;
}

type Glyph = { ch: string; x: number; y: number };

let measureCanvas: HTMLCanvasElement | null = null;
function measureCtx(): CanvasRenderingContext2D {
  if (!measureCanvas) {
    measureCanvas = document.createElement('canvas');
    measureCanvas.width = 8;
    measureCanvas.height = 8;
  }
  return measureCanvas.getContext('2d')!;
}

/**
 * Canvas 実測の TextMeasurer。
 * letterSpacing は ctx.letterSpacing に頼らず手動配置で扱うため、ここでも手で足す。
 */
export function canvasMeasurer(font: FontDef, letterSpacingEm: number): TextMeasurer {
  const ctx = measureCtx();
  return {
    measure(line, size) {
      if (!line) return 0;
      ctx.font = fontString(font, size);
      const chars = Array.from(line);
      let w = 0;
      for (const ch of chars) w += ctx.measureText(ch).width;
      w += letterSpacingEm * size * Math.max(0, chars.length - 1);
      return w;
    },
  };
}

export interface GlyphRendererOptions {
  font: FontDef;
  layout: TextLayout;
  letterSpacing: number;
  /** perChar アニメ用。文字インデックスからオフセットを返す */
  charOffset?: (index: number, total: number) => Vec2;
  canvasW: number;
  canvasH: number;
  /**
   * 本体キャンバスに掛かっている変形。mask() のオフスクリーンにも同じ変形を掛けないと
   * モーション適用時にシャドウ・グローがずれる。
   */
  transform?: DOMMatrix;
  pool: PoolId;
}

/**
 * 1文字ずつ手動配置する。ctx.letterSpacing は Safari 対応が不確実なため既定では使わない。
 */
export function createGlyphRenderer(opts: GlyphRendererOptions): GlyphRenderer {
  const { font, layout, letterSpacing } = opts;
  const ctx = measureCtx();
  const size = layout.fontSize;
  ctx.font = fontString(font, size);

  const glyphs: Glyph[] = [];
  layout.lines.forEach((line, li) => {
    const chars = Array.from(line);
    const y = layout.lineCenters[li];
    let x = opts.canvasW / 2 - layout.lineWidths[li] / 2;
    for (const ch of chars) {
      glyphs.push({ ch, x, y });
      x += ctx.measureText(ch).width + letterSpacing * size;
    }
  });

  const total = glyphs.length;
  const offsetOf = (i: number): Vec2 => (opts.charOffset ? opts.charOffset(i, total) : { x: 0, y: 0 });

  const applyFont = (c: CanvasRenderingContext2D) => {
    c.font = fontString(font, size);
    c.textBaseline = 'middle';
    c.textAlign = 'left';
  };

  const renderer: GlyphRenderer = {
    box: layout.box,
    fill(c, paint) {
      c.save();
      applyFont(c);
      c.fillStyle = paint;
      glyphs.forEach((g, i) => {
        const o = offsetOf(i);
        c.fillText(g.ch, g.x + o.x, g.y + o.y);
      });
      c.restore();
    },
    stroke(c, paint, lineWidth) {
      if (lineWidth <= 0) return;
      c.save();
      applyFont(c);
      c.strokeStyle = paint;
      c.lineWidth = lineWidth;
      // miter は鋭角で棘が出るので必ず round
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.miterLimit = 2;
      glyphs.forEach((g, i) => {
        const o = offsetOf(i);
        c.strokeText(g.ch, g.x + o.x, g.y + o.y);
      });
      c.restore();
    },
    mask(expandPx = 0) {
      const m = scratchCtx(opts.pool, 0, opts.canvasW, opts.canvasH);
      if (opts.transform) m.setTransform(opts.transform);
      if (expandPx > 0) renderer.stroke(m, '#ffffff', expandPx * 2);
      renderer.fill(m, '#ffffff');
      return scratch(opts.pool, 0, opts.canvasW, opts.canvasH);
    },
  };
  return renderer;
}

/** オフスクリーンを合成するときは、本体の変形を一旦外してデバイス座標で貼る */
export function withIdentity(ctx: CanvasRenderingContext2D, fn: () => void): void {
  const saved = ctx.getTransform();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  try {
    fn();
  } finally {
    ctx.setTransform(saved);
  }
}

/**
 * マスク合成。fillStyle だけでは表現できない塗り（パターン等）の汎用手段。
 * 1) A に文字を白で描く 2) B に塗りを全面描画 3) B を destination-in で切り抜く 4) 合成
 */
export function paintThroughMask(
  ctx: CanvasRenderingContext2D,
  glyphs: GlyphRenderer,
  c: TextDrawContext,
  paintFull: (b: CanvasRenderingContext2D) => void,
): void {
  const mask = glyphs.mask();
  const b = scratchCtx(c.pool, 1, c.w, c.h);
  paintFull(b);
  b.globalCompositeOperation = 'destination-in';
  b.drawImage(mask, 0, 0);
  b.globalCompositeOperation = 'source-over';
  withIdentity(ctx, () => ctx.drawImage(scratch(c.pool, 1, c.w, c.h), 0, 0));
}
