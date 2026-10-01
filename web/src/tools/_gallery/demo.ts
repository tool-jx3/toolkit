/**
 * 示範動畫：骰子落下、彈跳、顯示判定文字、星星閃爍、淡出。
 * 示範 AnimationSource 的寫法：所有畫面只由 t 決定（決定性亂數），字型在 prepare 裡先載好。
 */
import { toCss } from '@/core/color';
import { ensureFont, type FontValue, fontCss } from '@/core/fonts';
import { canvasGradient, type Gradient } from '@/core/gradient';
import {
  type AnimationSource,
  buildSegments,
  type Ctx2D,
  clamp01,
  EASE,
  type EasingName,
  getEasing,
  hash,
  lerp,
  progress,
  segmentsDuration,
  type TimelineSegment,
  timeSlot,
} from '@/core/timeline';
import { S } from './strings';

export interface DemoSettings {
  text: string;
  font: FontValue;
  textColor: string;
  outlineColor: string;
  die: Gradient;
  ease: EasingName;
  /** 停留秒數 */
  hold: number;
  sparkles: boolean;
  sparkleCount: number;
  seed: string;
}

export const DEMO_DEFAULTS: DemoSettings = {
  text: S.defaultText,
  font: { source: 'google', family: 'Noto Sans TC', weight: 700 },
  textColor: '#f0c36d',
  outlineColor: '#1b1426',
  die: {
    kind: 'linear',
    angle: 135,
    stops: [
      { offset: 0, color: '#b79ce0' },
      { offset: 1, color: '#5a3e88' },
    ],
  },
  ease: 'bounce',
  hold: 1.2,
  sparkles: true,
  sparkleCount: 14,
  seed: '星光',
};

export const DEMO_WIDTH = 480;
export const DEMO_HEIGHT = 270;

export function demoSegments(s: DemoSettings): TimelineSegment[] {
  return buildSegments([
    { id: 'in', label: '進場', duration: 0.8 },
    { id: 'hold', label: '停留', duration: s.hold },
    { id: 'out', label: '退場', duration: 0.6 },
  ]);
}

function diePath(ctx: Ctx2D, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 3;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function star(ctx: Ctx2D, x: number, y: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.28 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
}

export function createDemoSource(s: DemoSettings): AnimationSource {
  const segments = demoSegments(s);
  const [inSeg, holdSeg, outSeg] = segments;
  const ease = getEasing(s.ease);
  return {
    width: DEMO_WIDTH,
    height: DEMO_HEIGHT,
    duration: segmentsDuration(segments),
    segments,
    stillTime: holdSeg.start + Math.min(0.6, s.hold),
    async prepare() {
      await ensureFont(s.font.family, s.font.weight, `${s.text}20`);
    },
    render(ctx, t) {
      const pIn = progress(t, inSeg.start, inSeg.end - inSeg.start);
      const pOut = progress(t, outSeg.start, outSeg.end - outSeg.start);
      const fade = 1 - EASE.in(pOut);
      const shrink = 1 - 0.35 * EASE.in(pOut);

      /* 骰子：從上方落下，依選擇的曲線停住，同時旋轉 */
      const r = 64;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(140, lerp(-r, 140, ease(pIn)));
      ctx.rotate((1 - EASE.out(pIn)) * Math.PI * 2.5);
      ctx.scale(shrink, shrink);
      diePath(ctx, r);
      ctx.fillStyle = canvasGradient(ctx, s.die, -r, -r, r * 2, r * 2);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.stroke();
      /* 正二十面體的線條 */
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      const inner = [0, 1, 2].map((k) => {
        const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
        return [Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52] as const;
      });
      ctx.beginPath();
      for (const [k, [x, y]] of inner.entries()) {
        if (k) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.closePath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 3;
        const [x, y] = inner[Math.floor(((i + 1) % 6) / 2)];
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = fontCss({ family: s.font.family, weight: 700 }, 30);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('20', 0, 2);
      ctx.restore();

      /* 判定文字：停留開始時彈出 */
      const pText = progress(t, holdSeg.start, 0.45);
      if (pText > 0) {
        const k = Math.max(0, EASE.back(pText)) * shrink;
        ctx.save();
        ctx.globalAlpha = fade * clamp01(pText * 2.5);
        ctx.translate(335, 138);
        ctx.scale(k, k);
        ctx.font = fontCss(s.font, 46);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 8;
        ctx.strokeStyle = toCss(s.outlineColor);
        ctx.strokeText(s.text, 0, 0);
        ctx.fillStyle = toCss(s.textColor);
        ctx.fillText(s.text, 0, 0);
        ctx.restore();
      }

      /* 星星：位置由種子決定；每秒換 8 次亮度（不跟著輸出 fps 變） */
      if (s.sparkles && t >= holdSeg.start) {
        const slot = timeSlot(t - holdSeg.start, 8);
        ctx.save();
        ctx.fillStyle = toCss(s.textColor);
        for (let i = 0; i < s.sparkleCount; i++) {
          const x = 24 + hash(s.seed, 'x', i) * (DEMO_WIDTH - 48);
          const y = 18 + hash(s.seed, 'y', i) * (DEMO_HEIGHT - 36);
          const tw = hash(s.seed, i, slot);
          ctx.globalAlpha =
            fade *
            clamp01(progress(t, holdSeg.start + hash(s.seed, 'd', i) * 0.4, 0.2)) *
            (0.35 + 0.65 * tw);
          star(ctx, x, y, 3 + 7 * tw);
        }
        ctx.restore();
      }
    },
  };
}
