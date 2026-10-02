/**
 * 文字形狀：整段文字（很多字）當成一個形狀來描、填、加工。
 * 由 core/typeset 的排版結果產生；每個字的 (x, y) 是字身中心（畫面座標）。
 */
import type { TypesetResult } from '../typeset';
import type { Ctx2D } from './layers';
import type { PaintBox } from './paint';

export interface ShapeGlyph {
  ch: string;
  /** 字身中心 */
  x: number;
  y: number;
  /** 前進寬度（px） */
  adv: number;
  /** 旋轉（弧度；直書轉 90° 的英數等） */
  rot?: number;
  /** 水平縮放（以字身中心） */
  sx?: number;
}

export interface TextShape {
  glyphs: readonly ShapeGlyph[];
  /** canvas 的 font 字串 */
  font: string;
  /** 字身中心在基線上方的距離 */
  central: number;
  /** 範圍（整段文字的外接框，不是墨跡）：漸層、彩虹、斜紋都以它為準 */
  bounds: PaintBox;
  /** 字級（px） */
  size: number;
}

/**
 * 由排版結果產生形狀：origin 是區塊左上角在畫面上的位置。
 * 只收主文字（副文字另外做一個形狀）。
 */
export function shapeFromTypeset(r: TypesetResult, origin: { x: number; y: number }): TextShape {
  const sx = r.block.scaleX ?? 1;
  return {
    glyphs: r.block.glyphs
      .filter((g) => !g.space)
      .map((g) => ({
        ch: g.ch,
        x: origin.x + g.x,
        y: origin.y + g.y,
        adv: g.adv,
        rot: g.rot0 || 0,
        sx,
      })),
    font: r.mainCss,
    central: r.mainMeter.central,
    bounds: {
      x: origin.x + r.block.mainBox.x,
      y: origin.y + r.block.mainBox.y,
      w: r.block.mainBox.w,
      h: r.block.mainBox.h,
    },
    size: r.size,
  };
}

/** 每個字的額外位移（例如逐字波浪） */
export type GlyphOffset = (index: number, glyph: ShapeGlyph) => { dx: number; dy: number };

/**
 * 描出整段文字：fill（塗滿字形）或 stroke（沿字形描線，線寬用目前的 lineWidth）。
 * 呼叫前設好 fillStyle／strokeStyle；dx、dy 是整體位移（陰影、擠出的複本）。
 */
export function traceShape(
  ctx: Ctx2D,
  shape: TextShape,
  mode: 'fill' | 'stroke',
  { dx = 0, dy = 0, offset }: { dx?: number; dy?: number; offset?: GlyphOffset } = {},
): void {
  ctx.font = shape.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.miterLimit = 2;
  shape.glyphs.forEach((g, i) => {
    const o = offset ? offset(i, g) : null;
    ctx.save();
    ctx.translate(g.x + dx + (o?.dx ?? 0), g.y + dy + (o?.dy ?? 0));
    if (g.rot) ctx.rotate(g.rot);
    if (g.sx && g.sx !== 1) ctx.scale(g.sx, 1);
    if (mode === 'fill') ctx.fillText(g.ch, -g.adv / 2, shape.central);
    else ctx.strokeText(g.ch, -g.adv / 2, shape.central);
    ctx.restore();
  });
}

/**
 * 剪影：字形往外擴 spread px（以圓角描線）後塗滿。外框、陰影、擠出、挖空都用它。
 * 呼叫前設好 fillStyle 與 strokeStyle（同一個顏色）。
 */
export function traceSilhouette(
  ctx: Ctx2D,
  shape: TextShape,
  spread: number,
  options: { dx?: number; dy?: number; offset?: GlyphOffset } = {},
): void {
  if (spread > 0) {
    ctx.lineWidth = spread * 2;
    traceShape(ctx, shape, 'stroke', options);
  }
  traceShape(ctx, shape, 'fill', options);
}

/** 文字半徑＝範圍（外接框）對角線的一半；特效（放射線、圓環）從這裡往外 */
export function shapeRadius(shape: Pick<TextShape, 'bounds'>): number {
  return Math.hypot(shape.bounds.w, shape.bounds.h) / 2;
}
