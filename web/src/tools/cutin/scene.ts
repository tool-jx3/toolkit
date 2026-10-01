/**
 * 一個循環的畫面（預覽、縮圖、匯出共用）：
 * 1. 自動字級（規格 3.3）：文字塊（最寬一行的字寬＋字距 × 行數 × 字級 × 行距）四周加上所有外框層的厚度，
 *    在畫布寬高各 92% 內取最大字級（下限 8 px、上限長邊 × 1.2），再乘上文字縮放；
 *    每行水平置中、整塊以畫布中心垂直置中，空行也佔一行。
 * 2. 畫的順序：背景（鋪滿）→ 內容縮放 →（文字後面的特效）→ 文字加工（套文字動態）→（文字前面的特效）。
 */
import { ensureFont } from '@/core/fonts';
import { drawLoopFx, LOOP_FX_ORDER, type LoopFxEnv } from '@/core/fxlayers';
import {
  createLayerPool,
  fillBox,
  type LayerPool,
  type Paint,
  renderTextFx,
  shapeFromTypeset,
  type TextShape,
} from '@/core/textfx';
import type { Ctx2D } from '@/core/timeline';
import {
  canvasFont,
  fontStack,
  type MeasureFn,
  type TypesetResult,
  typeset,
  typesetToFill,
} from '@/core/typeset';
import { outlineSumPerSize, paletteOf, styleLayers } from './looks';
import {
  type CutinSettings,
  fontOf,
  NO_TUNING,
  TARGET_TUNING,
  type TargetTuning,
  tunedLineCount,
  tunedMotionAmount,
} from './model';
import { motionAt } from './motion';

/** 淡彩虹背景（約一半飽和度、偏亮） */
export const BACKGROUND_RAINBOW: Paint = { kind: 'rainbow', saturation: 55, lightness: 78 };

export interface SceneOptions {
  /** 套用依用途的自動調整（F09）；選項縮圖不套用 */
  tuned?: boolean;
  /** 量測函式（測試用） */
  measure?: MeasureFn;
  pool?: LayerPool;
}

export interface TextBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TextLayout {
  /** 最後的字級（已乘文字縮放） */
  size: number;
  /** 自動字級（乘文字縮放前） */
  autoSize: number;
  lines: number;
  /** 文字塊（不含外框）的範圍，以畫布中心置中 */
  box: TextBox;
  shape: TextShape;
  result: TypesetResult;
}

export interface CutinScene {
  width: number;
  height: number;
  layout: TextLayout;
  tuning: TargetTuning;
  /** 畫 t（循環進度 0～1）的畫面；畫布已清空 */
  draw(ctx: Ctx2D, t: number): void;
}

/** 字型字串（主字型＋通用字族；找不到的字退回系統字型） */
export function fontFor(s: Pick<CutinSettings, 'font' | 'text'>): (px: number) => string {
  const f = fontOf(s.font);
  const stack = fontStack({ family: f.font.family, styleClass: f.data.styleClass }, s.text);
  return (px) => canvasFont(stack, f.font.weight, px);
}

/** 自動字級與置中（規格 3.3） */
export function layoutText(
  s: Pick<
    CutinSettings,
    'text' | 'font' | 'style' | 'leading' | 'tracking' | 'textScale' | 'width' | 'height'
  >,
  outlineScale: number,
  measure?: MeasureFn,
): TextLayout {
  const text = s.text.replace(/\r\n?/g, '\n');
  const W = s.width;
  const H = s.height;
  const input = {
    main: text,
    mainFont: fontFor(s),
    leading: s.leading,
    tracking: s.tracking,
    segment: 'grapheme' as const,
    ...(measure ? { measure } : {}),
  };
  const pad = outlineSumPerSize(s.style, outlineScale);
  const fill = typesetToFill(input, {
    width: W,
    height: H,
    padPerSize: pad,
    boxOf: (r) => ({ w: r.block.w, h: Math.max(1, r.lines.main.length) * r.size * s.leading }),
  });
  const size = Math.max(0.5, fill.size * s.textScale);
  const r = s.textScale === 1 ? fill : typeset({ ...input, size, fixedLines: fill.lines });
  const lines = Math.max(1, r.lines.main.length);
  const pitch = size * s.leading;
  const w = r.block.w;
  const h = lines * pitch;
  /* 行的中線：第一行在區塊座標 size ÷ 2，往下每行 pitch；整塊以畫布中心置中 */
  const origin = { x: W / 2 - w / 2, y: H / 2 - ((lines - 1) * pitch) / 2 - size / 2 };
  const shape = shapeFromTypeset(r, origin);
  const box = { x: W / 2 - w / 2, y: H / 2 - h / 2, w, h };
  return {
    size,
    autoSize: fill.size,
    lines,
    box,
    shape: { ...shape, bounds: box },
    result: r,
  };
}

/** 文字半徑＝文字塊外接框對角線的一半（特效從這裡往外） */
export const textRadius = (box: TextBox): number => Math.hypot(box.w, box.h) / 2;

const sharedPool = createLayerPool();

/** 建立一個循環的畫面 */
export function buildScene(s: CutinSettings, opts: SceneOptions = {}): CutinScene {
  const W = s.width;
  const H = s.height;
  const tuning = opts.tuned ? TARGET_TUNING[s.target] : NO_TUNING;
  const font = fontOf(s.font);
  const outlineScale = font.data.outline * tuning.outline;
  const layout = layoutText(s, outlineScale, opts.measure);
  const palette = paletteOf(s.palette);
  const pool = opts.pool ?? sharedPool;
  const env: LoopFxEnv = { width: W, height: H, textRadius: textRadius(layout.box), seed: s.seed };
  const fx = s.fx === 'none' ? null : s.fx;
  const fxOptions =
    fx === 'speedLines'
      ? { ...s.fxParams, count: tunedLineCount(Number(s.fxParams.count ?? 48), tuning) }
      : s.fxParams;
  const motion = {
    motion: s.motion,
    amount: tunedMotionAmount(s.motion, s.motionAmount, tuning),
    width: W,
    height: H,
    fontSize: layout.size,
    glyphCount: layout.shape.glyphs.length,
    seed: s.seed,
  };
  const background: Paint | null =
    s.background === 'solid'
      ? { kind: 'solid', color: s.bgColor }
      : s.background === 'rainbow'
        ? BACKGROUND_RAINBOW
        : s.background === 'palette'
          ? palette.fill
          : null;
  const k = s.contentScale;
  const blank = layout.shape.glyphs.length === 0;
  return {
    width: W,
    height: H,
    layout,
    tuning,
    draw(ctx, t) {
      if (background) fillBox(ctx, background, { x: 0, y: 0, w: W, h: H }, t);
      ctx.save();
      if (k !== 1) {
        ctx.translate(W / 2, H / 2);
        ctx.scale(k, k);
        ctx.translate(-W / 2, -H / 2);
      }
      if (fx && LOOP_FX_ORDER[fx] === 'behind') drawLoopFx(ctx, fx, env, fxOptions, t);
      if (!blank) {
        const layers = styleLayers({
          style: s.style,
          palette,
          textColor: s.textColor,
          outlineColor: s.outlineColor,
          size: layout.size,
          outlineScale,
          seed: s.seed,
          t,
        });
        const m = motionAt(motion, t);
        renderTextFx(ctx, layout.shape, layers, {
          t,
          pool,
          transform: m.transform,
          offset: m.offset,
        });
      }
      if (fx && LOOP_FX_ORDER[fx] === 'front') drawLoopFx(ctx, fx, env, fxOptions, t);
      ctx.restore();
    },
  };
}

/** 等這組設定用到的字型載好（只下載文字用到的字） */
export async function loadFonts(s: Pick<CutinSettings, 'font' | 'text'>): Promise<void> {
  const f = fontOf(s.font);
  await ensureFont(f.font.family, f.font.weight, s.text.replace(/\s/g, '') || '永');
}
