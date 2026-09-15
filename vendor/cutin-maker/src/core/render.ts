import { resolvePaint } from './color';
import { assertFontReady, getFont, type FontDef } from './fonts';
import { getLayer } from './layers';
import type { PoolId } from './offscreen';
import { deriveSeed, loopNoise, xorshift32 } from './random';
import { applyDecorations } from './text/deco';
import { canvasMeasurer, createGlyphRenderer, type TextDrawContext } from './text/draw';
import { layoutText, strokeAllowanceOf, type TextLayout } from './text/layout';
import type { DrawContext, MotionSpec, RenderParams } from './types';

export function textOf(params: RenderParams): string {
  return params.text.lines.join('');
}

export function computeLayout(params: RenderParams): { font: FontDef; layout: TextLayout } {
  const font = getFont(params.text.fontId);
  const measurer = canvasMeasurer(font, params.text.letterSpacing);
  const layout = layoutText(
    {
      lines: params.text.lines,
      boxW: params.canvas.w,
      boxH: params.canvas.h,
      lineHeight: params.text.lineHeight,
      scale: params.text.scale,
      strokeAllowance: strokeAllowanceOf(params.text.decorations as any, font.strokeScale),
    },
    measurer,
  );
  return { font, layout };
}

type MotionTransform = { dx: number; dy: number; scale: number; rot: number };

/** 全て周期1の関数。t=0 と t=1 で必ず一致すること */
export function motionAt(motion: MotionSpec, t: number, unit: number, seed: number): MotionTransform {
  const a = motion.amount;
  switch (motion.type) {
    case 'pulse':
      return { dx: 0, dy: 0, scale: 1 + a * Math.sin(2 * Math.PI * t), rot: 0 };
    case 'bounce':
      return { dx: 0, dy: -a * Math.abs(Math.sin(Math.PI * t)) * unit, scale: 1, rot: 0 };
    case 'shake':
      return {
        dx: a * unit * loopNoise(t, deriveSeed(seed, 'shakeX'), 3),
        dy: a * unit * loopNoise(t, deriveSeed(seed, 'shakeY'), 3),
        scale: 1,
        rot: 0,
      };
    case 'rotate':
      return { dx: 0, dy: 0, scale: 1, rot: 2 * Math.PI * t * Math.round(a) };
    default:
      return { dx: 0, dy: 0, scale: 1, rot: 0 };
  }
}

export interface RenderOptions {
  /** オフスクリーンのプール。サムネは 'thumb' を渡してプレビューと取り合わないようにする */
  pool?: PoolId;
}

/**
 * params + t から1フレームを描画する。DOM の canvas 以外に依存しない。
 * @param t 0<=t<1
 */
export function render(ctx: CanvasRenderingContext2D, params: RenderParams, t: number, opts?: RenderOptions): void {
  const pool: PoolId = opts?.pool ?? 'main';
  const { w, h } = params.canvas;
  const unit = Math.min(w, h);
  const center = { x: w / 2, y: h / 2 };

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  ctx.clearRect(0, 0, w, h);

  const bg = params.background;
  if (bg.kind !== 'transparent') {
    ctx.fillStyle = resolvePaint(bg, ctx, { x: 0, y: 0, w, h }, t);
    ctx.fillRect(0, 0, w, h);
  }

  const { font, layout } = computeLayout(params);
  assertFontReady(font, textOf(params));

  // 背景は塗りきったまま、中身だけ中心基準で縮める
  const content = params.contentScale ?? 1;
  ctx.save();
  if (content !== 1) {
    ctx.translate(center.x, center.y);
    ctx.scale(content, content);
    ctx.translate(-center.x, -center.y);
  }

  const drawLayers = (z: 'back' | 'front') => {
    params.layers.forEach((spec, i) => {
      if (spec.z !== z) return;
      const layer = getLayer(spec.type);
      if (!layer) return;
      // レイヤーごとに毎フレーム同じ系列を引き直す（フレーム間で乱数を進めるとループが破綻する）
      const c: DrawContext = {
        w,
        h,
        unit,
        center,
        textBox: layout.box,
        rng: xorshift32(deriveSeed(params.seed, `${spec.type}#${i}`)),
        params: spec.params,
      };
      ctx.save();
      layer.draw(ctx, t, c);
      ctx.restore();
    });
  };

  drawLayers('back');

  const m = motionAt(params.motion, t, unit, params.seed);
  ctx.save();
  ctx.translate(center.x + m.dx, center.y + m.dy);
  ctx.rotate(m.rot);
  ctx.scale(m.scale, m.scale);
  ctx.translate(-center.x, -center.y);

  const waveAmount = params.motion.type === 'wave' ? params.motion.amount : 0;
  const glyphs = createGlyphRenderer({
    font,
    layout,
    letterSpacing: params.text.letterSpacing,
    canvasW: w,
    canvasH: h,
    pool,
    transform: ctx.getTransform(),
    charOffset:
      params.text.perChar && waveAmount !== 0
        ? (i, n) => ({ x: 0, y: waveAmount * layout.fontSize * Math.sin(2 * Math.PI * (t - i / Math.max(1, n))) })
        : undefined,
  });

  const tc: TextDrawContext = {
    w,
    h,
    pool,
    unit,
    fontSize: layout.fontSize,
    box: layout.box,
    strokeScale: font.strokeScale,
    rng: xorshift32(deriveSeed(params.seed, 'text')),
  };
  applyDecorations(ctx, glyphs, params.text.decorations, t, tc);
  ctx.restore();

  drawLayers('front');
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
