/**
 * 「散落」的畫法（lyric-fx 規格 3.6）：畫時間 t 的那一格。順序：殘影 → 槽位 → 目前這一句；
 * 每個字依序畫光暈、（中文）影子＋實心字或（英文）實心字＋描邊。基準畫面等比例縮放到 rect（置中）。
 * 純函式：只用參數（plan、settings、t、rect），不碰 DOM。
 */
import { jitterAt } from '../../jitter';
import { glyphAffine } from '../../perspective';
import type { LyricCtx, LyricRect } from '../../types';
import {
  DEFAULT_CHAR_MS,
  fadeAlpha,
  riseOffset,
  type ScatterLinePlan,
  type ScatterPlan,
  SHADOW_OFFSET,
  SLOT_DIM,
  SLOT_FADE_IN,
  SLOT_REVEAL_MS,
  TEXT_HEIGHT_RATIO,
} from './plan';
import type { ScatterSettings } from './settings';

/** 字的中心在基線上方幾個字級（中日韓字的字身約在基線上 0.88、下 0.12 字級） */
export const GLYPH_CENTER_UP = 0.38;

/** #rrggbb＋不透明度（0～255） → rgba() */
function rgba(hex: string, alpha255: number): string {
  const v = Number.parseInt(hex.slice(1), 16);
  const a = Math.max(0, Math.min(255, alpha255)) / 255;
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
}

export type ScatterRole = 'current' | 'fade' | 'slot';

/** 一句在時間 t 的狀態（沒有畫在畫面上＝null） */
export interface ScatterLineState {
  role: ScatterRole;
  /** 畫幾個字 */
  count: number;
  /** 不透明度（0～255；目前這一句 255、殘影 a(Δ)、槽位 255 × 係數） */
  alpha: number;
  /** 往上飄了多少 */
  rise: number;
}

export function lineStateAt(
  p: ScatterLinePlan,
  t: number,
  s: Pick<ScatterSettings, 'fadeSpeed' | 'riseSpeed'>,
): ScatterLineState | null {
  const total = p.glyphs.length;
  if (!total) return null;
  if (t >= p.fadeStart) {
    if (t >= p.fadeEnd) return null;
    const a = fadeAlpha(s.fadeSpeed, t - p.fadeStart);
    if (a <= 0) return null;
    return { role: 'fade', count: total, alpha: a, rise: riseOffset(s.riseSpeed, t - p.fadeStart) };
  }
  if (t >= p.start) {
    const count = p.bright
      ? total
      : Math.min(
          total,
          Math.floor(((t - p.start) * 1000) / (p.interval || DEFAULT_CHAR_MS) + 1e-9),
        );
    return count > 0 ? { role: 'current', count, alpha: 255, rise: 0 } : null;
  }
  if (p.slotBorn != null && t >= p.slotBorn) {
    if (p.slotBright) {
      const count = Math.min(total, Math.floor(((t - p.slotBorn) * 1000) / SLOT_REVEAL_MS + 1e-9));
      return count > 0 ? { role: 'slot', count, alpha: 255, rise: 0 } : null;
    }
    const fadeIn = Math.max(0, Math.min(1, (t - p.slotBorn) / SLOT_FADE_IN));
    const alpha = Math.floor(255 * SLOT_DIM * fadeIn);
    return alpha > 0 ? { role: 'slot', count: total, alpha, rise: 0 } : null;
  }
  return null;
}

type M6 = [number, number, number, number, number, number];

/** a ∘ b（先套 b 再套 a） */
const mul = (a: M6, b: M6): M6 => [
  a[0] * b[0] + a[2] * b[1],
  a[1] * b[0] + a[3] * b[1],
  a[0] * b[2] + a[2] * b[3],
  a[1] * b[2] + a[3] * b[3],
  a[0] * b[4] + a[2] * b[5] + a[4],
  a[1] * b[4] + a[3] * b[5] + a[5],
];

function drawLine(
  ctx: LyricCtx,
  base: M6,
  p: ScatterLinePlan,
  st: ScatterLineState,
  t: number,
  plan: ScatterPlan,
  s: ScatterSettings,
): void {
  const third = plan.th / 3;
  /* 透視的局部近似以字的中心為準：基線起點往右半個字寬、往上 GLYPH_CENTER_UP 個字級（規格 3.6、D14） */
  const up = -(plan.th / TEXT_HEIGHT_RATIO) * GLYPH_CENTER_UP;
  const jit = { x: 0, y: 0 };
  ctx.font = p.font;
  const a = st.alpha;
  const textC = rgba(s.textColor, a);
  const shadowC = rgba(s.strokeColor, a);
  const glowOn = s.glow && st.role !== 'slot';
  const glowC = glowOn ? rgba(s.glowColor, Math.floor((a * s.glowAlpha) / 255)) : '';
  const latinFill = st.role === 'fade' ? rgba(s.textColor, Math.max(0, a - 100)) : textC;
  const strokeW = s.strokeWidth * 2;
  for (let m = 0; m < st.count; m++) {
    const g = p.glyphs[m];
    if (st.role === 'current') jitterAt(p.jitter, m, t, jit);
    else {
      jit.x = 0;
      jit.y = 0;
    }
    const X = p.x + g.ox + jit.x;
    const Y = p.y - st.rise + g.oy + jit.y + third;
    const local: M6 = s.perspective
      ? glyphAffine(p.persp, X, Y, (g.adv ?? 0) / 2, up)
      : [1, 0, 0, 1, X, Y];
    const M = mul(base, local);
    ctx.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    if (glowOn) {
      ctx.lineJoin = 'bevel';
      ctx.lineCap = 'square';
      ctx.lineWidth = s.glowSize;
      ctx.strokeStyle = glowC;
      ctx.strokeText(g.ch, 0, 0);
    }
    if (!p.latin) {
      ctx.fillStyle = shadowC;
      ctx.fillText(g.ch, SHADOW_OFFSET, SHADOW_OFFSET);
      ctx.fillStyle = textC;
      ctx.fillText(g.ch, 0, 0);
    } else {
      ctx.fillStyle = latinFill;
      ctx.fillText(g.ch, 0, 0);
      if (strokeW > 0) {
        ctx.lineJoin = st.role === 'fade' ? 'bevel' : 'round';
        ctx.lineCap = st.role === 'fade' ? 'square' : 'round';
        ctx.lineWidth = strokeW;
        ctx.strokeStyle = shadowC;
        ctx.strokeText(g.ch, 0, 0);
      }
    }
  }
}

/** 畫時間 t 的那一格（不畫背景） */
export function drawScatter(
  ctx: LyricCtx,
  t: number,
  plan: ScatterPlan,
  s: ScatterSettings,
  rect: LyricRect,
): void {
  if (!plan.lines.length || rect.width <= 0 || rect.height <= 0) return;
  const scale = Math.min(rect.width / plan.width, rect.height / plan.height);
  const ox = rect.x + (rect.width - plan.width * scale) / 2;
  const oy = rect.y + (rect.height - plan.height * scale) / 2;
  const fades: [ScatterLinePlan, ScatterLineState][] = [];
  const slots: [ScatterLinePlan, ScatterLineState][] = [];
  let current: [ScatterLinePlan, ScatterLineState] | null = null;
  for (const p of plan.lines) {
    const st = lineStateAt(p, t, s);
    if (!st) continue;
    if (st.role === 'fade') fades.push([p, st]);
    else if (st.role === 'slot') slots.push([p, st]);
    else current = [p, st];
  }
  if (!fades.length && !slots.length && !current) return;
  fades.sort((a, b) => a[0].fadeStart - b[0].fadeStart || a[0].index - b[0].index);
  ctx.save();
  const m = ctx.getTransform();
  const base = mul([m.a, m.b, m.c, m.d, m.e, m.f], [scale, 0, 0, scale, ox, oy]);
  ctx.globalAlpha *= s.opacity / 100;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.miterLimit = 10;
  for (const [p, st] of fades) drawLine(ctx, base, p, st, t, plan, s);
  for (const [p, st] of slots) drawLine(ctx, base, p, st, t, plan, s);
  if (current) drawLine(ctx, base, current[0], current[1], t, plan, s);
  ctx.restore();
}
